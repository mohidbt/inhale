import { db } from "@/db";
import { userApiKeys } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

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
