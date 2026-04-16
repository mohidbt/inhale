# Phase 2.0.3 — Python agents service + framework migration

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (preferred) or `superpowers:executing-plans`. Steps use `- [ ]` for tracking.
>
> **Spec source of truth:** `docs/superpowers/specs/2026-04-13-inhale-phases-2-to-5-design.md` §0.2, §0.7, §0.8, §2.

**Goal:** stand up `services/agents/` (FastAPI) and migrate every existing AI route onto it with a byte-identical browser contract. Next.js becomes a thin proxy for AI routes.

**Architecture:** Two Vercel Services behind one deployment: `web` (Next.js, owns UI + auth + BYOK decrypt + proxy) and `agents` (FastAPI, owns all LLM/embedding calls + agent loops). Next.js→FastAPI traffic is HMAC-signed per §0.8. Postgres accessed from Python via `asyncpg` + `pgvector` adapter; Drizzle retains migration ownership.

**Tech Stack:** FastAPI (version per kickoff), `asyncpg`, `pgvector` asyncpg adapter, `httpx`, framework TBD per `langchain-skills:framework-selection`; Next.js stays 16.x with `@openrouter/sdk` removed by end of phase.

---

## Mandatory kickoff ritual (runs BEFORE Task 37b code)

Execute in order. Record outputs as amendments to the "Deferred decisions" block below.

1. `langchain-skills:framework-selection` — picks Python agent framework (LangGraph / LangChain / other). Locks primitive choices.
2. `fastapi` skill — conventions apply to every Python edit in this phase.
3. `langchain-skills:langchain-dependencies` — `pyproject.toml` deps.
4. `langchain-skills:langchain-rag` + `langchain-skills:langgraph-persistence` — consulted for Task 37f (chat) and Task 37h (persistence).
5. Confirm Vercel Python runtime version per https://vercel.com/docs/functions/runtimes/python .

No framework-dependent code is written before step 1. Framework-neutral code (37a–37e cleanup, 37c proxy helpers, 37d embeddings) proceeds independently.

## Deferred decisions (filled at kickoff)

```
Python runtime version:        <e.g. 3.13>
FastAPI version:               <per fastapi skill output>
Agent framework:               <per framework-selection>
Framework version(s):          <per langchain-dependencies>
Conversation persistence:      <per langgraph-persistence or equivalent>
RAG primitive:                 <per langchain-rag or "asyncpg raw SQL">
```

---

## Locked constraints

- Every Phase-1 browser contract (SSE schema, JSON shape, status codes) stays **byte-identical**. `e2e/ai-features.spec.ts` and `e2e/chat-context.spec.ts` pass unchanged.
- `INHALE_STUB_EMBEDDINGS=1` env-var behavior preserved on Python side: when set, returns `[0.01] * 1536` without network.
- `document_chunks.embedding` stays `vector(1536)`; embedding model stays `openai/text-embedding-3-small` via OpenRouter.
- Chat SSE event schema: `{ type: "sources", sources, conversationId }`, `{ type: "token", content }`, `{ type: "error", message }`, and terminator `data: [DONE]\n\n`.
- Python never writes migrations. Schema changes go through Drizzle.

---

## File structure

**New:**
- `vercel.json` — `experimentalServices: { web, agents }`
- `services/agents/pyproject.toml` — `[tool.fastapi] entrypoint = "main:app"`
- `services/agents/main.py` — app factory, lifespan, router mounts
- `services/agents/deps/auth.py` — `require_internal` HMAC verifier
- `services/agents/deps/db.py` — asyncpg pool + `pgvector.asyncpg.register_vector`
- `services/agents/deps/openrouter.py` — BYOK client factory from request headers
- `services/agents/lib/models.py` — shared Pydantic request/response models
- `services/agents/routers/health.py` — `GET /agents/health`
- `services/agents/routers/embeddings.py` — `POST /agents/embed-chunks`
- `services/agents/routers/outline.py` — `GET /agents/outline`
- `services/agents/routers/chat.py` — `POST /agents/chat` (SSE)
- `services/agents/tests/` — pytest suite
- `src/lib/agents/sign-request.ts` — HMAC signer
- `src/lib/agents/stream-passthrough.ts` — SSE passthrough helper

**Modified:**
- Everything currently at repo root moves into `apps/web/` (git-mv preserves history).
- `src/app/api/documents/upload/route.ts` — swaps `embedTexts` for signed POST to `/agents/embed-chunks`.
- `src/app/api/documents/[id]/outline/route.ts` — becomes proxy.
- `src/app/api/documents/[id]/chat/route.ts` — becomes proxy.

**Deleted at phase end (Task 37i):**
- `src/lib/ai/embeddings.ts`
- `src/lib/ai/openrouter.ts`
- `@openrouter/sdk` from `package.json`

**Out of scope for 2.0.3:** `/api/ai/explain` — no such route exists today; the spec §2.2 line is deferred to Phase 3.0b which creates it natively in Python.

---

## Task 37a — Repo restructure + Vercel Services config

**Files:**
- Create: `vercel.json`
- Move: entire repo root → `apps/web/` (via `git mv`)
- Create: `apps/web/` (destination)

- [ ] **Step 1: Create target directory**

```bash
mkdir -p apps/web
```

- [ ] **Step 2: git-mv all current-root source/config into `apps/web/`**

Move everything except `.git`, `docs/`, `services/` (not yet existing), and this plan file's containing tree. Use `git mv` so history is preserved.

