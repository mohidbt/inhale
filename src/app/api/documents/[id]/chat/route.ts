import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { documents, agentConversations, agentMessages } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getOpenRouterClient, getDecryptedApiKey, MODELS } from "@/lib/ai/openrouter";
import { embedQuery } from "@/lib/ai/embeddings";

interface ChatBody {
  question: string;
  conversationId?: number;
  viewportContext?: { page?: number; scrollPct?: number };
  history?: { role: "user" | "assistant"; content: string }[];
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

  // Fetch key once — reused for both embeddings and LLM client
  let apiKey: string;
  try {
    apiKey = await getDecryptedApiKey(userId);
  } catch {
    return new Response("Add an OpenRouter key in Settings", { status: 400 });
  }
  const client = await getOpenRouterClient(userId);

  // Embed question (embedQuery takes apiKey, not userId)
  const queryVec = await embedQuery(apiKey, body.question);

  // pgvector top-K with optional viewport bias
  const currentPage = body.viewportContext?.page ?? null;
  const rawRows = await db.execute(sql`
    SELECT id, content, page_start, page_end,
      (1 - (embedding <=> ${sql.raw(`'[${queryVec.join(",")}]'`)}::vector))
        + CASE
            WHEN ${currentPage}::int IS NOT NULL
             AND page_start <= ${currentPage}::int + 1
             AND page_end   >= ${currentPage}::int - 1
            THEN 0.05
            ELSE 0
          END AS score
    FROM document_chunks
    WHERE document_id = ${documentId}
      AND embedding IS NOT NULL
    ORDER BY score DESC
    LIMIT 6
  `);

  // Drizzle execute returns rows differently depending on driver — handle both
  const rows = (Array.isArray(rawRows) ? rawRows : (rawRows as { rows: unknown[] }).rows ?? []) as {
    id: number; content: string; page_start: number; page_end: number; score: number;
  }[];

  const contextText = rows.map((r) => `[Page ${r.page_start}]\n${r.content}`).join("\n\n---\n\n");
  const sources = rows.map((r) => ({ page: r.page_start, relevance: Number(r.score) }));

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

  const inputMessages = [
    {
      role: "system" as const,
      content:
        "You are a research assistant answering questions about a single PDF. " +
        "Use ONLY the provided context. Cite page numbers inline as (p. N). " +
        "If the answer is not in the context, say so.\n\nContext:\n" + contextText,
    },
    ...(body.history ?? []).slice(-10),
    { role: "user" as const, content: body.question },
  ];

  const result = client.callModel({ model: MODELS.chat, input: inputMessages });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      send({ type: "sources", sources });

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
      await db.insert(agentMessages).values({
        conversationId: conversationId!,
        role: "assistant",
        content: assistantContent,
      });
      await db
        .update(agentConversations)
        .set({ updatedAt: new Date() })
        .where(eq(agentConversations.id, conversationId!));
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
