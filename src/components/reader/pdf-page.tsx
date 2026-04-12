"use client";

import { memo } from "react";
import { Page } from "react-pdf";
import { InlineTextLayer } from "./inline-text-layer";

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
    <div data-page-number={pageNumber} className="mb-4 shadow-md relative">
      <Page
        pageNumber={pageNumber}
        width={width * zoom}
        renderTextLayer={false}
        renderAnnotationLayer={true}
      >
        <InlineTextLayer />
      </Page>
    </div>
  );
});
