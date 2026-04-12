"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { documentReferences } from "@/db/schema";
import type { InferSelectModel } from "drizzle-orm";

export type DocumentReference = InferSelectModel<typeof documentReferences>;

interface CitationCardProps {
  citation: DocumentReference;
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
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
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
            className="block truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            doi:{citation.doi}
          </a>
        )}
        {!citation.doi && citation.url && (
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            {citation.url}
          </a>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t p-3">
        <Button
          size="sm"
          variant="default"
          className="flex-1 text-xs"
          onClick={onKeep}
        >
          Keep It
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs"
          onClick={onSaveToLibrary}
        >
          Save to Library
        </Button>
      </div>
    </div>
  );
}
