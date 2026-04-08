"use client";

import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { PdfViewer } from "@/components/reader/pdf-viewer";

interface ReaderClientProps {
  documentId: number;
  title: string;
}

export function ReaderClient({ documentId, title }: ReaderClientProps) {
  const url = `/api/documents/${documentId}/file`;

  return (
    <div className="flex h-screen flex-col">
      <ReaderToolbar title={title} />
      <PdfViewer url={url} />
    </div>
  );
}
