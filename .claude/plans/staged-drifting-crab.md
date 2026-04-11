# Inhale — Implementation Plan

## Context

Inhale is an AI-enhanced interactive PDF reader for scientific papers. The PRD/ERD defines a 5-phase roadmap (Phases 0-4) with 17 core database entities and a BYOK model where users bring their own API keys for AI features. **Architecture**: pure Next.js (App Router) — all CRUD, auth, and AI features run inside Next.js API routes. The original PRD specced a Python FastAPI + Celery service for processing; that has been dropped in favor of inline Next.js routes calling the OpenRouter TypeScript SDK directly. Revisit a separate worker only when v0 latency proves unacceptable.

**Current state**: Next.js 16 + React 19 + Tailwind 4 + shadcn/ui (base-nova) boilerplate with a dummy landing page. No backend, no database, no auth, no PDF rendering — we're building from scratch.

**Goal**: Break the PRD into small, shippable increments and execute them in order.

**PRD/ERD source**: `/Users/mohidbutt/Documents/Claudius/Second Brain/Projects/Episteme/Inhale_PRD_ERD.md`

---

## Progress

| Phase | Status | Notes |
|---|---|---|
| **0.0 — Infrastructure & Database** | DONE | All files created. Migration generated. Uses `serial` (not `generateAlwaysAsIdentity` — unsupported in drizzle-orm 0.45.2). Postgres/Redis installed via Homebrew (not Docker). `drizzle-kit push` still needs to be run against a running Postgres. |
| **0.1 — Authentication** | DONE | Better Auth v1.6.0, email+password, session middleware, login/signup pages, user-menu. |
| **0.2 — Document Upload & Library** | DONE | Library page, drag-and-drop upload, local file storage, document CRUD API. |
| **0.3 — PDF Reader** | DONE | react-pdf v10, Turbopack canvas alias, Zustand reader state, toolbar, zoom, page nav. |
| **0.4 — Highlighting** | DONE | user_highlights schema, highlight CRUD API, text selection, highlight layer placeholder, highlights sidebar, SelectionToolbar. |
| **0.5 — Comments & BYOK Settings** | DONE | user_comments schema + CRUD API, CommentInput/CommentThread UI, AES-256-GCM encryption, BYOK settings page + API. |
| **1.0 — BYOK OpenRouter (server-side)** | DONE | `src/lib/ai/openrouter.ts` — `getDecryptedApiKey` + `getOpenRouterClient` + `MODELS`. `services/processing/` deleted. `docker-compose.yml` cleaned to Postgres-only. `@openrouter/sdk` uses named import `{ OpenRouter }`. |
| **1.1 — Document Chunking + pgvector** | DONE | pgvector enabled, `embedding vector(1536)` + ivfflat index on `document_chunks`. `unpdf` for server-side text extraction. Chunker (500-token/50-overlap). Embeddings via OpenRouter REST fetch. Inline on upload — sets `processingStatus` ready/failed. |
| **1.2 — AI Outline (Next.js route)** | DONE | `/api/documents/[id]/outline` — caches in `documentSections`, generates via OpenRouter on first request. `/api/ai/explain` SSE route for selected text. `OutlineSidebar` + `ConceptsPanel` + `SectionPreview` wired into reader. |
| **1.3 — Minimal RAG Chat (Next.js)** | DONE | `/api/documents/[id]/chat` — pgvector retrieval with viewport bias, SSE stream, conversation persistence. `use-chat.ts` rewritten (no FastAPI, proper SSE buffer, `conversationId` round-trip). `apiKey` client-side fetch removed. |
| **E2E — Playwright test suite** | DONE | `e2e/ai-features.spec.ts` — 4 tests covering Phase 1 happy paths: upload→chunk API contract, outline sidebar (mocked), explain SSE (mocked), RAG chat turn (mocked). Added `data-testid` to `OutlineSidebar` + `ConceptsPanel` for stable selectors. |
| 2.0–3.3 | Pending | — |
| 4.0–4.4 | Pending | — |

