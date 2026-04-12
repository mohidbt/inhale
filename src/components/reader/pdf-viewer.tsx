"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { PdfPage } from "./pdf-page";
import { useReaderState } from "@/hooks/use-reader-state";

// Worker must be set in the same module as Document/Page usage (react-pdf requirement)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/** Number of pages to render above and below the visible range */
const BUFFER_PAGES = 2;
/** A4 aspect ratio (height / width) */
const A4_RATIO = 1.414;
/** Bottom margin per page in px (matches mb-4 = 16px) */
const PAGE_MARGIN = 16;

interface PdfViewerProps {
  url: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function PdfViewer({ url, containerRef: externalRef }: PdfViewerProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const setTotalPages = useReaderState((s) => s.setTotalPages);
  const totalPages = useReaderState((s) => s.totalPages);
  const scrollTargetPage = useReaderState((s) => s.scrollTargetPage);
  const setScrollTargetPage = useReaderState((s) => s.setScrollTargetPage);
  const setCurrentPage = useReaderState((s) => s.setCurrentPage);
  const zoom = useReaderState((s) => s.zoom);
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalRef ?? internalRef;

  // Track which pages are currently visible (by IntersectionObserver on placeholders)
  const [visiblePages, setVisiblePages] = useState<Set<number>>(
    () => new Set([1])
  );

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setLoading(false);
      setTotalPages(numPages);
    },
    [setTotalPages]
  );

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width - 48);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  // Scroll to an explicitly requested page (Prev/Next buttons, outline clicks, etc.)
  useEffect(() => {
    if (scrollTargetPage === null) return;
    const el = containerRef.current;
    if (!el) {
      setScrollTargetPage(null);
      return;
    }
    const pageEl = el.querySelector(`[data-page-number="${scrollTargetPage}"]`);
    if (pageEl) {
      (pageEl as HTMLElement).scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
    setScrollTargetPage(null);
  }, [scrollTargetPage, containerRef, setScrollTargetPage]);

  // Observe all page slots (both real pages and placeholders) to determine
  // which pages are visible, and also track the current page for the toolbar.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || totalPages <= 0) return;
    const pageEls = el.querySelectorAll("[data-page-number]");
    if (pageEls.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        // Update visible pages set
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const n = Number(
              (entry.target as HTMLElement).dataset.pageNumber
            );
            if (!Number.isFinite(n)) continue;
            if (entry.isIntersecting) {
              next.add(n);
            } else {
              next.delete(n);
            }
          }
          // Avoid unnecessary re-render if nothing changed
          if (
            next.size === prev.size &&
            [...next].every((p) => prev.has(p))
          ) {
            return prev;
          }
          return next;
        });

        // Track current page (most visible)
        let bestRatio = 0;
        let bestPage = 0;
        for (const entry of entries) {
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            const n = Number(
              (entry.target as HTMLElement).dataset.pageNumber
            );
            if (Number.isFinite(n)) bestPage = n;
          }
        }
        if (bestPage > 0) setCurrentPage(bestPage);
      },
      { root: el, threshold: [0, 0.25, 0.5, 0.75] }
    );
    pageEls.forEach((pageEl) => io.observe(pageEl));
    return () => io.disconnect();
  }, [totalPages, containerRef, setCurrentPage]);

  // Compute which pages should be fully rendered (visible + buffer)
  const renderedPages = new Set<number>();
  for (const p of visiblePages) {
    for (
      let i = Math.max(1, p - BUFFER_PAGES);
      i <= Math.min(totalPages, p + BUFFER_PAGES);
      i++
    ) {
      renderedPages.add(i);
    }
  }

  /** Estimated height of a page placeholder at current zoom */
  const estimatedHeight = containerWidth * zoom * A4_RATIO + PAGE_MARGIN;

  return (
    <div ref={containerRef} className="flex-1 overflow-auto bg-muted/30 p-6">
      <div className="mx-auto flex flex-col items-center">
        {loading && !loadError && (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading PDF...</p>
          </div>
        )}
        {loadError && (
          <p className="text-destructive text-sm">
            Failed to load document. Please try again.
          </p>
        )}
        {containerWidth > 0 && (
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(err) => setLoadError(err)}
          >
            {Array.from({ length: totalPages }, (_, i) => {
              const pageNumber = i + 1;
              if (renderedPages.has(pageNumber)) {
                return (
                  <PdfPage
                    key={pageNumber}
                    pageNumber={pageNumber}
                    width={containerWidth}
                    zoom={zoom}
                  />
                );
              }
              // Placeholder — preserves layout and data-page-number for
              // scroll-to-page and IntersectionObserver tracking
              return (
                <div
                  key={pageNumber}
                  data-page-number={pageNumber}
                  className="mb-4"
                  style={{ height: estimatedHeight, width: containerWidth * zoom }}
                />
              );
            })}
          </Document>
        )}
      </div>
    </div>
  );
}
