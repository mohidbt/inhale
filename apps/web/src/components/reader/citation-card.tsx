"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { documentReferences } from "@/db/schema";
import type { InferSelectModel } from "drizzle-orm";
import { toast } from "sonner";
import { formatBibtex } from "@/lib/citations/bibtex";

export type DocumentReference = InferSelectModel<typeof documentReferences>;

export interface CitationWithStatus extends DocumentReference {
  keptId: number | null;
  libraryReferenceId: number | null;
  /** isOpenAccess from S2 API — not stored in DB, optionally passed through */
  isOpenAccess?: boolean | null;
}

export type CitationCardVariant = "popover" | "compact";

interface CitationCardProps {
  citation: CitationWithStatus;
  rect?: { top: number; left: number };
  onDismiss?: () => void;
  onKeep?: () => void;
  onSaveToLibrary?: () => void;
  variant?: CitationCardVariant;
}

// ---------------------------------------------------------------------------
// External-ID pill config
// ---------------------------------------------------------------------------

type PillConfig = { label: string; url: (id: string) => string };

const PILL_MAP: Record<string, PillConfig> = {
  DOI: { label: "DOI", url: (id) => `https://doi.org/${id}` },
  ArXiv: { label: "arXiv", url: (id) => `https://arxiv.org/abs/${id}` },
  PubMed: { label: "PubMed", url: (id) => `https://pubmed.ncbi.nlm.nih.gov/${id}/` },
  ACL: { label: "ACL", url: (id) => `https://aclanthology.org/${id}` },
  DBLP: { label: "DBLP", url: (id) => `https://dblp.org/rec/${id}` },
  PMC: { label: "PMC", url: (id) => `https://ncbi.nlm.nih.gov/pmc/articles/${id}` },
};

// ---------------------------------------------------------------------------
// CitationCard
// ---------------------------------------------------------------------------

