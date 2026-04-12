import type { DocumentReference } from "@/components/reader/citation-card";

export interface LibraryReferenceInput {
  userId: string;
  title: string;
  authors: string | null;
  year: string | null;
  doi: string | null;
  url: string | null;
  semanticScholarId: string | null;
  abstract: string | null;
  venue: string | null;
  citationCount: number | null;
}

/**
 * Build a library_references insert payload from a document_reference row.
 * Title falls back: title → rawText → markerText.
 */
export function buildLibraryReference(
  userId: string,
  ref: DocumentReference
): LibraryReferenceInput {
  return {
    userId,
    title: ref.title ?? ref.rawText ?? ref.markerText,
    authors: ref.authors ?? null,
    year: ref.year ?? null,
    doi: ref.doi ?? null,
    url: ref.url ?? null,
    semanticScholarId: ref.semanticScholarId ?? null,
    abstract: ref.abstract ?? null,
    venue: ref.venue ?? null,
    citationCount: ref.citationCount ?? null,
  };
}
