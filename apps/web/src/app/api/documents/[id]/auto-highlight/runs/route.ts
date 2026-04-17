import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { aiHighlightRuns, documents, userHighlights } from "@/db/schema";
import { and, eq, desc, count } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const documentId = parseInt(id, 10);
  if (isNaN(documentId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  try {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, session.user.id)))
      .limit(1);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rows = await db
      .select({
        id: aiHighlightRuns.id,
        instruction: aiHighlightRuns.instruction,
        status: aiHighlightRuns.status,
        summary: aiHighlightRuns.summary,
        createdAt: aiHighlightRuns.createdAt,
        completedAt: aiHighlightRuns.completedAt,
        highlightCount: count(userHighlights.id),
      })
      .from(aiHighlightRuns)
      .leftJoin(userHighlights, eq(userHighlights.layerId, aiHighlightRuns.id))
      .where(
        and(
          eq(aiHighlightRuns.documentId, documentId),
          eq(aiHighlightRuns.userId, session.user.id)
        )
      )
      .groupBy(
        aiHighlightRuns.id,
        aiHighlightRuns.instruction,
        aiHighlightRuns.status,
        aiHighlightRuns.summary,
        aiHighlightRuns.createdAt,
        aiHighlightRuns.completedAt
      )
      .orderBy(desc(aiHighlightRuns.createdAt));

    return NextResponse.json({ runs: rows });
  } catch (err) {
    console.error("GET /auto-highlight/runs failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