```bash
# From repo root — one mv per top-level item to make review tractable
for item in src public e2e scripts docker drizzle uploads \
            package.json package-lock.json tsconfig.json next.config.ts \
            next-env.d.ts postcss.config.mjs eslint.config.mjs components.json \
            playwright.config.ts vitest.config.ts drizzle.config.ts \
            docker-compose.yml .env.example .env.local.example \
            empty-module.js AGENTS.md CLAUDE.md README.md LICENSE \
            .gitignore .gitattributes; do
  [ -e "$item" ] && git mv "$item" "apps/web/$item"
done
```

- [ ] **Step 3: Verify no src imports broke (TS only — still using apps/web cwd)**

```bash
cd apps/web && npm run build
```

Expected: PASS.

- [ ] **Step 4: Write `vercel.json` at repo root**

```json
{
  "experimentalServices": {
    "web": {
      "src": "apps/web",
      "routePrefix": "/"
    },
    "agents": {
      "src": "services/agents",
      "routePrefix": "/agents"
    }
  }
}
```

- [ ] **Step 5: Scaffold empty `services/agents/` directory**

```bash
mkdir -p services/agents/{routers,deps,lib,tests}
touch services/agents/__init__.py services/agents/routers/__init__.py \
      services/agents/deps/__init__.py services/agents/lib/__init__.py
```

- [ ] **Step 6: Confirm `vercel dev -L` boots both services**

```bash
vercel dev -L
```

Expected: web service responds at `http://localhost:3000/`, health placeholder returns 404 at `/agents/health` (not yet implemented — that's Task 37b).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(repo): move web app to apps/web/ + add Vercel Services config"
```

---

## Task 37b — FastAPI scaffold + internal-auth + asyncpg pool

**Files:**
- Create: `services/agents/pyproject.toml`
- Create: `services/agents/main.py`
- Create: `services/agents/deps/auth.py`
- Create: `services/agents/deps/db.py`
- Create: `services/agents/routers/health.py`
- Test: `services/agents/tests/test_auth.py`, `services/agents/tests/test_health.py`

**Prerequisite:** kickoff ritual steps 1–5 complete. Record FastAPI/framework versions in the "Deferred decisions" block.

- [ ] **Step 1: Write `pyproject.toml` per `fastapi` skill conventions**

Per `fastapi` skill: set `[tool.fastapi] entrypoint = "main:app"`. Use `uv` for dependency management if available (`uv add`, `uv sync`). Dependencies include `fastapi`, `asyncpg`, `pgvector`, `httpx`, `pydantic`, `asyncer`, `pytest`, `pytest-asyncio`, `httpx` (for TestClient). Framework deps per `langchain-skills:langchain-dependencies` output — add to this file at that time.

```toml
[project]
name = "inhale-agents"
version = "0.1.0"
requires-python = ">=3.12"  # confirm at kickoff per Vercel Python docs
dependencies = [
    "fastapi",
    "asyncpg",
    "pgvector",
    "httpx",
    "pydantic",
    "asyncer",
    # framework deps appended at kickoff
]

[project.optional-dependencies]
dev = ["pytest", "pytest-asyncio", "ruff", "ty"]

[tool.fastapi]
entrypoint = "main:app"
```

Use `ruff` for linting/formatting and `ty` for type checking throughout the Python service.

- [ ] **Step 2: Write the failing auth test (§0.8 contract)**

`services/agents/tests/test_auth.py`:

```python
import hmac, hashlib, time, os
from fastapi.testclient import TestClient
import pytest

SECRET = "test-secret-abc"
os.environ["INHALE_INTERNAL_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)

def sign(ts: str, method: str, path: str, body: bytes) -> str:
    msg = ts.encode() + method.encode() + path.encode() + body
    return hmac.new(SECRET.encode(), msg, hashlib.sha256).hexdigest()

def headers(ts: str, method: str, path: str, body: bytes = b""):
    return {
        "X-Inhale-User-Id": "user_1",
        "X-Inhale-Document-Id": "1",
        "X-Inhale-LLM-Key": "sk-test",
        "X-Inhale-Ts": ts,
        "X-Inhale-Sig": sign(ts, method, path, body),
    }

def test_health_requires_internal_headers():
    r = client.get("/agents/health")
    assert r.status_code == 401

def test_health_accepts_valid_signature():
    ts = str(int(time.time()))
    r = client.get("/agents/health", headers=headers(ts, "GET", "/agents/health"))
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}

def test_rejects_stale_timestamp():
    ts = str(int(time.time()) - 120)  # 2 min old; limit is 60s
    r = client.get("/agents/health", headers=headers(ts, "GET", "/agents/health"))
    assert r.status_code == 401

def test_rejects_tampered_body():
    ts = str(int(time.time()))
    h = headers(ts, "POST", "/agents/health", b'{"a":1}')
    r = client.post("/agents/health", headers=h, content=b'{"a":2}')  # body mismatch
    assert r.status_code == 401
```

- [ ] **Step 3: Run test — verify FAIL**

```bash
cd services/agents && pytest tests/test_auth.py -v
```

Expected: FAIL (`main` module missing or health route missing).

- [ ] **Step 4: Implement `deps/auth.py`**

```python
import hmac, hashlib, os, time
from typing import Annotated
from fastapi import Depends, Header, HTTPException, Request

FRESHNESS_SECONDS = 60

async def require_internal(
    request: Request,
    x_inhale_user_id: Annotated[str, Header()],
    x_inhale_document_id: Annotated[str | None, Header()] = None,
    x_inhale_llm_key: Annotated[str, Header()] = "",
    x_inhale_ts: Annotated[str, Header()] = "",
    x_inhale_sig: Annotated[str, Header()] = "",
) -> dict:
    secret = os.environ["INHALE_INTERNAL_SECRET"]
    try:
        ts_int = int(x_inhale_ts)
    except ValueError:
        raise HTTPException(status_code=401, detail="invalid ts")
    if abs(int(time.time()) - ts_int) > FRESHNESS_SECONDS:
        raise HTTPException(status_code=401, detail="stale")

    body = await request.body()
    msg = x_inhale_ts.encode() + request.method.encode() + request.url.path.encode() + body
    expected = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, x_inhale_sig):
        raise HTTPException(status_code=401, detail="sig mismatch")

    return {
        "user_id": x_inhale_user_id,
        "document_id": int(x_inhale_document_id) if x_inhale_document_id else None,
        "llm_key": x_inhale_llm_key,
    }

