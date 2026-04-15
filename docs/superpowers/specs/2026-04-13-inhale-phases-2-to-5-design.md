# Inhale — Phases 2–5 Design Spec

**Date:** 2026-04-13
**Scope:** Architectural + feature design for Phases 2.0.2 through 5.x of the Inhale implementation plan.
**Supersedes:** Phase 2.1–4.x task outlines in `docs/superpowers/plans/2026-04-08-inhale-mvp.md`. Progress through 2.0.1 is unchanged.

> **Next action:** Once approved, transition to `superpowers:writing-plans` to produce detailed implementation tasks that patch the existing plan file. Phase 2.0.1 is DONE — update Progress table accordingly.

---

## 0. Cross-Cutting Decisions

### 0.1 Testing convention
- **Browser e2e:** Chrome DevTools MCP (per existing `## E2E Testing Strategy` section of the plan). Every phase ends with a DevTools-MCP gate.
- **API-contract / mocked-route tests:** Playwright (already in project).
- **Unit tests:** Vitest.
- **TDD:** every new route handler, service, and utility gets a failing test first.

### 0.2 Python agents service + LangChain/LangGraph migration
All existing LLM-calling routes migrate off `@openrouter/sdk`. The AI/ML plane moves to a Python FastAPI service (`services/agents/`) running as a Vercel Service alongside the Next.js web service (see §0.7). OpenRouter stays as the HTTP endpoint — BYOK user-key flow unchanged.

**Framework primitive choices are DEFERRED** to Phase 2.0.3 kickoff. The kickoff ritual is mandatory and runs in this order:
1. `langchain-skills:framework-selection` — output decides Python framework (LangGraph, LangChain, or other) and primitives. Record decisions inline as an amendment to this section.
2. `fastapi` skill — mandatory for any code touching `services/agents/`.
3. `langchain-skills:langchain-dependencies` — Python deps per framework choice.
4. `langchain-skills:langchain-rag` + `langchain-skills:langgraph-persistence` — consulted as relevant.
5. Confirm Python runtime version per Vercel Python runtime docs at kickoff.

No LangChain/LangGraph code is written before the framework-selection skill has run. Mentions of "LangGraph" elsewhere in this spec are candidates, not commitments.

**Locked constraint:** browser-facing route-handler request/response contracts stay byte-identical so all Phase 1 e2e tests pass unchanged. Non-negotiable. The Next.js proxy layer forwards the browser's existing `/api/*` calls to the Python service without schema change.

### 0.3 Chandra two-tier pipeline
On upload: `unpdf` runs first (fast text → chunks → embeddings; existing Phase 1.1 behavior preserved). If user has a Chandra Datalab key configured, a second pass runs Chandra in "accurate" mode and populates `document_segments` with structured output.

Features that read `document_segments`: 3.0a/b Smart Explanations, 4.0 AI outline fallback, 4.2 image-PDF OCR. If no Chandra key: these features gracefully degrade (no icons on figures/formulas; outline fallback disabled; image-PDF flow disabled).

**Chandra API specifics are DEFERRED** to Phase 3.0a kickoff, which begins by invoking the `chandra-ocr` skill. Locked contract: there exists a per-document structured-extraction output stored in `document_segments` with `(page, kind, bbox, payload)` that downstream features consume. Exact field names and kind enum map to skill output.

### 0.4 Unified highlight data model
Merge AI-generated and user-generated highlights into a single table:
- `user_highlights.source enum('user','ai-auto') default 'user'`
- `user_highlights.layer_id uuid null` — groups an AI run.
- `user_highlights.comment text null` — one comment per highlight (feature f).
- `user_highlights.rects jsonb` — array of `{page, x0, y0, x1, y1}` in PDF-user-space. Existing rows treated as legacy-read-only until re-highlighted, or best-effort backfilled.

Single `HighlightLayer` component renders all highlights regardless of source.

