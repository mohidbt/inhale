"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DocumentCardProps {
  id: number;
  title: string;
  filename: string;
  pageCount: number | null;
  createdAt: string;
}

export function DocumentCard({
  id,
  title,
  filename,
  pageCount,
  createdAt,
}: DocumentCardProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const formattedDate = new Date(createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete document.");
        return;
      }
      setShowDialog(false);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="group relative rounded-lg border bg-card hover:border-primary/60 transition-colors">
        <Link href={`/reader/${id}`} className="block p-4">
          <div className="mb-3 h-32 rounded bg-muted flex items-center justify-center">
            <span className="text-2xl text-muted-foreground">PDF</span>
          </div>
          <p
            className="font-medium text-sm leading-snug line-clamp-2 mb-1"
            title={title}
          >
            {title}
          </p>
          <p className="text-xs text-muted-foreground">
            {pageCount != null ? `${pageCount} pages · ` : ""}
            {formattedDate}
          </p>
        </Link>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.preventDefault();
            setShowDialog(true);
          }}
          className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          aria-label={`Delete ${title}`}
        >
          <Trash2 data-icon="inline-start" />
        </Button>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{title}&rdquo;? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
