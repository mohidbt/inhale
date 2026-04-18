"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { documentReferences } from "@/db/schema";
import type { InferSelectModel } from "drizzle-orm";

export type DocumentReference = InferSelectModel<typeof documentReferences>;

export interface CitationWithStatus extends DocumentReference {
  keptId: number | null;
  libraryReferenceId: number | null;
}

interface CitationCardProps {
  citation: CitationWithStatus;
  rect: { top: number; left: number };
  onDismiss: () => void;
  onKeep?: () => void;
  onSaveToLibrary?: () => void;
}

export function CitationCard({
  citation,
  rect,
  onDismiss,
  onKeep,
  onSaveToLibrary,
}: CitationCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [leftPos, setLeftPos] = useState<number>(rect.left);

  // Dismiss on click outside or Escape key
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss]);

  // Clamp card to viewport horizontally — runs client-side only after mount
  useEffect(() => {
    setLeftPos(Math.min(rect.left, window.innerWidth - 336));
  }, [rect.left]);

  const title = citation.title ?? citation.rawText ?? citation.markerText;
  const abstract = citation.abstract
    ? citation.abstract.length > 300
      ? citation.abstract.slice(0, 300) + "…"
      : citation.abstract
    : null;

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Citation details"
      className="fixed z-50 w-80 rounded-lg border bg-background shadow-xl"
      style={{ top: rect.top, left: Math.max(8, leftPos) }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b p-3">
        <p className="text-xs font-semibold leading-snug text-foreground line-clamp-3">
          {title}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          className="size-6 shrink-0"
          aria-label="Close"
        >
          <X data-icon="inline-start" />
        </Button>
      </div>

      {/* Metadata */}
      <div className="space-y-1.5 p-3">
        {citation.authors && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {citation.authors}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {citation.year && <span>{citation.year}</span>}
          {citation.venue && (
            <>
              {citation.year && <span aria-hidden>·</span>}
              <span className="italic line-clamp-1">{citation.venue}</span>
            </>
          )}
          {citation.citationCount != null && (
            <>
              {(citation.year || citation.venue) && <span aria-hidden>·</span>}
              <span>{citation.citationCount} citations</span>
            </>
          )}
        </div>

        {abstract && (
          <p className="text-xs text-foreground/80 leading-relaxed pt-1">
            {abstract}
          </p>
        )}

        {citation.doi && (
          <a
            href={`https://doi.org/${citation.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-xs text-foreground underline underline-offset-4 hover:text-primary"
          >
            doi:{citation.doi}
          </a>
        )}
        {!citation.doi && citation.url && (
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-xs text-foreground underline underline-offset-4 hover:text-primary"
          >
            {citation.url}
          </a>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t p-3">
        <Button
          size="sm"
          variant={citation.keptId ? "secondary" : "default"}
          className="flex-1 text-xs"
          onClick={onKeep}
          disabled={!!citation.keptId}
          aria-label={citation.keptId ? "Already kept" : "Keep It"}
        >
          {citation.keptId ? "Kept ✓" : "Keep It"}
        </Button>
        <Button
          size="sm"
          variant={citation.libraryReferenceId ? "secondary" : "outline"}
          className="flex-1 text-xs"
          onClick={onSaveToLibrary}
          disabled={!!citation.libraryReferenceId}
          aria-label={citation.libraryReferenceId ? "Already in library" : "Save to Library"}
        >
          {citation.libraryReferenceId ? "In Library ✓" : "Save to Library"}
        </Button>
      </div>
    </div>
  );
}
