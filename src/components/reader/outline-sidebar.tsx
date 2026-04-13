"use client";

import { useState } from "react";

export interface PdfOutlineItem {
  title: string;
  pageIndex: number | null;
  items: PdfOutlineItem[];
}

interface Props {
  totalPages: number;
  pdfOutline: PdfOutlineItem[] | null;
  onNavigate: (pageNumber: number) => void;
}

export function OutlineSidebar({ totalPages, pdfOutline, onNavigate }: Props) {
  const hasContents = !!(pdfOutline && pdfOutline.length > 0);
  const [tab, setTab] = useState<"pages" | "contents">(hasContents ? "contents" : "pages");

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
        {hasContents && (
          <button
            role="tab"
            aria-selected={tab === "contents"}
            onClick={() => setTab("contents")}
            className={`flex-1 p-2 text-xs ${tab === "contents" ? "font-semibold border-b-2 border-primary" : ""}`}
          >
            Contents
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-2">
        {tab === "pages" && (
          <ul className="space-y-0.5">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <li key={p}>
                <button
                  onClick={() => onNavigate(p)}
                  className="w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  Page {p}
                </button>
              </li>
            ))}
          </ul>
        )}
        {tab === "contents" && hasContents && (
          <OutlineTree items={pdfOutline!} onNavigate={onNavigate} />
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
