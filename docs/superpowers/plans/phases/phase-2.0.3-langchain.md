# Phase 2.0.3 — Python agents service + framework migration

> **Status:** Pending. **Spec:** §0.2, §0.7, §0.8, §2. **Kickoff (mandatory, in order):** `langchain-skills:framework-selection` → `fastapi` skill → `langchain-skills:langchain-dependencies` → consult `langchain-skills:langchain-rag` + `langchain-skills:langgraph-persistence` → confirm Vercel Python runtime version per Vercel Python docs. Record primitive decisions inline in spec §2.

## Phase 2.0.3 — Python agents service + framework migration (OUTLINE)

**Goal:** stand up `services/agents/` (FastAPI), migrate every existing AI route onto it behind a byte-identical browser contract. Next.js becomes a thin proxy for AI routes.

**Locked constraints:**
- Every existing Phase 1 route-handler request/response shape (SSE schema, JSON shape, status codes) stays byte-identical from the browser's perspective. `e2e/ai-features.spec.ts` must pass unchanged.
- Framework selection precedes implementation — no LangChain/LangGraph code before `framework-selection` skill runs.
- Versions (Python, FastAPI, OCRmyPDF, framework primitives) are not pinned here; decided at kickoff from each skill's current output.

**Tasks (expand to full TDD detail via `superpowers:writing-plans`):**

- [ ] Task 37a: Repo restructure — git-mv existing Next.js root into `apps/web/`; scaffold `services/agents/` per `fastapi` skill conventions (`pyproject.toml` with `[tool.fastapi]` entrypoint, `main.py`, `routers/`, `deps/`, `lib/`); add `vercel.json` with `experimentalServices: { web, agents }` per spec §0.7; confirm `vercel dev -L` boots both services locally against the existing `docker compose` Postgres.
- [ ] Task 37b: FastAPI scaffold — `main.py`, health route, internal-auth dependency (`require_internal`) verifying the HMAC headers from spec §0.8, asyncpg pool dependency with `pgvector.asyncpg.register_vector` on each connection, `INHALE_INTERNAL_SECRET` env var wired through Vercel env config for both services.
- [ ] Task 37c: Next.js proxy helpers in `src/lib/agents/` — `signRequest` (HMAC signing per §0.8) and `streamPassthrough` (SSE passthrough with correct headers). Vitest unit tests.
- [ ] Task 37d: Embeddings moved to Python — `POST /agents/embed-chunks` (accepts pre-chunked text, calls OpenRouter `/v1/embeddings`, writes `document_chunks` rows). Next.js upload route swaps direct OpenRouter fetch for a signed call to this endpoint. `src/lib/ai/embeddings.ts` deleted.
- [ ] Task 37e: Outline route — `GET /agents/outline` in Python using the framework chosen at kickoff. Next.js `/api/documents/[id]/outline/route.ts` becomes a proxy. JSON shape unchanged.
- [ ] Task 37f: Chat route — `POST /agents/chat` in Python using the framework chosen at kickoff, with SSE streaming. Next.js `/api/documents/[id]/chat/route.ts` becomes a proxy. SSE event schema (`sources` / `token` / `[DONE]` / `error`) byte-identical. Empty-retrieval guard + vector-miss fallback preserved.
- [ ] Task 37g: Explain route — `POST /agents/explain` in Python. Next.js explain route becomes a proxy.
- [ ] Task 37h: Conversation persistence — wired to existing `agent_conversations` + `agent_messages` via asyncpg, using the pattern selected by `langchain-skills:langgraph-persistence` (or equivalent for the chosen framework).
- [ ] Task 37i: Cleanup — delete `@openrouter/sdk` from `package.json`, delete `src/lib/ai/openrouter.ts`, confirm no remaining TS imports reference OpenRouter. Keep `src/lib/ai/chunking.ts` (pre-embedding text work).

### E2E Gate — Phase 2.0.3

- [ ] Existing `e2e/ai-features.spec.ts` passes with zero edits.
- [ ] Chrome DevTools MCP walk-through: upload fixture paper → open chat sidebar → send question → SSE tokens stream in → reload page → conversation history restored → open a prior conversation.
- [ ] `list_console_messages`: zero errors.
- [ ] `list_network_requests`: zero 4xx/5xx on `/api/*` or `/agents/*`.
- [ ] `take_screenshot` of chat response; commit as visual baseline.
- [ ] Python test suite (runner per `fastapi` skill) passes.
- [ ] `npm run build` passes with no TS errors.
