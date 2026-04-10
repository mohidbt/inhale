import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { documents, documentSections } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getOpenRouterClient, MODELS } from "@/lib/ai/openrouter";
import { extractPdfPages } from "@/lib/ai/pdf-text";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const documentId = Number(id);
  const userId = session.user.id; // string — do NOT cast to Number

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Return cached sections if they exist
  const existing = await db
    .select()
    .from(documentSections)
    .where(eq(documentSections.documentId, documentId))
    .orderBy(asc(documentSections.sectionIndex));
  if (existing.length > 0) return NextResponse.json({ sections: existing });

  // Generate via LLM
  let client;
  try {
    client = await getOpenRouterClient(userId);
  } catch {
    return NextResponse.json({ error: "Add an OpenRouter key in Settings" }, { status: 400 });
  }

  const pages = await extractPdfPages(doc.filePath);
  const sample = pages
    .slice(0, 30)
    .map((p) => `[Page ${p.pageNumber}]\n${p.text}`)
    .join("\n\n");

  const result = client.callModel({
    model: MODELS.outline,
    instructions:
      'You are a research paper analyzer. Return a JSON array of sections. ' +
      'Schema: [{"title": string, "page": number, "preview": string}]. ' +
      'Use real page numbers from the [Page N] markers. Return ONLY the JSON array, no markdown.',
    input: [{ role: "user", content: sample }],
  });

  let raw = "";
  for await (const delta of result.getTextStream()) raw += delta;

  const jsonText = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let parsed: { title: string; page: number; preview?: string }[];
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return NextResponse.json({ error: "Model returned invalid JSON", raw }, { status: 502 });
  }

  const inserted = await db
    .insert(documentSections)
    .values(
      parsed.map((s, i) => ({
        documentId,
        sectionIndex: i,
        title: s.title,
        content: s.preview ?? "",
        pageStart: s.page,
        pageEnd: s.page, // LLM gives one page number; pageEnd = pageStart
      }))
    )
    .returning();

  return NextResponse.json({ sections: inserted });
}
