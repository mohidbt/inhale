"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface Comment {
  id: number;
  content: string;
  pageNumber: number;
  highlightId: number | null;
  createdAt: string;
}

interface CommentThreadProps {
  documentId: number;
  open: boolean;
  refreshKey: number;
}

export function CommentThread({ documentId, open, refreshKey }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadComments = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/documents/${documentId}/comments`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ comments: Comment[] }>;
      })
      .then((data) => setComments(data.comments ?? []))
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setError("Failed to load comments");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [documentId]);

  useEffect(() => {
    if (!open) return;
    return loadComments();
  }, [open, loadComments, refreshKey]);

  const handleDelete = useCallback(
    async (commentId: number) => {
      try {
        const res = await fetch(
          `/api/documents/${documentId}/comments?commentId=${commentId}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        loadComments();
      } catch {
        // silently ignore delete errors; list will remain as-is
      }
    },
    [documentId, loadComments]
  );

  if (!open) return null;

  return (
    <div className="flex w-72 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Comments</h2>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!loading && !error && comments.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No comments yet. Add one with the toolbar above.
          </p>
        )}
        {!loading && !error && comments.length > 0 && (
          <div className="space-y-3">
            {comments.map((comment) => (
              <div key={comment.id} className="rounded-md border p-3">
                <p className="text-xs leading-relaxed">{comment.content}</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">p. {comment.pageNumber}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDelete(comment.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