---

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| **Backend** | Next.js API routes for everything (CRUD, auth, AI, RAG) | Single stack, single deploy. v0 scope is small enough that a Python service adds more friction than value. Revisit if heavy OCR/embedding workloads outgrow serverless function limits. |
| **AI SDK** | `@openrouter/sdk` (TypeScript) called from Next.js routes | One BYOK key per user, multi-model access, native streaming via `getTextStream()`. **Not using LangChain TS** — OpenRouter SDK's `callModel` + `tool()` + `stopWhen` covers v0 scope; revisit LangChain if/when multi-agent or HITL workflows are needed. |
| **Background processing** | None (inline on request) | v0 scope: chunk + embed inline on upload, generate outline on demand. Accept latency. No Celery, no Redis queue, no BullMQ. Revisit when a single doc takes >30s to process. |
| **Auth** | Better Auth (self-hosted TS lib) | Email+password built-in, OAuth plugin later, stores in your Postgres, no vendor lock-in |
| **ORM** | Drizzle ORM | Lightweight, SQL-like, excellent TS inference, schema-as-code. Single source of truth for all migrations. |
| **Streaming** | SSE for text agent + all AI features; WebSocket only for voice | SSE is simpler, works through Vercel/Cloudflare without special config, auto-reconnects |
| **PDF rendering** | react-pdf v10 (wraps PDF.js) | React 19 support, canvas + text layer |
| **Reader state** | Zustand | Minimal boilerplate for page/zoom/scroll state |
| **Vector DB** | pgvector (Postgres extension) | No separate service, lives in existing Postgres |
| **LLM** | OpenRouter (BYOK) | User provides key, multi-model access |
| **OCR** | Mistral OCR API (BYOK) | Best-in-class for scientific PDFs |
| **Citations** | Semantic Scholar API (free) | Comprehensive, good rate limits |
| **Encryption** | Node.js crypto AES-256-GCM | Built-in, zero dependencies |
| **Repo structure** | Single Next.js app under `src/` | Simple, one git history, one deploy target |

---

## Phase 0: Core Reader

### 0.0 — Infrastructure & Database [DONE]

**Build**: Docker Compose (Postgres 16 + pgvector, Redis 7), Drizzle ORM setup, initial schema (`users`, `documents`, `user_api_keys`), DB connection utility, env template.

**Install**: `drizzle-orm`, `drizzle-kit`, `postgres` (pg driver)

**Files created**:
- `docker-compose.yml` — Postgres 16 (pgvector/pgvector:pg16) + Redis 7 Alpine
- `drizzle.config.ts` — points to `src/db/schema/index.ts`, outputs to `drizzle/`
- `src/db/index.ts` — connection singleton using postgres.js driver
- `src/db/schema/users.ts` — users table (serial PK, email unique, password_hash, display_name, avatar_url, timestamps)
- `src/db/schema/documents.ts` — documents table + processing_status enum
- `src/db/schema/user-api-keys.ts` — user_api_keys table + provider_type, storage_mode enums
- `src/db/schema/index.ts` — barrel export
- `.env.local.example` — template with DATABASE_URL, REDIS_URL, ENCRYPTION_KEY, BETTER_AUTH_SECRET
- `drizzle/0000_*.sql` — generated migration (3 tables, 3 enums, 2 FKs with cascade)

**Remaining**: Run `drizzle-kit push` once Postgres is running to create tables.

**Done when**: `docker compose up` starts services, `npx drizzle-kit push` creates tables, can insert/read rows.

### 0.1 — Authentication

**Build**: Better Auth with email/password, sign up/in/out pages, session middleware, auth UI in editorial design style.

**Install**: `better-auth`

**shadcn add**: `input`, `label`, `card`, `form`

**Files**:
- `/src/lib/auth.ts`, `/src/lib/auth-client.ts`
- `/src/app/api/auth/[...all]/route.ts`
- `/src/app/(auth)/login/page.tsx`, `/src/app/(auth)/signup/page.tsx`
- `/src/middleware.ts`
- `/src/components/auth/user-menu.tsx`

**Done when**: Full auth flow works, protected routes redirect to login.

### 0.2 — Document Upload & Library

**Build**: Library page with document grid, drag-and-drop upload, file storage (local fs, S3 later), document CRUD API routes.

**Install**: `pdfjs-dist` (server-side page count extraction)

**shadcn add**: `dialog`, `progress`, `dropdown-menu`, `sonner`

**Files**:
- `/src/app/(main)/library/page.tsx`
- `/src/app/(main)/layout.tsx` — main app layout with nav
- `/src/app/api/documents/upload/route.ts`, `/src/app/api/documents/[id]/route.ts`
- `/src/components/library/upload-zone.tsx`, `/src/components/library/document-card.tsx`
- `/src/lib/storage.ts` — storage abstraction

