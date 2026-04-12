import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { documents, documentReferences } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { extractPdfPages } from "@/lib/ai/pdf-text";
import { extractCitations } from "@/lib/citations/parser";

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
      .select({ id: documents.id, filePath: documents.filePath })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, session.user.id)))
      .limit(1);

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Extract pages from PDF
    const pages = await extractPdfPages(doc.filePath);

    // Run citation extraction
    const { markers, references } = extractCitations(pages);

    // Delete existing references for this document (idempotent re-extraction)
    await db
      .delete(documentReferences)
      .where(eq(documentReferences.documentId, documentId));

    // Build marker lookup for pageNumber
    const markerPageMap = new Map<number, number>(
      markers.map((m) => [m.markerIndex, m.pageNumber])
    );

    // Insert new rows (only for references that were found in the bibliography)
    let inserted: typeof documentReferences.$inferSelect[] = [];

    if (references.length > 0) {
      inserted = await db
        .insert(documentReferences)
        .values(
          references.map((ref) => ({
            documentId,
            markerText: `[${ref.markerIndex}]`,
            markerIndex: ref.markerIndex,
            rawText: ref.rawText ?? null,
            title: ref.title ?? null,
            authors: ref.authors ?? null,
            year: ref.year ?? null,
            doi: ref.doi ?? null,
            url: ref.url ?? null,
            semanticScholarId: null,
            abstract: null,
            venue: null,
            citationCount: null,
            pageNumber: markerPageMap.get(ref.markerIndex) ?? null,
          }))
        )
        .returning();
    }

    return NextResponse.json(
      {
        references: inserted,
        stats: {
          markersFound: markers.length,
          referencesExtracted: references.length,
          referencesInserted: inserted.length,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
