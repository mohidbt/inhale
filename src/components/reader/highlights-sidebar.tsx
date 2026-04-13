"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface Highlight {
  id: number;
  pageNumber: number;
  textContent: string;
  color: string;
  note: string | null;
  comment: string | null;
  createdAt: string;
}

const COLOR_MAP: Record<string, string> = {
  yellow: "border-l-yellow-400",
  green: "border-l-green-400",
  blue: "border-l-blue-400",
  pink: "border-l-pink-400",
  orange: "border-l-orange-400",
  amber: "border-l-amber-400",
};

interface HighlightsSidebarProps {
  documentId: number;
  open: boolean;
  refreshKey?: number;
  onAskAi?: (text: string) => void;
}

export function HighlightsSidebar({ documentId, open, refreshKey = 0, onAskAi }: HighlightsSidebarProps) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHighlights = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/documents/${documentId}/highlights`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setHighlights(data.highlights ?? []))
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setError("Failed to load highlights");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [documentId]);

  useEffect(() => {
    if (!open) return;
    return loadHighlights();
  }, [open, loadHighlights, refreshKey]);

  if (!open) return null;

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Highlights</h2>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!loading && !error && highlights.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No highlights yet. Select text to create one.
          </p>
        )}
        {!loading && !error && highlights.length > 0 && (
          <div className="space-y-3">
            {highlights.map((h) => (
              <div
                key={h.id}
                className={`border-l-4 ${COLOR_MAP[h.color] ?? "border-l-gray-300"} py-1 pl-3`}
              >
                <p className="line-clamp-3 text-xs leading-relaxed">{h.textContent}</p>
                {h.comment && (
                  <p className="mt-1 rounded bg-muted/50 px-2 py-1 text-xs italic text-muted-foreground">
                    {h.comment}
                  </p>
                )}
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">Page {h.pageNumber}</p>
                  {onAskAi && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-2 text-[10px]"
                      onClick={() => onAskAi(h.textContent)}
                    >
                      Ask AI
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