**Done when**: Upload PDF, see it in library grid, delete it.

### 0.3 — PDF Reader (Core Rendering)

**Build**: Full-screen reader at `/reader/[documentId]`, PDF.js canvas + text layer, continuous scroll, zoom controls, page navigation toolbar.

**Install**: `react-pdf` (v9+), `zustand`

**Files**:
- `/src/app/(reader)/reader/[documentId]/page.tsx`
- `/src/components/reader/pdf-viewer.tsx`, `/src/components/reader/pdf-page.tsx`
- `/src/components/reader/reader-toolbar.tsx`, `/src/components/reader/zoom-controls.tsx`
- `/src/hooks/use-pdf-document.ts`, `/src/hooks/use-reader-state.ts`
- `/src/app/api/documents/[id]/file/route.ts` — serve raw PDF

**Done when**: Click document in library -> opens reader, PDF renders with selectable text, zoom works, page indicator works.

### 0.4 — Highlighting

**Build**: Text selection detection, highlight creation (select text -> pick color -> save), highlight persistence, colored overlays on PDF, highlights sidebar.

**DB**: Add `user_highlights` table.

**shadcn add**: `popover`, `tooltip`, `sheet`, `scroll-area`

**Files**:
- `/src/db/schema/user-highlights.ts`
- `/src/components/reader/highlight-layer.tsx`, `/src/components/reader/selection-toolbar.tsx`
- `/src/components/reader/highlights-sidebar.tsx`
- `/src/hooks/use-text-selection.ts`
- `/src/app/api/documents/[id]/highlights/route.ts`

**Done when**: Select text -> floating toolbar -> click highlight -> persists across sessions. Sidebar lists highlights, clicking scrolls to them.

### 0.5 — Comments & BYOK Settings

**Build**: Comments on highlights, margin notes, BYOK settings page (API key input for OpenRouter/ElevenLabs/Mistral), AES-256 encryption for stored keys.

**DB**: Add `user_comments` table.

**shadcn add**: `textarea`, `tabs`, `separator`

**Files**:
- `/src/db/schema/user-comments.ts`
- `/src/components/reader/comment-thread.tsx`, `/src/components/reader/comment-input.tsx`
- `/src/app/(main)/settings/page.tsx`, `/src/app/(main)/settings/api-keys/page.tsx`
- `/src/app/api/settings/api-keys/route.ts`
- `/src/lib/encryption.ts`

**Done when**: Comments work on highlights. API keys can be added/tested/deleted in settings. Keys are encrypted at rest.

---

## Phase 1: First AI Features

> **Architectural note**: Phase 1 was originally specced as a Python FastAPI + Celery service. That has been removed. All AI features run inside Next.js API routes calling the OpenRouter TypeScript SDK directly. The `services/processing/` directory will be deleted as part of Phase 1.0 execution. **Not using LangChain TS** — OpenRouter SDK's `callModel` + `tool()` + `stopWhen` covers v0 scope; revisit LangChain only if/when multi-agent or HITL workflows are needed.

### 1.0 — BYOK OpenRouter (server-side)

**Build**: Server-side OpenRouter client factory keyed by `userId`. Decrypts the user's stored API key and returns an initialized SDK client. One live ping confirms the wiring end-to-end. **First execution step**: delete `services/processing/` and remove its references from `docker-compose.yml` (if still present) and any tooling.

**Install**: `@openrouter/sdk` (latest stable from npm)

**Files**:
- `/src/lib/ai/openrouter.ts` — exports `getOpenRouterClient(userId: number)`:
  1. Query `userApiKeys` via Drizzle for the row where `user_id = userId AND provider_type = 'llm'`
  2. If no row, throw a typed error (`MissingApiKeyError`) the route can map to a 412 Precondition Failed
  3. Decrypt `encrypted_key` using the existing AES-256-GCM helper in `src/lib/encryption.ts` (`decrypt(ciphertext)`)
  4. Return `new OpenRouter({ apiKey })` from `@openrouter/sdk`
