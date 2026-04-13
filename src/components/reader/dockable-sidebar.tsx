"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export type Dock = "right" | "bottom" | "left";

interface Props {
  id: string;
  defaultDock?: Dock;
  children: React.ReactNode;
}

export function DockableSidebar({ id, defaultDock = "right", children }: Props) {
  const storageKey = `dockable-sidebar:${id}`;
  const [dock, setDock] = useState<Dock>(defaultDock);
  const [size, setSize] = useState<number>(320);

  useEffect(() => {
    const d = localStorage.getItem(`${storageKey}:dock`) as Dock | null;
    const s = Number(localStorage.getItem(`${storageKey}:size`) ?? 320);
    if (d === "right" || d === "left" || d === "bottom") setDock(d);
    if (Number.isFinite(s) && s > 0) setSize(s);
  }, [storageKey]);

  const persistDock = (d: Dock) => {
    setDock(d);
    localStorage.setItem(`${storageKey}:dock`, d);
  };
  const persistSize = (s: number) => {
    setSize(s);
    localStorage.setItem(`${storageKey}:size`, String(s));
  };

  const horizontal = dock === "bottom";
  const rootStyle: React.CSSProperties = horizontal
    ? { height: size, width: "100%" }
    : { width: size, height: "100%" };
  const borderCls =
    dock === "right" ? "border-l" : dock === "left" ? "border-r" : "border-t";
  const handleCls = horizontal
    ? "absolute top-0 h-1 w-full cursor-row-resize"
    : "absolute top-0 w-1 h-full cursor-col-resize";

  return (
    <div className={`relative flex bg-background ${borderCls}`} style={rootStyle}>
      <div
        role="separator"
        aria-orientation={horizontal ? "horizontal" : "vertical"}
        className={handleCls}
        onMouseDown={(e) => {
          const start = horizontal ? e.clientY : e.clientX;
          const startSize = size;
          const onMove = (ev: MouseEvent) => {
            const cur = horizontal ? ev.clientY : ev.clientX;
            const delta = start - cur;
            const next = dock === "left" ? startSize - delta : startSize + delta;
            persistSize(Math.max(200, Math.min(900, next)));
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      />
      <div className="flex-1 overflow-auto">{children}</div>
      <div className="absolute right-1 top-1">
        <details>
          <summary className="list-none">
            <Button size="sm" variant="ghost" aria-label="Dock">⋮</Button>
          </summary>
          <div role="menu" className="absolute right-0 mt-1 w-28 rounded-md border bg-popover p-1 shadow">
            {(["right", "bottom", "left"] as Dock[]).map((d) => (
              <button
                key={d}
                role="menuitem"
                className={`w-full px-2 py-1 text-left text-xs hover:bg-accent ${dock === d ? "font-semibold" : ""}`}
                onClick={() => persistDock(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
