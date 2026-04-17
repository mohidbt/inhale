# Inhale — Implementation Plan (Index)

> **For agentic work:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (preferred) or `superpowers:executing-plans`. Every phase's task detail lives in `plans/phases/<phase>.md`. This file is the index + meta layer; don't bloat it.

**Goal:** AI-enhanced interactive PDF reader for scientific papers

**Design source of truth:** `docs/superpowers/specs/2026-04-13-inhale-phases-2-to-5-design.md` (governs Phases 2.0.2+). If plan drifts from spec, fix the plan. If spec is wrong, amend spec first, then reconcile.

**PRD:** `/Users/mohidbutt/Documents/Claudius/Second Brain/Projects/Episteme/Inhale_PRD_ERD.md`

---

## Progress

| Phase | Status | Detail |
|---|---|---|
| 0.0 — Infrastructure & Database | DONE | [phases/phase-0-reader.md](phases/phase-0-reader.md) |
| 0.1 — Authentication | DONE | ↑ |
| 0.2 — Document Upload & Library | DONE | ↑ |
| 0.3 — PDF Reader (Core Rendering) | DONE | ↑ |
| 0.4 — Highlighting | DONE | ↑ |
| 0.5 — Comments & BYOK Settings | DONE | ↑ |
| 1.0 — BYOK OpenRouter (server-side) | DONE | [phases/phase-1-ai.md](phases/phase-1-ai.md) |
| 1.1 — Chunking + pgvector | DONE | ↑ |
| 1.2 — AI Outline via Next.js route | DONE | ↑ |
| 1.3 — Minimal RAG Chat | DONE | ↑ |
| E2E — Playwright test suite | DONE | ↑ |
| 2.0 — Smart Citations | DONE | [phases/phase-2.0-citations.md](phases/phase-2.0-citations.md) |
| 2.0.1 — Annotation-based detection (superscripts) | DONE | [phases/phase-2.0.1-annotations.md](phases/phase-2.0.1-annotations.md) |
| 2.0.2 — UX polish & bugfixes | DONE | [phases/phase-2.0.2-ux-polish.md](phases/phase-2.0.2-ux-polish.md) · fixes: [2026-04-14-phase-2.0.2-fixes.md](2026-04-14-phase-2.0.2-fixes.md) |
| 2.0.3 — Python agents service + framework migration | DONE | [phases/phase-2.0.3-langchain.md](phases/phase-2.0.3-langchain.md) |
| 2.1 — AI Auto-Highlight | DONE | [phases/phase-2.1-auto-highlight.md](phases/phase-2.1-auto-highlight.md) — explicit `/highlight` scope only; implicit chat-agent routing deferred |
| **2.2 — Enriched Smart Citations** | **NEXT** | [phases/phase-2.2-citations-enriched.md](phases/phase-2.2-citations-enriched.md) |
| 2.3 — Library Management (lite) | Pending | [phases/phase-2.3-library-lite.md](phases/phase-2.3-library-lite.md) |
| 3.0a — Smart Explanation detection + icons | Pending | [phases/phase-3.0a-explain-detection.md](phases/phase-3.0a-explain-detection.md) |
| 3.0b — Smart Explanation agent + history | Pending | [phases/phase-3.0b-explain-agent.md](phases/phase-3.0b-explain-agent.md) |
| 3.1 — External Links & Deep References | Pending | [phases/phase-3.1-external-links.md](phases/phase-3.1-external-links.md) |
| 3.2 — Voice Mode (push-to-talk) | Pending | [phases/phase-3.2-voice.md](phases/phase-3.2-voice.md) |
| 3.3 — BibTeX Export | Pending | [phases/phase-3.3-bibtex.md](phases/phase-3.3-bibtex.md) |
| 4.0 — AI outline fallback + TTS + LaTeX copy | Pending | [phases/phase-4.0-outline-tts-latex.md](phases/phase-4.0-outline-tts-latex.md) |
| 4.1 — Zotero Import | Pending | [phases/phase-4.1-zotero.md](phases/phase-4.1-zotero.md) |
| 4.2 — Image-PDF OCR "AI Scan" | Pending | [phases/phase-4.2-image-ocr.md](phases/phase-4.2-image-ocr.md) |
| 5.0–5.4 — Polish & scale | Pending | [phases/phase-5-polish.md](phases/phase-5-polish.md) |

### Known tech debt / notes

- **PDF text selection** — multi-row + gaps + triple-click fixed via `use-pdf-text-selection.ts` (ported pdfjs `TextLayerBuilder.#enableGlobalSelectionListener`). Two remaining issues are inherent to pdfjs's transparent-text-over-canvas architecture: (1) double-click word overlay width slightly misaligned; (2) multi-column layouts with a divider pick up text in reading order across columns. Future options: custom inline text layer with per-line `scaleX`, column-aware selection handler, or `@react-pdf-viewer/core`. Chrome's built-in PDF viewer uses native C++ rendering — 1:1 JS parity is fundamentally limited.

