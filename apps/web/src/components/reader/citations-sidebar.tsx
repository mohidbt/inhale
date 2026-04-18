"use client";

import { useState, useCallback, type ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { CitationWithStatus } from "@/components/reader/citation-card";

// Strip leading "[n] " or "n. " marker prefix that parseBibLines stores in rawText.
const MARKER_PREFIX_RE = /^(?:\[\d{1,3}\]\s+|\d{1,3}\.\s+)/;

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
      <div className="flex-1 overflow-auto p-4">
        {loading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}
        {!loading && citations.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpen className="size-6" aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No citations detected</EmptyTitle>
              <EmptyDescription>Format may not be supported.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                size="sm"
                variant="outline"
                disabled={extracting}
                onClick={handleExtract}
              >
                {extracting ? "Extracting…" : "Extract Citations"}
              </Button>
            </EmptyContent>
          </Empty>
        )}
        {!loading && citations.length > 0 && (
          <div className="space-y-2">
            {citations.map((c) => {
              // Prefer structured fields: authors (year) is clean even when rawText is
              // garbled by two-column PDF layouts interleaving bibliography with body text.
              // Fall back to a hard-capped rawText (120 chars) to avoid showing junk, then
              // title, then markerText.
              const structuredLabel =
                c.authors && c.year
                  ? `${c.authors} (${c.year})`
                  : c.authors ?? null;
              const rawLabel = c.rawText
                ? c.rawText.replace(MARKER_PREFIX_RE, "").trim().slice(0, 120)
                : null;
              const label = structuredLabel ?? rawLabel ?? c.title ?? c.markerText;
              return (
                <div
                  key={c.id}
                  className="rounded border px-3 py-2 text-xs leading-relaxed"
                >
                  <span className="mr-2 font-mono text-muted-foreground">
                    [{c.markerIndex}]
                  </span>
                  <span className="line-clamp-2">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
