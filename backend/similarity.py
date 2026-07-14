"""Fabric-focused image embedding + similarity search.

We deliberately combine multiple, complementary descriptors so the search is
robust against lighting, rotation, partial samples, blur, and background:

    - Global color histogram in HSV (illumination-tolerant)   [48 dims]
    - Perceptual hash (pHash, 8x8 DCT bit-vector)             [64 dims]
    - HOG-lite gradient orientation histogram
      captures weave / stripe / check / geometric motifs      [36 dims]
    - Local texture (Local Binary Pattern style) histogram    [16 dims]
    - Multi-scale patch color statistics                      [18 dims]

Each block is L2-normalised then concatenated into one vector so cosine
similarity works well.  Storage is a plain list[float] per design in Mongo;
FAISS is not needed at this scale (<50k designs still respond in <200ms via
numpy dot-product).

Efficiency notes (v2):
    - All descriptors now share ONE grayscale / ONE RGB decode per image
      instead of re-converting and re-resizing inside every descriptor
      (previously: 2x convert("L"), 2x resize, 2x arctan2 per embed).
    - rank_top_k uses np.argpartition (O(n)) instead of full sort (O(n log n)).
    - pairwise_similarity() added for vectorised duplicate detection
      (one matrix multiplication instead of an O(n^2) Python loop).
"""
from __future__ import annotations

import base64
import io
from typing import List, Tuple

import imagehash
import numpy as np
from PIL import Image, ImageFilter, ImageOps


EMBEDDING_DIMS = 48 + 64 + 36 + 16 + 18  # = 182

# Descriptor weights (must stay in sync between index-time and query-time).
_W_HSV, _W_PHASH, _W_GRAD, _W_LBP, _W_PATCH = 0.30, 0.20, 0.28, 0.14, 0.08


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
    """Center-crop ~85% to bias toward the fabric and away from cluttered
    background / hand / edges - simple but effective for handheld cloth photos.
    """
    w, h = img.size
    side = int(min(w, h) * 0.85)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side)).resize((256, 256), Image.LANCZOS)


# ------------------------- individual descriptors ------------------------ #
def _hsv_histogram(hsv_arr: np.ndarray) -> np.ndarray:
    h_hist, _ = np.histogram(hsv_arr[..., 0], bins=24, range=(0, 256))
    s_hist, _ = np.histogram(hsv_arr[..., 1], bins=12, range=(0, 256))
    v_hist, _ = np.histogram(hsv_arr[..., 2], bins=12, range=(0, 256))
    hist = np.concatenate([h_hist, s_hist, v_hist]).astype(np.float32)
    return _l2(hist)


def _phash_bits(img: Image.Image) -> np.ndarray:
    ph = imagehash.phash(img, hash_size=8)
    bits = np.array(ph.hash.flatten(), dtype=np.float32)
    # Map 0/1 to -1/+1 so hamming distance ~ cosine distance
    bits = bits * 2 - 1
    return _l2(bits)


def _gradient_orientation_hist(gray96: np.ndarray) -> np.ndarray:
    """A cheap HOG-lite: 3x3 spatial cells x 4 orientation bins over the
    grayscale gradient (= 36 dims) - highlights weave, stripes, checks."""
    gx = np.zeros_like(gray96)
    gy = np.zeros_like(gray96)
    gx[:, 1:-1] = gray96[:, 2:] - gray96[:, :-2]
    gy[1:-1, :] = gray96[2:, :] - gray96[:-2, :]
    mag = np.sqrt(gx * gx + gy * gy)

    cells, bins = 3, 4
    ch = 96 // cells
    ang = (np.arctan2(gy, gx) + np.pi) / np.pi  # 0..2
    ang_bin = np.clip((ang * bins / 2).astype(np.int32), 0, bins - 1)

    out = np.zeros(cells * cells * bins, dtype=np.float32)
    for cy in range(cells):
        for cx in range(cells):
            m = mag[cy * ch:(cy + 1) * ch, cx * ch:(cx + 1) * ch]
            a = ang_bin[cy * ch:(cy + 1) * ch, cx * ch:(cx + 1) * ch]
            # bincount over the cell replaces the per-bin masked sums
            out[(cy * cells + cx) * bins:(cy * cells + cx) * bins + bins] = \
                np.bincount(a.ravel(), weights=m.ravel(), minlength=bins)[:bins]
    return _l2(out)


def _lbp_hist(gray96: np.ndarray) -> np.ndarray:
    """Local Binary Pattern-ish 16-bin texture histogram."""
    gray = gray96.astype(np.int32)
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


def _patch_color_stats(rgb96: np.ndarray) -> np.ndarray:
    """Mean + std brightness of a 3x3 grid = 18 dims - coarse spatial
    fingerprint of the fabric palette."""
    arr = rgb96 / 255.0
    out = np.zeros(3 * 3 * 2, dtype=np.float32)
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


