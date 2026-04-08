"use client";

import { Button } from "@/components/ui/button";

const COLORS = [
  { name: "yellow", class: "bg-yellow-300" },
  { name: "green", class: "bg-green-300" },
  { name: "blue", class: "bg-blue-300" },
  { name: "pink", class: "bg-pink-300" },
  { name: "orange", class: "bg-orange-300" },
] as const;

type HighlightColor = (typeof COLORS)[number]["name"];

interface SelectionToolbarProps {
  rect: DOMRect;
  onHighlight: (color: HighlightColor) => void;
  onDismiss: () => void;
}

export function SelectionToolbar({ rect, onHighlight, onDismiss }: SelectionToolbarProps) {
  return (
    <div
      className="fixed z-50 flex items-center gap-1 rounded-lg border bg-background p-1 shadow-lg"
      style={{
        top: rect.top - 44,
        left: rect.left + rect.width / 2 - 80,
      }}
    >
      {COLORS.map((c) => (
        <button
          key={c.name}
          className={`h-6 w-6 rounded-full ${c.class} border border-black/10 hover:ring-2 ring-offset-1`}
          onClick={() => onHighlight(c.name)}
          title={c.name}
        />
      ))}
      <Button variant="ghost" size="sm" onClick={onDismiss} className="ml-1 text-xs">
        Cancel
      </Button>
    </div>
  );
}