### 0.5 Sidebar shell
Right-side sidebars (Outline, Highlights, Chat, Citations) are instances of a new `DockableSidebar` wrapper built on `react-resizable-panels`:
- Width resizable via drag handle.
- Dock position: right (default) / bottom / left, selectable per-sidebar via a small header menu.
- State persisted in localStorage per browser profile; DB-sync keyed to `userId` is a later option (Phase 5.3 with OAuth/cloud sync).

Top reader toolbar becomes collapsible: button collapses it to a thin hover-reveal strip; state persisted.

### 0.6 Chat persistence UI
`agent_conversations` + `agent_messages` schemas already persist threads. Missing piece: UI. The Chat sidebar header gets a history icon (top-right). Click → inline thread list (most recent first, preview = first user message). Click thread → loads messages, resumes. "New conversation" button creates a fresh `conversationId`.

### 0.7 Topology — Next.js + FastAPI via Vercel Services

Single Vercel deployment. Two services via `experimentalServices` in `vercel.json`:

- `web` — Next.js at `routePrefix: "/"`. Owns browser UI, Better Auth sessions, upload/library CRUD, BYOK key encrypt/decrypt, and a thin proxy layer for `/api/documents/*/chat|outline|explain` that validates the session, decrypts the BYOK key, and forwards to the `agents` service.
- `agents` — FastAPI at `routePrefix: "/agents"`. Owns every LLM call, every embedding call, every agent/tool loop, Chandra OCR client (Phase 3.0a), OCRmyPDF (Phase 4.2), and voice-agent session orchestration (Phase 3.2). Reads/writes Postgres via `asyncpg` + `pgvector` adapter. Schema-of-record stays in Drizzle (`src/db/schema.ts`); Python never writes migrations.

Repo layout shifts from single-root to:

```
apps/web/                    # existing Next.js app contents moved here
services/agents/
  pyproject.toml             # [tool.fastapi] entrypoint per fastapi skill
  main.py
  routers/, deps/, agents/, lib/
vercel.json                  # experimentalServices: { web, agents }
```

Local dev: `vercel dev -L` runs both services on one port; `docker compose up -d` remains for Postgres.

**Scope of "AI/ML plane" (Python):** all LLM calls (chat, outline, explain, auto-highlight tool-loops), all embedding calls, Chandra OCR, OCRmyPDF, voice-agent session orchestration. Non-LLM network calls (Semantic Scholar fetch in Phase 2.2; Zotero fetch in Phase 4.1) stay in Next.js.

### 0.8 Internal auth contract (Next.js → FastAPI)

Browser never talks to `/agents/*` directly. Every internal request from Next.js to FastAPI carries:

```
X-Inhale-User-Id: <better-auth user id>
X-Inhale-Document-Id: <int, when applicable>
X-Inhale-LLM-Key: <decrypted BYOK plaintext>
X-Inhale-Ts: <unix seconds; request rejected if >60s old>
X-Inhale-Sig: HMAC-SHA256 of (ts + method + path + body) using INHALE_INTERNAL_SECRET
```

FastAPI dependency `require_internal` verifies signature + freshness; 401 on failure. `INHALE_INTERNAL_SECRET` is a Vercel project env var, shared by both services. BYOK key decryption happens in Next.js only (Node `crypto` AES-256-GCM); Python never sees the AES secret.

---

## 1. Phase 2.0.2 — UX Polish & Bugfixes

**Goal:** reader becomes genuinely usable. No new AI. Ships fast. Unblocks later phases (unified highlight model, sidebar shell, chat history).

### 1.1 Features
- **(a) Highlight rendering** — implement `HighlightLayer` for real. Reads `user_highlights.rects`; converts PDF-user-space → CSS px via current viewport scale; absolutely-positioned overlays above text layer; color from `highlights.color` at ~30% opacity; hover ring.
- **(b) Outline replacement** — new `OutlineSidebar` with two tabs:
  - **Pages** (always shown): vertical list of page numbers. Click → navigate.
  - **Contents** (shown only if `pdf.getOutline()` returns a tree): renders the outline tree; click → navigate to dest.
  - Existing LLM-based `document_sections` read is removed here. Table kept for Phase 4.0 AI outline fallback.
