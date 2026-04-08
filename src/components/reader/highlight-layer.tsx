"use client";

interface Highlight {
  id: number;
  pageNumber: number;
  textContent: string;
  color: string;
}

interface HighlightLayerProps {
  highlights: Highlight[];
}

export function HighlightLayer({ highlights: _ }: HighlightLayerProps) {
  // Visual overlay rendering deferred — requires mapping stored offsets
  // to PDF.js text layer DOM elements. Data model is ready; sidebar provides value now.
  return null;
}
