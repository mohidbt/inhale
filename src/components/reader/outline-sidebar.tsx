"use client";

import { useState } from "react";
import { PageThumbnail } from "./page-thumbnail";
import { useComputedOutline } from "@/hooks/use-computed-outline";

export interface PdfOutlineItem {
  title: string;
  pageIndex: number | null;
  items: PdfOutlineItem[];
}

interface Props {
  totalPages: number;
  pdfOutline: PdfOutlineItem[] | null;
  pdfDoc?: unknown;
  onNavigate: (pageNumber: number) => void;
}

export function OutlineSidebar({ totalPages, pdfOutline, pdfDoc, onNavigate }: Props) {
  const hasNativeContents = !!(pdfOutline && pdfOutline.length > 0);
  const [tab, setTab] = useState<"pages" | "contents">(hasNativeContents ? "contents" : "pages");

  // Only run the computed-outline heuristic if no native outline exists,
  // and only when the Contents tab is active (avoids upfront work).
  const computed = useComputedOutline(
    pdfDoc ?? null,
    !hasNativeContents && tab === "contents"
  );

  const contentsToShow: PdfOutlineItem[] | null = hasNativeContents
    ? pdfOutline!
    : computed.outline.length > 0
      ? computed.outline
      : null;

  return (
    <div data-testid="outline-sidebar" className="flex h-full flex-col">
      <div role="tablist" className="flex border-b">
        <button
          role="tab"
          aria-selected={tab === "pages"}
          onClick={() => setTab("pages")}
          className={`flex-1 p-2 text-xs ${tab === "pages" ? "font-semibold border-b-2 border-primary" : ""}`}
        >
          Pages
        </button>
        <button
          role="tab"
          aria-selected={tab === "contents"}
          onClick={() => setTab("contents")}
          data-testid="outline-tab-contents"
          className={`flex-1 p-2 text-xs ${tab === "contents" ? "font-semibold border-b-2 border-primary" : ""}`}
        >
          Contents
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {tab === "pages" && (
          <ul className="grid grid-cols-1 gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <li key={p}>
                <PageThumbnail
                  pageNumber={p}
                  pdfDoc={
                    pdfDoc as
                      | {
                          getPage: (n: number) => Promise<{
                            getViewport: (params: { scale: number }) => {
                              width: number;
                              height: number;
                            };
                            render: (params: {
                              canvasContext: CanvasRenderingContext2D;
                              viewport: { width: number; height: number };
                            }) => { promise: Promise<void>; cancel?: () => void };
                          }>;
                        }
                      | null
                  }
                  width={120}
                  onClick={onNavigate}
                />
              </li>
            ))}
          </ul>
        )}
        {tab === "contents" && (
          <>
            {contentsToShow ? (
              <OutlineTree items={contentsToShow} onNavigate={onNavigate} />
            ) : computed.loading ? (
              <p
                data-testid="contents-loading"
                className="px-2 py-4 text-center text-xs text-muted-foreground"
              >
                Building table of contents…
              </p>
            ) : (
              <p
                data-testid="contents-empty"
                className="px-2 py-6 text-center text-xs text-muted-foreground"
              >
                This PDF has no table of contents.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OutlineTree({
  items,
  onNavigate,
  level = 0,
}: {
  items: PdfOutlineItem[];
  onNavigate: (p: number) => void;
  level?: number;
}) {
  return (
    <ul className="space-y-0.5" style={{ paddingLeft: level * 8 }}>
      {items.map((it, i) => (
        <li key={i}>
          <button
            data-testid="outline-section"
            onClick={() => it.pageIndex != null && onNavigate(it.pageIndex + 1)}
            className="w-full text-left text-xs hover:underline"
          >
            {it.title}
          </button>
          {it.items.length > 0 && (
            <OutlineTree items={it.items} onNavigate={onNavigate} level={level + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}
