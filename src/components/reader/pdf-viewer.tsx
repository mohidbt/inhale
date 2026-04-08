"use client";

import { useCallback, useState } from "react";
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
  const [containerWidth, setContainerWidth] = useState(800);
  const setTotalPages = useReaderState((s) => s.setTotalPages);
  const totalPages = useReaderState((s) => s.totalPages);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setTotalPages(numPages);
    },
    [setTotalPages]
  );

  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setContainerWidth(node.clientWidth - 48);
    }
  }, []);

  return (
    <div ref={measureRef} className="flex-1 overflow-auto bg-muted/30 p-6">
      <div className="mx-auto flex flex-col items-center">
        <Document file={url} onLoadSuccess={onDocumentLoadSuccess}>
          {Array.from({ length: totalPages }, (_, i) => (
            <PdfPage key={i + 1} pageNumber={i + 1} width={containerWidth} />
          ))}
        </Document>
      </div>
    </div>
  );
}
