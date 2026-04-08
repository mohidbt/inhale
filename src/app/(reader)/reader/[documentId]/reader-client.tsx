"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { PdfViewer } from "@/components/reader/pdf-viewer";
import { SelectionToolbar, type HighlightColor } from "@/components/reader/selection-toolbar";
import { HighlightsSidebar } from "@/components/reader/highlights-sidebar";
import { CommentThread } from "@/components/reader/comment-thread";
import { CommentInput } from "@/components/reader/comment-input";
import { ChatPanel } from "@/components/reader/chat-panel";
import { useTextSelection } from "@/hooks/use-text-selection";
import { useReaderState } from "@/hooks/use-reader-state";

interface ReaderClientProps {
  documentId: number;
  title: string;
}

export function ReaderClient({ documentId, title }: ReaderClientProps) {
  const url = `/api/documents/${documentId}/file`;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [commentRefreshKey, setCommentRefreshKey] = useState(0);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentSidebarOpen, setCommentSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const pdfScrollRef = useRef<HTMLDivElement>(null);
  const { selection, clearSelection } = useTextSelection();
  const currentPage = useReaderState((s) => s.currentPage);

  const handleHighlight = useCallback(
    async (color: HighlightColor) => {
      if (!selection) return;
      setSaveError(null);
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
        setSaveError("Failed to save highlight. Please try again.");
      }
    },
    [selection, documentId, clearSelection]
  );

  useEffect(() => {
    if (!saveError) return;
    const timer = setTimeout(() => setSaveError(null), 3000);
    return () => clearTimeout(timer);
  }, [saveError]);

  return (
    <div className="flex h-screen flex-col">
      <ReaderToolbar
        title={title}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        commentSidebarOpen={commentSidebarOpen}
        onToggleCommentSidebar={() => setCommentSidebarOpen((o) => !o)}
        onAddComment={() => setShowCommentInput((v) => !v)}
        showCommentInput={showCommentInput}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((o) => !o)}
      />
      {saveError && (
        <div className="bg-destructive/10 text-destructive px-4 py-2 text-sm">
          {saveError}
        </div>
      )}
      {showCommentInput && (
        <div className="border-b bg-background">
          <CommentInput
            documentId={documentId}
            pageNumber={currentPage}
            onSaved={() => {
              setCommentRefreshKey((k) => k + 1);
              setShowCommentInput(false);
            }}
            onCancel={() => setShowCommentInput(false)}
          />
        </div>
      )}
      <div className="relative flex flex-1 overflow-hidden">
        <PdfViewer url={url} containerRef={pdfScrollRef} />
        <HighlightsSidebar documentId={documentId} open={sidebarOpen} refreshKey={refreshKey} />
        <CommentThread
          documentId={documentId}
          open={commentSidebarOpen}
          refreshKey={commentRefreshKey}
        />
        <ChatPanel
          documentId={documentId}
          open={chatOpen}
          scrollContainerRef={pdfScrollRef}
          apiKey=""
        />
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
