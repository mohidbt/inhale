"""
Chandra JSON output (observed via datalab-python-sdk v0.5.0 / Datalab Marker API):

  result.json: dict — top-level document node
    result.json["children"]: list of page-block dicts
      page["block_type"]: "Page"
      page["children"]: list of block dicts, each block:
        block["block_type"]: str — one of the values below
        block["bbox"]: [x0, y0, x1, y1] — PDF user-space coords, origin bottom-left
        block["html"]: str — HTML representation of the block
        block["id"]: str — e.g. "/page/0/SectionHeader/0"
        block["children"]: list — nested child blocks (may be absent or empty)

  Known block_type values (Marker/Datalab):
    "SectionHeader", "Text", "Picture", "Figure", "Table",
    "Equation", "Formula", "Caption", "Code", "ListItem",
    "PageHeader", "PageFooter", "Footnote", "TextInlineMath"

  Page index: derived from the block's "id" field path (e.g. "/page/0/..."),
  or from the page block's own "id" if structured as children of the document.
  In the actual API response, pages are top-level children with block_type "Page"
  and the page number can be read from their id "/page/<N>/Page/0".

Mapping to document_segments.kind:
  "SectionHeader"              → "section_header"
  "Picture" | "Figure"         → "figure"
  "Equation" | "Formula"       → "formula"
  "Table"                      → "table"
  "Text" | "TextInlineMath"    → "paragraph"
  (all others dropped)

Payload per kind:
  section_header: {"text": str, "heading_level": int | None}
  figure:         {"caption": str}
  formula:        {"latex": str}
  table:          {"html": str}
  paragraph:      {"text": str}

bbox stored as {"x0": float, "y0": float, "x1": float, "y1": float}.

NOTE: "html" field on each block is the primary content source.
      For formulas, html typically wraps LaTeX in <math> or contains the raw LaTeX.
      We store html as-is in the latex/caption/text fields and let the frontend render.
"""

import html
import json
import logging
import re
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from deps.auth import InternalAuthDep
from deps.db import ConnDep

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["chandra-segments"])

# Maps Chandra block_type → document_segments.kind
_KIND_MAP: dict[str, str] = {
    "SectionHeader": "section_header",
    "Picture": "figure",
    "Figure": "figure",
    "Equation": "formula",
    "Formula": "formula",
    "Table": "table",
    "Text": "paragraph",
    "TextInlineMath": "paragraph",
}


class ChandraSegmentsBody(BaseModel):
    document_id: int
    file_path: str


class ChandraSegmentsResponse(BaseModel):
    success: bool
    segment_count: int
    page_count: int
    skipped: bool = False


def _strip_html(raw: str) -> str:
    """Remove HTML tags, unescape HTML entities, and return plain text."""
    return html.unescape(re.sub(r"<[^>]+>", "", raw or "").strip())


def _page_index_from_id(block_id: str) -> int:
    """Extract page number from Marker block ID like '/page/0/SectionHeader/0'."""
    parts = block_id.split("/")
    try:
        idx = parts.index("page")
        return int(parts[idx + 1])
    except (ValueError, IndexError):
        logger.warning("Could not parse page index from block id %s", block_id)
        return 0


def _build_payload(kind: str, block: dict[str, Any]) -> dict[str, Any]:
    raw_html = block.get("html", "")
    text = _strip_html(raw_html)
    if kind == "section_header":
        # Attempt to extract heading level from html tag (h1-h6)
        m = re.search(r"<h([1-6])[^>]*>", raw_html, re.IGNORECASE)
        heading_level = int(m.group(1)) if m else None
        return {"text": text, "heading_level": heading_level}
    if kind == "figure":
        return {"caption": text}
    if kind == "formula":
        return {"latex": raw_html}
    if kind == "table":
        return {"html": raw_html}
    # paragraph
    return {"text": text}


def _bbox_dict(bbox: list[float]) -> dict[str, float]:
    """Convert [x0, y0, x1, y1] list to named dict."""
    if len(bbox) >= 4:
        return {"x0": bbox[0], "y0": bbox[1], "x1": bbox[2], "y1": bbox[3]}
    return {"x0": 0.0, "y0": 0.0, "x1": 0.0, "y1": 0.0}


def _parse_blocks(json_output: dict[str, Any]) -> list[tuple[int, str, dict, dict]]:
    """
    Parse the Marker JSON tree into a flat list of
    (page_index, kind, bbox_dict, payload_dict) tuples in page-major order.
    Drops any block whose block_type has no kind mapping.
    """
    rows: list[tuple[int, str, dict, dict]] = []
    pages = json_output.get("children", [])

    for page_block in pages:
        if page_block.get("block_type") != "Page":
            continue
        page_id = page_block.get("id", "/page/0/Page/0")
        page_num = _page_index_from_id(page_id)

        for block in page_block.get("children", []):
            kind = _KIND_MAP.get(block.get("block_type", ""))
            if not kind:
                continue
            raw_bbox = block.get("bbox")
            if not raw_bbox or len(raw_bbox) < 4:
                continue
            bbox = _bbox_dict(raw_bbox)
            payload = _build_payload(kind, block)
            rows.append((page_num, kind, bbox, payload))

    return rows


async def _run_chandra(file_path: str, api_key: str):
    """Call Chandra OCR asynchronously via AsyncDatalabClient."""
    from datalab_sdk import AsyncDatalabClient, ConvertOptions

    async with AsyncDatalabClient(api_key=api_key) as chandra:
        return await chandra.convert(
            file_path=file_path,
            options=ConvertOptions(output_format="json", mode="accurate"),
            max_polls=120,
        )


@router.post("/chandra-segments", response_model=ChandraSegmentsResponse)
async def chandra_segments(
    body: ChandraSegmentsBody,
    auth: InternalAuthDep,
    conn: ConnDep,
) -> ChandraSegmentsResponse:
    ocr_key: str = auth.get("ocr_key", "") or ""
    if not ocr_key:
        return ChandraSegmentsResponse(
            success=True, segment_count=0, page_count=0, skipped=True
        )

    document_id = body.document_id

    result = await _run_chandra(body.file_path, ocr_key)

    if not result.success or result.json is None:
        logger.warning(
            "Chandra convert failed for document %d: %s", document_id, result.error
        )
        return ChandraSegmentsResponse(
            success=True, segment_count=0, page_count=result.page_count or 0
        )

    rows = _parse_blocks(result.json)

    if rows:
        await conn.executemany(
            """
            INSERT INTO document_segments
              (document_id, page, kind, bbox_jsonb, payload_jsonb, order_index)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            [
                (
                    document_id,
                    page,
                    kind,
                    json.dumps(bbox),
                    json.dumps(payload),
                    idx,
                )
                for idx, (page, kind, bbox, payload) in enumerate(rows)
            ],
        )

    return ChandraSegmentsResponse(
        success=True,
        segment_count=len(rows),
        page_count=result.page_count or 0,
    )
