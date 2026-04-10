import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getOpenRouterClient, MODELS } from "@/lib/ai/openrouter";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { text } = (await request.json()) as { text: string };
  if (!text?.trim()) return new Response("Bad Request", { status: 400 });

  let client;
  try {
    client = await getOpenRouterClient(session.user.id);
  } catch {
    return new Response("Add an OpenRouter key in Settings", { status: 400 });
  }

  const result = client.callModel({
    model: MODELS.chat,
    instructions:
      "You are a concise research tutor. Explain the highlighted passage in plain English in under 120 words.",
    input: [{ role: "user", content: text }],
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const delta of result.getTextStream()) {
          controller.enqueue(encoder.encode(`data: ${delta}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: [ERROR] ${(err as Error).message}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
