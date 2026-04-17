# Phase 2.2 — Enriched Smart Citations

> **Status:** DONE (worktree `worktree-phase-2.2-citations-enriched`). **Spec:** §4 (amended 2026-04-17).

**Goal:** `CitationCard` becomes a rich S2-backed surface (title/author links, TL;DR, metrics, external-ID pills, OA PDF link, BibTeX, Save). Batched enrichment via `/paper/batch`. BYOK S2 key in Settings.

## Scope chunking (amended 2026-04-17)
Higher-risk features originally considered for 2.2 were moved to **Phase 3.1** to keep this phase low-risk: snippet preview via `/snippet/search`, references/citations drawers on the card. See spec §8.

## Tasks

- [x] **A. Schema + migration.** Add columns to both `document_references` and `library_references`: `influential_citation_count int`, `open_access_pdf_url text`, `tldr_text text`, `external_ids jsonb`, `bibtex text`. Convert `authors` from `text` to `jsonb` with safe migration of existing comma-separated strings. Generate via `drizzle-kit generate`; hand-edit the SQL if needed so the jsonb conversion happens in-transaction. Failing vitest test first for round-trip of jsonb authors.
- [x] **B. S2 client — two-pass pipeline.** In `apps/web/src/lib/citations/semantic-scholar.ts`:
  - Extend `PaperMetadata` with new fields (typed `authors: {name, authorId?}[]`).
  - Add `resolvePaperId(ref, {apiKey?})` — DOI lookup first, else `/paper/search/match`.
  - Add `fetchPaperBatch(paperIds, {apiKey?})` — single `POST /paper/batch` call; chunk at 500 if ever >500.
  - Rewrite `enrichReferences` as pass-1 (500ms pacing between resolves) → pass-2 (one batch call).
  - `x-api-key` header when `apiKey` arg present.
  - Failing tests first (fixture-based): mapper, batch-call count, header conditional.
- [x] **C. BYOK S2 key.** Extend `userApiKeys.providerType` enum with `"references"` (name per impl). Settings manager gains a Semantic Scholar row. Server helper `getUserS2Key(userId)` decrypts → `string|null`. Enrich route passes through to S2 client. Failing test first for helper + UI test for the row.
- [x] **D. `CitationCard` overhaul.** `apps/web/src/components/reader/citation-card.tsx`:
  - Prop `variant: "popover" | "compact"`, default `"popover"`.
  - Render order: title (hyperlink) · authors (hyperlinked) · metrics line `Venue · Year · ⭐ {citationCount} ({influential} influential)` + OA badge · TL;DR (italic 1-line) · collapsible abstract · external-ID pill strip · actions row.
  - Pills: DOI → `doi.org/{x}`; ArXiv → `arxiv.org/abs/{x}`; PubMed → `pubmed.ncbi.nlm.nih.gov/{x}/`; ACL → `aclanthology.org/{x}`; DBLP → `dblp.org/rec/{x}`; PMC → `ncbi.nlm.nih.gov/pmc/articles/{x}`. Render only pills for IDs present.
  - Actions: Save to References (existing) · Copy BibTeX (clipboard; from row `bibtex` or local fallback) · Open PDF (when `open_access_pdf_url`).
  - New `apps/web/src/lib/citations/bibtex.ts` — local fallback formatter. Failing unit test first.
  - Skeleton state while enrichment in flight.
- [x] **E. Citations sidebar uses CitationCard compact + auto-enrichment.** `apps/web/src/components/reader/citations-sidebar.tsx`:
  - Each row rendered as `<CitationCard variant="compact" />`.
  - On first open for a document (when any ref lacks `semantic_scholar_id`), auto-POST `/api/documents/[id]/citations/enrich`.
  - Popover variant (click-on-[n]) unchanged behaviorally; uses same component.
- [x] **F. `/library/references` page uses CitationCard + remove.** `apps/web/src/app/(main)/library/references/page.tsx`:
  - Each row rendered as `<CitationCard variant="compact" />`.
  - `Remove` button per row → `DELETE /api/library/references/[id]` (new route; ownership check). Failing test first on route.
- [x] **G. E2E gate.**
  - `apps/web/e2e/citations-enriched.spec.ts` — Playwright with mocked S2 responses. Verify: enrichment fires on tab open; single `/paper/batch` in network log; all new columns written; Save flow; Remove flow; `x-api-key` present when BYOK configured.
  - Chrome DevTools MCP walk-through per `.claude/skills/e2e-testing`: login → open a real paper → Citations tab → cards enrich → TL;DR visible → pills open correct URLs in new tabs → Copy BibTeX → Save → `/library/references` row present → Remove. Inline [n] popover renders identical card. Zero 4xx/5xx; clean console. Screenshot success + any failures.

## Verification checklist
1. `npm run build` — zero TS errors.
2. `npm run test` — green, including new test files.
3. `npm run lint` — clean.
4. DevTools MCP walk-through above.
5. Plan index Progress table updated: 2.2 → DONE; 3.1 left as Pending with revised scope.
