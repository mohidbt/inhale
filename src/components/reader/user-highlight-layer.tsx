"use client";

export interface UserHighlight {
  id: number;
  color: "yellow" | "green" | "blue" | "pink" | "orange" | "amber";
  source: "user" | "ai-auto";
  layerId: string | null;
  rects: { page: number; x0: number; y0: number; x1: number; y1: number }[] | null;
}

const COLOR_BG: Record<UserHighlight["color"], string> = {
  yellow: "rgba(250,204,21,0.30)",
  green:  "rgba(74,222,128,0.30)",
  blue:   "rgba(96,165,250,0.30)",
  pink:   "rgba(244,114,182,0.30)",
  orange: "rgba(251,146,60,0.30)",
  amber:  "rgba(245,158,11,0.35)",
};

interface Props {
  highlights: UserHighlight[];
  pageNumber: number;
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
}

export function UserHighlightLayer({ highlights, pageNumber, naturalWidth, naturalHeight, displayWidth }: Props) {
  const scale = displayWidth / naturalWidth;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true">
      {highlights.flatMap((h) =>
        (h.rects ?? [])
          .filter((r) => r.page === pageNumber)
          .map((r, idx) => (
            <div
              key={`${h.id}-${idx}`}
              data-highlight-id={h.id}
              className="absolute rounded-sm transition-shadow hover:ring-2 hover:ring-primary/50"
              style={{
                top:    (naturalHeight - r.y1) * scale,
                left:   r.x0 * scale,
                width:  (r.x1 - r.x0) * scale,
                height: (r.y1 - r.y0) * scale,
                background: COLOR_BG[h.color],
                pointerEvents: "auto",
              }}
            />
          ))
      )}
    </div>
  );
}