InternalAuthDep = Annotated[dict, Depends(require_internal)]
```

- [ ] **Step 5: Implement `routers/health.py`**

```python
from fastapi import APIRouter
from deps.auth import InternalAuthDep

router = APIRouter(prefix="/agents", tags=["health"], dependencies=[])

@router.get("/health")
async def health(_: InternalAuthDep) -> dict:
    return {"status": "ok"}
```

- [ ] **Step 6: Implement `deps/db.py` with asyncpg + pgvector registration**

```python
import os
from contextlib import asynccontextmanager
from typing import Annotated, AsyncIterator
import asyncpg
from fastapi import Depends
from pgvector.asyncpg import register_vector

_pool: asyncpg.Pool | None = None

async def init_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=os.environ["DATABASE_URL"],
        min_size=1,
        max_size=10,
        init=register_vector,
    )

async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None

async def get_conn() -> AsyncIterator[asyncpg.Connection]:
    assert _pool is not None, "pool not initialised"
    async with _pool.acquire() as conn:
        yield conn

ConnDep = Annotated[asyncpg.Connection, Depends(get_conn)]
```

- [ ] **Step 7: Implement `main.py`**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from deps.db import init_pool, close_pool
from routers import health

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()

app = FastAPI(lifespan=lifespan)
app.include_router(health.router)
```

- [ ] **Step 8: Run auth test — verify PASS**

```bash
cd services/agents && pytest tests/test_auth.py -v
```

Expected: all four tests PASS.

- [ ] **Step 9: Wire `INHALE_INTERNAL_SECRET` into both services**

Add to `apps/web/.env.local.example` and `.env.local`:

```
INHALE_INTERNAL_SECRET=<openssl rand -hex 32>
AGENTS_URL=http://localhost:3000  # Vercel dev serves both under one port
```

Add the same key to the `services/agents/` env (Vercel project env vars — both services share).

- [ ] **Step 10: Commit**

```bash
git add services/agents apps/web/.env.local.example
git commit -m "feat(agents): FastAPI scaffold + HMAC auth + asyncpg pool"
```

---

## Task 37c — Next.js proxy helpers (`signRequest`, `streamPassthrough`)

**Files:**
- Create: `apps/web/src/lib/agents/sign-request.ts`
- Create: `apps/web/src/lib/agents/stream-passthrough.ts`
- Test: `apps/web/src/lib/agents/sign-request.test.ts`, `apps/web/src/lib/agents/stream-passthrough.test.ts`

- [ ] **Step 1: Write failing test for `signRequest`**

`apps/web/src/lib/agents/sign-request.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import crypto from "node:crypto";
import { signRequest } from "./sign-request";

const SECRET = "test-secret-abc";

beforeEach(() => { process.env.INHALE_INTERNAL_SECRET = SECRET; });

describe("signRequest", () => {
  it("adds required HMAC headers", () => {
    const { headers, ts } = signRequest({
      method: "POST",
      path: "/agents/embed-chunks",
      body: '{"x":1}',
      userId: "u1",
      documentId: 42,
      llmKey: "sk-test",
    });
    expect(headers["X-Inhale-User-Id"]).toBe("u1");
    expect(headers["X-Inhale-Document-Id"]).toBe("42");
    expect(headers["X-Inhale-LLM-Key"]).toBe("sk-test");
    expect(headers["X-Inhale-Ts"]).toBe(ts);

    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(ts + "POST" + "/agents/embed-chunks" + '{"x":1}')
      .digest("hex");
    expect(headers["X-Inhale-Sig"]).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

```bash
cd apps/web && npx vitest run src/lib/agents/sign-request.test.ts
```

- [ ] **Step 3: Implement `sign-request.ts`**

```ts
import crypto from "node:crypto";

export interface SignInput {
  method: "GET" | "POST";
  path: string;           // must start with /agents
  body: string;           // "" for GET
  userId: string;
  documentId?: number;
  llmKey: string;
}

export interface SignedHeaders {
  "X-Inhale-User-Id": string;
  "X-Inhale-Document-Id"?: string;
  "X-Inhale-LLM-Key": string;
  "X-Inhale-Ts": string;
  "X-Inhale-Sig": string;
}

