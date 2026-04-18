# Phase 2.1.1 — Implicit Auto-Highlight (chat agent toolbelt)

**Goal:** chat agent can create highlights mid-conversation without the `/highlight` prefix.

**Design (locked):**
- (a) Shared toolbelt — chat agent gets the 5 existing highlight tools
- New `ai_highlight_runs` row per implicit trigger (sidebar Runs reflects it)
- Intent gating via **tool descriptions**, not system prompt
- Scalability: each future slash-command = new module with `build_tools(ctx)`. Chat router concats toolbelts. No registry until toolbelt #2 arrives.

**Non-goals:**
- Classifier / router — deferred
- Intent detection beyond what the LLM does from tool descriptions
- Toolbelt registry abstraction — deferred until needed

---

## Tasks

### 44 — Chat agent loop (replace plain streamer)

Convert `services/agents/lib/chat.py` from plain token streaming to a LangChain agent (`create_agent` + `astream(stream_mode="updates")`), mirroring `auto_highlight.py`. Preserve existing RAG system prompt verbatim as agent instructions. Yield `("token", str)` for LLM tokens and `("tool_call", tool_name, args)` for tool-call progress so the router can format SSE.

**Touches:** `services/agents/lib/chat.py` only. Tests stay green (unit test on `run_chat` may need shimming — check existing tests first).

### 45 — Lazy highlight run + toolbelt wire-up

In `services/agents/routers/chat.py`:
- Build per-turn `ctx` dict: `{run_id: None, highlights_inserted: 0}`
- Wrap `build_tools()` from `auto_highlight_tools.py`: first call to `create_highlights` triggers `INSERT INTO ai_highlight_runs (...) RETURNING id` and populates `ctx["run_id"]`; subsequent calls reuse it
- Pass the full 5-tool list (plus any future toolbelt) to the chat agent
- On turn end: if `ctx["run_id"]`, UPDATE run status='completed' + completed_at + summary (from `finish` tool output if called, else synthesize)

**Touches:** `services/agents/routers/chat.py`, minor refactor in `auto_highlight_tools.py` to accept `get_run_id` callable instead of eager `run_id` param (backward-compat for explicit route).

### 46 — SSE schema extension + TS hook

Extend chat SSE events (alongside existing `sources` / `token` / `error` / `[DONE]`):
- `{type: "highlight_progress", step: "<tool_name>", label?: "<human readable>"}`
- `{type: "highlight_done", runId: string, count: number}` (only if `ctx["run_id"]` populated)

`apps/web/src/hooks/use-chat.ts` parses the new events and attaches `runId` + `highlightsCount` + `progressSteps` to the assistant message (reuse the existing ChatMessage shape from explicit flow).

**Touches:** `services/agents/routers/chat.py`, `apps/web/src/hooks/use-chat.ts`.

### 47 — Tool description intent gating

Prepend to `semantic_search` and `create_highlights` docstrings in `auto_highlight_tools.py`:

> **Use this toolset only when the user explicitly asks to highlight / mark / annotate passages.**
> ✅ "Highlight where the dataset is discussed"
> ❌ "What's the methodology?" — answer inline; do NOT call this tool.

No change to system prompt. Unit test: add a `test_tool_descriptions_mention_intent` sanity check.

**Touches:** `services/agents/lib/auto_highlight_tools.py` (docstrings only), one new test.

### 48 — UI: Review button for implicit runs

`apps/web/src/components/reader/chat-message.tsx` already renders the Review button for `kind === "auto-highlight-result" && runId && highlightsCount > 0`. Extend logic: also render when the message is a regular chat reply (`kind` undefined / `"chat"`) but `runId` + `highlightsCount` are present. Same button, same handler.

**Touches:** `chat-message.tsx`.

### 49 — E2E gate

Chrome DevTools walkthrough:
1. Open document 185, open chat
2. Send "highlight the passages where attention is explained" (no slash prefix)
3. Assert: progress events visible, amber overlays appear, Review button in reply, sidebar Runs shows new row
4. Send "what is the paper about?" (pure Q&A)
5. Assert: plain text answer, ZERO highlight tools called, no new run row
6. Delete the implicit run from sidebar → overlays disappear

