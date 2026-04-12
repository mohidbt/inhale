import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { documents, documentReferences, libraryReferences, keptCitations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { buildLibraryReference } from "@/lib/citations/library-sync";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; refId: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, refId } = await params;
  const documentId = parseInt(id, 10);
  const documentReferenceId = parseInt(refId, 10);
  if (isNaN(documentId) || isNaN(documentReferenceId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    // Verify document ownership
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, session.user.id)))
      .limit(1);

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Verify + fetch document_reference
    const [ref] = await db
      .select()
      .from(documentReferences)
      .where(
        and(
          eq(documentReferences.id, documentReferenceId),
          eq(documentReferences.documentId, documentId)
        )
      )
      .limit(1);

    if (!ref) {
      return NextResponse.json({ error: "Citation not found" }, { status: 404 });
    }

    // Find or create library_reference
    let libraryReferenceId: number;

    // Try to reuse existing library_reference by DOI if available
    if (ref.doi) {
      const [existing] = await db
        .select({ id: libraryReferences.id })
        .from(libraryReferences)
        .where(
          and(
            eq(libraryReferences.userId, session.user.id),
            eq(libraryReferences.doi, ref.doi)
          )
        )
        .limit(1);

      if (existing) {
        libraryReferenceId = existing.id;
      } else {
        const payload = buildLibraryReference(session.user.id, ref);
        const [inserted] = await db
          .insert(libraryReferences)
          .values(payload)
          .returning({ id: libraryReferences.id });
        libraryReferenceId = inserted.id;
      }
    } else {
      const payload = buildLibraryReference(session.user.id, ref);
      const [inserted] = await db
        .insert(libraryReferences)
        .values(payload)
        .returning({ id: libraryReferences.id });
      libraryReferenceId = inserted.id;
    }

    // Upsert kept_citations — update libraryReferenceId if row exists, else insert
    const [existingKept] = await db
      .select({ id: keptCitations.id })
      .from(keptCitations)
      .where(
        and(
          eq(keptCitations.userId, session.user.id),
          eq(keptCitations.documentReferenceId, documentReferenceId)
        )
      )
      .limit(1);

    let keptId: number;

    if (existingKept) {
      await db
        .update(keptCitations)
        .set({ libraryReferenceId })
        .where(eq(keptCitations.id, existingKept.id));
      keptId = existingKept.id;
    } else {
      const [inserted] = await db
        .insert(keptCitations)
        .values({
          userId: session.user.id,
          documentReferenceId,
          libraryReferenceId,
        })
        .returning({ id: keptCitations.id });
      keptId = inserted.id;
    }

    return NextResponse.json({ libraryReferenceId, keptId });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