export function signRequest(input: SignInput): { headers: SignedHeaders; ts: string } {
  const secret = process.env.INHALE_INTERNAL_SECRET;
  if (!secret) throw new Error("INHALE_INTERNAL_SECRET missing");
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(ts + input.method + input.path + input.body)
    .digest("hex");
  const h: SignedHeaders = {
    "X-Inhale-User-Id": input.userId,
    "X-Inhale-LLM-Key": input.llmKey,
    "X-Inhale-Ts": ts,
    "X-Inhale-Sig": sig,
  };
  if (input.documentId !== undefined) h["X-Inhale-Document-Id"] = String(input.documentId);
  return { headers: h, ts };
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Write failing test for `streamPassthrough`**

`stream-passthrough.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { streamPassthrough } from "./stream-passthrough";

describe("streamPassthrough", () => {
  it("mirrors upstream SSE body + content-type", async () => {
    const upstream = new Response(
      new ReadableStream({
        start(ctrl) {
          const enc = new TextEncoder();
          ctrl.enqueue(enc.encode('data: {"type":"token","content":"hi"}\n\n'));
          ctrl.enqueue(enc.encode("data: [DONE]\n\n"));
          ctrl.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } }
    );
    const res = streamPassthrough(upstream);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    const text = await res.text();
    expect(text).toContain('"type":"token"');
    expect(text).toContain("[DONE]");
  });

  it("propagates upstream error status", async () => {
    const upstream = new Response("nope", { status: 502 });
    const res = streamPassthrough(upstream);
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 6: Implement `stream-passthrough.ts`**

```ts
export function streamPassthrough(upstream: Response): Response {
  if (!upstream.ok && upstream.status !== 200) {
    return new Response(upstream.body, { status: upstream.status });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 7: Run vitest — all green**

```bash
cd apps/web && npx vitest run src/lib/agents
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/agents
git commit -m "feat(web): proxy helpers for agents service (signRequest + streamPassthrough)"
```

---

## Task 37d — Embeddings moved to Python

**Files:**
- Create: `services/agents/routers/embeddings.py`
- Create: `services/agents/lib/openrouter_client.py`
- Test: `services/agents/tests/test_embeddings.py`
- Modify: `apps/web/src/app/api/documents/upload/route.ts`
- (deferred delete to Task 37i): `apps/web/src/lib/ai/embeddings.ts`

### Python side

- [ ] **Step 1: Write failing Python test for `/agents/embed-chunks`**

`services/agents/tests/test_embeddings.py`:

```python
import os, hmac, hashlib, time, json
from fastapi.testclient import TestClient

os.environ["INHALE_INTERNAL_SECRET"] = "test-secret-abc"
os.environ["INHALE_STUB_EMBEDDINGS"] = "1"
os.environ["DATABASE_URL"] = "postgres://inhale:inhale@localhost:5432/inhale_test"

from main import app  # noqa: E402

client = TestClient(app)

def _headers(method, path, body: bytes, user="u1", doc="1"):
    ts = str(int(time.time()))
    sig = hmac.new(b"test-secret-abc",
                   ts.encode() + method.encode() + path.encode() + body,
                   hashlib.sha256).hexdigest()
    return {
        "X-Inhale-User-Id": user,
        "X-Inhale-Document-Id": doc,
        "X-Inhale-LLM-Key": "sk-test",
        "X-Inhale-Ts": ts,
        "X-Inhale-Sig": sig,
        "Content-Type": "application/json",
    }

def test_embed_chunks_stub_writes_rows(db_seed_document):
    doc_id = db_seed_document  # fixture inserts a documents row, returns id
    body = json.dumps({
        "documentId": doc_id,
        "chunks": [
            {"chunkIndex": 0, "content": "hello", "pageStart": 1, "pageEnd": 1, "tokenCount": 1},
            {"chunkIndex": 1, "content": "world", "pageStart": 1, "pageEnd": 2, "tokenCount": 1},
        ],
    }).encode()
    r = client.post("/agents/embed-chunks", content=body,
                    headers=_headers("POST", "/agents/embed-chunks", body, doc=str(doc_id)))
    assert r.status_code == 200
    assert r.json() == {"inserted": 2}
```

Add a `conftest.py` with an async pytest fixture that seeds a document and cleans up. Pattern per `fastapi` skill reference `dependencies.md` (DB fixtures via `yield`).

- [ ] **Step 2: Run test — FAIL (endpoint missing)**

- [ ] **Step 3: Implement `lib/openrouter_client.py`**

```python
import os
from typing import Iterable
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
```

- [ ] **Step 4: Implement `routers/embeddings.py`**

```python
from typing import Annotated
from fastapi import APIRouter
from pydantic import BaseModel, Field
from deps.auth import InternalAuthDep
from deps.db import ConnDep
from lib.openrouter_client import embed_texts

router = APIRouter(prefix="/agents", tags=["embeddings"])

class Chunk(BaseModel):
    chunkIndex: int
    content: str
    pageStart: int
    pageEnd: int
    tokenCount: int

class EmbedChunksBody(BaseModel):
    documentId: int
    chunks: Annotated[list[Chunk], Field(min_length=1, max_length=512)]

class EmbedChunksResponse(BaseModel):
    inserted: int

@router.post("/embed-chunks")
async def embed_chunks(
    body: EmbedChunksBody,
    auth: InternalAuthDep,
    conn: ConnDep,
) -> EmbedChunksResponse:
    vecs = await embed_texts(auth["llm_key"], [c.content for c in body.chunks])
    if len(vecs) != len(body.chunks):
        raise ValueError("embedding count mismatch")

    rows = [
        (body.documentId, c.chunkIndex, c.content, c.pageStart, c.pageEnd, c.tokenCount, v)
        for c, v in zip(body.chunks, vecs)
    ]
    await conn.executemany(
        """
        INSERT INTO document_chunks
          (document_id, chunk_index, content, page_start, page_end, token_count, embedding)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        """,
        rows,
    )
    return EmbedChunksResponse(inserted=len(rows))
```

- [ ] **Step 5: Register router in `main.py`**

```python
from routers import health, embeddings
app.include_router(health.router)
app.include_router(embeddings.router)
```

- [ ] **Step 6: Run test — PASS**

```bash
cd services/agents && INHALE_STUB_EMBEDDINGS=1 pytest tests/test_embeddings.py -v
```

### Next.js side

- [ ] **Step 7: Write failing test asserting upload route calls `/agents/embed-chunks`**

`apps/web/e2e/upload-agents-embed.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { signUpAndLogin } from "./helpers/auth";
import fs from "fs";
import path from "path";

test("upload forwards chunks to /agents/embed-chunks", async ({ page }) => {
  await signUpAndLogin(page);

  let agentsCalled = false;
  await page.route("**/agents/embed-chunks", async (route) => {
    agentsCalled = true;
    const body = route.request().postDataJSON();
    expect(Array.isArray(body.chunks)).toBe(true);
    expect(typeof body.documentId).toBe("number");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ inserted: body.chunks.length }),
    });
  });

  const pdfPath = path.join(__dirname, "fixtures/test.pdf");
  const buf = fs.readFileSync(pdfPath);
  const res = await page.request.post("/api/documents/upload", {
    multipart: { file: { name: "test.pdf", mimeType: "application/pdf", buffer: buf } },
  });
  expect(res.status()).toBe(201);
  expect(agentsCalled).toBe(true);
});
```

- [ ] **Step 8: Run — expect FAIL (upload route still uses local `embedTexts`)**

- [ ] **Step 9: Modify upload route to call `/agents/embed-chunks`**

In `apps/web/src/app/api/documents/upload/route.ts` — replace the `embedTexts` block with a signed fetch:

```ts
import { signRequest } from "@/lib/agents/sign-request";
import { getDecryptedApiKey } from "@/lib/ai/openrouter"; // stays until Task 37i

// ... inside POST, after `const chunks = chunkPages(pages);` ...
if (chunks.length > 0) {
  const llmKey = await getDecryptedApiKey(session.user.id);
  const payload = JSON.stringify({
    documentId: doc.id,
    chunks: chunks.map((c) => ({
      chunkIndex: c.chunkIndex,
      content: c.content,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      tokenCount: c.tokenCount,
    })),
  });
  const { headers } = signRequest({
    method: "POST",
    path: "/agents/embed-chunks",
    body: payload,
    userId: session.user.id,
    documentId: doc.id,
    llmKey,
  });
  const res = await fetch(`${process.env.AGENTS_URL}/agents/embed-chunks`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: payload,
  });
  if (!res.ok) throw new Error(`embed-chunks failed: ${res.status}`);
}
// remove the local db.insert(documentChunks).values(...) block — Python owns the insert now.
```

- [ ] **Step 10: Run upload e2e — PASS**

- [ ] **Step 11: Confirm existing `e2e/ai-features.spec.ts` "upload sets processingStatus to ready" still passes**

```bash
cd apps/web && npx playwright test ai-features.spec.ts
```

- [ ] **Step 12: Commit**

```bash
git add services/agents apps/web/src/app/api/documents/upload apps/web/e2e/upload-agents-embed.spec.ts
git commit -m "feat(agents): move embeddings to Python /agents/embed-chunks"
```

---

## Task 37e — Outline route → Python

**Files:**
- Create: `services/agents/routers/outline.py`
- Create: `services/agents/lib/pdf_text.py` (port of `apps/web/src/lib/ai/pdf-text.ts` to Python using `unpdf`-equivalent: `pypdf` or `pdfminer.six` — choose per kickoff note)
- Test: `services/agents/tests/test_outline.py`
- Modify: `apps/web/src/app/api/documents/[id]/outline/route.ts` (becomes proxy)

- [ ] **Step 1: Pin the PDF-text lib at kickoff**

Record in "Deferred decisions" block: which Python PDF-text library is used (`pypdf`, `pdfminer.six`, or other). Add to `pyproject.toml` deps.

- [ ] **Step 2: Write failing test for `GET /agents/outline`**

`services/agents/tests/test_outline.py`:

```python
def test_outline_returns_cached_sections(db_seed_document_with_sections):
    doc_id = db_seed_document_with_sections  # fixture inserts document_sections rows
    body = b""
    r = client.get(f"/agents/outline?documentId={doc_id}",
                   headers=_headers("GET", f"/agents/outline", body, doc=str(doc_id)))
    assert r.status_code == 200
    assert r.json()["sections"][0]["title"] == "Intro"
```

Plus a test that if no cached sections exist, the route calls OpenRouter (stubbed) and inserts rows.

- [ ] **Step 3: Run — FAIL**

- [ ] **Step 4: Port `pdf-text.ts` behavior to Python** — `lib/pdf_text.py` exposes `def extract_pages(file_path: str) -> list[ExtractedPage]` (plain `def` — PDF parsing is blocking I/O). Callers in async endpoints must wrap with `asyncer.asyncify(extract_pages)(path)` per FastAPI async rules.

- [ ] **Step 5: Implement `routers/outline.py`**

Mirror `apps/web/src/app/api/documents/[id]/outline/route.ts` logic: read-through cache on `document_sections`; if empty, call OpenRouter (via `lib/openrouter_client.call_model` — add a non-streaming variant), parse JSON array, insert, return.

Request: `GET /agents/outline?documentId=<int>`. Response JSON unchanged from current: `{ sections: [{ id, documentId, sectionIndex, title, content, pageStart, pageEnd, createdAt }] }`.

- [ ] **Step 6: Register router; run tests — PASS**

- [ ] **Step 7: Write failing Playwright test that outline proxy preserves JSON shape**

`apps/web/e2e/outline-proxy.spec.ts` — mocks `/agents/outline` upstream and asserts `/api/documents/:id/outline` returns identical body shape.

- [ ] **Step 8: Replace `apps/web/src/app/api/documents/[id]/outline/route.ts` body with proxy**

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDecryptedApiKey } from "@/lib/ai/openrouter";
import { signRequest } from "@/lib/agents/sign-request";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const documentId = Number(id);

  let llmKey: string;
  try { llmKey = await getDecryptedApiKey(session.user.id); }
  catch { return NextResponse.json({ error: "Add an OpenRouter key in Settings" }, { status: 400 }); }

  const path = `/agents/outline?documentId=${documentId}`;
  const { headers } = signRequest({
    method: "GET",
    path,
    body: "",
    userId: session.user.id,
    documentId,
    llmKey,
  });
  const res = await fetch(`${process.env.AGENTS_URL}${path}`, { headers });
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 9: Run Playwright + existing outline e2e — PASS**

- [ ] **Step 10: Commit**

```bash
git commit -am "feat(agents): move outline route to Python + Next.js proxy"
```

---

## Task 37f — Chat route → Python (framework-parameterized)

**Files:**
- Create: `services/agents/routers/chat.py`
- Create: `services/agents/lib/rag.py` — retrieval helpers (asyncpg queries from `apps/web/src/app/api/documents/[id]/chat/route.ts`)
- Create: `services/agents/lib/agent.py` — framework-specific agent class (populated per kickoff)
- Test: `services/agents/tests/test_chat_contract.py`
- Modify: `apps/web/src/app/api/documents/[id]/chat/route.ts` (becomes proxy)

**Kickoff prerequisite:** framework chosen at §2.1 step 1; conversation-persistence pattern chosen at step 4.

### Contract tests (framework-independent — written now)

- [ ] **Step 1: Write failing SSE contract test**

`services/agents/tests/test_chat_contract.py` — boots `TestClient`, posts to `/agents/chat` with `INHALE_STUB_EMBEDDINGS=1` + a mock OpenRouter completion, asserts the wire contract:

```python
def test_chat_emits_sources_then_tokens_then_done(db_seed_document_with_chunks, monkeypatch):
    doc_id = db_seed_document_with_chunks

    async def fake_stream(*_, **__):
        yield "Hello "
        yield "world"
    monkeypatch.setattr("lib.openrouter_client.stream_completion", fake_stream)

    body = json.dumps({"question": "what is this?", "scope": "paper"}).encode()
    with client.stream("POST", "/agents/chat",
                       content=body,
                       headers=_headers("POST", "/agents/chat", body, doc=str(doc_id))) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        events = [line for line in r.iter_lines() if line.startswith("data:")]

    assert any('"type":"sources"' in e for e in events)
    assert any('"type":"token"' in e and '"content":"Hello "' in e for e in events)
    assert events[-1] == "data: [DONE]"
```

Also assert: conversationId returned in first sources event; assistant message persisted; `agent_conversations.updated_at` bumped.

- [ ] **Step 2: Port retrieval logic to `lib/rag.py`**

Translate each `db.execute(sql\`...\`)` block from `apps/web/src/app/api/documents/[id]/chat/route.ts` (lines 94–218) to asyncpg. Same three queries (page-scoped rows, supporting top-K with per-page dedupe, anchor/first-chunks, empty fallback). Same constants (`MAX_PAGE_TEXT_CHARS=12_000`, `MAX_ANCHOR_CHARS=4_000`, top-20 → top-8 dedupe, 6-row fallback).

```python
# services/agents/lib/rag.py
from dataclasses import dataclass
from typing import Literal
import asyncpg

Scope = Literal["page", "selection", "paper"]

@dataclass
class ChunkRow:
    id: int
    content: str
    page_start: int
    page_end: int
    score: float

# async def retrieve(conn, *, document_id, scope, focus_page, query_vec) -> tuple[list[ChunkRow], str|None, str|None]: ...
# async def fallback_first_n(conn, document_id, n=6) -> list[ChunkRow]: ...
```

Write unit tests in `tests/test_rag.py` that seed chunks and assert the per-page dedupe + 8-cap + anchor-from-MIN(page_start) behavior matches the TS reference.

- [ ] **Step 3: Implement `routers/chat.py` skeleton (framework-agnostic)**

Handles: auth, body validation, retrieval (via `lib/rag.py`), empty-retrieval guard (byte-identical to TS), SSE envelope + conversation upsert + message persistence. Delegates the LLM call itself to `lib/agent.py`.

```python
# services/agents/routers/chat.py
from collections.abc import AsyncIterable
from typing import Literal
from fastapi import APIRouter
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel, Field
from deps.auth import InternalAuthDep
from deps.db import ConnDep
from lib.rag import retrieve, fallback_first_n
from lib.conversations import upsert_conversation, insert_message, bump_updated_at
from lib.agent import run_chat  # framework-specific — populated at kickoff

router = APIRouter(prefix="/agents", tags=["chat"])

class ChatBody(BaseModel):
    question: str = Field(min_length=1)
    conversationId: int | None = None
    viewportContext: dict | None = None
    history: list[dict] = Field(default_factory=list)
    scope: Literal["page", "selection", "paper"] = "paper"
    selectionText: str | None = None
    pageNumber: int | None = None

@router.post("/chat", response_class=EventSourceResponse)
async def chat(
    body: ChatBody, auth: InternalAuthDep, conn: ConnDep,
) -> AsyncIterable[ServerSentEvent]:
    # 1. embed query + retrieve (rag.py)
    # 2. empty-retrieval guard:
    #    yield ServerSentEvent(data={"type": "sources", "sources": [], "conversationId": conv_id})
    #    yield ServerSentEvent(data={"type": "token", "content": emptyMessage})
    #    yield ServerSentEvent(raw_data="[DONE]")
    #    persist both rows; return
    # 3. upsert conversation + insert user message
    # 4. yield ServerSentEvent(data={"type": "sources", "sources": sources, "conversationId": conv_id})
    # 5. stream LLM via run_chat():
    #    async for delta in run_chat(...):
    #        yield ServerSentEvent(data={"type": "token", "content": delta})
    # 6. yield ServerSentEvent(raw_data="[DONE]")
    # 7. persist assistant message after last yield (conn still alive)
    ...
```

Uses FastAPI's built-in `fastapi.sse` module — no `sse-starlette` dep needed. Use `data=` for auto-JSON-serialized objects, `raw_data="[DONE]"` for the terminator string. The `yield`-based pattern per FastAPI streaming reference.

- [ ] **Step 4: Write `lib/openrouter_client.stream_completion` (framework-neutral fallback)**

Simple `httpx` SSE stream iterator over OpenRouter chat-completions. Used when framework-selection output chooses "no framework" OR as the underlying HTTP client that the chosen framework wraps.

- [ ] **Step 5: Run contract test with minimal stub `run_chat` — PASS**

At this point, `lib/agent.py` can be a stub that calls `stream_completion` directly with a prompt identical to the TS reference (lines 338–369). This satisfies the contract tests without any framework.

```bash
cd services/agents && INHALE_STUB_EMBEDDINGS=1 pytest tests/test_chat_contract.py tests/test_rag.py -v
```

### Framework integration (authored AT kickoff — populates `lib/agent.py`)

- [ ] **Step 6: [KICKOFF] Replace stub `run_chat` with framework-chosen implementation**

Per §2.1 step 1 output, implement `run_chat(conn, auth, body, supporting_chunks, page_text, anchor_text)` using the chosen framework's streaming primitive. The function must:
- yield string deltas (no framework-specific event objects leak out)
- not own conversation persistence (router does that)
- accept the same prompt assembly inputs (supporting_chunks, page_text, anchor_text, selectionText) as the TS reference

If the framework is LangGraph: build a single-node graph; node calls the chat model with streaming; return `ainvoke` + `astream` delta generator.
If LangChain only: use `RunnableWithMessageHistory` or a plain `ChatOpenAI.astream`.
If no framework: keep the stub.

Re-run `test_chat_contract.py` — MUST still pass with zero event-schema change.

- [ ] **Step 7: Write failing Next.js proxy test**

`apps/web/e2e/chat-proxy.spec.ts` — mocks `/agents/chat`, asserts `/api/documents/:id/chat` streams the mocked SSE through unchanged.

- [ ] **Step 8: Replace `apps/web/src/app/api/documents/[id]/chat/route.ts` with proxy**

```ts
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getDecryptedApiKey } from "@/lib/ai/openrouter";
import { signRequest } from "@/lib/agents/sign-request";
import { streamPassthrough } from "@/lib/agents/stream-passthrough";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const documentId = Number(id);

  let llmKey: string;
  try { llmKey = await getDecryptedApiKey(session.user.id); }
  catch { return new Response("Add an OpenRouter key in Settings", { status: 400 }); }

  const bodyText = await request.text();
  const path = "/agents/chat";
  const { headers } = signRequest({
    method: "POST",
    path,
    body: bodyText,
    userId: session.user.id,
    documentId,
    llmKey,
  });

  const upstream = await fetch(`${process.env.AGENTS_URL}${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: bodyText,
  });
  return streamPassthrough(upstream);
}
```

- [ ] **Step 9: Run e2e suite — MUST be green**

```bash
cd apps/web
INHALE_STUB_EMBEDDINGS=1 npx playwright test ai-features.spec.ts chat-context.spec.ts chat-history.spec.ts
```

All three existing suites pass with zero edits.

- [ ] **Step 10: Commit**

```bash
git commit -am "feat(agents): chat route → Python + Next.js proxy (SSE contract preserved)"
```

---

## Task 37h — Conversation persistence via asyncpg

**Files:**
- Create: `services/agents/lib/conversations.py` — `upsert_conversation`, `insert_message`, `bump_updated_at`
- Test: `services/agents/tests/test_conversations.py`
- Modify: `services/agents/routers/chat.py` — delegate persistence to `lib/conversations.py`

Conversation/messages schema is already in `agent_conversations` + `agent_messages` (Drizzle-owned). Python only reads/writes rows.

- [ ] **Step 1: Write failing persistence test**

`tests/test_conversations.py`: seed a user + doc, call `upsert_conversation(conn, user_id, doc_id, title="q")` → returns id; call `insert_message(conn, conv_id, "user", "q", viewport={"page":2})` → row exists with matching `viewport_context` jsonb; `bump_updated_at` increases `updated_at`.

- [ ] **Step 2: Implement `lib/conversations.py`**

```python
import json as _json
from datetime import datetime, timezone

