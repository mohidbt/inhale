"use client";

import { memo } from "react";
import { Page } from "react-pdf";

interface PdfPageProps {
  pageNumber: number;
  width: number;
  zoom: number;
}

export const PdfPage = memo(function PdfPage({
  pageNumber,
  width,
  zoom,
}: PdfPageProps) {
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
});
