import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { aiHighlightRuns, documents, userHighlights } from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";

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
        highlightCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${userHighlights}
          WHERE ${userHighlights.layerId} = ${aiHighlightRuns.id}
        )`,
      })
      .from(aiHighlightRuns)
      .where(
        and(
          eq(aiHighlightRuns.documentId, documentId),
          eq(aiHighlightRuns.userId, session.user.id)
        )
      )
      .orderBy(desc(aiHighlightRuns.createdAt));

    return NextResponse.json({ runs: rows });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
