"use client";

import type { ChatAttachment } from "@/hooks/use-chat";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  attachment?: ChatAttachment;
}

export function ChatMessage({ role, content, isStreaming = false, attachment }: ChatMessageProps) {
  return (
    <div className={`flex ${role === "user" ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {attachment && role === "user" && (
          <div className="mb-1.5 rounded border-l-2 border-primary-foreground/40 bg-primary-foreground/10 px-2 py-1">
            <p className="text-[10px] font-medium opacity-80">
              Highlighted · Page {attachment.pageNumber}
            </p>
            <p className="line-clamp-2 text-xs italic opacity-90">
              “{attachment.text}”
            </p>
          </div>
        )}
        <p className="whitespace-pre-wrap">{content}</p>
        {isStreaming && <span className="animate-pulse">▋</span>}
      </div>
    </div>
  );
}
