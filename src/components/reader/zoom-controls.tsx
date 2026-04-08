"use client";

import { useReaderState } from "@/hooks/use-reader-state";
import { Button } from "@/components/ui/button";

export function ZoomControls() {
  const { zoom, zoomIn, zoomOut, resetZoom } = useReaderState();

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={zoomOut}>-</Button>
      <span className="w-14 text-center text-sm">{Math.round(zoom * 100)}%</span>
      <Button variant="ghost" size="sm" onClick={zoomIn}>+</Button>
      <Button variant="ghost" size="sm" onClick={resetZoom}>Fit</Button>
    </div>
  );
}
