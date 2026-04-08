"use client";

import { useEffect, useState, useCallback } from "react";

interface Concept {
  term: string;
  definition: string;
}

interface ConceptsPanelProps {
  documentId: number;
  open: boolean;
}

export function ConceptsPanel({ documentId, open }: ConceptsPanelProps) {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConcepts = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/documents/${documentId}/outline`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setConcepts(data.concepts ?? []))
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setError("Failed to load concepts");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [documentId]);

  useEffect(() => {
    if (!open) return;
    return loadConcepts();
  }, [open, loadConcepts]);

  if (!open) return null;

  return (
    <div className="flex w-72 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Key Concepts</h2>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!loading && !error && concepts.length === 0 && (
          <p className="text-xs text-muted-foreground">No concepts extracted yet.</p>
        )}
        {!loading && !error && concepts.length > 0 && (
          <div className="space-y-4">
            {concepts.map((c, i) => (
              <div key={i} className="space-y-1">
                <p className="text-xs font-bold leading-snug">{c.term}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{c.definition}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
