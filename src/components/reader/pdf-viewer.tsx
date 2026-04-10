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
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalRef ?? internalRef;

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setLoading(false);
      setTotalPages(numPages);
    },
    [setTotalPages]
  );

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
  // The observer will naturally update currentPage once the new page is visible.
  useEffect(() => {
    if (scrollTargetPage === null) return;
    const el = containerRef.current;
    if (!el) {
      setScrollTargetPage(null);
      return;
    }
    const pageEl = el.querySelector(`[data-page-number="${scrollTargetPage}"]`);
    if (pageEl) {
      (pageEl as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setScrollTargetPage(null);
  }, [scrollTargetPage, containerRef, setScrollTargetPage]);

  // Sync currentPage with the most visible page as the user scrolls.
  // This is purely observational — it never triggers programmatic scrolling.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || totalPages <= 0) return;
    const pageEls = el.querySelectorAll("[data-page-number]");
    if (pageEls.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        let bestRatio = 0;
        let bestPage = 0;
        for (const entry of entries) {
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            const n = Number((entry.target as HTMLElement).dataset.pageNumber);
            if (Number.isFinite(n)) bestPage = n;
          }
        }
        if (bestPage > 0) setCurrentPage(bestPage);
      },
      { root: el, threshold: [0.25, 0.5, 0.75] }
    );
    pageEls.forEach((pageEl) => io.observe(pageEl));
    return () => io.disconnect();
  }, [totalPages, containerWidth, containerRef, setCurrentPage]);

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
          <Document file={url} onLoadSuccess={onDocumentLoadSuccess} onLoadError={(err) => setLoadError(err)}>
            {Array.from({ length: totalPages }, (_, i) => (
              <PdfPage key={i + 1} pageNumber={i + 1} width={containerWidth} />
            ))}
          </Document>
        )}
      </div>
    </div>
  );
}