---

## Progress

| Task | Status |
|---|---|
| 44 Chat agent loop | Pending |
| 45 Lazy run + toolbelt wire-up | Pending |
| 46 SSE + hook | Pending |
| 47 Tool intent gating | Pending |
| 48 UI Review button for chat | Pending |
| 49 E2E gate | Pending |

---

# Phase 2.1.2 — Highlight rect positioning (bugfix)

**Goal:** amber overlays land on the actual words the agent selected — no empty-row boxes, no drift onto neighboring words, no paragraph-tall blocks.

**Symptoms observed:**
- Rects rendered on blank lines below body text ("yellow bar in empty space")
- Single highlight box covering a whole paragraph when the LLM asked for one phrase
- Word-length highlights drifting: "hemosensory" half-marked with the rest bleeding into the right margin; a "chemosensory" highlight landing on "measurements"

**Root cause (already diagnosed):** `services/agents/lib/auto_highlight_tools.py` `_extract_with_positions` + `_rect_for_span` approximate glyph positions from pypdf's `visitor_text` fragments using `offset × fsz × 0.5`. Three independent defects compound:
1. pypdf reports `font_size=1.0` for this PDF — real size is in `tm[0]` text-matrix scale. **Fixed.**
2. A hit span that crosses fragments on different y-lines got one tall rect instead of per-line rects. **Fixed** (returns `list[dict]`, grouped by y).
3. Linear `0.5×fsz` char-width approximation over-shoots real serif widths (~1.3×) and can extend past the page mediabox. **Partially mitigated** with mediabox clamp; drift on long offsets (>60 chars into a fragment) remains.

**What still fails:** #3 above. On dense captions where `offset_into_first` is large, the computed x still lands 10-30pt off true glyph position, visually shifting onto an adjacent word.

**Non-goals:**
- Re-architecting PDF extraction for other features
- Changing the tool surface exposed to the LLM (`locate_phrase`, `create_highlights` signatures stay stable)

---

## TDD discipline (applies to all tasks)

**Iron law:** no production edit to `_extract_with_positions` / `_rect_for_span` without a failing test first.

Red → verify red → minimal green → verify green → refactor. If a test passes on the first run, it's wrong — it's not exercising the bug.

Truth source for glyph positions = `pdfplumber` `page.chars` (per-glyph `{text, x0, x1, y0, y1}`) against the fixture PDF, loaded once in a pytest fixture. Pure-Python, MIT, no native dep. All assertions compare current-impl rects to that ground truth.

---

## Tasks

### 50 — Per-glyph positions (TDD)

Two approaches, **ordered**: try A first, fall back to B only if A can't satisfy the RED tests.

**Option A — pdfplumber (default, try first).**
Swap `_extract_with_positions` to use `pdfplumber.open(…).pages[n].chars`, which returns per-glyph `{text, x0, x1, y0, y1, size, fontname}`. Match the phrase against the joined `char["text"]` stream, slice the matching chars, group by y, emit `min(x0)…max(x1)` per line. Deletes all `offset × fsz × 0.5` math. Pure-Python, MIT, adds one dep to `pyproject.toml`. ~25 LOC.

**Option B — client-side text-layer resolution (fallback).**
Only if A hits an edge case we can't solve (e.g. ligatures or rotated glyphs in the fixture). Change the API contract: `create_highlights` stores `{page, phrase, occurrence_index}` instead of rects. Overlays resolve at render time by walking `.react-pdf__Page__textContent span` nodes, building a `Range` for the phrase, and calling `Range.getClientRects()`. Eliminates Python-side coordinate math entirely, but changes the storage shape and overlay render path.

Do NOT pursue PyMuPDF — it is AGPL-3.0, not compatible with a closed-source product.

**RED first** (task 51 scaffolding lands before any lib edit):
1. `test_rect_matches_truth` — single-line "chemosensory" hit on page 1. Drift from `pdfplumber` truth ≤3pt.
2. `test_rect_no_overflow_mediabox` — long caption hit near right margin. `x1 <= mediabox.right`.
3. `test_multiline_span_yields_per_line_rects` — phrase wrapping across two lines → `len(rects) >= 2`, each within its own line's y-band.

