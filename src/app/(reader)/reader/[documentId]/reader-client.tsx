"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { SelectionToolbar, type HighlightColor } from "@/components/reader/selection-toolbar";
import { HighlightsSidebar } from "@/components/reader/highlights-sidebar";
import { CommentThread } from "@/components/reader/comment-thread";
import { CommentInput } from "@/components/reader/comment-input";
import { ChatPanel } from "@/components/reader/chat-panel";
import { OutlineSidebar, type PdfOutlineItem } from "@/components/reader/outline-sidebar";
import { ConceptsPanel } from "@/components/reader/concepts-panel";
import { CitationCard, type CitationWithStatus } from "@/components/reader/citation-card";
import { CitationsSidebar } from "@/components/reader/citations-sidebar";
import { DockableSidebar } from "@/components/reader/dockable-sidebar";
import { toast } from "sonner";
import { useTextSelection } from "@/hooks/use-text-selection";
import { useReaderState } from "@/hooks/use-reader-state";
import { useCitationClick } from "@/hooks/use-citation-click";

const PdfViewer = dynamic(
  () => import("@/components/reader/pdf-viewer").then((m) => ({ default: m.PdfViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading PDF...</p>
        </div>
      </div>
    ),
  }
);

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
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [conceptsOpen, setConceptsOpen] = useState(false);
  const [citationsOpen, setCitationsOpen] = useState(false);
  const pdfScrollRef = useRef<HTMLDivElement>(null);
  const { selection, clearSelection } = useTextSelection();
  const currentPage = useReaderState((s) => s.currentPage);
  const totalPages = useReaderState((s) => s.totalPages);
  const [pdfOutline, setPdfOutline] = useState<PdfOutlineItem[] | null>(null);
  const [pdfDoc, setPdfDoc] = useState<unknown>(null);

  // Citations
  const [citations, setCitations] = useState<CitationWithStatus[]>([]);
  const [citationsLoading, setCitationsLoading] = useState(true);
  const pendingCitationIds = useRef<Set<number>>(new Set());
  const { activeCitation, clickPosition, dismiss: dismissCitation } = useCitationClick(
    pdfScrollRef,
    citations
  );

  type MarkerRect = {
    id: number;
    referenceId: number;
    markerIndex: number;
    pageNumber: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  const [markers, setMarkers] = useState<MarkerRect[]>([]);
  const [citationsRefreshKey, setCitationsRefreshKey] = useState(0);

  useEffect(() => {
    setCitationsLoading(true);
    fetch(`/api/documents/${documentId}/citations`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { citations: CitationWithStatus[] }) => setCitations(data.citations))
      .catch(() => {/* non-fatal: citations just won't show */})
      .finally(() => setCitationsLoading(false));
  }, [documentId, citationsRefreshKey]);

  useEffect(() => {
    fetch(`/api/documents/${documentId}/citations/markers`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { markers: MarkerRect[] }) => setMarkers(data.markers))
      .catch(() => {/* non-fatal: overlays just won't show */});
  }, [documentId, citationsRefreshKey]);

  const patchCitation = useCallback(
    (citationId: number, patch: Partial<CitationWithStatus>) => {
      setCitations((prev) =>
        prev.map((c) => (c.id === citationId ? { ...c, ...patch } : c))
      );
    },
    []
  );

  const handleKeep = useCallback(async (citationId: number) => {
    // Guard against double-submit from rapid clicks
    if (pendingCitationIds.current.has(citationId)) return;
    pendingCitationIds.current.add(citationId);
    try {
      const res = await fetch(
        `/api/documents/${documentId}/citations/${citationId}/keep`,
        { method: "POST" }
      );
      if (res.ok) {
        const { keptId } = (await res.json()) as { keptId: number };
        patchCitation(citationId, { keptId });
        toast.success("Kept");
      } else {
        toast.error("Failed to keep citation");
      }
    } finally {
      pendingCitationIds.current.delete(citationId);
    }
  }, [documentId, patchCitation]);

  const handleSaveToLibrary = useCallback(async (citationId: number) => {
    if (pendingCitationIds.current.has(citationId)) return;
    pendingCitationIds.current.add(citationId);
    try {
      const res = await fetch(
        `/api/documents/${documentId}/citations/${citationId}/save`,
        { method: "POST" }
      );
      if (res.ok) {
        const { keptId, libraryReferenceId } = (await res.json()) as {
          keptId: number;
          libraryReferenceId: number;
        };
        patchCitation(citationId, { keptId, libraryReferenceId });
        toast.success("Saved to library");
      } else {
        toast.error("Failed to save to library");
      }
    } finally {
      pendingCitationIds.current.delete(citationId);
    }
  }, [documentId, patchCitation]);

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
            rects: selection.rects,
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

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      const doc = pdfDoc as {
        getOutline: () => Promise<Array<{ title: string; dest: unknown; items?: unknown[] }> | null>;
        getPageIndex: (ref: unknown) => Promise<number>;
        getDestination: (name: string) => Promise<unknown[] | null>;
      };
      const normalize = async (items: unknown[]): Promise<PdfOutlineItem[]> =>
        Promise.all(
          (items ?? []).map(async (raw) => {
            const it = raw as { title?: string; dest?: unknown; items?: unknown[] };
            let pageIndex: number | null = null;
            try {
              if (Array.isArray(it.dest)) {
                pageIndex = await doc.getPageIndex(it.dest[0]);
              } else if (typeof it.dest === "string") {
                const resolved = await doc.getDestination(it.dest);
                if (resolved && Array.isArray(resolved)) {
                  pageIndex = await doc.getPageIndex(resolved[0]);
                }
              }
            } catch {
              /* leaves pageIndex null */
            }
            return {
              title: it.title ?? "",
              pageIndex,
              items: await normalize(it.items ?? []),
            };
          })
        );
      try {
        const raw = await doc.getOutline();
        const normalized = await normalize(raw ?? []);
        if (!cancelled) setPdfOutline(normalized.length > 0 ? normalized : null);
      } catch {
        if (!cancelled) setPdfOutline(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);

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
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((o) => !o)}
        conceptsOpen={conceptsOpen}
        onToggleConcepts={() => setConceptsOpen((o) => !o)}
        citationsOpen={citationsOpen}
        onToggleCitations={() => setCitationsOpen((o) => !o)}
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
        <PdfViewer
          url={url}
          containerRef={pdfScrollRef}
          markers={markers}
          onPdfLoad={setPdfDoc}
        />
        {sidebarOpen && (
          <DockableSidebar id="highlights">
            <HighlightsSidebar documentId={documentId} open={sidebarOpen} refreshKey={refreshKey} />
          </DockableSidebar>
        )}
        <CommentThread
          documentId={documentId}
          open={commentSidebarOpen}
          refreshKey={commentRefreshKey}
        />
        {chatOpen && (
          <DockableSidebar id="chat">
            <ChatPanel
              documentId={documentId}
              open={chatOpen}
              scrollContainerRef={pdfScrollRef}
            />
          </DockableSidebar>
        )}
        {outlineOpen && (
          <DockableSidebar id="outline" defaultDock="left">
            <OutlineSidebar
              totalPages={totalPages}
              pdfOutline={pdfOutline}
              onNavigate={(page) => useReaderState.getState().setScrollTargetPage(page)}
            />
          </DockableSidebar>
        )}
        <ConceptsPanel
          selectedText={selection?.text ?? ""}
          open={conceptsOpen}
        />
        {citationsOpen && (
          <DockableSidebar id="citations">
            <CitationsSidebar
              documentId={documentId}
              open={citationsOpen}
              citations={citations}
              loading={citationsLoading}
              onExtracted={() => setCitationsRefreshKey((k) => k + 1)}
            />
          </DockableSidebar>
        )}
        {selection && (
          <SelectionToolbar
            rect={selection.rect}
            onHighlight={handleHighlight}
            onDismiss={clearSelection}
          />
        )}
        {activeCitation && clickPosition && (
          <CitationCard
            citation={activeCitation}
            rect={clickPosition}
            onDismiss={dismissCitation}
            onKeep={() => handleKeep(activeCitation.id)}
            onSaveToLibrary={() => handleSaveToLibrary(activeCitation.id)}
          />
        )}
      </div>
    </div>
  );
}
