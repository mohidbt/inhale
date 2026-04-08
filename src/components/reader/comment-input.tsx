"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface CommentInputProps {
  documentId: number;
  pageNumber: number;
  highlightId?: number;
  onSaved: () => void;
  onCancel: () => void;
}

export function CommentInput({
  documentId,
  pageNumber,
  highlightId,
  onSaved,
  onCancel,
}: CommentInputProps) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!content.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, pageNumber, highlightId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setContent("");
      onSaved();
    } catch {
      setError("Failed to save comment. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a comment…"
        rows={3}
        className="resize-none"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={saving || !content.trim()}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
