"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useReaderState } from "@/hooks/use-reader-state";
import { ZoomControls } from "./zoom-controls";

interface ReaderToolbarProps {
  title: string;
}

export function ReaderToolbar({ title }: ReaderToolbarProps) {
  const { currentPage, totalPages, setCurrentPage } = useReaderState();

  return (
    <header className="flex h-12 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <Link href="/library">
          <Button variant="ghost" size="sm">Back</Button>
        </Link>
        <span className="max-w-[300px] truncate text-sm font-medium">{title}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
          >
            Prev
          </Button>
          <span>{currentPage} / {totalPages || "—"}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
          >
            Next
          </Button>
        </div>
        <ZoomControls />
      </div>
    </header>
  );
}
