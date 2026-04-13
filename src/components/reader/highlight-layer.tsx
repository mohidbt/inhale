"use client";

interface CitationMarker {
  id: number;
  markerIndex: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface HighlightLayerProps {
  markers: CitationMarker[];
  naturalWidth: number;
  naturalHeight: number;
  /** Width of the rendered page in CSS pixels (width * zoom) */
  displayWidth: number;
}

export function HighlightLayer({
  markers,
  naturalWidth,
  naturalHeight,
  displayWidth,
}: HighlightLayerProps) {
  const scale = displayWidth / naturalWidth;

  return (
    <div
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden="true"
    >
      {markers.map((marker) => {
        // PDF y-axis is bottom-up; CSS is top-down.
        // y1 is the top of the rect in PDF coords (higher value).
        const cssTop = (naturalHeight - marker.y1) * scale;
        const cssLeft = marker.x0 * scale;
        const cssWidth = (marker.x1 - marker.x0) * scale;
        const cssHeight = (marker.y1 - marker.y0) * scale;

        return (
          <div
            key={marker.id}
            data-marker-index={marker.markerIndex}
            className="absolute rounded-[2px] bg-primary/10 ring-1 ring-primary/30 hover:bg-primary/20 cursor-pointer transition-colors"
            style={{
              top: cssTop,
              left: cssLeft,
              width: cssWidth,
              height: cssHeight,
              pointerEvents: "auto",
            }}
          />
        );
      })}
    </div>
  );
}
