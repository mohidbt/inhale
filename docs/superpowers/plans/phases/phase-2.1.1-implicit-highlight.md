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
