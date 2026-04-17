"use client";

import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CitationCard, type CitationWithStatus } from "@/components/reader/citation-card";
import { toast } from "sonner";

interface CitationsSidebarProps {
  documentId: number;
  open: boolean;
  citations: CitationWithStatus[];
  loading: boolean;
  onExtracted?: () => void;
  dockControl?: ReactNode;
}

export function CitationsSidebar({ documentId, open, citations, loading, onExtracted, dockControl }: CitationsSidebarProps) {
  const [extracting, setExtracting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const enrichFiredRef = useRef(false);

  // Auto-enrich once per session open when any ref lacks semanticScholarId
  useEffect(() => {
    if (!open || loading || enrichFiredRef.current) return;
    if (citations.length === 0) return;
    if (!citations.some((r) => !r.semanticScholarId)) return;

    enrichFiredRef.current = true;
    setEnriching(true);

    fetch(`/api/documents/${documentId}/citations/enrich`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error(`enrich failed: ${res.status}`);
        return res.json();
      })
      .then(() => {
        onExtracted?.();
      })
      .catch((err) => {
        console.error("[citations-sidebar] enrich error", err);
        toast.error("Enrichment failed. Citations shown with available data.");
      })
      .finally(() => {
        setEnriching(false);
      });
  }, [open, loading, citations, documentId, onExtracted]);

  const handleExtract = useCallback(async () => {
    setExtracting(true);
    try {
      await fetch(`/api/documents/${documentId}/citations/extract`, { method: "POST" });
      onExtracted?.();
    } finally {
      setExtracting(false);
    }
  }, [documentId, onExtracted]);

  if (!open) return null;

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="truncate text-sm font-semibold">Citations</h2>
        {dockControl}
      </div>
      {enriching && (
        <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
          <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
          Enriching from Semantic Scholar…
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        {loading && (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            <p className="text-xs text-muted-foreground">Loading…</p>
          </div>
        )}
        {!loading && citations.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground/50"
              aria-hidden="true"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <p className="text-sm font-medium text-muted-foreground">No citations detected</p>
            <p className="text-xs text-muted-foreground/70">
              This document may use a citation format not yet supported.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={extracting}
              onClick={handleExtract}
            >
              {extracting ? (
                <>
                  <span className="mr-2 h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                  Extracting…
                </>
              ) : (
                "Extract Citations"
              )}
            </Button>
          </div>
        )}
        {!loading && citations.length > 0 && (
          <div className="space-y-2">
            {citations.map((c) => (
              <CitationCard key={c.id} citation={c} variant="compact" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
