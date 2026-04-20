# Phase 3.0a — Smart Explanation: Detection + Icon Overlays

> **Status:** DONE (2026-04-20). **Spec:** §6. Merged to main at `eb9f710`.

## Tasks

- [x] Task 53: Schema — `document_segments (id, document_id, page, kind, bbox jsonb, payload jsonb, order_index)`.
- [x] Task 54a: FastAPI `/agents/chandra-segments` router (Datalab AsyncDatalabClient, normalized bboxes, `_KIND_MAP` → section_header/figure/formula/table/paragraph).
- [x] Task 54b: Next.js upload → Chandra proxy wiring (HMAC-signed, silent no-op without key).
- [x] Task 55: `ExplainMarkerLayer` — 16px icon per segment (`#` / figure / Σ), anchored at `bbox.x1 + 4px, bbox.y0`, blurred-pill background.
- [x] Task 56: Click → Chat sidebar with seed message (raw payload; 3.0b adds intelligence).
- [x] Task 57: Settings banner when Chandra key absent.

## E2E Gate — Phase 3.0a

- [x] With Chandra configured: upload → icons render; each variant present (verified on `attention.pdf` / doc 438).
- [x] Click each variant → chat opens with expected seed.
- [x] Without Chandra: no icons; settings banner visible.

## Post-merge fixes

- **Coordinate normalization** (`eb9f710`): Chandra returns image-pixel bboxes with top-left origin, not PDF points. Normalize to 0..1 fractions of page dims so the frontend positions markers without knowing Chandra's render DPI.
- **Click z-index** (`eb9f710`): pdfjs textLayer has computed `z-index: 2`; ExplainMarkerLayer's wrapper was `z-index: auto`, so textLayer spans silently intercepted every click. Wrapper now `z-index: 10`.

## Deferred follow-ups

- I1: sync Chandra timeout with upstream Datalab poll window.
- I4: Chandra failures are currently swallowed — surface a user-visible warning when OCR returns `success=false`.
- I5: add `Cache-Control` on `GET /api/documents/[id]/segments`.
