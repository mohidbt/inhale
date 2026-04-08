"use client";

import { Page } from "react-pdf";
import { useReaderState } from "@/hooks/use-reader-state";

interface PdfPageProps {
  pageNumber: number;
  width: number;
}

export function PdfPage({ pageNumber, width }: PdfPageProps) {
  const zoom = useReaderState((s) => s.zoom);

  return (
    <div data-page-number={pageNumber} className="mb-4 shadow-md">
      <Page
        pageNumber={pageNumber}
        width={width * zoom}
        renderTextLayer={true}
        renderAnnotationLayer={true}
      />
    </div>
  );
}
