"use client";

import { useState, useCallback } from "react";
import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { PdfViewer } from "@/components/reader/pdf-viewer";
import { SelectionToolbar } from "@/components/reader/selection-toolbar";
import { HighlightsSidebar } from "@/components/reader/highlights-sidebar";
import { useTextSelection } from "@/hooks/use-text-selection";

interface ReaderClientProps {
  documentId: number;
  title: string;
}

export function ReaderClient({ documentId, title }: ReaderClientProps) {
  const url = `/api/documents/${documentId}/file`;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { selection, clearSelection } = useTextSelection();

  const handleHighlight = useCallback(
    async (color: string) => {
      if (!selection) return;
      try {
        await fetch(`/api/documents/${documentId}/highlights`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageNumber: selection.pageNumber,
            textContent: selection.text,
            startOffset: selection.startOffset,
            endOffset: selection.endOffset,
            color,
          }),
        });
        setRefreshKey((k) => k + 1);
        clearSelection();
      } catch {
        // TODO: show toast in a future iteration
      }
    },
    [selection, documentId, clearSelection]
  );

  return (
    <div className="flex h-screen flex-col">
      <ReaderToolbar
        title={title}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />
      <div className="relative flex flex-1 overflow-hidden">
        <PdfViewer url={url} />
        <HighlightsSidebar documentId={documentId} open={sidebarOpen} refreshKey={refreshKey} />
        {selection && (
          <SelectionToolbar
            rect={selection.rect}
            onHighlight={handleHighlight}
            onDismiss={clearSelection}
          />
        )}
      </div>
    </div>
  );
}
