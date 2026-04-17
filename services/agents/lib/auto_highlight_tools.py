import json
import os
import re
from difflib import SequenceMatcher

import anyio
from langchain_core.tools import tool
from pypdf import PdfReader

from lib.openrouter_client import embed_texts

MAX_HIGHLIGHTS_PER_RUN = 50
MAX_LOCATE_HITS = 20


def build_tools(
    conn,
    user_id: str,
    document_id: int,
    run_id: str,
    api_key: str,
    pdf_path: str,
) -> list:
    """Build the auto-highlight tool set with context closed over by each @tool."""

    @tool
    async def semantic_search(query: str, top_k: int = 8) -> list[dict]:
        """Search the document for passages semantically related to `query`.

        Returns the top_k most similar chunks as
        `{chunk_id, page, page_start, page_end, content, score}`. Use this
        first to locate candidate pages before drilling into `page_text` or
        `locate_phrase`.
        """
        vecs = await embed_texts(api_key, [query])
        rows = await conn.fetch(
            "SELECT id, content, page_start, page_end, "
            "(1 - (embedding <=> $2::vector)) AS score "
            "FROM document_chunks "
            "WHERE document_id = $1 AND embedding IS NOT NULL "
            "ORDER BY score DESC LIMIT $3",
            document_id, vecs[0], top_k,
        )
        return [
            {
                "chunk_id": r["id"],
                "page": r["page_start"],
                "page_start": r["page_start"],
                "page_end": r["page_end"],
                "content": r["content"],
                "score": float(r["score"]),
            }
            for r in rows
        ]

    @tool
    async def page_text(page_number: int) -> dict:
        """Return the full plain-text contents of a single PDF page.

        `page_number` is 1-indexed. Returns `{page, text, char_count}`, or
        `{error}` if the page is out of range. Use this to read the full
        context around a candidate passage before calling `locate_phrase`.
        """
        def _load():
            reader = PdfReader(pdf_path)
            if page_number < 1 or page_number > len(reader.pages):
                return None
            return reader.pages[page_number - 1].extract_text() or ""

        text = await anyio.to_thread.run_sync(_load)
        if text is None:
            return {"error": f"page {page_number} out of range"}
        return {"page": page_number, "text": text, "char_count": len(text)}

    @tool
    async def locate_phrase(phrase: str, page_number: int) -> list[dict]:
        """Find every occurrence of `phrase` on `page_number` and return
        character offsets + approximate page-coordinate rects.

        Exact match is case-insensitive. If no exact matches and env var
        `AUTO_HIGHLIGHT_FUZZY=1` is set, falls back to fuzzy word-window
        matching. Caps at 20 results. Returns
        `[{start_offset, end_offset, text, rects: [{page, x0, y0, x1, y1}]}]`.
        """
        text, fragments = await anyio.to_thread.run_sync(
            lambda: _extract_with_positions(pdf_path, page_number)
        )
        if text is None:
            return []

        hits = _find_exact(text, phrase)
        if not hits and os.environ.get("AUTO_HIGHLIGHT_FUZZY") == "1":
            hits = _find_fuzzy(text, phrase)

        results = []
        for start, end in hits[:MAX_LOCATE_HITS]:
            rect = _rect_for_span(fragments, start, end, page_number)
            results.append({
                "start_offset": start,
                "end_offset": end,
                "text": text[start:end],
                "rects": [rect] if rect else [],
            })
        return results

    @tool
    async def create_highlights(matches: list[dict]) -> dict:
        """Persist a batch of highlight rows for the current run.

        Each match: `{page_number, text_content, start_offset, end_offset,
        rects}`. All inserts are tagged `source='ai-auto'`, `color='amber'`,
        and `layer_id` of the run. Hard-capped at 50 highlights per run;
        if the cap is hit mid-batch, inserts partial and returns
        `{capped: true}`.
        """
        existing = await conn.fetchval(
            "SELECT COUNT(*) FROM user_highlights WHERE layer_id = $1::uuid",
            run_id,
        )
        existing = int(existing or 0)
        remaining = MAX_HIGHLIGHTS_PER_RUN - existing
        to_insert = matches[:max(0, remaining)]
        capped = len(to_insert) < len(matches) or (existing + len(to_insert)) >= MAX_HIGHLIGHTS_PER_RUN

        for m in to_insert:
            rects_json = json.dumps(m.get("rects", []))
            await conn.execute(
                "INSERT INTO user_highlights "
                "(user_id, document_id, page_number, text_content, start_offset, "
                "end_offset, color, source, layer_id, rects) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10::jsonb)",
                user_id, document_id, m["page_number"], m["text_content"],
                m["start_offset"], m["end_offset"],
                "amber", "ai-auto", run_id, rects_json,
            )

        total = existing + len(to_insert)
        return {"inserted": len(to_insert), "total_in_run": total, "capped": capped}

    @tool
    async def finish(summary: str) -> dict:
        """End the tool loop. Call this once after all relevant highlights
        have been created. `summary` is a 1-2 sentence description of what
        was highlighted (shown to the user).
        """
        return {"summary": summary, "done": True}

    return [semantic_search, page_text, locate_phrase, create_highlights, finish]


