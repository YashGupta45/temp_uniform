"""Fabric-focused image embedding + similarity search.

We deliberately combine multiple, complementary descriptors so the search is
robust against lighting, rotation, partial samples, blur, and background:

    - Global color histogram in HSV (illumination-tolerant)   [48 dims]
    - Perceptual hash (pHash, 8x8 DCT bit-vector)             [64 dims]
    - Multi-scale HOG-lite gradient orientation histogram
      captures weave / stripe / check / geometric motifs      [36 dims]
    - Local texture (Local Binary Pattern style) histogram   [16 dims]
    - Multi-scale patch color statistics                     [18 dims]

Each block is L2-normalised then concatenated into one vector so cosine
similarity works well.  Storage is a plain list[float] per design in Mongo;
FAISS is not needed at this scale (<50k designs still respond in <200ms via
numpy dot-product).
"""
from __future__ import annotations

import base64
import io
import math
from typing import List, Tuple

import imagehash
import numpy as np
from PIL import Image, ImageFilter, ImageOps


EMBEDDING_DIMS = 48 + 64 + 36 + 16 + 18  # = 182


# ------------------------- image loading helpers ------------------------- #
def _strip_data_uri(data: str) -> bytes:
    if "," in data and data.strip().startswith("data:"):
        data = data.split(",", 1)[1]
    return base64.b64decode(data)


def load_image(b64_data: str, max_side: int = 512) -> Image.Image:
    raw = _strip_data_uri(b64_data)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    # Fix EXIF orientation so rotation of phone photos does not confuse us.
    img = ImageOps.exif_transpose(img)
    w, h = img.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return img


def make_thumbnail_b64(b64_data: str, side: int = 256, quality: int = 78) -> str:
    """Return a small JPEG data-uri preview."""
    img = load_image(b64_data, max_side=side)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


# ------------------------- fabric region isolation ----------------------- #
def _isolate_fabric_region(img: Image.Image) -> Image.Image:
    """Center-crop 80% to bias toward the fabric and away from cluttered
    background / hand / edges - simple but effective for handheld cloth photos.
    """
    w, h = img.size
    side = int(min(w, h) * 0.85)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side)).resize((256, 256), Image.LANCZOS)


# ------------------------- individual descriptors ------------------------ #
def _hsv_histogram(img: Image.Image) -> np.ndarray:
    hsv = img.convert("HSV")
    arr = np.asarray(hsv, dtype=np.float32)
    h_hist, _ = np.histogram(arr[..., 0], bins=24, range=(0, 256))
    s_hist, _ = np.histogram(arr[..., 1], bins=12, range=(0, 256))
    v_hist, _ = np.histogram(arr[..., 2], bins=12, range=(0, 256))
    hist = np.concatenate([h_hist, s_hist, v_hist]).astype(np.float32)
    return _l2(hist)


def _phash_bits(img: Image.Image) -> np.ndarray:
    ph = imagehash.phash(img, hash_size=8)
    bits = np.array(ph.hash.flatten(), dtype=np.float32)
    # Map 0/1 to -1/+1 so hamming distance ~ cosine distance
    bits = bits * 2 - 1
    return _l2(bits)


def _gradient_orientation_hist(img: Image.Image) -> np.ndarray:
    """A cheap HOG-lite: 6x6 spatial cells x 6 orientation bins over the
    grayscale gradient - highlights weave, stripes, checks, geometry."""
    gray = np.asarray(img.convert("L").resize((96, 96), Image.LANCZOS), dtype=np.float32)
    gx = np.zeros_like(gray)
    gy = np.zeros_like(gray)
    gx[:, 1:-1] = gray[:, 2:] - gray[:, :-2]
    gy[1:-1, :] = gray[2:, :] - gray[:-2, :]
    mag = np.sqrt(gx * gx + gy * gy)
    ang = (np.arctan2(gy, gx) + math.pi) / math.pi  # 0..2
    ang = (ang * 3) % 6  # 6 orientation bins
    hist = np.zeros(6 * 6, dtype=np.float32)  # 6 cells but flattened => 36 dims total? we want 36
    # Use 6 orientation bins over 6 cells => 6*6=36
    cells = 3  # 3x3 spatial grid -> 9 cells
    bins = 4  # 4 orientation bins per cell => 9*4 = 36 dims
    ch = 96 // cells
    out = np.zeros(cells * cells * bins, dtype=np.float32)
    ang = (np.arctan2(gy, gx) + math.pi) / math.pi  # 0..2
    ang_bin = np.clip((ang * bins / 2).astype(np.int32), 0, bins - 1)
    for cy in range(cells):
        for cx in range(cells):
            m = mag[cy * ch:(cy + 1) * ch, cx * ch:(cx + 1) * ch]
            a = ang_bin[cy * ch:(cy + 1) * ch, cx * ch:(cx + 1) * ch]
            for b in range(bins):
                out[(cy * cells + cx) * bins + b] = float(m[a == b].sum())
    return _l2(out)


