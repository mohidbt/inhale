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
}

export function PdfViewer({ url }: PdfViewerProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const setTotalPages = useReaderState((s) => s.setTotalPages);
  const totalPages = useReaderState((s) => s.totalPages);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
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
  }, []);

  return (
    <div ref={containerRef} className="flex-1 overflow-auto bg-muted/30 p-6">
      <div className="mx-auto flex flex-col items-center">
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
