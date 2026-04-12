"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useReaderState } from "@/hooks/use-reader-state";
import { ZoomControls } from "./zoom-controls";

interface ReaderToolbarProps {
  title: string;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  commentSidebarOpen?: boolean;
  onToggleCommentSidebar?: () => void;
  onAddComment?: () => void;
  showCommentInput?: boolean;
  chatOpen?: boolean;
  onToggleChat?: () => void;
  outlineOpen?: boolean;
  onToggleOutline?: () => void;
  conceptsOpen?: boolean;
  onToggleConcepts?: () => void;
}

export function ReaderToolbar({
  title,
  sidebarOpen,
  onToggleSidebar,
  commentSidebarOpen,
  onToggleCommentSidebar,
  onAddComment,
  showCommentInput,
  chatOpen,
  onToggleChat,
  outlineOpen,
  onToggleOutline,
  conceptsOpen,
  onToggleConcepts,
}: ReaderToolbarProps) {
  const currentPage = useReaderState((s) => s.currentPage);
  const totalPages = useReaderState((s) => s.totalPages);
  const setScrollTargetPage = useReaderState((s) => s.setScrollTargetPage);

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
            onClick={() => setScrollTargetPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1 || totalPages === 0}
          >
            Prev
          </Button>
          <span>{currentPage} / {totalPages || "—"}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setScrollTargetPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages || totalPages === 0}
          >
            Next
          </Button>
        </div>
        <ZoomControls />
        {onToggleSidebar && (
          <Button variant={sidebarOpen ? "secondary" : "ghost"} size="sm" onClick={onToggleSidebar}>
            Highlights
          </Button>
        )}
        {onToggleCommentSidebar && (
          <Button
            variant={commentSidebarOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleCommentSidebar}
          >
            Comments
          </Button>
        )}
        {onAddComment && (
          <Button
            variant={showCommentInput ? "secondary" : "ghost"}
            size="sm"
            onClick={onAddComment}
          >
            Add Comment
          </Button>
        )}
        {onToggleChat && (
          <Button
            variant={chatOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleChat}
          >
            Chat
          </Button>
        )}
        {onToggleOutline && (
          <Button
            variant={outlineOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleOutline}
          >
            Outline
          </Button>
        )}
        {onToggleConcepts && (
          <Button
            variant={conceptsOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleConcepts}
          >
            Explain
          </Button>
        )}
      </div>
    </header>
  );
}
