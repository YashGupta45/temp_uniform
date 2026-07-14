"""Idempotent seeding of admin + sample catalog & designs.

Runs on FastAPI startup.  Safe to invoke repeatedly.
"""
from __future__ import annotations

import base64
import io
import os
import random
import uuid
from datetime import datetime, timezone

from PIL import Image, ImageDraw

from auth import hash_password
from similarity import embed_image_b64, make_thumbnail_b64


def _png_data_uri(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _fabric_check(size=256, c1=(220, 40, 40), c2=(30, 30, 30), gap=32) -> str:
    img = Image.new("RGB", (size, size), c1)
    d = ImageDraw.Draw(img)
    for x in range(0, size, gap):
        d.rectangle([x, 0, x + gap // 2, size], fill=c2)
    for y in range(0, size, gap):
        d.rectangle([0, y, size, y + gap // 2], fill=(0, 0, 0, 128) if False else c2)
    return _png_data_uri(img)


def _fabric_stripe(size=256, c1=(20, 60, 160), c2=(240, 240, 240), gap=20) -> str:
    img = Image.new("RGB", (size, size), c1)
    d = ImageDraw.Draw(img)
    for x in range(0, size, gap * 2):
        d.rectangle([x, 0, x + gap, size], fill=c2)
    return _png_data_uri(img)


def _fabric_dots(size=256, bg=(245, 240, 225), dot=(120, 40, 20), r=12, gap=32) -> str:
    img = Image.new("RGB", (size, size), bg)
    d = ImageDraw.Draw(img)
    for y in range(gap, size, gap):
        for x in range(gap, size, gap):
            d.ellipse([x - r, y - r, x + r, y + r], fill=dot)
    return _png_data_uri(img)


def _fabric_weave(size=256, base=(90, 110, 90)) -> str:
    img = Image.new("RGB", (size, size), base)
    px = img.load()
    for y in range(size):
        for x in range(size):
            n = ((x + y) % 6 < 3) ^ ((x - y) % 6 < 3)
            v = 25 if n else -25
            r, g, b = base
            px[x, y] = (max(0, min(255, r + v)), max(0, min(255, g + v)), max(0, min(255, b + v)))
    return _png_data_uri(img)


def _fabric_floral(size=256) -> str:
    img = Image.new("RGB", (size, size), (250, 245, 240))
    d = ImageDraw.Draw(img)
    random.seed(7)
    for _ in range(24):
        cx, cy = random.randint(20, size - 20), random.randint(20, size - 20)
        col = (random.randint(150, 220), random.randint(60, 130), random.randint(60, 130))
        for a in range(0, 360, 45):
            import math
            dx = int(14 * math.cos(math.radians(a)))
            dy = int(14 * math.sin(math.radians(a)))
            d.ellipse([cx + dx - 8, cy + dy - 8, cx + dx + 8, cy + dy + 8], fill=col)
        d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=(240, 200, 60))
    return _png_data_uri(img)


SEED_DESIGNS = [
    # design_number, color, pattern, tags, image_fn
    ("UNI-001", "Red / Black", "Check", ["school", "uniform", "red"], _fabric_check),
    ("UNI-002", "Blue / White", "Stripe", ["formal", "shirt", "stripe"], _fabric_stripe),
    ("UNI-003", "Beige / Brown", "Polka", ["casual", "dots"], _fabric_dots),
    ("UNI-004", "Olive", "Weave", ["army", "solid", "weave"], _fabric_weave),
    ("UNI-005", "Ivory / Rose", "Floral", ["dress", "floral"], _fabric_floral),
    ("UNI-006", "Navy / Grey", "Stripe", ["corporate", "stripe"],
     lambda: _fabric_stripe(c1=(20, 30, 80), c2=(170, 170, 170), gap=16)),
    ("UNI-007", "Charcoal", "Check", ["formal", "check"],
     lambda: _fabric_check(c1=(60, 60, 60), c2=(160, 160, 160), gap=24)),
    ("UNI-008", "Maroon", "Solid", ["uniform", "solid"],
     lambda: _fabric_weave(base=(120, 20, 30))),
]


async def seed_all(db) -> None:
    # ----------------- Admin ------------------
    admin_email = os.environ.get("SEED_ADMIN_EMAIL", "admin@fabric.app")
    admin_pass = os.environ.get("SEED_ADMIN_PASSWORD", "Admin@123")

    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Administrator",
            "hashed_password": hash_password(admin_pass),
            "role": "admin",
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
        })

    # A manager & employee demo user (idempotent)
    for email, name, pwd, role in [
        ("manager@fabric.app", "Manager Demo", "Manager@123", "manager"),
        ("employee@fabric.app", "Employee Demo", "Employee@123", "employee"),
    ]:
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": email,
                "name": name,
                "hashed_password": hash_password(pwd),
                "role": role,
                "is_active": True,
                "created_at": datetime.now(timezone.utc),
            })

    # ----------------- Sample catalog + designs ------------------
    if await db.catalogs.count_documents({}) == 0:
        catalog_id = str(uuid.uuid4())
        await db.catalogs.insert_one({
            "id": catalog_id,
            "name": "Spring / Summer Uniforms 2026",
            "brand": "Emergent Textiles",
            "manufacturer": "Emergent Mills",
            "year": 2026,
            "season": "SS",
            "description": "Demo catalog with 8 uniform swatches.",
            "cover_image": _fabric_stripe(),
            "design_count": 0,
            "created_at": datetime.now(timezone.utc),
            "created_by": None,
        })

        added = 0
        for i, (num, color, pattern, tags, fn) in enumerate(SEED_DESIGNS, start=1):
            img = fn()
            emb = embed_image_b64(img)
            thumb = make_thumbnail_b64(img, side=256)
            await db.designs.insert_one({
                "id": str(uuid.uuid4()),
                "design_number": num,
                "catalog_id": catalog_id,
                "catalog_name": "Spring / Summer Uniforms 2026",
                "brand": "Emergent Textiles",
                "page_number": i,
                "color": color,
                "pattern": pattern,
                "tags": tags,
                "remarks": "",
                "image": img,
                "thumbnail": thumb,
                "embedding": emb,
                "created_at": datetime.now(timezone.utc),
                "created_by": None,
            })
            added += 1

        await db.catalogs.update_one({"id": catalog_id}, {"$set": {"design_count": added}})
