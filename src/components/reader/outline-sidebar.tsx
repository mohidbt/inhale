"use client";

import { useEffect, useState, useCallback } from "react";

interface OutlineItem {
  title: string;
  pageStart: number;
  summary: string;
}

interface OutlineSidebarProps {
  documentId: number;
  open: boolean;
}

export function OutlineSidebar({ documentId, open }: OutlineSidebarProps) {
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOutline = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/documents/${documentId}/outline`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setOutline(data.outline ?? []))
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setError("Failed to load outline");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [documentId]);

  useEffect(() => {
    if (!open) return;
    return loadOutline();
  }, [open, loadOutline]);

  if (!open) return null;

  return (
    <div className="flex w-72 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Outline</h2>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!loading && !error && outline.length === 0 && (
          <p className="text-xs text-muted-foreground">No outline generated yet.</p>
        )}
        {!loading && !error && outline.length > 0 && (
          <div className="space-y-4">
            {outline.map((item, i) => (
              <div key={i} className="space-y-1">
                <p className="text-xs font-medium leading-snug">{item.title}</p>
                <p className="text-[10px] text-muted-foreground">Page {item.pageStart}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
