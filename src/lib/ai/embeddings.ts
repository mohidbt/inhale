import { MODELS } from "./openrouter";
export { getDecryptedApiKey } from "./openrouter";

const EMBED_URL = "https://openrouter.ai/api/v1/embeddings";

export async function embedTexts(apiKey: string, inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];

  // Stub for E2E tests — exercises full DB insert path (including vector column)
  // but skips the real OpenRouter network call.
  if (process.env.INHALE_STUB_EMBEDDINGS === "1") {
    return inputs.map(() => Array(1536).fill(0.01));
  }

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

export async function embedQuery(apiKey: string, query: string): Promise<number[]> {
  const [vec] = await embedTexts(apiKey, [query]);
  if (!vec) throw new Error("embedQuery: no embedding returned for query");
  return vec;
}
