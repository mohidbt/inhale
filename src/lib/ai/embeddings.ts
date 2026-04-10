import { db } from "@/db";
import { userApiKeys } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { MODELS } from "./openrouter";

const EMBED_URL = "https://openrouter.ai/api/v1/embeddings";

async function getDecryptedKey(userId: string): Promise<string> {
  const [row] = await db
    .select({ encryptedKey: userApiKeys.encryptedKey })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.providerType, "llm")));
  if (!row) throw new Error("NO_LLM_KEY");
  return decrypt(row.encryptedKey);
}

export async function embedTexts(userId: string, inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const apiKey = await getDecryptedKey(userId);
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODELS.embedding, input: inputs }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter embeddings failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

export async function embedQuery(userId: string, query: string): Promise<number[]> {
  const [vec] = await embedTexts(userId, [query]);
  return vec;
}