Run pytest, confirm all three fail for the **expected** reason (wrong x, overflow, single tall rect) — not import errors.

**GREEN (A):** implement pdfplumber path. Run RED tests → all green. If any stays red after honest effort, stop and escalate to Option B rather than band-aiding.

**GREEN (B, only if A escalates):** RED tests move to Playwright (they assert on DOM rects, not Python rects). Python-side tests for 50 are deleted; task 51 shifts to an e2e-only gate. Migration note: existing `ai_highlight_rects` rows become derivable-on-render — drop the column or keep as cache.

**REFACTOR:** collapse `_rect_for_span` to a thin wrapper over the chars-table lookup; delete dead approximation helpers.

**Touches:** `services/agents/lib/auto_highlight_tools.py`, `services/agents/pyproject.toml` (pdfplumber). If escalating to B: schema change, `apps/web/src/components/reader/highlight-overlay.tsx` (or equivalent render component).

### 51 — Regression fixture + assertions

New `services/agents/tests/test_auto_highlight_rects.py` + trimmed 4-page fixture (`tests/fixtures/chemosensory.pdf`, ~1.2MB; pages carry embedded figures so `<500KB` wasn't achievable, and further trimming would lose coverage) carved from `4d5b8a02-…`. Fixture loads once per module.

Assertions (all parametrized over pages 1, 2, 5, 21):
- `(x0, y0)` within ±3pt of pdfplumber truth bbox (built from `page.chars` at test-setup time).
- `x1 <= mediabox.right` and `y1 <= mediabox.top`.
- Width ∈ [char_count × 2pt, char_count × 12pt] — guards against the 6×1pt sliver regression from run `3a2e170b`.
- Multi-line: `len(rects) >= 2`, y-bands non-overlapping.

These tests ARE the red step for task 50 — no separate scaffold phase.

**Touches:** `services/agents/tests/test_auto_highlight_rects.py`, `services/agents/tests/fixtures/chemosensory.pdf`.

### 52 — Legacy bad-rect cleanup (TDD)

**RED:** `test_is_stale_rect` unit test — `(width<5 AND height<2)` → True; normal rects → False.

**GREEN:** add `is_stale_rect()` helper + admin endpoint `POST /api/highlight-runs/:id/rebuild` that re-runs extraction. Sidebar shows "Rebuild" button only when any rect in the run fails the predicate.

No destructive SQL migration — old runs stay, user opts in to rebuild.

**Touches:** `services/agents/lib/auto_highlight_tools.py` (predicate), new admin router, `apps/web/src/components/reader/highlights-sidebar.tsx`.

### E2E Gate — Phase 2.1.2 (Playwright)

Extend `apps/web/tests/highlights-render.spec.ts` — Playwright already covers this surface, piggyback on its fixtures:

1. **Glyph accuracy** — seed a run over the fixture PDF with phrase "chemosensory". For each overlay `<div>`, query `getBoundingClientRect()`, screenshot the page, assert the rect's center pixel ∈ pre-computed target bbox (truth file checked in alongside fixture). Sample pages 1, 2, 5, 21.
2. **No blank-line rects** — assert every rect's top overlaps a text-layer span (use react-pdf's text layer DOM: `.react-pdf__Page__textContent span`).
3. **No overflow** — `rect.right <= page.right` on all overlays.
4. **Sentence scope** — seed "Coarse-grained energy landscape" → assert single rect, height ≤ 2 × line-height.
5. **Rebuild button** — seed a legacy run with a sliver rect → Rebuild button visible → click → assert overlay now passes predicate.

Run via `pnpm --filter web test:e2e highlights-render`. Gate passes only when all 5 green + unit suite green.

---

## Progress

| Task | Status |
|---|---|
| 50 Per-glyph positions (RED→GREEN) | Pending |
| 51 Regression fixture + assertions | Pending |
| 52 Legacy rebuild (RED→GREEN) | Pending |
| E2E gate (Playwright) | Pending |
