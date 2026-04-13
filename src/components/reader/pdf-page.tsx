"use client";

import { memo, useState } from "react";
import { Page } from "react-pdf";
import { HighlightLayer } from "./highlight-layer";
import type { MarkerRect } from "./pdf-viewer";

interface PdfPageProps {
  pageNumber: number;
  width: number;
  zoom: number;
  markers?: MarkerRect[];
}

export const PdfPage = memo(function PdfPage({
  pageNumber,
  width,
  zoom,
  markers = [],
}: PdfPageProps) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const displayWidth = width * zoom;

  return (
    <div data-page-number={pageNumber} className="relative mb-4 shadow-md">
      <Page
        pageNumber={pageNumber}
        width={displayWidth}
        renderTextLayer={true}
        renderAnnotationLayer={true}
        onLoadSuccess={(page) => {
          const vp = page.getViewport({ scale: 1 });
          setNaturalSize({ width: vp.width, height: vp.height });
        }}
      />
      {naturalSize && markers.length > 0 && (
        <HighlightLayer
          markers={markers}
          naturalWidth={naturalSize.width}
          naturalHeight={naturalSize.height}
          displayWidth={displayWidth}
        />
      )}
    </div>
  );
});