- **(e) Keyword search** — reader toolbar `Ctrl+F` (cmd+F on mac) opens inline search bar. Uses PDF.js `PDFFindController`. Next/Prev buttons. Optional "Match case" checkbox.
- **(f) Comments redesign** — delete current top-of-page comment bar; delete existing "Explain" tab (`concepts-panel.tsx` + its route if unshared). Highlight color-picker popover gains two buttons:
  - **Comment** — inline textarea; one comment per highlight stored in `user_highlights.comment`.
  - **Ask AI** — opens Chat sidebar with highlight text pre-filled as user message; full document RAG active.
  - Highlights sidebar shows comment inline and an Ask-AI re-open action.
- **(g) Pinch/trackpad zoom** — `wheel` handler with `event.ctrlKey` detection (Mac trackpad pinch reports as ctrl+wheel). Updates reader-state zoom. Clamp 0.5x–3x.
- **(h) Chat history UI** — Chat sidebar header gets history icon (see §0.6).
- **UI shell** — top toolbar collapsible; right sidebars use `DockableSidebar` with resize + dock-position (right/bottom/left). See §0.5.

### 1.2 Schema changes
```
ALTER TABLE user_highlights
  ADD COLUMN source text NOT NULL DEFAULT 'user',
  ADD COLUMN layer_id uuid NULL,
  ADD COLUMN comment text NULL,
  ADD COLUMN rects jsonb NULL;
-- backfill rects from existing offsets where feasible; accept partial legacy read-only
```

### 1.3 Tests
- **Unit:** find-controller wrapper; pinch-zoom clamp; rects→CSS conversion; dockable-sidebar persistence.
- **Playwright:** Outline tabs render correctly (mocked PDF with/without native outline); comment-on-highlight write path.
- **Chrome DevTools MCP e2e gate:**
  - Upload + highlight text → reload → verify overlay renders.
  - Open Outline, switch Pages/Contents tabs, navigate to page.
  - `Ctrl+F`, search term, next/prev moves highlight, match-case flips results.
  - Click highlight → popover → Comment → save → reload → comment persists.
  - Click highlight → Ask AI → chat sidebar opens with text seeded.
  - Trackpad pinch (synthesized ctrl+wheel) → zoom changes within bounds.
  - Collapse toolbar; drag sidebar to bottom dock; reload → state persists.
  - Open chat history icon → past threads listed → select → messages load.
  - `list_console_messages` empty; `list_network_requests` no 4xx/5xx.

---

## 2. Phase 2.0.3 — Python agents service + framework migration

**Goal:** stand up the Python FastAPI service, migrate every existing AI route onto it behind an unchanged browser-facing contract. Zero user-visible feature change. All Phase 1 e2e tests green.

### 2.1 Kickoff ritual (mandatory; see §0.2)
1. `langchain-skills:framework-selection` → record primitive decisions inline below.
2. `fastapi` skill → conventions applied to all Python code.
3. `langchain-skills:langchain-dependencies` → deps per framework.
4. `langchain-skills:langchain-rag` + `langchain-skills:langgraph-persistence` → as relevant.
5. Vercel Python runtime version confirmation per the Vercel Python docs at kickoff.

### 2.2 Scope of change
- **Repo restructure.** Move existing Next.js root into `apps/web/`. Add `services/agents/` scaffold. Add `vercel.json` with `experimentalServices` per §0.7.
- **FastAPI scaffold.** Entrypoint `services/agents/main.py`; internal-auth dependency per §0.8; asyncpg pool dependency; health route. No agent logic yet.
- **Embeddings moved to Python.** New `POST /agents/embed-chunks` consumes pre-chunked text and writes `document_chunks` rows with embeddings. Next.js upload route swaps its direct OpenRouter `fetch` for a signed call to this endpoint. `src/lib/ai/embeddings.ts` deleted. `src/lib/ai/chunking.ts` stays TS (pre-embedding text work; not an LLM call).
- **Chat route** (`/api/documents/[id]/chat`). Becomes a thin proxy: session validate → BYOK decrypt → signed fetch to `/agents/chat` → SSE passthrough. Python-side implementation uses the framework chosen in §2.1 step 1.
- **Outline route** (`/api/documents/[id]/outline`). Proxy → `/agents/outline`. Kept for Phase 4.0 fallback.
- **Explain route** (`/api/ai/explain`). Proxy → `/agents/explain`.
- **Conversation persistence.** Uses the pattern selected by `langchain-skills:langgraph-persistence` (or equivalent for the chosen framework), backed by existing `agent_conversations` + `agent_messages` tables via `asyncpg`.
- **Cleanup.** Remove `@openrouter/sdk` and `src/lib/ai/openrouter.ts` once callers migrate. Delete `src/lib/ai/embeddings.ts`.

