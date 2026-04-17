# Phase 3.3 — BibTeX Export

> **Status:** Pending. **Spec:** §10 (amended 2026-04-17 — per-ref BibTeX now stored on the row from Phase 2.2, so this phase is a thin concatenate + download).

## Scope (amended)

Per-reference BibTeX already ships via `CitationCard` → Copy BibTeX (2.2) and is persisted on `library_references.bibtex`. This phase adds bulk library export.

## Tasks

- [ ] **T1. `/api/library/references/export.bib` route.** GET. Queries the user's `library_references`; for each row emits stored `bibtex` or local fallback formatter (shared with 2.2). Response: `text/x-bibtex; charset=utf-8`, `Content-Disposition: attachment; filename="inhale-library.bib"`. Failing test first: ownership, content-type, concatenation, fallback path.
- [ ] **T2. Export button.** On `/library/references` page, top-right `Export .bib` link to the route above. No pagination concerns; library stays small in MVP.

## E2E gate
- Playwright: route returns valid BibTeX (at least one `@article{` or `@inproceedings{`); filename + content-type correct; respects ownership (user A cannot read user B's library).
- Chrome DevTools MCP: click Export .bib → download starts → parsed output contains all saved rows.

## Out of scope
- Per-document export (from Citations tab). Can ship later if demand emerges; no blocker today.
- RIS / EndNote / CSL-JSON. Covered in Phase 5 polish if needed.
