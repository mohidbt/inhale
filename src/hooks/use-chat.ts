"use client";
import { useState, useCallback } from "react";
import { ViewportContext } from "./use-viewport-tracking";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function useChat(documentId: number, processingServiceUrl: string = "http://localhost:8000") {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (
    question: string,
    apiKey: string,
    viewportContext: ViewportContext,
    model: string = "openai/gpt-4o-mini",
  ) => {
    if (!question.trim() || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setError(null);

    // Placeholder for streaming assistant message
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch(`${processingServiceUrl}/rag/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: documentId,
          question,
          conversation_history: messages,
          viewport_context: viewportContext,
          api_key: apiKey,
          model,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") { streamDone = true; break; }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed?.choices?.[0]?.delta?.content ?? "";
              if (delta) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: (updated[updated.length - 1].content) + delta,
                  };
                  return updated;
                });
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
        if (streamDone) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      // Remove the empty assistant placeholder on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }, [documentId, messages, processingServiceUrl, streaming]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, streaming, error, sendMessage, clearMessages };
}
