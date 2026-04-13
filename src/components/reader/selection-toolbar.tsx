"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const COLORS = [
  { name: "yellow", class: "bg-yellow-300" },
  { name: "green", class: "bg-green-300" },
  { name: "blue", class: "bg-blue-300" },
  { name: "pink", class: "bg-pink-300" },
  { name: "orange", class: "bg-orange-300" },
] as const;

export type HighlightColor = (typeof COLORS)[number]["name"];

interface SelectionToolbarProps {
  rect: { top: number; left: number; width: number; height: number };
  onHighlight: (color: HighlightColor) => void;
  onDismiss: () => void;
  onComment?: (text: string) => void;
  onAskAi?: () => void;
}

export function SelectionToolbar({ rect, onHighlight, onDismiss, onComment, onAskAi }: SelectionToolbarProps) {
  const [mode, setMode] = useState<"main" | "comment">("main");
  const [commentText, setCommentText] = useState("");

  const containerStyle: React.CSSProperties = {
    top: rect.top - 44,
    left: rect.left + rect.width / 2 - 80,
  };

  if (mode === "comment") {
    return (
      <div
        className="fixed z-50 flex flex-col gap-2 rounded-lg border bg-background p-2 shadow-lg w-64"
        style={containerStyle}
      >
        <textarea
          className="h-20 w-full rounded border p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          placeholder="Add a comment…"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          autoFocus
        />
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setMode("main")} className="text-xs">
            Back
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onComment?.(commentText);
              setCommentText("");
              setMode("main");
            }}
            className="text-xs"
          >
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-50 flex items-center gap-1 rounded-lg border bg-background p-1 shadow-lg"
      style={containerStyle}
    >
      {COLORS.map((c) => (
        <button
          type="button"
          key={c.name}
          className={`h-6 w-6 rounded-full ${c.class} border border-black/10 hover:ring-2 ring-offset-1`}
          onClick={() => onHighlight(c.name)}
          title={c.name}
        />
      ))}
      {onComment && (
        <Button variant="ghost" size="sm" onClick={() => setMode("comment")} className="ml-1 text-xs">
          Comment
        </Button>
      )}
      {onAskAi && (
        <Button variant="ghost" size="sm" onClick={onAskAi} className="text-xs">
          Ask AI
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onDismiss} className="ml-1 text-xs">
        Cancel
      </Button>
    </div>
  );
}
