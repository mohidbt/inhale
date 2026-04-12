"use client";

import { useEffect, useState } from "react";
import { usePageContext } from "react-pdf";

interface TextLine {
  y: number;
  x: number;
  height: number;
  width: number;
  text: string;
}

/**
 * Custom text layer that renders PDF text as inline HTML per line.
 * Replaces react-pdf's default text layer (absolutely-positioned per-word
 * spans) to get browser-native text selection: continuous highlights,
 * triple-click line select, and smooth multi-line selection.
 *
 * Must be rendered as a child of react-pdf's <Page> component.
 */
export function InlineTextLayer() {
  const context = usePageContext();
  const [lines, setLines] = useState<TextLine[]>([]);

  const page = context?.page;
  const scale = context?.scale ?? 1;

  useEffect(() => {
    if (!page) return;
    let cancelled = false;

    const viewport = page.getViewport({ scale });

    page.getTextContent().then((content) => {
      if (cancelled) return;

      const items = content.items.filter(
        (item): item is Extract<(typeof content.items)[number], { str: string }> =>
          "str" in item
      );

      // Group by Y coordinate (within 2 PDF-unit tolerance = same line)
      const lineMap = new Map<number, typeof items>();
      for (const item of items) {
        const pdfY = item.transform[5];
        let key = pdfY;
        for (const existing of lineMap.keys()) {
          if (Math.abs(existing - pdfY) < 2) {
            key = existing;
            break;
          }
        }
        if (!lineMap.has(key)) lineMap.set(key, []);
        lineMap.get(key)!.push(item);
      }

      const result: TextLine[] = [];
      for (const [pdfY, lineItems] of lineMap) {
        lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

        // Split into segments at large X gaps (column detection).
        // A gap larger than the font height indicates a column break.
        const segments: (typeof items)[] = [[]];
        for (let i = 0; i < lineItems.length; i++) {
          const item = lineItems[i];
          if (i > 0) {
            const prev = lineItems[i - 1];
            const gap = item.transform[4] - (prev.transform[4] + prev.width);
            const fontH = Math.abs(item.transform[3]);
            if (gap > fontH * 1.5) {
              segments.push([]); // start new segment (column break)
            }
          }
          segments[segments.length - 1].push(item);
        }

        for (const seg of segments) {
          const text = seg.map((it) => it.str).join("");
          if (!text.trim()) continue;

          const first = seg[0];
          const last = seg[seg.length - 1];
          const pdfX = first.transform[4];
          const fontHeight = Math.abs(first.transform[3]);

          // Expected width from PDF coordinates
          const pdfWidth = last.transform[4] + last.width - first.transform[4];

          const [vx, vy] = viewport.convertToViewportPoint(pdfX, pdfY);

          result.push({
            y: vy,
            x: vx,
            height: fontHeight * scale,
            width: pdfWidth * scale,
            text,
          });
        }
      }

      setLines(result);
    });

    return () => {
      cancelled = true;
    };
  }, [page, scale]);

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ zIndex: 2, lineHeight: 1 }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: line.y,
            left: line.x,
            width: line.width,
            height: line.height * 1.2,
            fontSize: line.height,
            color: "transparent",
            whiteSpace: "pre",
            cursor: "text",
            overflow: "hidden",
          }}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
}