- `/src/app/api/ai/ping/route.ts` — throwaway dev-only route. GET handler:
  1. `getSession()` via better-auth
  2. `client = await getOpenRouterClient(session.user.id)`
  3. `const text = await client.callModel({ model: 'openai/gpt-4o-mini', input: 'ping' }).getText()`
  4. Return `{ ok: true, text }`
  5. Delete this route once verified (or gate behind `process.env.NODE_ENV !== 'production'`)

**Delete**:
- `services/processing/` (entire directory)
- Any `processing` service block in `docker-compose.yml`
- Any references to `localhost:8000` or the FastAPI service in env files

**Done when**: Logged-in user with a saved OpenRouter key can hit `/api/ai/ping` and receive a non-empty `text`. Decrypt path is exercised. `services/processing/` no longer exists in the repo.

### 1.1 — Document Chunking + pgvector

**Build**: Enable pgvector, add `embedding` column to `document_chunks`, chunk + embed PDF text inline at upload time, store rows. **No queue, no worker** — runs synchronously in the upload handler. Accept the latency for v0.

**DB migration** (Drizzle):
- `CREATE EXTENSION IF NOT EXISTS vector;` (raw SQL in a new migration)
- Add `embedding vector(1536)` to `document_chunks` (1536 dim matches `text-embedding-3-small`; if a different model is used, update the column dim to match)
- Add a cosine similarity index: `CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`

**Files**:
- `/src/lib/ai/chunking.ts` — `chunkText(text: string, opts?: { maxTokens?: number; overlapTokens?: number }): Array<{ text: string; pageNumber: number; charStart: number; charEnd: number }>`
  - Simple splitter: split on paragraph boundaries first, then pack paragraphs into ~500-token windows with ~50-token overlap. Use a rough char-to-token heuristic (4 chars/token) — no tokenizer dep.
  - Preserve `pageNumber` by tracking page breaks from the upstream extractor.