### 2.3 Tests
- **Python unit:** OpenRouter client (mocked); framework-specific primitives (mocked); internal-auth dep.
- **TS unit:** `signRequest` + `streamPassthrough` proxy helpers.
- **Playwright (mocked routes):** existing `e2e/ai-features.spec.ts` passes unchanged. Primary acceptance signal.
- **Chrome DevTools MCP e2e gate:** upload + chat flow end-to-end; SSE streams; reload preserves conversation; zero 4xx/5xx on `/api/*` or `/agents/*`; clean console.

---

## 3. Phase 2.1 — AI Auto-Highlight (feature i)

**Goal:** user issues a natural-language instruction ("highlight where the loss function is described"); agent locates matching passages across the paper and writes highlight rows tagged as an AI-run layer. User reviews, toggles, or reverts.

### 3.1 Trigger surface
- **Explicit:** slash command `/highlight <instruction>` — bypasses routing; enters the auto-highlight tool-loop directly with the instruction as input.
- **Implicit:** the Phase 2.0.3 chat agent has the auto-highlight tools (§3.2) registered alongside its existing tools. LangGraph's tool-selection picks them when the user's phrasing matches (e.g., "highlight where the loss function is described"). No separate intent classifier needed — the agent's own tool-routing does the work.

Conversations created by either trigger are persisted with `agent_conversations.kind = 'auto-highlight'`.

### 3.2 Agent shape (LangGraph; finalized per 2.0.3)
Tools:
- `semantic_search(query, top_k)` — pgvector over `document_chunks`; returns chunk text + `{page, y0, y1}` bounds.
- `page_text(pageNumber)` — full text of a page via `unpdf`, with character-offset → rect mapping.
- `locate_phrase(phrase, pageNumber)` — exact first, fuzzy fallback (flag-gated). Returns PDF-user-space rects.
- `create_highlights(matches[])` — batch-writes `user_highlights` rows with `source='ai-auto'`, `layer_id`, color = amber by default (configurable).
- `finish(summary)` — ends loop; returns user-visible summary.

Flow: broad query → `semantic_search` → narrow → `page_text` + `locate_phrase` → batch `create_highlights` → `finish`. SSE streams tool-use events to UI ("Searching… found 12 candidates on p.5…"). On completion, chat reply has a **Review highlights** button → opens Highlights sidebar filtered to this `layer_id`.

### 3.3 Guardrails
- Max 50 highlights per run (hard cap); agent must narrow query if exceeded.
- Fuzzy match behind config flag; default exact-match only.
- No classification taxonomy (old 2.1 novelty/method/result is explicitly replaced).

### 3.4 Schema
```
-- user_highlights already has source, layer_id, rects (from 2.0.2)

CREATE TABLE ai_highlight_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id int NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instruction text NOT NULL,
  model_used text,
  status text NOT NULL,    -- 'running' | 'completed' | 'failed'
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
```

### 3.5 UI
- Highlights sidebar gains a **Runs** filter/section at top. Lists AI runs per document; each has toggle (show/hide `layer_id`) + delete (cascades to highlights of that layer).
- No new sidebar tab.

### 3.6 Tests
- **Unit:** each tool in isolation; intent-classifier for chat phrasing; `/highlight` slash parser.
- **Integration:** full tool-loop with fixture paper + fixed instruction; assert highlights written with plausible rects.
- **Chrome DevTools MCP e2e gate:** type instruction → wait for SSE complete → verify ≥1 overlay visible → open Highlights sidebar → toggle run off/on → delete run → overlays disappear. No console errors.

