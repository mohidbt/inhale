"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { SelectionToolbar, type HighlightColor } from "@/components/reader/selection-toolbar";
import { HighlightsSidebar } from "@/components/reader/highlights-sidebar";
import { CommentsSidebar } from "@/components/reader/comments-sidebar";
import { ChatPanel, type ChatSeed } from "@/components/reader/chat-panel";
import { OutlineSidebar, type PdfOutlineItem } from "@/components/reader/outline-sidebar";
import { CitationCard, type CitationWithStatus } from "@/components/reader/citation-card";
import { CitationsSidebar } from "@/components/reader/citations-sidebar";
import { DockableSidebar } from "@/components/reader/dockable-sidebar";
import { FindBar } from "@/components/reader/find-bar";
import { usePdfFind } from "@/hooks/use-pdf-find";
import { toast } from "sonner";
import { useTextSelection } from "@/hooks/use-text-selection";
import { useReaderState } from "@/hooks/use-reader-state";
import { useCitationClick } from "@/hooks/use-citation-click";
import { useUserHighlights } from "@/hooks/use-user-highlights";

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
  const [chatOpen, setChatOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [citationsOpen, setCitationsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const pdfScrollRef = useRef<HTMLDivElement>(null);
  const { selection, clearSelection } = useTextSelection();
  // Snapshot of `selection` taken when the user enters a long-lived
  // sub-mode (e.g. clicking Comment). The toolbar must survive the
  // selectionchange that fires when focus shifts to the popup, so we
  // pin the selection here and keep rendering the toolbar from this
  // snapshot until Save / Cancel / Escape clears it.
  type ActiveSelection = NonNullable<typeof selection>;
  const [activeSelection, setActiveSelection] = useState<ActiveSelection | null>(null);
  const currentPage = useReaderState((s) => s.currentPage);
  const totalPages = useReaderState((s) => s.totalPages);
  const [pdfOutline, setPdfOutline] = useState<PdfOutlineItem[] | null>(null);
  const [pdfDoc, setPdfDoc] = useState<unknown>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const find = usePdfFind(pdfDoc);
  const [chatSeed, setChatSeed] = useState<ChatSeed | null>(null);

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

  // User highlights — fetched at page level so overlay + sidebar share state
  const {
    highlights: sidebarHighlights,
    userHighlights,
    loading: highlightsLoading,
    error: highlightsError,
  } = useUserHighlights(documentId, refreshKey);

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

  // Toolbar reads from snapshot if present, else live selection.
  const toolbarSelection = activeSelection ?? selection;

  const saveHighlight = useCallback(
    async (color: HighlightColor): Promise<number | null> => {
      const sel = activeSelection ?? selection;
      if (!sel) return null;
      setSaveError(null);
      try {
        const res = await fetch(`/api/documents/${documentId}/highlights`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageNumber: sel.pageNumber,
            textContent: sel.text,
            startOffset: sel.startOffset,
            endOffset: sel.endOffset,
            color,
            rects: sel.rects,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { highlight: { id: number } };
        return data.highlight.id;
      } catch {
        setSaveError("Failed to save highlight. Please try again.");
        return null;
      }
    },
    [selection, activeSelection, documentId]
  );

  const handleDismissSelection = useCallback(() => {
    setActiveSelection(null);
    clearSelection();
  }, [clearSelection]);

  const handleHighlight = useCallback(
    async (color: HighlightColor) => {
      await saveHighlight(color);
      setRefreshKey((k) => k + 1);
      setActiveSelection(null);
      clearSelection();
    },
    [saveHighlight, clearSelection]
  );

  const handleComment = useCallback(
    async (text: string) => {
      const id = await saveHighlight("yellow");
      if (id && text.trim()) {
        try {
          await fetch(`/api/documents/${documentId}/highlights/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ comment: text }),
          });
        } catch {
          setSaveError("Failed to save comment.");
        }
      }
      setRefreshKey((k) => k + 1);
      setActiveSelection(null);
      clearSelection();
    },
    [saveHighlight, documentId, clearSelection]
  );

  const handleAskAi = useCallback(() => {
    const sel = activeSelection ?? selection;
    if (!sel) return;
    setChatSeed({
      text: sel.text,
      pageNumber: sel.pageNumber,
      scope: "selection",
      nonce: Date.now(),
    });
    setChatOpen(true);
    setActiveSelection(null);
    clearSelection();
  }, [selection, activeSelection, clearSelection]);

  const handleCommitStart = useCallback(() => {
    // Pin the current selection so the toolbar stays mounted even after
    // focus shifts and the window selection clears.
    if (selection) setActiveSelection(selection);
  }, [selection]);

  useEffect(() => {
    if (!saveError) return;
    const timer = setTimeout(() => setSaveError(null), 3000);
    return () => clearTimeout(timer);
  }, [saveError]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
      }
      if (e.key === "Escape") {
        // Escape dismisses any active selection toolbar (incl. comment popup)
        setActiveSelection(null);
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection]);

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
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((o) => !o)}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((o) => !o)}
        citationsOpen={citationsOpen}
        onToggleCitations={() => setCitationsOpen((o) => !o)}
        commentsOpen={commentsOpen}
        onToggleComments={() => setCommentsOpen((o) => !o)}
      />
      {saveError && (
        <div className="bg-destructive/10 text-destructive px-4 py-2 text-sm">
          {saveError}
        </div>
      )}
      <FindBar
        open={findOpen}
        matchCase={matchCase}
        onSearch={(q, opts) => find.search(q, opts)}
        onNext={find.next}
        onPrev={find.prev}
        onToggleCase={() => setMatchCase((v) => !v)}
        onClose={() => setFindOpen(false)}
      />
      <div className="relative flex flex-1 overflow-hidden">
        <PdfViewer
          url={url}
          containerRef={pdfScrollRef}
          markers={markers}
          userHighlights={userHighlights}
          onPdfLoad={setPdfDoc}
        />
        {sidebarOpen && (
          <DockableSidebar id="highlights">
            <HighlightsSidebar
              open={sidebarOpen}
              highlights={sidebarHighlights}
              loading={highlightsLoading}
              error={highlightsError}
              onAskAi={(text, pageNumber) => {
                setChatSeed({
                  text,
                  pageNumber,
                  scope: "selection",
                  nonce: Date.now(),
                });
                setChatOpen(true);
              }}
            />
          </DockableSidebar>
        )}
        {chatOpen && (
          <DockableSidebar id="chat">
            <ChatPanel
              documentId={documentId}
              open={chatOpen}
              scrollContainerRef={pdfScrollRef}
              seed={chatSeed}
            />
          </DockableSidebar>
        )}
        {outlineOpen && (
          <DockableSidebar id="outline" defaultDock="left">
            <OutlineSidebar
              totalPages={totalPages}
              pdfOutline={pdfOutline}
              pdfDoc={pdfDoc}
              onNavigate={(page) => useReaderState.getState().setScrollTargetPage(page)}
            />
          </DockableSidebar>
        )}
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
        {commentsOpen && (
          <DockableSidebar id="comments">
            <CommentsSidebar
              open={commentsOpen}
              highlights={sidebarHighlights}
              loading={highlightsLoading}
              error={highlightsError}
              onNavigate={(page) => useReaderState.getState().setScrollTargetPage(page)}
              onAskAi={(text, pageNumber) => {
                setChatSeed({
                  text,
                  pageNumber,
                  scope: "selection",
                  nonce: Date.now(),
                });
                setChatOpen(true);
              }}
            />
          </DockableSidebar>
        )}
        {toolbarSelection && (
          <SelectionToolbar
            rect={toolbarSelection.rect}
            onHighlight={handleHighlight}
            onDismiss={handleDismissSelection}
            onComment={handleComment}
            onAskAi={handleAskAi}
            onCommitStart={handleCommitStart}
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