---

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Backend | Next.js (web) + FastAPI Python (agents), single Vercel project via `experimentalServices` | TS owns auth/UI/CRUD; Python owns AI/ML plane. One deploy target. See spec §0.7. |
| Auth | Better Auth (self-hosted TS lib) | Email+password built-in, OAuth plugin later, stores in your Postgres. |
| ORM | Drizzle ORM | Lightweight, SQL-like, schema-as-code. |
| Streaming | SSE for text + AI; WebSocket only for voice | SSE simpler, works through Vercel/Cloudflare, auto-reconnects. |
| PDF rendering | react-pdf v10 via `next/dynamic` (bypass SSR) | React 19 support, canvas + text layer. |
| Reader state | Zustand | Minimal boilerplate. |
| Vector DB | pgvector (Postgres extension) | No separate service. |
| Background work | Inline in upload route (v0); revisit if jobs >5s | Avoid Celery/Redis complexity until measured demand. |
| LLM | OpenRouter via Python framework (TBD at Phase 2.0.3 kickoff via `langchain-skills:framework-selection`). BYOK preserved. | Python has the most mature LangChain/LangGraph surface; agent phases 2.1/3.0b/3.2 benefit. Framework primitives deferred to kickoff. |
| Embeddings | OpenRouter OpenAI-compatible REST from Python (`services/agents`) | Single place for all OpenRouter calls; Next.js upload route proxies via `/agents/embed-chunks`. |
| Agent framework | Python; choice deferred to `langchain-skills:framework-selection` at 2.0.3 kickoff | No commitment to LangGraph yet. Spec §0.2. |
| Structured extraction | Chandra OCR (Datalab API, BYOK) — client runs inside `services/agents`; specifics per `chandra-ocr` skill at 3.0a kickoff | Two-tier: `unpdf` for chunks/embeddings; Chandra additionally produces `document_segments` (section/figure/formula/table bboxes + payloads). |
| Image-PDF text layer | OCRmyPDF inside `services/agents` — mechanism/version per https://ocrmypdf.readthedocs.io/en/latest/ at 4.2 kickoff | Lives in the Python service; no separate sidecar needed. |
| Sidebar shell | `react-resizable-panels` + `DockableSidebar` (from 2.0.2) | Width-resize + dock-position per sidebar, persisted. |
| Citations | Semantic Scholar API (free) | Comprehensive, good rate limits. |
| Encryption | Node.js crypto AES-256-GCM | Built-in, zero dependencies. |
| Repo structure | `apps/web/` (Next.js) + `services/agents/` (FastAPI) under Vercel `experimentalServices` | See spec §0.7. Migration is mechanical at 2.0.3 kickoff — existing root → `apps/web/`. |

---

## Dependency Graph

```
0.x ✅ → 1.x ✅ → 2.0 ✅ → 2.0.1 ✅ → 2.0.2 ✅ → 2.0.3 ← NEXT
                                                      |
                                        ┌─────────────┼─────────────┐
                                        v             v             v
                                      2.1           2.2           2.3
                                        └─────────────┴─────────────┘
                                                      |
                                                      v
                                                    3.0a (needs Chandra)
                                                      |
                                                      v
                                                    3.0b (needs 2.0.3 RAG tool)
                                                      |
                                        ┌─────────────┼─────────────┐
                                        v             v             v
                                       3.1           3.2           3.3
                                        └─────────────┴─────────────┘
                                                      |
                                        ┌─────────────┼─────────────┐
                                        v             v             v
                                       4.0           4.1           4.2
                                                      |
                                                      v
                                                    5.0–5.4 (any order)
```

---

## E2E Testing Strategy (Chrome DevTools MCP)

Every implementation phase ends with a mandatory **E2E gate** using Chrome DevTools MCP to verify the feature in a real browser before marking DONE.

1. **TDD for unit/integration logic** — failing test first for every route handler, service, utility (see `superpowers:test-driven-development`). Playwright for API-level contracts.
2. **Chrome DevTools MCP E2E for UI features**:
   - `navigate_page` → `wait_for` → `take_snapshot` to verify structure + `data-testid`
   - `click`/`fill`/`type_text` to simulate interactions
   - `take_screenshot` for visual verification
   - `evaluate_script` for DOM/network/console assertions
   - `list_console_messages` (zero errors) + `list_network_requests` (zero 4xx/5xx)
3. **No phase is DONE until its E2E gate passes.**

**Prereqs:** dev server running, Docker Postgres up (`docker compose up -d`), test user exists, Chrome accessible to `chrome-devtools-mcp`.

**Hard-won rules from Phase 2.0.2 fixes** (see `2026-04-14-phase-2.0.2-fixes.md` §0):
- Never mock the API route you are claiming to test.
- Never assert intermediate state as proof of feature (input has value ≠ feature works).
- Never conclude a feature works from unit tests alone.
- Never declare a phase DONE without a manual DevTools walk-through of every user-visible outcome.
- Use a real PDF fixture (`e2e/fixtures/test_real_paper.pdf`).
- Screenshot on failure AND success.

---

## Verification Protocol

After each sub-phase:
1. `npm run build` — zero TypeScript errors
2. `npm run dev` — dev server starts without warnings (or `vercel dev -L` once Services config lands in 2.0.3)
3. `docker compose up -d` — Postgres (pgvector) is the only required service
4. Python tests — pass in `services/agents/` (runner per `fastapi` skill) once the service exists
5. **TDD compliance** — every new function/route handler/Python route has a failing test first (see TDD skill)
6. **Chrome DevTools E2E gate** — see Testing Strategy above
7. **No phase is marked DONE until its E2E gate passes.**

---

## Existing Baseline (Phase 0.0)

Docker Compose (Postgres 16 + pgvector), Drizzle ORM setup, initial schema (users, documents, user_api_keys), migration applied. See `phases/phase-0-reader.md` for detail.

**Startup:** `docker compose up -d && npx drizzle-kit push`. Redis is not required.

---

## File Structure

Per-phase file layout is in `phases/phase-0-reader.md` (Phase 0 shell) and `phases/phase-1-ai.md` (Phase 1 additions). Subsequent phases add files as described in their respective detail docs and the spec.

**Phase 2.0.3 restructures the repo** into `apps/web/` (Next.js, existing code moved verbatim) and `services/agents/` (FastAPI Python service). See spec §0.7 for the target layout and §0.8 for the Next.js↔FastAPI auth contract.
