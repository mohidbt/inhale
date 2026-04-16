import os
import httpx

EMBED_MODEL = "openai/text-embedding-3-small"
EMBED_URL = "https://openrouter.ai/api/v1/embeddings"
EMBED_DIM = 1536


async def embed_texts(api_key: str, inputs: list[str]) -> list[list[float]]:
    if not inputs:
        return []
    if os.environ.get("INHALE_STUB_EMBEDDINGS") == "1":
        return [[0.01] * EMBED_DIM for _ in inputs]
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            EMBED_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": EMBED_MODEL, "input": inputs},
        )
        r.raise_for_status()
        data = r.json()["data"]
        return [d["embedding"] for d in data]
