"use client";

import { useEffect, useRef, useState } from "react";

interface ConceptsPanelProps {
  selectedText: string;
  open: boolean;
}

export function ConceptsPanel({ selectedText, open }: ConceptsPanelProps) {
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || !selectedText.trim()) {
      setExplanation("");
      setError(null);
      return;
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setExplanation("");
    setError(null);

    (async () => {
      try {
        const res = await fetch("/api/ai/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: selectedText }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const msg = await res.text();
          setError(msg || `Error ${res.status}`);
          return;
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n\n").filter((l) => l.startsWith("data: "));
          for (const line of lines) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            if (data.startsWith("[ERROR]")) {
              setError(data.slice(7).trim());
              break;
            }
            accumulated += data;
            setExplanation(accumulated);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError("Failed to get explanation");
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [selectedText, open]);

  if (!open) return null;

  return (
    <div className="flex w-72 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Explain</h2>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {!selectedText.trim() && (
          <p className="text-xs text-muted-foreground">
            Select text in the document to get an explanation.
          </p>
        )}
        {selectedText.trim() && loading && !explanation && (
          <p className="text-xs text-muted-foreground">Explaining...</p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {explanation && (
          <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
            {explanation}
          </p>
        )}
      </div>
    </div>
  );
}
