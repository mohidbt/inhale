"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface TextSelection {
  text: string;
  pageNumber: number;
  startOffset: number;
  endOffset: number;
  rect: { top: number; left: number; width: number; height: number };
}

export function useTextSelection() {
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelection(null);
      return;
    }

    const text = sel.toString().trim();
    const range = sel.getRangeAt(0);
    const domRect = range.getBoundingClientRect();
    const rect = { top: domRect.top, left: domRect.left, width: domRect.width, height: domRect.height };

    // Find which PDF page this selection is on via the data-page-number attribute
    const pageEl = range.startContainer.parentElement?.closest("[data-page-number]");
    const pageNumber = pageEl ? Number(pageEl.getAttribute("data-page-number")) : 1;

    setSelection({
      text,
      pageNumber,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      rect,
    });
  }, []);

  useEffect(() => {
    const debouncedHandler = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(handleSelectionChange, 50);
    };

    document.addEventListener("selectionchange", debouncedHandler);
    return () => {
      document.removeEventListener("selectionchange", debouncedHandler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [handleSelectionChange]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  return { selection, clearSelection };
}
