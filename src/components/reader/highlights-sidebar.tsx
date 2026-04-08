"use client";

import { useEffect, useState, useCallback } from "react";

interface Highlight {
  id: number;
  pageNumber: number;
  textContent: string;
  color: string;
  note: string | null;
  createdAt: string;
}

const COLOR_MAP: Record<string, string> = {
  yellow: "border-l-yellow-400",
  green: "border-l-green-400",
  blue: "border-l-blue-400",
  pink: "border-l-pink-400",
  orange: "border-l-orange-400",
};

interface HighlightsSidebarProps {
  documentId: number;
  open: boolean;
  refreshKey?: number;
}

export function HighlightsSidebar({ documentId, open, refreshKey = 0 }: HighlightsSidebarProps) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHighlights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/highlights`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHighlights(data.highlights ?? []);
    } catch {
      setError("Failed to load highlights");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (open) loadHighlights();
  }, [open, loadHighlights, refreshKey]);

  if (!open) return null;

  return (
    <div className="flex w-72 flex-col border-l bg-background">
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
                <p className="mt-1 text-[10px] text-muted-foreground">Page {h.pageNumber}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
