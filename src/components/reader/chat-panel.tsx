"use client";
import { useState, useRef } from "react";
import { useChat } from "@/hooks/use-chat";
import { useViewportTracking } from "@/hooks/use-viewport-tracking";
import { ChatMessage } from "./chat-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatPanelProps {
  documentId: number;
  open: boolean;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
}

export function ChatPanel({ documentId, open, scrollContainerRef }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const viewportRef = useViewportTracking(scrollContainerRef);
  const { messages, sources, streaming, error, sendMessage } = useChat(documentId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    const q = input;
    setInput("");
    await sendMessage(q, viewportRef.current ?? { page: 1, scrollPct: 0 });
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  if (!open) return null;

  return (
    <div className="flex flex-col h-full w-80 border-l bg-background">
      <div className="p-3 border-b font-medium text-sm">AI Assistant</div>
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-4">
            Ask a question about this paper
          </p>
        )}
        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            role={msg.role}
            content={msg.content}
            isStreaming={streaming && i === messages.length - 1 && msg.role === "assistant"}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      {sources.length > 0 && (
        <div className="px-3 py-2 border-t flex flex-wrap gap-1">
          {sources.map((s, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              p.{s.page}
            </span>
          ))}
        </div>
      )}
      {error && <p className="px-3 py-1 text-xs text-red-500">{error}</p>}
      <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this paper..."
          disabled={streaming}
          className="text-sm"
        />
        <Button type="submit" size="sm" disabled={streaming || !input.trim()}>
          {streaming ? "..." : "Send"}
        </Button>
      </form>
    </div>
  );
}
