"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { CitationCard } from "@/components/reader/citation-card";
import type { CitationWithStatus } from "@/components/reader/citation-card";
import type { InferSelectModel } from "drizzle-orm";
import type { libraryReferences } from "@/db/schema";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type LibraryRef = InferSelectModel<typeof libraryReferences>;

function toCardCitation(ref: LibraryRef): CitationWithStatus {
  return {
    // Required DocumentReference fields not on library refs — provide neutral defaults
    id: ref.id,
    documentId: 0,
    markerText: ref.title,
    markerIndex: 0,
    rawText: null,
    pageNumber: null,
    // Shared fields
    title: ref.title,
    authors: ref.authors ?? null,
    year: ref.year,
    doi: ref.doi,
    url: ref.url,
    semanticScholarId: ref.semanticScholarId,
    abstract: ref.abstract,
    venue: ref.venue,
    citationCount: ref.citationCount,
    createdAt: ref.createdAt,
    // Phase 2.2 enrichment fields
    influentialCitationCount: ref.influentialCitationCount,
    openAccessPdfUrl: ref.openAccessPdfUrl,
    tldrText: ref.tldrText,
    externalIds: ref.externalIds,
    bibtex: ref.bibtex,
    // Library-specific status (already saved)
    keptId: null,
    libraryReferenceId: ref.id,
  };
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json() as Promise<LibraryRef[]>;
  });

export default function ReferencesPage() {
  const { data: refs, isLoading, error, mutate } = useSWR<LibraryRef[]>(
    "/api/library/references",
    fetcher
  );

  useEffect(() => {
    if (error) toast.error("Failed to load references");
  }, [error]);

  async function handleRemove(id: number) {
    const prev = refs ?? [];
    mutate(
      prev.filter((x) => x.id !== id),
      { revalidate: false }
    );
    try {
      const res = await fetch(`/api/library/references/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`${res.status}`);
      mutate();
    } catch {
      mutate(prev, { revalidate: false });
      toast.error("Failed to remove reference");
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-semibold mb-6">Saved References</h1>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  const list = refs ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-semibold mb-6">Saved References</h1>

      {list.length === 0 ? (
        <div className="flex flex-col gap-1 text-muted-foreground">
          <p className="text-lg">No saved references yet.</p>
          <p className="text-sm">
            Click a citation in a paper and use &ldquo;Save to Library&rdquo;.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((ref) => (
            <div key={ref.id} className="relative group">
              <CitationCard citation={toCardCitation(ref)} variant="compact" />
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button variant="ghost" size="sm">
                      Remove
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove reference?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Remove this reference from your library?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => handleRemove(ref.id)}
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
