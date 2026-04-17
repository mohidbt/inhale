import json
import logging
from typing import Literal
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from deps.auth import InternalAuthDep
from deps.db import ConnDep
from lib.conversations import upsert_conversation, insert_message, bump_updated_at
from lib.rag import retrieve
from lib.chat import run_chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["chat"])


class ChatBody(BaseModel):
    question: str = Field(min_length=1)
    conversationId: int | None = None
    viewportContext: dict | None = None
    history: list[dict] = Field(default_factory=list)
    scope: Literal["page", "selection", "paper"] = "paper"
    selectionText: str | None = None
    pageNumber: int | None = None


def _sse(obj) -> str:
    return f"data: {json.dumps(obj)}\n\n"


def _sse_done() -> str:
    return "data: [DONE]\n\n"


async def _persist_turn(conn, *, conv_id, question, viewport, assistant_content):
    await insert_message(conn, conversation_id=conv_id, role="user", content=question, viewport=viewport)
    await insert_message(conn, conversation_id=conv_id, role="assistant", content=assistant_content)
    await bump_updated_at(conn, conv_id)


@router.post("/chat")
async def chat(body: ChatBody, auth: InternalAuthDep, conn: ConnDep):
    user_id = auth["user_id"]
    document_id = auth["document_id"]
    api_key = auth["llm_key"]

    if not document_id:
        raise HTTPException(status_code=400, detail="missing document_id")

    # Verify document exists + belongs to user
    doc = await conn.fetchrow(
        "SELECT id, processing_status FROM documents WHERE id = $1 AND user_id = $2",
        document_id, user_id,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")

    question = body.question.strip()
    scope = body.scope
    focus_page = body.pageNumber or (body.viewportContext or {}).get("page")
    selection_text = (body.selectionText or "").strip() or None

    # Processing status guard
    if doc["processing_status"] != "ready":
        status = doc["processing_status"]
        if status in ("pending", "processing"):
            msg = "This document is still being processed. Refresh in a minute and try again."
        elif status == "failed":
            msg = "This document failed to process. Please re-upload it."
        else:
            msg = "This document is not ready for chat yet."

        conv_id = await upsert_conversation(conn, user_id=user_id, document_id=document_id,
                                            conversation_id=body.conversationId, title=question)
        await _persist_turn(conn, conv_id=conv_id, question=question,
                           viewport=body.viewportContext, assistant_content=msg)

        async def status_stream():
            yield _sse({"type": "sources", "sources": [], "conversationId": conv_id})
            yield _sse({"type": "token", "content": msg})
            yield _sse_done()

        return StreamingResponse(status_stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})

    # RAG retrieval
    retrieval = await retrieve(conn, document_id=document_id, question=question,
                               scope=scope, focus_page=focus_page,
                               selection_text=selection_text, api_key=api_key)

    # Empty-retrieval guard
    has_context = (
        len(retrieval.supporting_chunks) > 0
        or bool(retrieval.page_text)
        or bool(retrieval.anchor_text)
        or bool(selection_text)
    )

    if not has_context:
        empty_msg = "The assistant cannot find any content from this document. It may still be processing — try again in a minute, or re-upload."
        conv_id = await upsert_conversation(conn, user_id=user_id, document_id=document_id,
                                            conversation_id=body.conversationId, title=question)
        await _persist_turn(conn, conv_id=conv_id, question=question,
                           viewport=body.viewportContext, assistant_content=empty_msg)

        async def empty_stream():
            yield _sse({"type": "sources", "sources": [], "conversationId": conv_id})
            yield _sse({"type": "token", "content": empty_msg})
            yield _sse_done()

        return StreamingResponse(empty_stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})

    # Main path: upsert conversation + persist user message
    conv_id = await upsert_conversation(conn, user_id=user_id, document_id=document_id,
                                        conversation_id=body.conversationId, title=question)
    await insert_message(conn, conversation_id=conv_id, role="user",
                        content=question, viewport=body.viewportContext)

    async def event_stream():
        yield _sse({"type": "sources", "sources": retrieval.sources, "conversationId": conv_id})

        assistant_content = ""
        try:
            async for event in run_chat(
                api_key=api_key, history=body.history, question=question,
                supporting_chunks=retrieval.supporting_chunks,
                page_text=retrieval.page_text, anchor_text=retrieval.anchor_text,
                selection_text=selection_text, scope=scope, focus_page=focus_page,
                tools=None,
            ):
                if event[0] == "token":
                    token = event[1]
                    assistant_content += token
                    yield _sse({"type": "token", "content": token})
                # tool_call / tool_result: ignored until Task 45/46 wires tools
        except Exception as e:
            yield _sse({"type": "error", "message": str(e)})

        yield _sse_done()

        # Persist assistant turn after stream
        try:
            await insert_message(conn, conversation_id=conv_id, role="assistant", content=assistant_content)
            await bump_updated_at(conn, conv_id)
        except Exception:
            logger.exception("failed to persist assistant turn (best-effort)")

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})
