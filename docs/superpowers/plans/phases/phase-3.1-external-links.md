# Phase 3.1 — External Links & Deep References

> **Status:** Pending. **Spec:** §8 (expanded 2026-04-17 to absorb snippet preview + references/citations drawers deferred from 2.2).

## Scope (amended)

Makes `CitationCard` a spring-board for exploring the cited paper in place:
- **Snippet preview** on card expand via `/snippet/search`.
- **References drawer** on card via `/paper/{id}/references`.
- **Cited by drawer** on card via `/paper/{id}/citations`.
- **Inline DOI/URL resolution** in PDF body text (original 3.1 scope).

## Tasks

- [ ] **T1. Snippet preview.** On card abstract expand, call `GET /snippet/search?paperId={id}&query=<context>&limit=1`. `<context>` = ~200 chars around the marker click site (stored when the popover opened) OR the Citations tab search input. Render under abstract with label `From cited paper, matching your passage`. Client-side cache per `(paperId, queryHash)` for session. Failing test first on the surrounding-text extractor.
- [ ] **T2. References drawer.** Disclosure `References (N)` in card → `GET /paper/{id}/references?fields=paperId,title,authors.name,year&limit=50`. Render mini-cards (title + authors + year). Click a mini-card → open full CitationCard in popover mode anchored to it. Failing test first on route.
- [ ] **T3. Cited-by drawer.** Same as T2 on `/paper/{id}/citations`.
- [ ] **T4. Inline DOI scanner.** Scan PDF text-layer spans for `10\.\d{4,9}/[-._;()/:A-Z0-9]+` (case-insensitive) and known paper-host URLs (arxiv.org, aclanthology.org, pubmed). Wrap matches in an overlay; click → CitationCard popover via S2 resolver.
- [ ] **T5. E2E gate.**
  - Playwright with mocked S2 `/snippet/search`, `/paper/{id}/references`, `/paper/{id}/citations`.
  - Chrome DevTools MCP: expand a CitationCard → snippet renders → open References drawer → mini-cards render → click mini-card → popover CitationCard renders → repeat for Cited by → scan a page with an inline DOI → click → popover renders. Zero 4xx/5xx.

## Notes
- Phase 3.0a/b (Smart Explanation) is upstream. 3.1 depends only on 2.2 (CitationCard + S2 client) and the existing text-layer infra from 2.0.1.