---

## 4. Phase 2.2 — Enriched Smart Citations (feature c)

**Goal:** every citation surface shows full Semantic Scholar metadata with useful hyperlinks + Save-to-References action.

### 4.1 Schema extension
Extend `document_references` (and/or joined `library_references`) with Semantic Scholar fields:
```
external_id text,          -- S2 paperId
title text,
authors jsonb,             -- [{ name, authorId }]
venue text,
year int,
citation_count int,
open_access_pdf_url text,
abstract text
```

### 4.2 Fetch strategy
Lazy enrichment: on first open of Citations tab for a document (or first click of a citation marker), hit S2 Graph API `/paper/search` by title/DOI. Cache response on the row.

Rate limiting: S2 public API ~1 req/sec unauthenticated. Queue enrichment; batch 10 with 500ms spacing. Optional S2 API key (BYOK, added to Settings) lifts limits.

### 4.3 `CitationCard` component
Single component rendered in two modes:
- **Inline popover** (PDF marker click) — positioned popover anchored to marker rect.
- **Compact list item** (Citations tab) — collapsed by default, expand for abstract.

Fields rendered:
- Title — hyperlink to `semanticscholar.org/paper/{paperId}`, opens new tab.
- Authors — each name hyperlinks to `/author/{authorId}`.
- `Venue · Year · ⭐ {citationCount}` row.
- Collapsible abstract.
- Actions: **Save to References** · **Copy BibTeX** (uses S2 `citationStyles.bibtex` if available; local fallback) · **Open PDF** (shown when `openAccessPdfUrl`).

### 4.4 Save-to-References flow
Click **Save to References** → writes a `library_references` row (table exists from Phase 2.0 baseline — this phase extends the schema with the S2 metadata columns in §4.1). Scoped to user library. Toast "Saved — view in References". Button swaps to "Saved ✓".

### 4.5 Tests
- **Unit:** S2 response → `CitationCard` props mapper; BibTeX formatter fallback.
- **Integration (Playwright, mocked S2):** enrichment route populates expected fields.
- **Chrome DevTools MCP e2e gate:** open Citations tab → card fields render → click Save → navigate to `/library/references` → saved citation appears → click `[n]` marker → inline popover renders same card. No 4xx/5xx.

---

## 5. Phase 2.3 — Library Management (Lite)

**Goal:** minimal polish. Kept small per user direction.

### 5.1 Scope
- Rename / delete documents from library grid (context menu or hover actions).
- Sort by: recently opened · upload date · title.
- Simple search input — substring match on title + filename. No FTS (Phase 5).
- `/library/references` page — lists `library_references` rows with `CitationCard` compact mode; remove action.

### 5.2 Out of scope (explicit)
Collections/folders, tags, grid/list toggle, bulk ops, drag-to-collection. Deferred to a possible later phase if demand emerges.

### 5.3 Tests
- **Playwright:** rename/delete/sort/search CRUD.
- **Chrome DevTools MCP e2e gate:** rename a document; sort by title; search filters; navigate to `/library/references`; remove a saved citation; verify persistence.

---

## 6. Phase 3.0a — Smart Explanation Detection + Icon Overlays (feature d, part 1)

**Goal:** user sees a small elegant icon next to every detected chapter heading, figure, and formula. Click does minimal placeholder (opens Chat sidebar with seed message). Intelligence arrives in 3.0b.

### 6.1 Kickoff ritual
Invoke `chandra-ocr` skill. Record its API shape, segment kinds, bbox coordinate space, and payload structure as an inline amendment here. The field names below are *expected* and reconciled against skill output.

### 6.2 Detection source
`document_segments` populated by the two-tier pipeline (§0.3). Segment kinds used in 3.0a: `section_header`, `figure`, `formula`. Each row: `{id, documentId, page, kind, bbox (jsonb), payload (jsonb), orderIndex}`.

