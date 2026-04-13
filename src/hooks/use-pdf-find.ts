"use client";

import { useCallback, useEffect, useRef } from "react";

type FindController = {
  executeCommand: (cmd: string, args: Record<string, unknown>) => void;
};

export function usePdfFind(pdfDocument: unknown) {
  const findCtrlRef = useRef<FindController | null>(null);

  useEffect(() => {
    if (!pdfDocument) return;
    let disposed = false;
    (async () => {
      const mod = await import("pdfjs-dist/web/pdf_viewer.mjs");
      if (disposed) return;
      const { EventBus, PDFFindController, PDFLinkService } = mod as unknown as {
        EventBus: new () => unknown;
        PDFLinkService: new (opts: { eventBus: unknown }) => {
          setDocument: (doc: unknown, baseUrl: unknown) => void;
        };
        PDFFindController: new (opts: {
          linkService: unknown;
          eventBus: unknown;
          updateMatchesCountOnProgress: boolean;
        }) => FindController & { setDocument: (doc: unknown) => void };
      };
      const eventBus = new EventBus();
      const linkService = new PDFLinkService({ eventBus });
      linkService.setDocument(pdfDocument, null);
      const controller = new PDFFindController({
        linkService,
        eventBus,
        updateMatchesCountOnProgress: true,
      });
      controller.setDocument(pdfDocument);
      findCtrlRef.current = controller;
    })();
    return () => {
      disposed = true;
      findCtrlRef.current = null;
    };
  }, [pdfDocument]);

  const search = useCallback((query: string, opts: { matchCase: boolean }) => {
    findCtrlRef.current?.executeCommand("find", {
      query,
      caseSensitive: opts.matchCase,
      entireWord: false,
      phraseSearch: true,
      highlightAll: true,
      findPrevious: false,
    });
  }, []);
  const next = useCallback(
    () => findCtrlRef.current?.executeCommand("findagain", { findPrevious: false }),
    []
  );
  const prev = useCallback(
    () => findCtrlRef.current?.executeCommand("findagain", { findPrevious: true }),
    []
  );

  return { search, next, prev };
}
