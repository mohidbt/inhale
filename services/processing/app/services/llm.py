import httpx
from typing import AsyncIterator

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

async def chat_completion(
    api_key: str,
    model: str,
    messages: list[dict],
    stream: bool = False,
) -> dict | AsyncIterator[str]:
    """
    Call OpenRouter chat completions.
    Returns parsed JSON dict for non-streaming, or async iterator of SSE chunks for streaming.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://inhale.app",
    }
    payload = {"model": model, "messages": messages, "stream": stream}

    async with httpx.AsyncClient(timeout=60.0) as client:
        if not stream:
            response = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()
        else:
            # Return streaming: caller iterates over SSE lines
            async def _stream() -> AsyncIterator[str]:
                async with client.stream(
                    "POST",
                    f"{OPENROUTER_BASE_URL}/chat/completions",
                    headers=headers,
                    json=payload,
                ) as r:
                    r.raise_for_status()
                    async for line in r.aiter_lines():
                        if line.startswith("data: ") and line != "data: [DONE]":
                            yield line[6:]  # strip "data: " prefix
            return _stream()