### 6.3 Graceful degradation
No Chandra key configured → feature silently disabled. Settings page shows a small notice: "Configure Chandra key to enable Smart Explanations on figures and formulas."

### 6.4 `ExplainMarkerLayer` component
- One icon per segment, anchored `bbox.right + 4px, bbox.top` on its page.
- Three variants: chapter (#), figure (image), formula (Σ).
- 16px icons, blurred-pill bg, subtle until hover → full opacity + ring.
- Click → emits event; Chat sidebar opens with seed message "Explain this [type]". In 3.0a no agent tools run yet; the seed message sits in the input or a lightweight response shows the raw payload (caption for figure, LaTeX for formula).

### 6.5 Schema
```
CREATE TABLE document_segments (
  id serial PRIMARY KEY,
  document_id int NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page int NOT NULL,
  kind text NOT NULL,          -- 'section_header'|'figure'|'formula'|'paragraph'|'table' (subject to chandra-ocr skill reconciliation)
  bbox jsonb NOT NULL,         -- {x0,y0,x1,y1} in PDF user-space
  payload jsonb NOT NULL,      -- {latex?, caption?, heading_level?, text?}
  order_index int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON document_segments (document_id, page);
```

### 6.6 Tests
- **Unit:** bbox → CSS position math; icon variant selector by kind.
- **Integration:** Chandra fixture → segments rows → overlay renders expected icon counts and positions.
- **Chrome DevTools MCP e2e gate:** upload paper with Chandra configured → icons render on page 1 → click each type → Chat sidebar opens with expected seed. No console errors.

---

## 7. Phase 3.0b — Smart Explanation Agent + History (feature d, parts 3 & d1)

**Goal:** click makes something genuinely useful happen. Agent explains the element with full-page context + paper-wide RAG. Formulas get LaTeX-constituent breakdown. User's past explanations are browsable.

### 7.1 Agent shape (LangGraph)
Tools:
- `page_context(page)` — full text of the page + adjacent segments.
- `paper_rag(query)` — reuses the 2.0.3 RAG tool.
- `figure_caption(figureId)` / `formula_latex(formulaId)` — pull specific segment payloads.

### 7.2 Starter prompts by element type
- **Chapter:** "Explain what this section covers and how it fits into the paper's argument."
- **Figure:** "Describe this figure, what it shows, and its role in the paper."
- **Formula:** "List each symbol in LaTeX and briefly define it. Then explain what the formula computes and why it matters here." Response includes a KaTeX-rendered copy of the formula at the top.

### 7.3 Rendering
Chat messages in this flow render math via KaTeX (`react-katex`). No LaTeX-copy button yet — that's Phase 4.0 d2.

### 7.4 Interaction history (d1)
No new sidebar. Chat's history icon (from 2.0.2) already lists threads. Tag explanation threads with:
- `agent_conversations.kind text default 'chat'` — `'chat' | 'explain-segment' | 'auto-highlight'`.
- `agent_conversations.segment_id int null` — FK to `document_segments` when applicable.

History view in chat sidebar gets a filter chip: "Explanations only / All". Threads show an icon badge per kind ("Formula on p.5", "Figure 2", etc.).

### 7.5 Schema
```
ALTER TABLE agent_conversations
  ADD COLUMN kind text NOT NULL DEFAULT 'chat',
  ADD COLUMN segment_id int NULL REFERENCES document_segments(id) ON DELETE SET NULL;
```

### 7.6 Tests
- **Unit:** starter-prompt generator per element type; thread-kind filter logic.
- **Integration:** mocked `paper_rag` + `page_context` → agent produces well-formed output per type.
- **Chrome DevTools MCP e2e gate:** click formula icon → sidebar streams explanation → KaTeX present (`.katex` in DOM) → close sidebar → open history → thread listed with formula badge → apply filter "Explanations only" → non-explanation threads hidden.

---

## 8. Phase 3.1 — External Links & Deep References

**Unchanged from existing plan.** DOI/URL extraction from text layer; resolution via Semantic Scholar; related-paper suggestions. Migrated on top of the LangChain stack from 2.0.3. Details TBD at implementation-plan time.

---

## 9. Phase 3.2 — Voice Mode (Push-to-Talk)

**Goal unchanged from existing plan.** Implementation plan **must** invoke the ElevenLabs skills `agents`, `speech-to-text`, and `text-to-speech` at kickoff and record their API shapes. Spec locks the behavior (push-to-talk orb, interruption, WebSocket session) but defers transport/API specifics to those skills.

---

## 10. Phase 3.3 — BibTeX Export

**Unchanged.** Leverages the per-reference BibTeX already produced by the `CitationCard` from Phase 2.2 — this phase adds bulk library export.

---

## 11. Phase 4.0 — AI Outline Fallback + TTS + LaTeX Copy

### 11.1 AI-generated outline (fallback)
When `pdf.getOutline()` returns empty AND the paper has no native outline tree: generate a hierarchical outline via LLM over `document_segments` (prefer `section_header` rows) or chunked text (fallback). Store in existing `document_sections` table.

`OutlineSidebar`'s **Contents** tab:
- If native outline present → render native.
- Else if `document_sections` rows exist → render generated with a small "AI-generated" badge.
- Else → tab hidden; only Pages tab visible.

### 11.2 TTS on agent responses
Speaker icon per chat message → ElevenLabs TTS. BYOK from Settings. Invokes ElevenLabs `text-to-speech` skill during implementation.

### 11.3 LaTeX copy (feature d2)
Formula icon in `ExplainMarkerLayer` gains a **Copy LaTeX** action (secondary click or hover button). Pulls `payload.latex` from `document_segments`.

### 11.4 Tests
AI-outline generator unit tests; Chrome DevTools MCP gate covering a paper without native outline (shows AI-generated badge), TTS playback on a chat message, Copy LaTeX action puts formula in clipboard.

---

## 12. Phase 4.1 — Zotero Import (feature j)

**Goal:** import user's Zotero library and attached PDFs into Inhale.

### 12.1 Auth
Settings page gains a Zotero section — user provides Zotero API key + userID. Stored encrypted in `user_api_keys` (existing BYOK storage).

### 12.2 Import flow
- Library page gains **Import from Zotero** button → modal.
- Fetches library via Zotero Web API. Lists items with PDF attachments; user selects subset.
- For each: download PDF → existing upload pipeline runs (creates `documents` row → `unpdf` chunking → optional Chandra pass).
- Progress indicator; cancellable.

### 12.3 Tests
Unit: Zotero API response → document creation mapper. Playwright: mocked Zotero API; import creates expected documents. Chrome DevTools MCP gate: paste key → list loads → select 2 items → import → new documents appear in library.

---

## 13. Phase 4.2 — Image-PDF OCR "AI Scan" (feature k)

**Goal:** make scanned/image-only PDFs fully usable — selectable text, highlighting, RAG.

### 13.1 Detection
On upload, if `unpdf` extraction yields ~0 text AND (if Chandra key present) Chandra finds no text content → mark document `needs_ocr = true`.

### 13.2 Two-tool approach
- **Chandra** — extracts text content + per-segment bounding boxes. Feeds `document_chunks` (for RAG/chat) and `document_segments` (for Smart Explanations). Uses existing two-tier pipeline.
- **Classical OCR-PDF transformer** — working candidate `OCRmyPDF`. Produces a NEW PDF file with an embedded selectable text layer. Replaces the stored `documents.file_path` so the reader's native selection, `HighlightLayer`, and `Ctrl+F` search all just work on the OCR'd PDF without custom overlays.

### 13.3 Deployment note
OCRmyPDF runs inside `services/agents` (the Python FastAPI service from §0.7). Invocation mechanism (`ocrmypdf` Python API vs. `python -m ocrmypdf` subprocess), version pin, and long-job strategy (Vercel Services `maxDuration` up to 900s, or offload to Vercel Queues) are decided at Phase 4.2 kickoff per the OCRmyPDF project docs at https://ocrmypdf.readthedocs.io/en/latest/. Spec locks behavior, not mechanism.

### 13.4 UX
Reader shows a banner on affected documents: "This paper appears to be image-only. Run AI Scan to make it readable?" → button triggers the pipeline. Progress shown; on completion, page reloads the OCR'd PDF transparently.

### 13.5 Schema
```
ALTER TABLE documents
  ADD COLUMN needs_ocr boolean NOT NULL DEFAULT false,
  ADD COLUMN ocr_applied_at timestamptz NULL;
```

### 13.6 Tests
Unit: text-density detector. Integration: pipeline with fixture image-only PDF → OCR'd output has selectable text layer. Chrome DevTools MCP gate: upload image PDF → banner appears → click AI Scan → wait → reader now allows text selection + highlight + Ctrl+F finds terms.

---

## 14. Phase 5 — Polish & Scale (moved from old Phase 4)

Numbering preserved for traceability. Sub-phase contents unchanged from existing plan.

- **5.0 Dark Mode**
- **5.1 Full-Text Search** (FTS, distinct from reader keyword search in 2.0.2)
- **5.2 Split View & Reading Memory**
- **5.3 OAuth & Cloud Key Sync**
- **5.4 Performance & Production** (S3, CDN, rate limits, Sentry, virtual rendering)

---

## 15. Phase Map Summary

```
2.0.1  DONE  — Smart Citations (annotation-based)
2.0.2  NEW   — UX polish/bugfixes (a,b,e,f,g,h) + dockable sidebars + collapsible toolbar
2.0.3  NEW   — LangChain/LangGraph migration
2.1    REWRITTEN — AI Auto-Highlight (i)
2.2    REWRITTEN — Enriched Smart Citations (c)
2.3    KEPT (lite) — Library Management
3.0a   NEW   — Smart Explanation detection + icon overlays (d)
3.0b   NEW   — Smart Explanation agent + history (d, d1)
3.1    KEPT  — External Links & Deep References
3.2    KEPT  — Voice Mode (push-to-talk) — uses ElevenLabs skills
3.3    KEPT  — BibTeX Export
4.0    NEW   — AI outline fallback + TTS + LaTeX copy (d2)
4.1    NEW   — Zotero Import (j)
4.2    NEW   — Image-PDF OCR via Chandra + OCRmyPDF (k)
5.0–5.4 MOVED from old Phase 4 — Dark mode, FTS, Split view, OAuth, Perf
```

---

## 16. Dependency Ordering

```
2.0.1 ✅
  ↓
2.0.2 (bugfixes + shell)
  ↓
2.0.3 (LangChain migration)
  ↓
├─→ 2.1 (AI auto-highlight) — needs LangChain + unified highlights
├─→ 2.2 (enriched citations) — independent of LangChain; can parallelize with 2.1
└─→ 2.3 (library-lite) — independent; can parallelize
       ↓
3.0a (detection + icons) — needs Chandra pipeline from 0.3
  ↓
3.0b (explain agent + history) — needs 3.0a + 2.0.3 RAG tool
  ↓
3.1, 3.2, 3.3 — independent of each other; any order
  ↓
4.0, 4.1, 4.2 — independent of each other
  ↓
5.0–5.4 — any order
```

---

## 17. Open Questions / Deferred Decisions

These are intentionally unresolved in the spec; resolution happens at phase kickoff, not now.

- **2.0.3:** Python framework (LangGraph / LangChain / other) + primitives per route (from `langchain-skills:framework-selection`). Vercel Python runtime version (per Vercel Python docs at kickoff). FastAPI idioms (per `fastapi` skill).
- **3.0a:** Chandra API specifics, segment-kind enum (from `chandra-ocr` skill). Chandra client runs inside `services/agents`.
- **3.2:** ElevenLabs API shapes (from ElevenLabs skills). Voice session orchestration runs inside `services/agents`; browser WebSocket terminates on `/agents/voice`.
- **4.2:** OCRmyPDF invocation mechanism, version pin, long-job strategy (per https://ocrmypdf.readthedocs.io/en/latest/ at kickoff).
