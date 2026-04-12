"use client";

import { useState, useEffect, useCallback, type RefObject } from "react";
import { findCitationMarkerAtOffset } from "@/lib/citations/click-detection";
import type { CitationWithStatus } from "@/components/reader/citation-card";

interface CitationClickResult {
  activeCitation: CitationWithStatus | null;
  clickPosition: { top: number; left: number } | null;
  dismiss: () => void;
}

export function useCitationClick(
  containerRef: RefObject<HTMLElement | null>,
  citations: CitationWithStatus[]
): CitationClickResult {
  const [activeCitation, setActiveCitation] = useState<CitationWithStatus | null>(null);
  const [clickPosition, setClickPosition] = useState<{ top: number; left: number } | null>(null);

  const dismiss = useCallback(() => {
    setActiveCitation(null);
    setClickPosition(null);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleClick(e: MouseEvent) {
      // Use caretRangeFromPoint (WebKit/Blink) or caretPositionFromPoint (Firefox) for precise offset
      type CaretPositionFromPoint = (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      const docWithCaret = document as Document & { caretPositionFromPoint?: CaretPositionFromPoint };

      let node: Node | null = null;
      let offset = 0;

      if (typeof document.caretRangeFromPoint === "function") {
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (range) {
          node = range.startContainer;
          offset = range.startOffset;
        }
      } else if (typeof docWithCaret.caretPositionFromPoint === "function") {
        const pos = docWithCaret.caretPositionFromPoint(e.clientX, e.clientY);
        if (pos) {
          node = pos.offsetNode;
          offset = pos.offset;
        }
      }

      let markerIndex: number | null = null;

      if (node && node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? "";
        markerIndex = findCitationMarkerAtOffset(text, offset);
      }

      // Fallback: check the target element's text content for a lone [n] marker
      if (markerIndex === null) {
        const target = e.target as HTMLElement;
        const text = target.textContent ?? "";
        if (text.trim().match(/^\[\d{1,3}\]$/)) {
          markerIndex = findCitationMarkerAtOffset(text, text.indexOf("["));
        }
      }

      if (markerIndex === null) return;

      const citation = citations.find((c) => c.markerIndex === markerIndex);
      if (!citation) return;

      // Position the card just below + slightly right of the click, avoiding bottom clipping.
      // CARD_HEIGHT_ESTIMATE approximates the rendered card height (title + meta + abstract + buttons).
      const CARD_HEIGHT_ESTIMATE = 260;
      const top =
        e.clientY + CARD_HEIGHT_ESTIMATE > window.innerHeight
          ? e.clientY - CARD_HEIGHT_ESTIMATE
          : e.clientY + 12;

      setActiveCitation(citation);
      setClickPosition({ top, left: e.clientX });
    }

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [containerRef, citations]);

  return { activeCitation, clickPosition, dismiss };
}
