from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from app.services.llm import chat_completion
import json
import asyncio

router = APIRouter(prefix="/rag")

@router.post("/chat")
async def rag_chat(body: dict, request: Request):
    """
    SSE streaming RAG chat endpoint.
    Body: { document_id, question, conversation_history, viewport_context, api_key, model }
    Streams: text/event-stream chunks
    """
    document_id = body.get("document_id")
    question = body.get("question", "")
    history = body.get("conversation_history", [])
    viewport = body.get("viewport_context", {})
    api_key = body.get("api_key", "")
    model = body.get("model", "openai/gpt-4o-mini")

    if not question or not api_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="question and api_key are required")

    # Build system prompt with viewport context
    viewport_info = ""
    if viewport:
        viewport_info = f"\n\nThe user is currently viewing page {viewport.get('page', '?')} of the document."

    system_prompt = (
        "You are a scientific paper assistant helping the user understand a research paper. "
        "Answer questions based on the paper content. Be concise and cite specific sections when possible."
        + viewport_info
    )

    messages = [{"role": "system", "content": system_prompt}]
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": question})

    async def event_stream():
        try:
            stream = await chat_completion(
                api_key=api_key,
                model=model,
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                # chunk is a JSON string (SSE data line without "data: " prefix)
                yield f"data: {chunk}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
