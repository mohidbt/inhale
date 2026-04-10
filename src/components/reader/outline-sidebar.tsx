"use client";

import { useEffect, useState, useCallback } from "react";

interface DocumentSection {
  id: number;
  documentId: number;
  sectionIndex: number;
  title: string | null;
  content: string;
  pageStart: number;
  pageEnd: number;
  createdAt: string;
}

interface OutlineSidebarProps {
  documentId: number;
  open: boolean;
  onNavigate?: (page: number) => void;
}

export function OutlineSidebar({ documentId, open, onNavigate }: OutlineSidebarProps) {
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSections = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/documents/${documentId}/outline`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setSections(data.sections ?? []))
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
    return loadSections();
  }, [open, loadSections]);

  if (!open) return null;

  return (
    <div className="flex w-72 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Outline</h2>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!loading && !error && sections.length === 0 && (
          <p className="text-xs text-muted-foreground">No outline generated yet.</p>
        )}
        {!loading && !error && sections.length > 0 && (
          <div className="space-y-4">
            {sections.map((section) => (
              <button
                key={section.id}
                className="w-full space-y-1 text-left"
                onClick={() => onNavigate?.(section.pageStart)}
              >
                <p className="text-xs font-medium leading-snug">{section.title ?? "Untitled"}</p>
                <p className="text-[10px] text-muted-foreground">Page {section.pageStart}</p>
                {section.content && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {section.content}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
