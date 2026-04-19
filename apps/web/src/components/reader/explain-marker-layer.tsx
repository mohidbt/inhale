"use client";

import { Hash, Image, Sigma } from "lucide-react";

export interface ExplainSegment {
  id: number;
  page: number;
  kind: "section_header" | "figure" | "formula";
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface ExplainMarkerLayerProps {
  segments: ExplainSegment[];
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  onMarkerClick?: (segmentId: number) => void;
}

const RENDERABLE_KINDS = new Set(["section_header", "figure", "formula"]);

function MarkerIcon({ kind }: { kind: ExplainSegment["kind"] }) {
  if (kind === "section_header") return <Hash size={16} aria-hidden="true" />;
  if (kind === "figure") return <Image size={16} aria-hidden="true" />;
  return <Sigma size={16} aria-hidden="true" />;
}

function ariaLabel(kind: ExplainSegment["kind"]): string {
  if (kind === "section_header") return "Explain section heading";
  if (kind === "figure") return "Explain figure";
  return "Explain formula";
}

export function ExplainMarkerLayer({
  segments,
  naturalWidth,
  naturalHeight,
  displayWidth,
  onMarkerClick,
}: ExplainMarkerLayerProps) {
  const scale = displayWidth / naturalWidth;
  const renderable = segments.filter((s) => RENDERABLE_KINDS.has(s.kind));

  return (
    <div
      data-testid="explain-marker-layer"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {renderable.map((segment) => {
        const cssLeft = segment.bbox.x1 * scale + 4;
        const cssTop = (naturalHeight - segment.bbox.y1) * scale;

        return (
          <button
            key={segment.id}
            data-testid={`explain-marker-${segment.id}`}
            aria-label={ariaLabel(segment.kind)}
            onClick={() => onMarkerClick?.(segment.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onMarkerClick?.(segment.id);
              }
            }}
            className="absolute flex items-center justify-center w-5 h-5 rounded-full bg-background/70 backdrop-blur-sm opacity-50 transition-all hover:opacity-100 hover:ring-2 hover:ring-ring cursor-pointer text-foreground"
            style={{
              top: cssTop,
              left: cssLeft,
              pointerEvents: "auto",
            }}
          >
            <MarkerIcon kind={segment.kind} />
          </button>
        );
      })}
    </div>
  );
}
