"""PDF catalog bulk-import: swatch grid detection + AI-OCR of design codes.

The pipeline for each PDF page:

    1. Render the page at 200 DPI with PyMuPDF.
    2. Find the printed page-number (from the PDF's page label if present,
       otherwise the PDF index).
    3. Detect an approximate swatch grid by projecting content pixels onto
       the x and y axes and locating the wide white gutters between columns
       and rows.
    4. For each detected cell (label + swatch stacked vertically), split:
         - top ~22% of the cell = OCR crop  → GPT-4o-mini reads the code.
         - middle ~70%          = fabric crop → we embed this for search.
    5. Persist an item per cell in `pdf_import_items` so the admin can
       review, edit, or skip before committing to `designs`.

Grid detection is intentionally conservative: pages where fewer than 4
strong swatch cells are detected are marked `skip_page=True` (typically
covers, intros, indices, and quality-assurance pages).
"""
from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import fitz  # PyMuPDF
import numpy as np
from PIL import Image

from similarity import embed_image_b64, make_thumbnail_b64

logger = logging.getLogger("fabric-api.pdf-import")


# ------------------------- Rendering ------------------------------------- #
def render_pdf_pages(pdf_bytes: bytes, dpi: int = 200) -> List[Image.Image]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    scale = dpi / 72.0
    mat = fitz.Matrix(scale, scale)
    pages: List[Image.Image] = []
    for page in doc:
        pix = page.get_pixmap(matrix=mat, alpha=False)
        pages.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
    doc.close()
    return pages


# ------------------------- Grid detection -------------------------------- #
def _light_mask(page: Image.Image, thresh: int = 215) -> np.ndarray:
    """1 where the pixel is light (paper background), 0 elsewhere."""
    gray = np.asarray(page.convert("L"))
    return (gray >= thresh).astype(np.uint8)


def _find_bands(is_content: np.ndarray, min_run: int, min_gap: int) -> List[Tuple[int, int]]:
    """Return [start, end) ranges where `is_content` is True, merging bands
    separated by gaps shorter than `min_gap` and rejecting bands shorter
    than `min_run`."""
    n = len(is_content)
    bands: List[Tuple[int, int]] = []
    i = 0
    while i < n:
        while i < n and not is_content[i]:
            i += 1
        if i >= n:
            break
        start = i
        gap = 0
        last = i
        while i < n:
            if is_content[i]:
                last = i
                gap = 0
            else:
                gap += 1
                if gap > min_gap:
                    break
            i += 1
        end = last + 1
        if end - start >= min_run:
            bands.append((start, end))
    return bands


