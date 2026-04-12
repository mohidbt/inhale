"use client";

import { useState, useEffect, useCallback, type RefObject } from "react";
import { findCitationMarkerAtOffset } from "@/lib/citations/click-detection";
import type { DocumentReference } from "@/components/reader/citation-card";

interface CitationClickResult {
  activeCitation: DocumentReference | null;
  clickPosition: { top: number; left: number } | null;
  dismiss: () => void;
}

export function useCitationClick(
  containerRef: RefObject<HTMLElement | null>,
  citations: DocumentReference[]
): CitationClickResult {
  const [activeCitation, setActiveCitation] = useState<DocumentReference | null>(null);
  const [clickPosition, setClickPosition] = useState<{ top: number; left: number } | null>(null);

  const dismiss = useCallback(() => {
    setActiveCitation(null);
    setClickPosition(null);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleClick(e: MouseEvent) {
      // Use caretRangeFromPoint for precise character offset detection
      const range =
        typeof document.caretRangeFromPoint === "function"
          ? document.caretRangeFromPoint(e.clientX, e.clientY)
          : null;

      let markerIndex: number | null = null;

      if (range) {
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent ?? "";
          const offset = range.startOffset;
          markerIndex = findCitationMarkerAtOffset(text, offset);
        }
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

      // Position the card just below + slightly right of the click, avoiding bottom clipping
      const CARD_HEIGHT_ESTIMATE = 260;
      const top =
        e.clientY + CARD_HEIGHT_ESTIMATE > window.innerHeight
          ? e.clientY - CARD_HEIGHT_ESTIMATE
          : e.clientY + 12;

      setActiveCitation(citation);
      setClickPosition({ top, left: e.clientX });
      e.stopPropagation();
    }

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [containerRef, citations]);

  return { activeCitation, clickPosition, dismiss };
}
