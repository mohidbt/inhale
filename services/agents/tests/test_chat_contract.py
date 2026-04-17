import hmac, hashlib, json, os, time
from unittest.mock import AsyncMock, patch

SECRET = "test-secret-abc"
os.environ["INHALE_INTERNAL_SECRET"] = SECRET
os.environ["INHALE_STUB_EMBEDDINGS"] = "1"

import deps.db  # noqa: E402
from main import app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from lib.rag import RetrievalResult, ChunkRow  # noqa: E402

client = TestClient(app)


def _signed_headers(method: str, path: str, body: bytes):
    ts = str(int(time.time()))
    sig = hmac.new(
        SECRET.encode(),
        ts.encode() + method.encode() + path.encode() + body,
        hashlib.sha256,
    ).hexdigest()
    return {
        "X-Inhale-User-Id": "user_1",
        "X-Inhale-Document-Id": "1",
        "X-Inhale-LLM-Key": "sk-test",
        "X-Inhale-Ts": ts,
        "X-Inhale-Sig": sig,
        "Content-Type": "application/json",
    }


def _parse_sse(text: str) -> list:
    events = []
    for line in text.split("\n"):
        if line.startswith("data: "):
            payload = line[6:]
            if payload == "[DONE]":
                events.append("[DONE]")
            else:
                events.append(json.loads(payload))
    return events


def _mock_conn(processing_status="ready"):
    conn = AsyncMock()
    conn.fetchrow.return_value = {"id": 1, "processing_status": processing_status}
    conn.execute.return_value = None
    return conn


def test_chat_sse_contract():
    """Full happy path: sources → tokens → [DONE]."""
    mock_conn = _mock_conn()

    async def override():
        yield mock_conn

    app.dependency_overrides[deps.db.get_conn] = override

    fake_retrieval = RetrievalResult(
        supporting_chunks=[ChunkRow(1, "Some content", 3, 3, 0.85)],
        page_text=None, anchor_text=None,
        sources=[{"page": 3, "relevance": 0.85}],
    )

    async def fake_run_chat(**kwargs):
        yield ("token", "Hello ")
        yield ("token", "world")

    try:
        with (
            patch("routers.chat.retrieve", return_value=fake_retrieval),
            patch("routers.chat.run_chat", side_effect=fake_run_chat),
        ):
            body = json.dumps({"question": "What is this?"}).encode()
            r = client.post("/agents/chat", content=body,
                           headers=_signed_headers("POST", "/agents/chat", body))
            assert r.status_code == 200
            assert r.headers["content-type"] == "text/event-stream; charset=utf-8"

            events = _parse_sse(r.text)
            # First event: sources
            assert events[0]["type"] == "sources"
            assert events[0]["sources"] == [{"page": 3, "relevance": 0.85}]
            assert "conversationId" in events[0]
            # Token events
            tokens = [e for e in events if isinstance(e, dict) and e.get("type") == "token"]
            assert len(tokens) == 2
            assert tokens[0]["content"] == "Hello "
            assert tokens[1]["content"] == "world"
            # Last: [DONE]
            assert events[-1] == "[DONE]"
    finally:
        app.dependency_overrides.clear()


def test_chat_processing_status_guard():
    """Document not ready → status message SSE stream."""
    mock_conn = _mock_conn(processing_status="processing")
    mock_conn.fetchrow.return_value = {"id": 1, "processing_status": "processing"}

    async def override():
        yield mock_conn

    app.dependency_overrides[deps.db.get_conn] = override
    try:
        body = json.dumps({"question": "What is this?"}).encode()
        r = client.post("/agents/chat", content=body,
                       headers=_signed_headers("POST", "/agents/chat", body))
        assert r.status_code == 200
        events = _parse_sse(r.text)
        assert events[0]["type"] == "sources"
        assert events[0]["sources"] == []
        token_events = [e for e in events if isinstance(e, dict) and e.get("type") == "token"]
        assert "still being processed" in token_events[0]["content"]
        assert events[-1] == "[DONE]"
    finally:
        app.dependency_overrides.clear()


def test_chat_empty_retrieval_guard():
    """No context found → empty-retrieval message."""
    mock_conn = _mock_conn()

    async def override():
        yield mock_conn

    app.dependency_overrides[deps.db.get_conn] = override

    empty_retrieval = RetrievalResult(
        supporting_chunks=[], page_text=None, anchor_text=None, sources=[],
    )

    try:
        with patch("routers.chat.retrieve", return_value=empty_retrieval):
            body = json.dumps({"question": "What is this?"}).encode()
            r = client.post("/agents/chat", content=body,
                           headers=_signed_headers("POST", "/agents/chat", body))
            assert r.status_code == 200
            events = _parse_sse(r.text)
            assert events[0]["type"] == "sources"
            token_events = [e for e in events if isinstance(e, dict) and e.get("type") == "token"]
            assert "cannot find any content" in token_events[0]["content"]
            assert events[-1] == "[DONE]"
    finally:
        app.dependency_overrides.clear()


def test_chat_404_when_doc_not_found():
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = None

    async def override():
        yield mock_conn

    app.dependency_overrides[deps.db.get_conn] = override
    try:
        body = json.dumps({"question": "Hello"}).encode()
        r = client.post("/agents/chat", content=body,
                       headers=_signed_headers("POST", "/agents/chat", body))
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_chat_unauthenticated():
    body = json.dumps({"question": "Hello"}).encode()
    r = client.post("/agents/chat", content=body)
    assert r.status_code == 401
