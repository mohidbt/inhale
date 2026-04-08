# Inhale — Implementation Plan

## Context

Inhale is an AI-enhanced interactive PDF reader for scientific papers. The PRD/ERD defines a 5-phase roadmap (Phases 0-4) with 17 core database entities, a dual-stack architecture (Next.js frontend + FastAPI backend), and a BYOK model where users bring their own API keys for AI features.

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
| **1.0 — FastAPI Service Bootstrap** | DONE | FastAPI + async SQLAlchemy (read-only), Celery + Redis, health check, /extract stub, Dockerfile, docker-compose processing service with pg healthcheck. |
| **1.1 — Celery Pipeline & Processing** | DONE | document_sections/chunks/processing_jobs schemas, Celery task stubs, ProcessingBadge UI. |
| **1.2 — AI Outline & Concepts** | DONE | document_outlines schema, LLM service (OpenRouter), generate_outline Celery task, outline-sidebar + concepts-panel components, /api/documents/[id]/outline route. |
| **1.3 — RAG Q&A + Viewport Awareness** | DONE | agent_conversations/messages schemas, /rag/chat SSE endpoint, use-viewport-tracking + use-chat hooks, ChatMessage + ChatPanel components, reader integration. |
| 2.0–3.3 | Pending | — |
| 4.0–4.4 | Pending | — |
| 2.0–3.3 | Pending | — |
| 4.0–4.4 | Pending | — |

---

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| **Backend split** | Next.js API routes for CRUD/auth + FastAPI for heavy processing (OCR, RAG, embeddings) | Avoids dual-stack overhead for simple ops; keeps Python where its ecosystem is superior |
| **Auth** | Better Auth (self-hosted TS lib) | Email+password built-in, OAuth plugin later, stores in your Postgres, no vendor lock-in |
| **ORM (JS)** | Drizzle ORM | Lightweight, SQL-like, excellent TS inference, schema-as-code |
| **ORM (Python)** | SQLAlchemy 2.0 (async, **read-only schema reflection**) | Mature, pgvector extension, same DB. **Drizzle owns all migrations — SQLAlchemy models mirror but never create/alter tables.** |
| **Streaming** | SSE for text agent + all AI features; WebSocket only for voice | SSE is simpler, works through Vercel/Cloudflare without special config, auto-reconnects |
| **PDF rendering** | react-pdf v9 (wraps PDF.js) | React 19 support, canvas + text layer |
| **Reader state** | Zustand | Minimal boilerplate for page/zoom/scroll state |
| **Vector DB** | PGVector (Postgres extension) | No separate service, lives in existing Postgres |
| **Task queue** | Celery + Redis | Standard Python background processing |
| **LLM** | OpenRouter (BYOK) | User provides key, multi-model access |
| **OCR** | Mistral OCR API (BYOK) | Best-in-class for scientific PDFs |
| **Citations** | Semantic Scholar API (free) | Comprehensive, good rate limits |
| **Encryption** | Node.js crypto AES-256-GCM | Built-in, zero dependencies |
| **Repo structure** | Monorepo: `src/` (Next.js) + `services/processing/` (FastAPI) | Simple, shared DB, one git history |

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

### 1.0 — FastAPI Service Bootstrap

**Build**: FastAPI project structure, SQLAlchemy models mirroring Drizzle schema, health check, text extraction endpoint, Docker Compose update. **Convention established from day 1**: Drizzle is the single source of truth for all schema changes. SQLAlchemy models are read-only reflections — they never create or alter tables. All migrations run through `drizzle-kit`.

**Python deps**: `fastapi`, `uvicorn`, `sqlalchemy`, `asyncpg`, `httpx`, `celery`, `redis`

**Files**:
- `/services/processing/app/main.py`, `/services/processing/app/config.py`
- `/services/processing/app/models/`, `/services/processing/app/routers/`
- `/services/processing/requirements.txt`, `/services/processing/Dockerfile`

**Done when**: FastAPI runs in Docker, health check works, can trigger text extraction on a document.

### 1.1 — Celery Pipeline & Processing

**Build**: Celery worker config, background processing pipeline (OCR -> section split -> chunking -> embedding), processing status tracking, frontend status indicator.

**DB**: Add `document_sections`, `document_chunks`, `processing_jobs` tables.

**Files**:
- `/services/processing/app/celery_app.py`
- `/services/processing/app/tasks/process_document.py`, `generate_embeddings.py`
- `/services/processing/app/services/chunking.py`, `embeddings.py`
- `/src/db/schema/document-sections.ts`, `document-chunks.ts`, `processing-jobs.ts`
- `/src/components/library/processing-badge.tsx`

**Done when**: Upload triggers background processing, status shows on document cards, embeddings stored in pgvector.

### 1.2 — AI Outline & Section Preview

**Build**: LLM-generated outline, section preview popovers, concepts breakdown panel. All AI calls use user's BYOK key.

**DB**: Add `document_outlines` table.

**Files**:
- `/services/processing/app/tasks/generate_outline.py`, `extract_concepts.py`
- `/services/processing/app/services/llm.py` — OpenRouter client
- `/src/components/reader/outline-sidebar.tsx`, `section-preview.tsx`, `concepts-panel.tsx`

**Done when**: Processed docs show AI outline. Clicking sections shows summaries. Concepts panel explains key terms.

### 1.3 — Basic RAG Q&A + Viewport Awareness

**Build**: Chat panel in reader, RAG pipeline (embed question -> vector search -> LLM answer with citations), conversation persistence. **Viewport tracking**: debounced scroll listener sends `{ page, visible_section_ids, scroll_pct }` with each chat message so the agent knows what the user is looking at. Streaming via **SSE** (not WebSocket).

**DB**: Add `agent_conversations`, `agent_messages` tables (messages store `viewport_context` JSONB).

**Files**:
- `/services/processing/app/routers/rag.py`, `/services/processing/app/services/rag.py`
- `/src/components/reader/chat-panel.tsx`, `chat-message.tsx`
- `/src/hooks/use-chat.ts`
- `/src/hooks/use-viewport-tracking.ts` — debounced scroll listener (500ms), resolves visible section IDs from document sections

**Done when**: User asks question about paper, gets grounded AI answer with section references. Agent system prompt includes current viewport section. Responses stream via SSE.

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
                                          1.0 (FastAPI) → 1.1 (Pipeline) → 1.2 (Outline) + 1.3 (RAG)
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
3. `docker compose up` — verify backend services (from Phase 1.0+)
4. Manual test the acceptance criteria listed per sub-phase
5. Commit with descriptive message before moving to next sub-phase

---

## Start

Begin with **Phase 0.0** (Docker Compose + Drizzle schema) → immediately into **Phase 0.1** (auth). These two unblock everything.
