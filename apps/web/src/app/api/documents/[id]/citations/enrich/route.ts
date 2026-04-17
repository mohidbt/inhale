import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { documents, documentReferences } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { enrichReferences } from "@/lib/citations/semantic-scholar";
import { authorStringToJson } from "@/lib/citations/author-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const documentId = parseInt(id, 10);
  if (isNaN(documentId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    // Ownership check
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, session.user.id)))
      .limit(1);

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Fetch all document references that haven't been enriched yet
    const refs = await db
      .select({
        id: documentReferences.id,
        title: documentReferences.title,
        doi: documentReferences.doi,
      })
      .from(documentReferences)
      .where(
        and(
          eq(documentReferences.documentId, documentId),
          isNull(documentReferences.semanticScholarId)
        )
      );

    const total = refs.length;

    if (total === 0) {
      return NextResponse.json({ enriched: 0, total: 0 });
    }

    // Enrich references via Semantic Scholar
    const enriched = await enrichReferences(refs);

    // Update each matched reference in parallel (each targets a distinct id)
    await Promise.all(
      Array.from(enriched).map(([refId, metadata]) =>
        db
          .update(documentReferences)
          .set({
            semanticScholarId: metadata.semanticScholarId,
            title: metadata.title,
            authors: authorStringToJson(metadata.authors),
            year: metadata.year,
            doi: metadata.doi,
            url: metadata.url,
            abstract: metadata.abstract,
            venue: metadata.venue,
            citationCount: metadata.citationCount,
          })
          .where(eq(documentReferences.id, refId))
      )
    );

    return NextResponse.json({ enriched: enriched.size, total });
  } catch (err) {
    console.error("[citations/enrich] failed for document", documentId, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
