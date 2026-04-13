"use client";

import type { CitationWithStatus } from "@/components/reader/citation-card";

interface CitationsSidebarProps {
  documentId: number;
  open: boolean;
  citations: CitationWithStatus[];
  loading: boolean;
}

export function CitationsSidebar({ open, citations, loading }: CitationsSidebarProps) {
  if (!open) return null;

  return (
    <div className="flex w-72 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Citations</h2>
      </div>
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
          </div>
        )}
        {!loading && citations.length > 0 && (
          <div className="space-y-2">
            {citations.map((c) => {
              const label = c.title ?? c.rawText ?? c.markerText;
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