# ------------------------- shared preprocessing --------------------------- #
def _embed_fabric(fabric: Image.Image) -> np.ndarray:
    """Compute the weighted, concatenated descriptor vector for an already
    isolated 256x256 fabric crop.  Image conversions happen exactly once."""
    hsv_arr = np.asarray(fabric.convert("HSV"), dtype=np.float32)
    # convert-then-resize order matches the original implementation exactly,
    # so embeddings already stored in Mongo remain byte-for-byte compatible.
    gray96 = np.asarray(fabric.convert("L").resize((96, 96), Image.LANCZOS), dtype=np.float32)
    rgb96 = np.asarray(fabric.resize((96, 96), Image.LANCZOS), dtype=np.float32)

    parts = [
        _hsv_histogram(hsv_arr) * _W_HSV,
        _phash_bits(fabric) * _W_PHASH,
        _gradient_orientation_hist(gray96) * _W_GRAD,
        _lbp_hist(gray96) * _W_LBP,
        _patch_color_stats(rgb96) * _W_PATCH,
    ]
    return np.concatenate(parts).astype(np.float32)


# ------------------------- public API ------------------------------------ #
def embed_image_b64(b64_data: str) -> List[float]:
    """Generate a single 182-dim embedding for the given image data uri."""
    img = load_image(b64_data)
    fabric = _isolate_fabric_region(img)
    return _l2(_embed_fabric(fabric)).tolist()


def embed_query_multi(b64_data: str) -> List[float]:
    """For the search query, generate embeddings from the original + a few
    lightly perturbed variants and take a weighted average.  The base image
    is weighted 5x heavier than each perturbation so identity matches stay
    close to 1.0 while blur / rotation / lighting robustness is preserved."""
    base = load_image(b64_data)
    variants: List[Tuple[Image.Image, float]] = [
        (base, 5.0),
        (base.filter(ImageFilter.GaussianBlur(radius=1.2)), 1.0),
        (base.rotate(6, resample=Image.BILINEAR, expand=False), 1.0),
        (base.rotate(-6, resample=Image.BILINEAR, expand=False), 1.0),
        (ImageOps.autocontrast(base, cutoff=2), 1.0),
    ]

    weighted = np.zeros(EMBEDDING_DIMS, dtype=np.float32)
    total_w = 0.0
    for img, w in variants:
        fabric = _isolate_fabric_region(img)
        weighted += _embed_fabric(fabric) * w
        total_w += w
    avg = weighted / max(total_w, 1e-9)
    return _l2(avg).tolist()


def cosine_similarity_batch(query: List[float], corpus: np.ndarray) -> np.ndarray:
    """Corpus expected to already be L2-normalised (embed_image_b64 returns
    unit-norm vectors)."""
    q = np.asarray(query, dtype=np.float32)
    return corpus @ q


def rank_top_k(
    query_vec: List[float],
    corpus_vecs,  # List[List[float]] or an np.ndarray matrix
    top_k: int = 20,
) -> List[Tuple[int, float]]:
    if corpus_vecs is None or len(corpus_vecs) == 0:
        return []
    corpus = np.asarray(corpus_vecs, dtype=np.float32)
    sims = cosine_similarity_batch(query_vec, corpus)
    # Cosine of L2-normed vectors is in [-1,1]; clamp negatives to 0 so the
    # UI 0-100% band is monotonic.
    sims = np.clip(sims, 0.0, 1.0)
    k = min(top_k, sims.shape[0])
    # argpartition = O(n); only sort the k winners.
    part = np.argpartition(-sims, k - 1)[:k]
    order = part[np.argsort(-sims[part])]
    return [(int(i), float(sims[i])) for i in order]


def pairwise_similarity(matrix: np.ndarray, threshold: float) -> List[Tuple[int, int, float]]:
    """Vectorised all-pairs cosine similarity for duplicate detection.

    Returns (i, j, sim) with i < j and sim >= threshold, sorted by sim desc.
    One BLAS matmul replaces the previous O(n^2) Python loop that rebuilt a
    numpy array for every row.  5k x 182 floats -> ~25M-cell matrix, well
    within memory and computed in a fraction of a second.
    """
    if matrix is None or len(matrix) < 2:
        return []
    m = np.asarray(matrix, dtype=np.float32)
    sims = np.clip(m @ m.T, 0.0, 1.0)
    iu, ju = np.triu_indices(len(m), k=1)
    vals = sims[iu, ju]
    keep = vals >= threshold
    pairs = list(zip(iu[keep].tolist(), ju[keep].tolist(), vals[keep].tolist()))
    pairs.sort(key=lambda t: -t[2])
    return pairs