async def upsert_conversation(conn, *, user_id: str, document_id: int,
                              conversation_id: int | None, title: str) -> int:
    if conversation_id is not None:
        return conversation_id
    row = await conn.fetchrow(
        """
        INSERT INTO agent_conversations (user_id, document_id, title)
        VALUES ($1, $2, $3)
        RETURNING id
        """,
        user_id, document_id, title[:80],
    )
    return row["id"]

async def insert_message(conn, *, conversation_id: int, role: str,
                         content: str, viewport: dict | None = None) -> None:
    # asyncpg requires JSON-serialized string for jsonb columns
    viewport_json = _json.dumps(viewport) if viewport else None
    await conn.execute(
        """
        INSERT INTO agent_messages (conversation_id, role, content, viewport_context)
        VALUES ($1, $2, $3, $4::jsonb)
        """,
        conversation_id, role, content, viewport_json,
    )

async def bump_updated_at(conn, conversation_id: int) -> None:
    await conn.execute(
        "UPDATE agent_conversations SET updated_at = $1 WHERE id = $2",
        datetime.now(timezone.utc), conversation_id,
    )
```

- [ ] **Step 3: Run persistence test — PASS**

- [ ] **Step 4: Wire into `routers/chat.py`** — replace the stub persistence calls (from Task 37f Step 3) with these helpers.

- [ ] **Step 5: [KICKOFF] If framework-selection chose LangGraph:** swap the manual helpers for the pattern from `langchain-skills:langgraph-persistence` if-and-only-if it reads/writes the same two tables with the same column semantics. If the skill mandates a checkpointer table, that's a migration — add a Drizzle migration first and update the "Deferred decisions" block. Do NOT introduce new tables without amending the spec.

- [ ] **Step 6: Re-run `test_chat_contract.py` — PASS**

- [ ] **Step 7: Commit**

```bash
git commit -am "feat(agents): conversation persistence via asyncpg"
```

---

## Task 37i — Cleanup (TS OpenRouter removal)

**Files (deleted):**
- `apps/web/src/lib/ai/embeddings.ts`
- `apps/web/src/lib/ai/openrouter.ts`

**Files (modified):**
- `apps/web/package.json` — remove `@openrouter/sdk`
- `apps/web/src/app/api/documents/upload/route.ts` — replace `getDecryptedApiKey` import with a local helper OR inline the BYOK decrypt (since only two call sites now: upload + chat/outline proxies).

**Keep:**
- `apps/web/src/lib/ai/chunking.ts` — no LLM call, used by upload route for pre-embedding text work.
- `apps/web/src/lib/ai/pdf-text.ts` — used only by upload route now.

- [ ] **Step 1: Grep for remaining usages**

```bash
cd apps/web
grep -rn "@openrouter/sdk" src/ && echo "STILL REFERENCED" || echo "clean"
grep -rn "from \"@/lib/ai/openrouter\"" src/
grep -rn "from \"@/lib/ai/embeddings\"" src/
```

Expected: only upload route, chat proxy route, and outline proxy route reference `getDecryptedApiKey` from `@/lib/ai/openrouter`. Nothing references `@/lib/ai/embeddings`.

- [ ] **Step 2: Extract `getDecryptedApiKey` to a new `apps/web/src/lib/byok.ts`**

```ts
import { db } from "@/db";
import { userApiKeys } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