export function CitationCard({
  citation,
  rect,
  onDismiss,
  onKeep,
  onSaveToLibrary,
  variant = "popover",
}: CitationCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [leftPos, setLeftPos] = useState<number>(rect?.left ?? 0);
  const [abstractExpanded, setAbstractExpanded] = useState(false);

  const isPopover = variant === "popover";

  // Dismiss on click outside or Escape key (popover mode only)
  useEffect(() => {
    if (!isPopover || !onDismiss) return;

    function handleMouseDown(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onDismiss!();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss!();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss, isPopover]);

  // Clamp card to viewport (popover mode only)
  useEffect(() => {
    if (!isPopover || !rect) return;
    setLeftPos(Math.min(rect.left, window.innerWidth - 336));
  }, [rect, isPopover]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const title = citation.title ?? citation.rawText ?? citation.markerText;

  // Title link
  const titleHref = citation.semanticScholarId
    ? `https://www.semanticscholar.org/paper/${citation.semanticScholarId}`
    : citation.doi
    ? `https://doi.org/${citation.doi}`
    : null;

  // Authors
  const authors = citation.authors ?? [];

  // Metrics
  const showOaBadge = !!(citation.openAccessPdfUrl || citation.isOpenAccess);

  // External ID pills
  const pills = Object.entries(citation.externalIds ?? {}).flatMap(([key, id]) => {
    const cfg = PILL_MAP[key];
    return cfg ? [{ key, label: cfg.label, href: cfg.url(id) }] : [];
  });

  // BibTeX
  async function handleCopyBibtex() {
    const bibtex =
      citation.bibtex ??
      formatBibtex({
        paperId: citation.semanticScholarId,
        doi: citation.doi,
        title: citation.title,
        authors: citation.authors,
        year: citation.year ? Number(citation.year) : null,
        venue: citation.venue,
      });
    try {
      await navigator.clipboard.writeText(bibtex);
      toast.success("BibTeX copied");
    } catch {
      toast.error("Failed to copy BibTeX");
    }
  }

  // ---------------------------------------------------------------------------
  // Variant-dependent classes
  // ---------------------------------------------------------------------------

  const padding = isPopover ? "p-4" : "p-3";
  const headerPadding = isPopover ? "p-3" : "p-2";
  const titleClass = isPopover ? "text-base" : "text-sm";
  const abstractClamp = isPopover ? "line-clamp-3" : "line-clamp-2";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const cardContent = (
    <div
      ref={cardRef}
      role={isPopover ? "dialog" : undefined}
      aria-label={isPopover ? "Citation details" : undefined}
      className={isPopover
        ? "fixed z-50 w-80 rounded-lg border bg-background shadow-xl"
        : "rounded-lg border bg-background"}
      style={isPopover && rect ? { top: rect.top, left: Math.max(8, leftPos) } : undefined}
    >
      {/* Header: title + close button (popover only) */}
      <div className={`flex items-start justify-between gap-2 border-b ${headerPadding}`}>
        {titleHref ? (
          <a
            href={titleHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="citation-title"
            className={`font-semibold leading-snug text-foreground hover:underline line-clamp-3 ${titleClass}`}
          >
            {title}
          </a>
        ) : (
          <p
            data-testid="citation-title"
            className={`font-semibold leading-snug text-foreground line-clamp-3 ${titleClass}`}
          >
            {title}
          </p>
        )}
        {isPopover && onDismiss && (
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
        )}
      </div>

      {/* Body */}
      <div className={`space-y-1.5 ${padding}`}>
        {/* Authors */}
        {authors.length > 0 && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {authors.map((author, i) => {
              const authorEl = author.authorId ? (
                <a
                  key={author.name}
                  href={`https://www.semanticscholar.org/author/${author.authorId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {author.name}
                </a>
              ) : (
                <span key={author.name}>{author.name}</span>
              );
              return i < authors.length - 1 ? (
                <span key={`${author.name}-wrap`}>{authorEl}{", "}</span>
              ) : authorEl;
            })}
          </p>
        )}

        {/* Metrics line: Venue · Year · citations · OA badge */}
        {(citation.venue || citation.year || citation.citationCount != null || showOaBadge) && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {citation.venue && <span className="italic">{citation.venue}</span>}
            {citation.venue && citation.year && <span aria-hidden>·</span>}
            {citation.year && <span>{citation.year}</span>}
            {(citation.venue || citation.year) && citation.citationCount != null && (
              <span aria-hidden>·</span>
            )}
            {citation.citationCount != null && (
              <span>
                ⭐ {citation.citationCount}
                {(citation.influentialCitationCount ?? 0) > 0 && (
                  <span className="ml-1 text-muted-foreground/70">
                    ({citation.influentialCitationCount} influential)
                  </span>
                )}
              </span>
            )}
            {showOaBadge && (
              <span
                title="Open Access PDF available"
                className="ml-1 inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
              >
                OA
              </span>
            )}
          </div>
        )}

        {/* TL;DR */}
        {citation.tldrText && (
          <p
            title={citation.tldrText}
            className="text-xs italic text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap"
          >
            {citation.tldrText}
          </p>
        )}

        {/* Abstract (collapsible) */}
        {citation.abstract && (
          <div className="pt-0.5">
            <p
              className={`text-xs text-foreground/80 leading-relaxed ${abstractExpanded ? "" : abstractClamp}`}
            >
              {citation.abstract}
            </p>
            <button
              type="button"
              onClick={() => setAbstractExpanded((v) => !v)}
              className="mt-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {abstractExpanded ? "Show less" : "Show more"}
            </button>
          </div>
        )}

        {/* External-ID pills */}
        {pills.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {pills.map(({ key, label, href }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border border-border bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={`flex flex-wrap gap-2 border-t ${headerPadding}`}>
        {/* Keep It (legacy popover behavior) */}
        {onKeep !== undefined && (
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
        )}
        {/* Save to Library */}
        {onSaveToLibrary !== undefined && (
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
        )}
        {/* Copy BibTeX */}
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs"
          onClick={handleCopyBibtex}
          aria-label="Copy BibTeX"
        >
          Copy BibTeX
        </Button>
        {/* Open PDF */}
        {citation.openAccessPdfUrl && (
          <a
            href={citation.openAccessPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted h-7"
            aria-label="Open PDF"
          >
            Open PDF
          </a>
        )}
      </div>
    </div>
  );

  return cardContent;
}