- `/src/lib/ai/embeddings.ts` — `embedTexts(client, texts: string[]): Promise<number[][]>`
  - **Embeddings decision**: as of writing, the `@openrouter/sdk` TS package's primary surface is `callModel` for chat/completion. If the SDK exposes an `embeddings` method, use it: `client.embeddings.create({ model: 'openai/text-embedding-3-small', input: texts })`. **If it does not**, call OpenRouter's OpenAI-compatible REST endpoint directly via `fetch`:
    ```
    POST https://openrouter.ai/api/v1/embeddings
    Authorization: Bearer <decrypted user key>
    { "model": "openai/text-embedding-3-small", "input": [...] }
    ```
    Response shape mirrors OpenAI: `{ data: [{ embedding: number[] }, ...] }`. Verify the SDK surface during execution and pick whichever works; the rest of the code path is identical.
  - **Hard fallback** (only if OpenRouter embeddings turn out to be unavailable for the user's plan): mark the column nullable and skip embedding at upload. RAG retrieval (Phase 1.3) falls back to Postgres FTS/`ts_rank` over `document_chunks.text`. Document this in the code as a TODO.
- `/src/app/api/documents/upload/route.ts` — extend the existing upload handler:
  1. After the existing PDF save + page-count step, extract full text per page (use the same `pdfjs-dist` import already in the file)
  2. `chunkText(...)` -> array of chunks
  3. `getOpenRouterClient(userId)` -> `embedTexts(client, chunks.map(c => c.text))`
  4. Insert into `document_chunks` (one row per chunk, including `embedding`)
  5. Update `documents.processing_status` to `ready` on success, `failed` on error
- Update `/src/db/schema/document-chunks.ts` — add `embedding` column using Drizzle's pgvector helper (see drizzle-orm pgvector docs; likely `vector('embedding', { dimensions: 1536 })`)

**Done when**: Upload a 5-page PDF → `document_chunks` rows exist with non-null `embedding` vectors → a hand-run cosine query (`SELECT id, text FROM document_chunks WHERE document_id = ? ORDER BY embedding <=> $1 LIMIT 5`) returns chunks visibly relevant to the query.

### 1.2 — AI Outline (Next.js route)

**Build**: Move outline generation into a Next.js route. Server-side: load doc text, call OpenRouter, persist sections. Reuse the existing outline-sidebar UI unchanged.

**Files**:
- `/src/app/api/documents/[id]/outline/route.ts` — replace the current FastAPI proxy. Match the HTTP method the existing frontend already calls (check `outline-sidebar.tsx` for the fetch call before changing). Handler:
  1. `getSession()` via better-auth, 401 on missing
  2. Load `document` by id, verify `document.user_id === session.user.id`, 403 otherwise
  3. Load chunked text (concat `document_chunks.text` ordered by `page_number, char_start`, or fall back to re-extracting from the stored PDF)
  4. `client = await getOpenRouterClient(session.user.id)`
  5. ```
     const result = await client.callModel({
       model: 'openai/gpt-4o-mini',
       instructions: 'You are an academic paper outliner. Return JSON: { sections: [{ title, summary, page_start }] }',
       input: documentText.slice(0, 80_000), // hard cap; tune as needed
       stopWhen: [stepCountIs(3)],
     })
     const json = JSON.parse(await result.getText())
     ```
  6. Insert rows into `document_outlines` (or `document_sections` — confirm which table the existing outline-sidebar reads from before writing)
  7. Return the outline JSON
- Leave `/src/components/reader/outline-sidebar.tsx` and related UI components untouched if their current fetch already targets `/api/documents/[id]/outline`. If not, adjust only the URL.

**Done when**: Upload a PDF → click the outline button in the reader → outline rows appear in the DB and render in the sidebar within ~10s.

### 1.3 — Minimal RAG Chat (Next.js)

**Build**: Replace the dead `http://localhost:8000/rag/chat` endpoint with a Next.js SSE route. Embed question, run pgvector similarity search, optionally bias by viewport page, build prompt, stream answer back in the OpenAI SSE format the existing `chat-panel.tsx` expects. Persist conversation.

**Server files**:
- `/src/app/api/documents/[id]/chat/route.ts` — POST handler. Body: `{ messages: [{ role, content }], viewport_context?: { page?: number, visible_section_ids?: number[], scroll_pct?: number } }`. Flow:
  1. `getSession()` via better-auth → 401
  2. Load `document`, verify ownership → 403
  3. `client = await getOpenRouterClient(session.user.id)`
  4. `question = messages.at(-1).content`
  5. `[questionEmbedding] = await embedTexts(client, [question])` (reuses Phase 1.1 helper)
  6. pgvector query against `document_chunks` filtered by `document_id`:
     ```sql
     SELECT id, text, page_number,
            1 - (embedding <=> $1) AS similarity
     FROM document_chunks
     WHERE document_id = $2
     ORDER BY embedding <=> $1
     LIMIT 5
     ```
     Use Drizzle's raw SQL helper (`sql\`...\``) for the vector ops.
  7. **Viewport bias**: if `viewport_context.page` is provided, re-rank: add `+0.1` to similarity for chunks where `abs(page_number - viewport.page) <= 1`. Re-sort and take top 5.
  8. Build system prompt:
     ```
     You are answering questions about a specific document. Use only the
     provided context to answer. Cite page numbers like [p. 3]. If the
     answer is not in the context, say so.

     Context:
     ---
     [chunk 1 text] (page 3)
     [chunk 2 text] (page 5)
     ...
     ```
  9. ```
     const result = await client.callModel({
       model: 'openai/gpt-4o-mini',
       instructions: systemPrompt,
       input: messages,
     })
     const stream = result.getTextStream()
     ```
  10. Wrap the text stream in an SSE `ReadableStream` that emits chunks in the OpenAI delta format the existing client parses:
      ```
      data: {"choices":[{"delta":{"content":"<chunk>"}}]}\n\n
      ```
      and a terminal `data: [DONE]\n\n`. Return a `Response` with `Content-Type: text/event-stream`.
  11. After the stream completes, persist:
      - upsert `agent_conversations` row (one per `document_id` + user, or new per session — match whatever the existing schema expects)
      - insert one `agent_messages` row for the user question (with `viewport_context` JSONB)
      - insert one `agent_messages` row for the assistant answer (full text, not deltas)
  12. On error mid-stream, send `data: {"error":"..."}\n\n` then close — `chat-panel.tsx` already handles this.

**Client changes**:
- `/src/hooks/use-chat.ts`:
  - Change POST URL from `http://localhost:8000/rag/chat` to `/api/documents/${documentId}/chat`
  - Remove the `api_key` field from the request body (server now reads it from the DB)
  - Keep the SSE parsing logic — the response format is unchanged
- `/src/app/(reader)/reader/[documentId]/reader-client.tsx`:
  - Delete the `useEffect` that fetches `/api/settings/api-keys`
  - Delete the `apiKey` state variable
  - Delete the `apiKey` prop passed to `<ChatPanel />`
- `/src/components/reader/chat-panel.tsx`:
  - Remove the `apiKey` prop from the component signature and any code that forwards it to `useChat`
- `/src/hooks/use-viewport-tracking.ts` — leave unchanged; the viewport object is now sent to the new route

**Done when**:
- User opens reader, opens chat panel, asks "what is this document about?" → answer streams in token-by-token
- User asks a question whose answer lives on page 3 → answer cites `[p. 3]` and quotes/paraphrases content from that page
- New row in `agent_conversations`, one user + one assistant row in `agent_messages` per turn
- Citations as clickable markers are explicitly **out of scope for v0** — track as Phase 2 followup

---

## Phase 2: Smart Reading

### 2.0 — Smart Citations
Extract references, enrich via Semantic Scholar, interactive reference cards, "Keep It" bookmarking.

### 2.1 — Auto-Highlight
AI classifies sentences (finding/method/limitation/background), color-coded overlays, toggleable.

### 2.2 — AI Agent (Enhanced) + TTS on Responses
Agent with tool use (search doc, lookup citation, explain formula), streaming responses (SSE), source citations in chat. **+ TTS toggle on agent responses**: user can click a speaker icon on any agent reply to hear it read aloud via ElevenLabs BYOK. This is the first voice building block — response output only, no STT input yet.

### 2.3 — Library Management
Collections/folders, tags, search, sort, bulk operations.

---

## Phase 3: Advanced AI

### 3.0 — Figure & Formula Enhancement
Figure extraction, click-to-zoom, formula detection, KaTeX rendering, AI explanation on click.

### 3.1 — External Links & Deep References
URL/DOI detection, open-access links, related paper suggestions.

### 3.2 — Voice Mode (Push-to-Talk)
**STT input**: hold spacebar -> record audio -> release -> transcribe via OpenRouter/ElevenLabs STT -> feed into RAG agent -> stream text response + TTS audio. Voice orb UI (ElevenLabs-style pulsing animation, states: idle/listening/processing/speaking). **WebSocket** used here for bidirectional audio streaming. Interruption handling: spacebar during playback cancels TTS and starts new recording.

### 3.3 — BibTeX Export
Export references as BibTeX, copy individual citations.

---

## Phase 4: Polish & Scale

### 4.0 — Dark Mode (leverage existing shadcn dark theme vars in `globals.css`)
### 4.1 — Full-Text Search (PostgreSQL FTS across library + in-document)
### 4.2 — Split View & Reading Memory
### 4.3 — OAuth & Cloud Key Sync (Better Auth OAuth plugins)
### 4.4 — Performance & Production (S3, CDN, rate limiting, Sentry)

---

## Dependency Graph

```
0.0 (Infra) → 0.1 (Auth) → 0.2 (Upload) → 0.3 (Reader) → 0.4 (Highlights) → 0.5 (Comments/BYOK)
                                                |
                                                v
                                  1.0 (BYOK OpenRouter) → 1.1 (Chunking + pgvector) → 1.2 (Outline) + 1.3 (RAG Chat)
                                                                                |
                                                                    2.0–2.3 (independent of each other)
                                                                                |
                                                                    3.0–3.3 (independent of each other)
                                                                                |
                                                                    4.0–4.4 (can interleave after Phase 1)
```

---

## Critical Files (existing, will be modified)

- `src/app/layout.tsx` — needs auth provider wrapping, nav updates
- `src/app/globals.css` — already has full light/dark shadcn theme vars
- `src/app/page.tsx` — landing page, update CTAs to point to auth
- `components.json` — shadcn config for adding new components
- `next.config.ts` — will need webpack config for PDF.js worker
- `src/lib/utils.ts` — `cn()` utility, reuse everywhere

---

## Verification

After each sub-phase:
1. Run `npm run build` — zero TypeScript errors
2. Run `npm run dev` — verify the feature works in browser
3. Manual test the acceptance criteria listed per sub-phase
4. Commit with descriptive message before moving to next sub-phase

---

## Start

Begin with **Phase 0.0** (Docker Compose + Drizzle schema) → immediately into **Phase 0.1** (auth). These two unblock everything.