export async function getDecryptedApiKey(userId: string): Promise<string> {
  if (process.env.INHALE_STUB_EMBEDDINGS === "1") return "stub-api-key";
  const [row] = await db
    .select({ encryptedKey: userApiKeys.encryptedKey })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.providerType, "llm")));
  if (!row) throw new Error("NO_LLM_KEY");
  return decrypt(row.encryptedKey);
}
```

- [ ] **Step 3: Update imports in upload + chat proxy + outline proxy**

Change three lines: `from "@/lib/ai/openrouter"` → `from "@/lib/byok"`.

- [ ] **Step 4: Delete obsolete files**

```bash
cd apps/web
rm src/lib/ai/openrouter.ts src/lib/ai/embeddings.ts
```

- [ ] **Step 5: Remove dep**

```bash
cd apps/web && npm uninstall @openrouter/sdk
```

- [ ] **Step 6: Type-check + build**

```bash
cd apps/web && npm run build
```

Expected: PASS, zero TS errors.

- [ ] **Step 7: Run full Playwright suite**

```bash
cd apps/web && INHALE_STUB_EMBEDDINGS=1 npx playwright test
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git commit -am "chore(web): drop @openrouter/sdk + remove TS OpenRouter wrappers"
```

---

## E2E Gate — Phase 2.0.3

Run from `apps/web/` with `docker compose up -d` and both Vercel Services booted via `vercel dev -L`.

- [ ] `e2e/ai-features.spec.ts` passes with zero edits.
- [ ] `e2e/chat-context.spec.ts` passes with zero edits.
- [ ] `e2e/chat-history.spec.ts` passes with zero edits.
- [ ] Chrome DevTools MCP walk-through:
  - upload fixture paper → wait for `processingStatus=ready`
  - open chat sidebar → send "summarize this" → SSE `sources` event observed; `token` events stream; assistant message renders
  - reload page → conversation history visible; open a prior thread → messages restored
- [ ] `list_console_messages` returns zero errors.
- [ ] `list_network_requests` returns zero 4xx/5xx on `/api/*` or `/agents/*`.
- [ ] `take_screenshot` of streamed chat reply → commit as visual baseline under `e2e/__meta__/phase-2.0.3-chat.png`.
- [ ] `cd services/agents && pytest -v` — all Python tests pass.
- [ ] `cd apps/web && npm run build` — zero TS errors.
- [ ] Progress table in `docs/superpowers/plans/2026-04-08-inhale-mvp.md` updated: 2.0.3 → DONE.