# ----- helpers ---------------------------------------------------------------

def _extract_with_positions(pdf_path: str, page_number: int):
    """Return (full_text, fragments). Each fragment: (text, char_start, x, y, font_size).

    Limitation: pypdf's visitor_text fires per text-show operator, typically
    a full line. So rects are line-level, not character-level.
    """
    reader = PdfReader(pdf_path)
    if page_number < 1 or page_number > len(reader.pages):
        return None, []
    page = reader.pages[page_number - 1]

    fragments: list[tuple[str, int, float, float, float]] = []
    parts: list[str] = []
    cursor = 0

    def visitor(text, cm, tm, font_dict, font_size):
        nonlocal cursor
        if not text:
            return
        # pypdf passes the operand text with trailing "\n" for line breaks,
        # which matches what extract_text() assembles. We mirror that layout.
        fragments.append((text, cursor, float(tm[4]), float(tm[5]), float(font_size or 10.0)))
        parts.append(text)
        cursor += len(text)

    page.extract_text(visitor_text=visitor)
    return "".join(parts), fragments


def _find_exact(text: str, phrase: str) -> list[tuple[int, int]]:
    if not phrase:
        return []
    pattern = re.compile(re.escape(phrase), re.IGNORECASE)
    return [(m.start(), m.end()) for m in pattern.finditer(text)]


def _find_fuzzy(text: str, phrase: str, threshold: float = 0.82) -> list[tuple[int, int]]:
    """Simple fuzzy: slide a word-window of phrase length over text, keep spans
    whose SequenceMatcher ratio exceeds `threshold`. Deduped + non-overlapping.
    """
    words = [(m.start(), m.end()) for m in re.finditer(r"\S+", text)]
    plen = len(phrase.split()) or 1
    hits: list[tuple[int, int]] = []
    for i in range(len(words) - plen + 1):
        start = words[i][0]
        end = words[i + plen - 1][1]
        window = text[start:end]
        if SequenceMatcher(None, window.lower(), phrase.lower()).ratio() >= threshold:
            if not hits or start >= hits[-1][1]:
                hits.append((start, end))
    return hits


def _rect_for_span(fragments, start: int, end: int, page_number: int) -> dict | None:
    """Line-level rect: bbox spanning from the first fragment that overlaps
    `start` to the last fragment that overlaps `end`. Width is approximated
    from font_size × chars since pypdf doesn't expose glyph widths here.
    """
    overlapping = [
        f for f in fragments
        if f[1] < end and (f[1] + len(f[0])) > start
    ]
    if not overlapping:
        return None
    first = overlapping[0]
    last = overlapping[-1]
    # Approximate char width as 0.5 * font_size (serif/typical ratio).
    first_text, first_cur, fx, fy, fsz = first
    last_text, last_cur, lx, ly, lsz = last
    offset_into_first = max(0, start - first_cur)
    x0 = fx + offset_into_first * fsz * 0.5
    # Upper y-edge: line baseline + font size (PDF origin is bottom-left).
    y1 = max(fy, ly) + max(fsz, lsz)
    y0 = min(fy, ly)
    # end relative to last fragment's own run
    offset_into_last_end = max(0, end - last_cur)
    x1 = lx + offset_into_last_end * lsz * 0.5
    if x1 <= x0:
        x1 = x0 + fsz * 0.5
    return {"page": page_number, "x0": x0, "y0": y0, "x1": x1, "y1": y1}
