import { OpenRouter } from "@openrouter/sdk";
import { db } from "@/db";
import { userApiKeys } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

/**
 * Returns the decrypted API key for the given user.
 * Throws Error("NO_LLM_KEY") if the user has not stored an LLM key.
 */
export async function getDecryptedApiKey(userId: string): Promise<string> {
  if (process.env.INHALE_STUB_EMBEDDINGS === "1") {
    return "stub-api-key";
  }

  const [row] = await db
    .select({ encryptedKey: userApiKeys.encryptedKey })
    .from(userApiKeys)
    .where(
      and(eq(userApiKeys.userId, userId), eq(userApiKeys.providerType, "llm"))
    );

  if (!row) {
    throw new Error("NO_LLM_KEY");
  }

  return decrypt(row.encryptedKey);
}

/**
 * Returns an initialized OpenRouter client for the given user.
 * Throws Error("NO_LLM_KEY") if the user has not stored an LLM key.
 */
export async function getOpenRouterClient(userId: string): Promise<OpenRouter> {
  const apiKey = await getDecryptedApiKey(userId);
  return new OpenRouter({ apiKey });
}

export const MODELS = {
  chat: "openai/gpt-4o-mini",
  outline: "openai/gpt-4o-mini",
  embedding: "openai/text-embedding-3-small",
} as const;