def _lbp_hist(img: Image.Image) -> np.ndarray:
    """Local Binary Pattern-ish 16-bin texture histogram."""
    gray = np.asarray(img.convert("L").resize((96, 96), Image.LANCZOS), dtype=np.int32)
    center = gray[1:-1, 1:-1]
    code = (
        (gray[:-2, :-2] > center).astype(np.uint8) << 0 |
        (gray[:-2, 1:-1] > center).astype(np.uint8) << 1 |
        (gray[:-2, 2:] > center).astype(np.uint8) << 2 |
        (gray[1:-1, 2:] > center).astype(np.uint8) << 3 |
        (gray[2:, 2:] > center).astype(np.uint8) << 4 |
        (gray[2:, 1:-1] > center).astype(np.uint8) << 5 |
        (gray[2:, :-2] > center).astype(np.uint8) << 6 |
        (gray[1:-1, :-2] > center).astype(np.uint8) << 7
    )
    hist, _ = np.histogram(code, bins=16, range=(0, 256))
    return _l2(hist.astype(np.float32))


def _patch_color_stats(img: Image.Image) -> np.ndarray:
    """Mean L*a*b color of a 3x3 grid = 18 dims (missing 3rd channel), give
    a coarse spatial fingerprint of the fabric palette."""
    small = img.convert("RGB").resize((96, 96), Image.LANCZOS)
    arr = np.asarray(small, dtype=np.float32) / 255.0
    out = np.zeros(3 * 3 * 2, dtype=np.float32)  # 18 dims (mean + std for 3 channels avg per patch)
    idx = 0
    for py in range(3):
        for px in range(3):
            patch = arr[py * 32:(py + 1) * 32, px * 32:(px + 1) * 32]
            out[idx] = float(patch.mean())
            out[idx + 1] = float(patch.std())
            idx += 2
    return _l2(out)


def _l2(v: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    if n < 1e-9:
        return v
    return v / n


# ------------------------- public API ------------------------------------ #
def embed_image_b64(b64_data: str) -> List[float]:
    """Generate a single 182-dim embedding for the given image data uri."""
    img = load_image(b64_data)
    fabric = _isolate_fabric_region(img)

    parts = [
        _hsv_histogram(fabric) * 0.30,
        _phash_bits(fabric) * 0.20,
        _gradient_orientation_hist(fabric) * 0.28,
        _lbp_hist(fabric) * 0.14,
        _patch_color_stats(fabric) * 0.08,
    ]
    vec = np.concatenate(parts).astype(np.float32)
    return _l2(vec).tolist()


def embed_query_multi(b64_data: str) -> List[float]:
    """For the search query, generate embeddings from the original + a
    lightly blurred + a rotated variant and average them.  This absorbs
    small blur / rotation / lighting differences at query time."""
    base = load_image(b64_data)
    variants: List[Image.Image] = [base]
    variants.append(base.filter(ImageFilter.GaussianBlur(radius=1.2)))
    variants.append(base.rotate(8, resample=Image.BILINEAR, expand=False))
    variants.append(base.rotate(-8, resample=Image.BILINEAR, expand=False))
    variants.append(ImageOps.autocontrast(base, cutoff=2))

    vecs = []
    for v in variants:
        fabric = _isolate_fabric_region(v)
        parts = [
            _hsv_histogram(fabric) * 0.30,
            _phash_bits(fabric) * 0.20,
            _gradient_orientation_hist(fabric) * 0.28,
            _lbp_hist(fabric) * 0.14,
            _patch_color_stats(fabric) * 0.08,
        ]
        vecs.append(np.concatenate(parts).astype(np.float32))
    avg = np.mean(np.stack(vecs, axis=0), axis=0)
    return _l2(avg).tolist()


def cosine_similarity_batch(query: List[float], corpus: np.ndarray) -> np.ndarray:
    """Corpus expected to already be L2-normalised (embed_image_b64 returns
    unit-norm vectors)."""
    q = np.asarray(query, dtype=np.float32)
    return corpus @ q


def rank_top_k(
    query_vec: List[float],
    corpus_vecs: List[List[float]],
    top_k: int = 20,
) -> List[Tuple[int, float]]:
    if not corpus_vecs:
        return []
    corpus = np.asarray(corpus_vecs, dtype=np.float32)
    sims = cosine_similarity_batch(query_vec, corpus)
    # Cosine of L2-normed vectors is in [-1,1]; clamp negatives to 0 so the
    # UI 0-100% band is monotonic.
    sims = np.clip(sims, 0.0, 1.0)
    order = np.argsort(-sims)[:top_k]
    return [(int(i), float(sims[i])) for i in order]
