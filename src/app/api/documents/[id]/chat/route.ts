import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { documents, agentConversations, agentMessages } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { OpenRouter } from "@openrouter/sdk";
import { getDecryptedApiKey, MODELS } from "@/lib/ai/openrouter";
import { embedQuery } from "@/lib/ai/embeddings";

type ChatScope = "page" | "selection" | "paper";

interface ChatBody {
  question: string;
  conversationId?: number;
  viewportContext?: { page?: number; scrollPct?: number };
  history?: { role: "user" | "assistant"; content: string }[];
  scope?: ChatScope;
  selectionText?: string;
  pageNumber?: number;
}

interface ChunkRow {
  id: number;
  content: string;
  page_start: number;
  page_end: number;
  score: number;
}

const MAX_PAGE_TEXT_CHARS = 12_000;
const MAX_ANCHOR_CHARS = 4_000;

/**
 * Redact long fields for production logging — keeps shape inspectable but
 * avoids dumping full document text into shared log sinks.
 */
function redact(value: string, max = 240): string {
  if (process.env.NODE_ENV !== "production") return value;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…[+${value.length - max} chars]`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const documentId = Number(id);
  const userId = session.user.id; // string

  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
  if (!doc) return new Response("Not found", { status: 404 });

  const body = (await request.json()) as ChatBody;
  if (!body.question?.trim()) return new Response("Bad Request", { status: 400 });

  const scope: ChatScope = body.scope ?? "paper";
  const focusPage =
    body.pageNumber ?? body.viewportContext?.page ?? null;
  const selectionText = body.selectionText?.trim() ?? null;
  const question = body.question.trim();

  // Fetch key once — reused for both embeddings and LLM client
  let apiKey: string;
  try {
    apiKey = await getDecryptedApiKey(userId);
  } catch {
    return new Response("Add an OpenRouter key in Settings", { status: 400 });
  }
  const client = new OpenRouter({ apiKey });

  // For very short paper-scoped queries, expand lightly so the embedding has
  // more semantic surface area. Cheap and only used for vector search — the
  // LLM still sees the original question.
  const wordCount = question.split(/\s+/).filter(Boolean).length;
  const embeddingQuery =
    scope === "paper" && wordCount > 0 && wordCount < 4
      ? `${question} — find relevant passages in the paper`
      : question;

  // Embed question (embedQuery takes apiKey, not userId)
  const queryVec = await embedQuery(apiKey, embeddingQuery);

  if (!queryVec.every((n) => Number.isFinite(n))) {
    return new Response("Invalid embedding response", { status: 502 });
  }

  const vecLiteral = sql.raw(`'[${queryVec.join(",")}]'`);

  let supportingChunks: ChunkRow[] = [];
  let pageText: string | null = null;
  let anchorText: string | null = null;

  if (scope === "selection" || scope === "page") {
    // Pull every chunk on the focus page, joined in order, to form the
    // "current page" injection.
    if (focusPage != null) {
      const pageRowsRaw = await db.execute(sql`
        SELECT content, page_start, page_end, chunk_index
        FROM document_chunks
        WHERE document_id = ${documentId}
          AND page_start <= ${focusPage}::int
          AND page_end   >= ${focusPage}::int
        ORDER BY chunk_index ASC
      `);
      const pageRows = (Array.isArray(pageRowsRaw)
        ? pageRowsRaw
        : (pageRowsRaw as { rows: unknown[] }).rows ?? []) as {
        content: string;
      }[];
      const joined = pageRows.map((r) => r.content).join("\n\n");
      pageText =
        joined.length > MAX_PAGE_TEXT_CHARS
          ? `${joined.slice(0, MAX_PAGE_TEXT_CHARS)}\n…[truncated]`
          : joined;
    }

    // Plus top-4 supporting chunks across the whole doc.
    const supportingRaw = await db.execute(sql`
      SELECT id, content, page_start, page_end,
        (1 - (embedding <=> ${vecLiteral}::vector)) AS score
      FROM document_chunks
      WHERE document_id = ${documentId}
        AND embedding IS NOT NULL
      ORDER BY score DESC
      LIMIT 4
    `);
    supportingChunks = (Array.isArray(supportingRaw)
      ? supportingRaw
      : (supportingRaw as { rows: unknown[] }).rows ?? []) as ChunkRow[];
  } else {
    // scope === "paper": fetch top-K by pure relevance, then dedupe by
    // page in Node (keep highest-scoring chunk per page) and truncate to
    // 8. Doing the dedupe in SQL via DISTINCT ON (page_start) ORDER BY
    // page_start ASC forces page-number ordering and loses the most
    // relevant chunks if they cluster on a few pages.
    const topKRaw = await db.execute(sql`
      SELECT id, content, page_start, page_end,
        (1 - (embedding <=> ${vecLiteral}::vector)) AS score
      FROM document_chunks
      WHERE document_id = ${documentId}
        AND embedding IS NOT NULL
      ORDER BY score DESC
      LIMIT 20
    `);
    const topK = (Array.isArray(topKRaw)
      ? topKRaw
      : (topKRaw as { rows: unknown[] }).rows ?? []) as ChunkRow[];

    const bestPerPage = new Map<number, ChunkRow>();
    for (const row of topK) {
      const existing = bestPerPage.get(row.page_start);
      if (!existing || Number(row.score) > Number(existing.score)) {
        bestPerPage.set(row.page_start, row);
      }
    }
    supportingChunks = Array.from(bestPerPage.values())
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, 8);

    // Anchor = opening of the paper. Use MIN(page_start) rather than the
    // literal 1 because some PDFs extract a blank leading page (or even a
    // cover page filtered out by the chunker's empty-content skip), so the
    // first real chunk may start on page 2+.
    const anchorRaw = await db.execute(sql`
      SELECT content
      FROM document_chunks
      WHERE document_id = ${documentId}
        AND page_start = (
          SELECT MIN(page_start)
          FROM document_chunks
          WHERE document_id = ${documentId}
        )
      ORDER BY chunk_index ASC
      LIMIT 3
    `);
    const anchorRows = (Array.isArray(anchorRaw)
      ? anchorRaw
      : (anchorRaw as { rows: unknown[] }).rows ?? []) as { content: string }[];
    const joinedAnchor = anchorRows.map((r) => r.content).join("\n\n");
    anchorText =
      joinedAnchor.length > MAX_ANCHOR_CHARS
        ? `${joinedAnchor.slice(0, MAX_ANCHOR_CHARS)}\n…[truncated]`
        : joinedAnchor || null;
  }

  // Vector-miss fallback. The ivfflat index was created with `lists=100`
  // and pgvector defaults to `probes=1`, so for a per-document subset of
  // ~30 chunks most lists are empty and a single probe often returns
  // zero rows — producing the "cannot find any content" guard on valid
  // documents. When vector search misses, fall back to the first 6
  // chunks by chunk_index so the LLM still has material to reason over.
  // Runs for every scope so selection/page queries also keep doc-wide
  // supporting context.
  if (supportingChunks.length === 0) {
    const fallbackRaw = await db.execute(sql`
      SELECT id, content, page_start, page_end
      FROM document_chunks
      WHERE document_id = ${documentId}
      ORDER BY chunk_index ASC
      LIMIT 6
    `);
    const fallbackRows = (Array.isArray(fallbackRaw)
      ? fallbackRaw
      : (fallbackRaw as { rows: unknown[] }).rows ?? []) as Omit<ChunkRow, "score">[];
    supportingChunks = fallbackRows.map((r) => ({ ...r, score: 0 }));
    console.warn("[chat/route] vector search returned 0 rows — used first-N fallback", {
      documentId,
      scope,
      fallbackCount: supportingChunks.length,
    });
  }

  const supportingText = supportingChunks
    .map((r) => `[Page ${r.page_start}]\n${r.content}`)
    .join("\n\n---\n\n");

  // Sources list (drives the badge UI). Always include focus page first.
  const sourcesMap = new Map<number, number>();
  if (focusPage != null && (scope === "selection" || scope === "page")) {
    sourcesMap.set(focusPage, 1);
  }
  for (const r of supportingChunks) {
    if (!sourcesMap.has(r.page_start)) {
      sourcesMap.set(r.page_start, Number(r.score));
    }
  }
  const sources = Array.from(sourcesMap.entries()).map(([page, relevance]) => ({
    page,
    relevance,
  }));

  // Diagnostic log — redacted in prod. Helps trace future "I only have page 1"
  // style regressions without leaking the doc.
  const topSupporting = supportingChunks.slice(0, 3).map((r) => ({
    page: r.page_start,
    score: Number(Number(r.score).toFixed(4)),
  }));
  console.log("[chat/route] retrieval", {
    documentId,
    scope,
    focusPage,
    question: redact(body.question),
    pageTextChars: pageText?.length ?? 0,
    anchorChars: anchorText?.length ?? 0,
    supportingCount: supportingChunks.length,
    supportingPages: supportingChunks.map((r) => r.page_start),
    topSupporting,
  });

  // Empty-retrieval guard — if we have nothing to ground the answer in,
  // surface a clear message instead of falling through to a generic LLM
  // refusal. Covers "doc still processing / embeddings missing" case.
  const hasAnyContext =
    supportingChunks.length > 0 ||
    (pageText?.length ?? 0) > 0 ||
    (anchorText?.length ?? 0) > 0 ||
    (selectionText?.length ?? 0) > 0;

  if (!hasAnyContext) {
    // Upsert conversation + user message so the empty-state turn is
    // still persisted in history, consistent with the success path.
    let emptyConvId = body.conversationId;
    if (!emptyConvId) {
      const [conv] = await db
        .insert(agentConversations)
        .values({ userId, documentId, title: body.question.slice(0, 80) })
        .returning({ id: agentConversations.id });
      emptyConvId = conv.id;
    }
    await db.insert(agentMessages).values({
      conversationId: emptyConvId,
      role: "user",
      content: body.question,
      viewportContext: body.viewportContext ?? null,
    });

    const emptyMessage =
      "The assistant cannot find any content from this document. It may still be processing — try again in a minute, or re-upload.";

    await db.insert(agentMessages).values({
      conversationId: emptyConvId,
      role: "assistant",
      content: emptyMessage,
    });
    await db
      .update(agentConversations)
      .set({ updatedAt: new Date() })
      .where(eq(agentConversations.id, emptyConvId));

    const emptyStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        send({ type: "sources", sources: [], conversationId: emptyConvId });
        send({ type: "token", content: emptyMessage });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(emptyStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Upsert conversation
  let conversationId = body.conversationId;
  if (!conversationId) {
    const [conv] = await db
      .insert(agentConversations)
      .values({ userId, documentId, title: body.question.slice(0, 80) })
      .returning({ id: agentConversations.id });
    conversationId = conv.id;
  }

  await db.insert(agentMessages).values({
    conversationId,
    role: "user",
    content: body.question,
    viewportContext: body.viewportContext ?? null,
  });

  // Assemble system prompt. Separate "primary focus" from "supporting
  // context", and explicitly tell the model not to refuse when the
  // material is partial.
  const promptSections: string[] = [
    "You are a research assistant answering questions about a single PDF.",
    "Cite page numbers inline as (p. N) whenever you draw on the material.",
    "Prefer the provided material; if it is insufficient, say what specifically is missing rather than refusing outright.",
    "Do not claim you only have access to a single page unless the user explicitly scoped the question to one page.",
    "If the provided material contains any relevant information, answer with citations; do not ask the user to narrow the question when content is available.",
  ];

  if (scope === "selection" && selectionText) {
    promptSections.push(
      `\n--- User selection (page ${focusPage ?? "?"}) ---\n${selectionText}`
    );
  }
  if ((scope === "selection" || scope === "page") && pageText) {
    promptSections.push(
      `\n--- Current page (page ${focusPage}) ---\n${pageText}`
    );
  }
  if (scope === "paper" && anchorText) {
    promptSections.push(`\n--- Paper opening (page 1) ---\n${anchorText}`);
  }
  if (supportingText) {
    promptSections.push(
      `\n--- Supporting context (retrieved across the document) ---\n${supportingText}`
    );
  }

  const inputMessages = [
    { role: "system" as const, content: promptSections.join("\n") },
    ...(body.history ?? []).slice(-10),
    { role: "user" as const, content: body.question },
  ];

  const result = client.callModel({ model: MODELS.chat, input: inputMessages });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      send({ type: "sources", sources, conversationId });

      let assistantContent = "";
      try {
        for await (const delta of result.getTextStream()) {
          assistantContent += delta;
          send({ type: "token", content: delta });
        }
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();

      // Persist assistant turn after stream closes
      try {
        await db.insert(agentMessages).values({
          conversationId: conversationId!,
          role: "assistant",
          content: assistantContent,
        });
        await db
          .update(agentConversations)
          .set({ updatedAt: new Date() })
          .where(eq(agentConversations.id, conversationId!));
      } catch (err) {
        console.error("[chat/route] Failed to persist assistant message:", err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