def detect_grid(page: Image.Image, min_cells: int = 4) -> List[Tuple[int, int, int, int]]:
    """Detect swatch cells on a catalog page.

    Strategy:
        1. Find COLUMN bands: vertical strips of the page that contain
           swatches, separated by mostly-white gutters (column detection is
           relatively easy because there's usually a real white gap between
           columns of swatches).
        2. Inside each column band, find SWATCH bands: contiguous vertical
           regions of dense colour (low light-pixel fraction).  These are
           the actual fabric swatches.
        3. Grow each swatch upward to grab the LABEL band immediately above
           it (the printed design code).  The union = one "cell" we return.
    """
    light = _light_mask(page, thresh=215)
    h, w = light.shape

    mx = int(w * 0.03)
    my = int(h * 0.03)
    inner = light[my:h - my, mx:w - mx]
    ih, iw = inner.shape

    # ---- Column detection (whole page) ----
    col_light = inner.mean(axis=0)          # 1.0 = pure paper
    # Column is "swatch column" if <60% of it is light paper.
    col_is_swatch = col_light < 0.60
    col_bands = _find_bands(
        col_is_swatch,
        min_run=max(80, iw // 30),
        min_gap=max(4, iw // 400),
    )
    if not col_bands:
        return []

    cells: List[Tuple[int, int, int, int]] = []
    for (cx0, cx1) in col_bands:
        strip = inner[:, cx0:cx1]
        row_light = strip.mean(axis=1)
        # Swatch rows are dense colour: <40% light pixels.
        row_is_swatch = row_light < 0.40
        swatch_bands = _find_bands(
            row_is_swatch,
            min_run=max(40, ih // 60),
            min_gap=max(4, ih // 400),
        )
        if not swatch_bands:
            continue

        for i, (sy0, sy1) in enumerate(swatch_bands):
            # Grow up to include the label. The label sits between the
            # previous swatch (or the top) and this swatch.  Take everything
            # from the previous swatch's bottom up to this swatch's top,
            # but cap the label height at 60% of the swatch height so we
            # don't accidentally scoop up an entire empty band.
            prev_bottom = swatch_bands[i - 1][1] if i > 0 else 0
            swatch_h = sy1 - sy0
            max_label = int(swatch_h * 0.6)
            label_start = max(prev_bottom, sy0 - max_label)
            # Convert to page coordinates
            X0 = cx0 + mx
            X1 = cx1 + mx
            Y0 = label_start + my
            Y1 = sy1 + my
            cw = X1 - X0
            ch = Y1 - Y0
            if cw < w * 0.05 or ch < h * 0.04:
                continue
            cells.append((X0, Y0, X1, Y1))

    if len(cells) < min_cells:
        return []
    return cells


# ------------------------- Cell splitting -------------------------------- #
def split_cell(page: Image.Image, bbox: Tuple[int, int, int, int]) -> Tuple[Image.Image, Image.Image]:
    """Split a grid cell vertically into (label_crop, fabric_crop)."""
    x0, y0, x1, y1 = bbox
    cell = page.crop((x0, y0, x1, y1))
    w, h = cell.size
    # Heuristic: label takes ~22% top; fabric = middle 70%.
    label = cell.crop((0, 0, w, int(h * 0.22)))
    fabric = cell.crop((int(w * 0.02), int(h * 0.24), int(w * 0.98), int(h * 0.98)))
    return label, fabric


def img_to_data_uri(img: Image.Image, quality: int = 80, fmt: str = "JPEG") -> str:
    buf = io.BytesIO()
    if fmt.upper() == "PNG":
        img.save(buf, format="PNG", optimize=True)
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    img.save(buf, format="JPEG", quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


# ------------------------- AI OCR (GPT-4o-mini vision) ------------------- #
_OCR_PROMPT = (
    "You are looking at a small crop from a fabric catalog. It shows the "
    "design code label printed above (or on) a fabric swatch. Extract "
    "ONLY the exact code as printed. Codes look like: '622155-Liberty', "
    "'1-Cherry Cherry', 'Co9-Liberty-MO', 'MF-650-Fronta', '9001-British "
    "Checks', '42565-France'. Ignore any brand name, page number, or "
    "collection header. If you cannot read a code clearly, reply with "
    "exactly the single word: UNKNOWN. Reply with just the code, no "
    "quotes, no explanation."
)


async def ocr_label(label_img: Image.Image, semaphore: asyncio.Semaphore) -> str:
    """OCR a single label crop using GPT-4o-mini vision. Best-effort — on
    error we return an empty string so the caller can fall back."""
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        return ""
    try:
        from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage
    except Exception:
        return ""

    # Resize label for cheap payload — 512px wide is plenty for the text.
    lw, lh = label_img.size
    if lw > 512:
        scale = 512 / lw
        label_img = label_img.resize((512, int(lh * scale)), Image.LANCZOS)
    b64 = img_to_data_uri(label_img, quality=88).split(",", 1)[1]

    async with semaphore:
        try:
            chat = (
                LlmChat(
                    api_key=key,
                    session_id=f"ocr-{uuid.uuid4().hex[:8]}",
                    system_message="You are a precise OCR assistant. Reply with only the requested text.",
                ).with_model("openai", "gpt-4o-mini")
            )
            resp = await chat.send_message(UserMessage(
                text=_OCR_PROMPT,
                file_contents=[ImageContent(image_base64=b64)],
            ))
            text = (resp or "").strip().strip('"').strip("'")
            # Sanity: single-line, drop wrapping punctuation, no whitespace runs
            text = re.sub(r"\s+", " ", text).strip()
            if not text or text.upper() == "UNKNOWN":
                return ""
            # Guard against runaway hallucinations — cap length.
            return text[:80]
        except Exception as e:  # pragma: no cover
            logger.warning("OCR error: %s", e)
            return ""


# ------------------------- Job orchestration ----------------------------- #
async def process_pdf_job(
    db,
    job_id: str,
    catalog_id: str,
    pdf_bytes: bytes,
    use_ai_ocr: bool = True,
    ocr_concurrency: int = 6,
) -> None:
    """Background task. Writes progress + items back into MongoDB."""
    try:
        await db.pdf_import_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "rendering", "progress": 0.0}},
        )
        pages = render_pdf_pages(pdf_bytes, dpi=180)
        total_pages = len(pages)

        await db.pdf_import_jobs.update_one(
            {"id": job_id},
            {"$set": {"total_pages": total_pages, "status": "detecting"}},
        )

        all_items: List[Dict[str, Any]] = []
        page_summaries: List[Dict[str, Any]] = []

        for idx, page in enumerate(pages):
            printed_page = idx + 1  # simple 1-based; user can edit
            bboxes = detect_grid(page)
            page_thumb = page.copy()
            page_thumb.thumbnail((360, 480), Image.LANCZOS)
            page_thumb_uri = img_to_data_uri(page_thumb, quality=70)
            if not bboxes:
                page_summaries.append({
                    "page_index": idx,
                    "printed_page_number": printed_page,
                    "thumb": page_thumb_uri,
                    "detected": 0,
                    "skip_page": True,
                })
                await db.pdf_import_jobs.update_one(
                    {"id": job_id},
                    {"$set": {"progress": (idx + 1) / total_pages, "pages": page_summaries}},
                )
                continue

            # Sort cells top-to-bottom, then left-to-right
            bboxes.sort(key=lambda b: (b[1], b[0]))

            for cell_idx, bbox in enumerate(bboxes):
                label_img, fabric_img = split_cell(page, bbox)
                fabric_img.thumbnail((520, 520), Image.LANCZOS)
                fabric_uri = img_to_data_uri(fabric_img, quality=82)
                label_uri = img_to_data_uri(label_img, quality=82)
                item_id = str(uuid.uuid4())
                # Position-based fallback code so the user has SOMETHING
                # pre-filled even if AI OCR is off / budget is exhausted.
                fallback = f"p{printed_page:02d}-r{cell_idx // 4 + 1}c{cell_idx % 4 + 1}"
                item = {
                    "id": item_id,
                    "job_id": job_id,
                    "page_index": idx,
                    "printed_page_number": printed_page,
                    "cell_index": cell_idx,
                    "bbox": list(bbox),
                    "label_thumb": label_uri,
                    "image": fabric_uri,
                    "thumbnail": make_thumbnail_b64(fabric_uri, side=200),
                    "suggested_number": "",
                    "edited_number": fallback,
                    "pattern": "",
                    "color": "",
                    "skip": False,
                    "ocr_status": "pending" if use_ai_ocr else "skipped",
                }
                all_items.append(item)

            page_summaries.append({
                "page_index": idx,
                "printed_page_number": printed_page,
                "thumb": page_thumb_uri,
                "detected": len(bboxes),
                "skip_page": False,
            })
            await db.pdf_import_jobs.update_one(
                {"id": job_id},
                {"$set": {"progress": (idx + 1) / total_pages, "pages": page_summaries}},
            )

        # Persist items (thumbnails are small; full image is ~50-80KB each)
        if all_items:
            await db.pdf_import_items.insert_many(all_items)

        await db.pdf_import_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "ocr" if use_ai_ocr else "ready",
                "item_count": len(all_items),
                "progress": 0.0 if use_ai_ocr else 1.0,
            }},
        )

        if not use_ai_ocr or not all_items:
            await db.pdf_import_jobs.update_one(
                {"id": job_id}, {"$set": {"status": "ready", "progress": 1.0}}
            )
            return

        # ------------------ OCR pass ------------------
        semaphore = asyncio.Semaphore(ocr_concurrency)
        done_count = 0
        budget_flag = {"exhausted": False}

        async def _ocr_one(item: Dict[str, Any]):
            nonlocal done_count
            if budget_flag["exhausted"]:
                await db.pdf_import_items.update_one(
                    {"id": item["id"]},
                    {"$set": {"ocr_status": "skipped_budget"}},
                )
                return
            label_bytes = base64.b64decode(item["label_thumb"].split(",", 1)[1])
            label_img = Image.open(io.BytesIO(label_bytes)).convert("RGB")
            text, status = await ocr_label(label_img, semaphore)
            if status == "budget":
                budget_flag["exhausted"] = True
                await db.pdf_import_items.update_one(
                    {"id": item["id"]},
                    {"$set": {"ocr_status": "skipped_budget"}},
                )
                return
            await db.pdf_import_items.update_one(
                {"id": item["id"]},
                {"$set": {
                    "suggested_number": text,
                    "edited_number": text,
                    "ocr_status": status,
                }},
            )
            done_count += 1
            if done_count % 5 == 0 or done_count == len(all_items):
                await db.pdf_import_jobs.update_one(
                    {"id": job_id},
                    {"$set": {"progress": done_count / len(all_items)}},
                )

        # Launch bounded parallel OCR
        await asyncio.gather(*[_ocr_one(it) for it in all_items])

        final_status_extra: Dict[str, Any] = {}
        if budget_flag["exhausted"]:
            final_status_extra["ocr_warning"] = (
                "AI OCR stopped: your Emergent LLM key balance is exhausted. "
                "You can still review and type codes manually, then commit."
            )

        await db.pdf_import_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "ready", "progress": 1.0, **final_status_extra}},
        )
    except Exception as e:  # pragma: no cover
        logger.exception("PDF import job %s failed", job_id)
        await db.pdf_import_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "failed", "error": str(e)[:400]}},
        )


