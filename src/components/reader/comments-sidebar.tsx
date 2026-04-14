"use client";

import { useMemo } from "react";
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

interface CommentsSidebarProps {
  open: boolean;
  highlights: Highlight[];
  loading: boolean;
  error: string | null;
  onNavigate: (pageNumber: number) => void;
  onAskAi?: (text: string, pageNumber: number) => void;
}

export function CommentsSidebar({
  open,
  highlights,
  loading,
  error,
  onNavigate,
  onAskAi,
}: CommentsSidebarProps) {
  const commented = useMemo(
    () =>
      highlights
        .filter((h) => h.comment && h.comment.trim().length > 0)
        .slice()
        .sort((a, b) => {
          if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }),
    [highlights]
  );

  if (!open) return null;

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Comments</h2>
        <span className="text-[10px] text-muted-foreground">{commented.length}</span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!loading && !error && commented.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No comments yet. Select text and click Comment.
          </p>
        )}
        {!loading && !error && commented.length > 0 && (
          <div className="space-y-3">
            {commented.map((h) => (
              <button
                type="button"
                key={h.id}
                onClick={() => onNavigate(h.pageNumber)}
                className={`block w-full text-left border-l-4 ${COLOR_MAP[h.color] ?? "border-l-gray-300"} py-1 pl-3 hover:bg-accent/40 rounded-r`}
              >
                <p className="text-xs font-medium leading-relaxed">{h.comment}</p>
                <p className="mt-1 line-clamp-2 text-[11px] italic text-muted-foreground">
                  &ldquo;{h.textContent}&rdquo;
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">Page {h.pageNumber}</p>
                  {onAskAi && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-2 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAskAi(h.textContent, h.pageNumber);
                      }}
                    >
                      Ask AI
                    </Button>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
