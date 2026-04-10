import { OpenRouter } from "@openrouter/sdk";
import { db } from "@/db";
import { userApiKeys } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

export async function getOpenRouterClient(userId: string): Promise<OpenRouter> {
  const [row] = await db
    .select({ encryptedKey: userApiKeys.encryptedKey })
    .from(userApiKeys)
    .where(
      and(eq(userApiKeys.userId, userId), eq(userApiKeys.providerType, "llm"))
    );

  if (!row) {
    throw new Error("NO_LLM_KEY");
  }

  const apiKey = decrypt(row.encryptedKey);
  return new OpenRouter({ apiKey });
}

export const MODELS = {
  chat: "openai/gpt-4o-mini",
  outline: "openai/gpt-4o-mini",
  embedding: "openai/text-embedding-3-small",
} as const;