# ------------------------- Commit ---------------------------------------- #
async def commit_job(db, job_id: str, catalog_id: str, created_by: Optional[str]) -> Dict[str, int]:
    catalog = await db.catalogs.find_one({"id": catalog_id}, {"_id": 0})
    if not catalog:
        raise ValueError("Catalog not found")

    items = await db.pdf_import_items.find(
        {"job_id": job_id, "skip": {"$ne": True}}, {"_id": 0}
    ).to_list(20000)

    inserted = 0
    for it in items:
        code = (it.get("edited_number") or "").strip()
        if not code:
            continue
        try:
            emb = embed_image_b64(it["image"])
        except Exception:
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "design_number": code,
            "catalog_id": catalog_id,
            "catalog_name": catalog["name"],
            "brand": catalog.get("brand", ""),
            "page_number": it.get("printed_page_number"),
            "color": it.get("color", "") or "",
            "pattern": it.get("pattern", "") or "",
            "tags": [],
            "remarks": "",
            "image": it["image"],
            "thumbnail": it.get("thumbnail") or make_thumbnail_b64(it["image"], side=200),
            "embedding": emb,
            "created_at": datetime.now(timezone.utc),
            "created_by": created_by,
            "source_job_id": job_id,
        }
        await db.designs.insert_one(doc)
        inserted += 1

    await db.catalogs.update_one(
        {"id": catalog_id}, {"$inc": {"design_count": inserted}}
    )
    await db.pdf_import_jobs.update_one(
        {"id": job_id},
        {"$set": {"status": "committed", "committed_count": inserted}},
    )
    return {"inserted": inserted}
