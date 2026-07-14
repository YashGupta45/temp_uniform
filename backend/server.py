"""Fabric Design Search API — FastAPI + MongoDB + custom similarity search."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional
import uuid

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Bootstrapping DB before importing modules that need it.
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# Local imports (need db above to be set for auth.current_user).
from auth import (  # noqa: E402
    create_access_token,
    current_user,
    hash_password,
    require_role,
    verify_password,
)
from models import (  # noqa: E402
    Catalog,
    CatalogCreate,
    CatalogUpdate,
    DashboardStats,
    Design,
    DesignCreate,
    DesignSearchResult,
    DesignUpdate,
    DuplicatePair,
    Favorite,
    FavoriteCreate,
    RecentSearch,
    SimilaritySearchRequest,
    TextSearchRequest,
    Token,
    UserCreate,
    UserLogin,
    UserPublic,
)
from seed import seed_all  # noqa: E402
from similarity import (  # noqa: E402
    embed_image_b64,
    embed_query_multi,
    make_thumbnail_b64,
    rank_top_k,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("fabric-api")

app = FastAPI(title="AI Fabric Design Search API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------- helpers ------------------------------------------ #
def _strip_mongo(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


async def _record_search(user_id: str, query_type: str, query_text: str,
                         thumb: str, top: Optional[dict], top_sim: float):
    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "query_type": query_type,
        "query_text": query_text,
        "thumbnail": thumb,
        "top_design_id": top["id"] if top else None,
        "top_similarity": top_sim,
        "created_at": datetime.now(timezone.utc),
    }
    await db.search_history.insert_one(rec)


# ---------------------- lifecycle --------------------------------------- #
@app.on_event("startup")
async def _startup():
    # Indexes for uniqueness / performance
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.catalogs.create_index("id", unique=True)
    await db.designs.create_index("id", unique=True)
    await db.designs.create_index("design_number")
    await db.designs.create_index("catalog_id")
    await db.favorites.create_index([("user_id", 1), ("design_id", 1)], unique=True)
    await db.search_history.create_index([("user_id", 1), ("created_at", -1)])

    await seed_all(db)
    logger.info("Startup seeding complete.")


@app.on_event("shutdown")
async def _shutdown():
    client.close()


# =========================================================================
#                               AUTH
# =========================================================================
@app.get("/api/")
async def root():
    return {"message": "AI Fabric Design Search API", "version": "1.0.0"}


@app.get("/api/health")
async def health():
    designs = await db.designs.count_documents({})
    return {"ok": True, "designs": designs}


@app.post("/api/auth/login", response_model=Token)
async def login(payload: UserLogin):
    doc = await db.users.find_one({"email": payload.email.lower()})
    if not doc or not verify_password(payload.password, doc["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not doc.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    tok = create_access_token(doc["id"], doc["role"])
    doc = _strip_mongo(doc)
    doc.pop("hashed_password", None)
    return Token(access_token=tok, user=UserPublic(**doc))


@app.post("/api/auth/register", response_model=UserPublic)
async def register(
    payload: UserCreate,
    _admin: UserPublic = Depends(require_role("admin")),
):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": payload.name,
        "hashed_password": hash_password(payload.password),
        "role": payload.role,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(doc)
    out = _strip_mongo(dict(doc))
    out.pop("hashed_password", None)
    return UserPublic(**out)


@app.get("/api/auth/me", response_model=UserPublic)
async def me(user: UserPublic = Depends(current_user)):
    return user


@app.get("/api/auth/users", response_model=List[UserPublic])
async def list_users(_admin: UserPublic = Depends(require_role("admin"))):
    docs = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(500)
    return [UserPublic(**d) for d in docs]


# =========================================================================
#                               CATALOGS
# =========================================================================
@app.post("/api/catalogs", response_model=Catalog)
async def create_catalog(
    payload: CatalogCreate,
    user: UserPublic = Depends(require_role("manager")),
):
    obj = Catalog(**payload.dict(), created_by=user.id)
    await db.catalogs.insert_one(obj.dict())
    return obj


@app.get("/api/catalogs", response_model=List[Catalog])
async def list_catalogs(_user: UserPublic = Depends(current_user)):
    docs = await db.catalogs.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Catalog(**d) for d in docs]


@app.get("/api/catalogs/{catalog_id}", response_model=Catalog)
async def get_catalog(catalog_id: str, _user: UserPublic = Depends(current_user)):
    doc = await db.catalogs.find_one({"id": catalog_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Catalog not found")
    return Catalog(**doc)


@app.patch("/api/catalogs/{catalog_id}", response_model=Catalog)
async def update_catalog(
    catalog_id: str,
    payload: CatalogUpdate,
    _user: UserPublic = Depends(require_role("manager")),
):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    r = await db.catalogs.update_one({"id": catalog_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Catalog not found")
    # If name/brand changed, propagate to designs so search results stay correct.
    prop = {}
    if "name" in updates: prop["catalog_name"] = updates["name"]
    if "brand" in updates: prop["brand"] = updates["brand"]
    if prop:
        await db.designs.update_many({"catalog_id": catalog_id}, {"$set": prop})
    doc = await db.catalogs.find_one({"id": catalog_id}, {"_id": 0})
    return Catalog(**doc)


@app.delete("/api/catalogs/{catalog_id}")
async def delete_catalog(
    catalog_id: str,
    _admin: UserPublic = Depends(require_role("admin")),
):
    await db.designs.delete_many({"catalog_id": catalog_id})
    r = await db.catalogs.delete_one({"id": catalog_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Catalog not found")
    return {"deleted": True}


# =========================================================================
#                               DESIGNS
# =========================================================================
@app.post("/api/designs", response_model=Design)
async def create_design(
    payload: DesignCreate,
    user: UserPublic = Depends(require_role("manager")),
):
    catalog = await db.catalogs.find_one({"id": payload.catalog_id}, {"_id": 0})
    if not catalog:
        raise HTTPException(status_code=404, detail="Catalog not found")

    try:
        embedding = embed_image_b64(payload.image)
        thumb = make_thumbnail_b64(payload.image, side=256)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bad image data: {e}")

    doc = Design(
        design_number=payload.design_number,
        catalog_id=payload.catalog_id,
        catalog_name=catalog["name"],
        brand=catalog.get("brand", ""),
        page_number=payload.page_number,
        color=payload.color or "",
        pattern=payload.pattern or "",
        tags=payload.tags or [],
        remarks=payload.remarks or "",
        image=payload.image,
        thumbnail=thumb,
        created_by=user.id,
    ).dict()
    doc["embedding"] = embedding
    await db.designs.insert_one(doc)
    await db.catalogs.update_one({"id": payload.catalog_id}, {"$inc": {"design_count": 1}})
    doc.pop("embedding", None)
    return Design(**doc)


@app.get("/api/designs/{design_id}", response_model=Design)
async def get_design(design_id: str, _user: UserPublic = Depends(current_user)):
    doc = await db.designs.find_one({"id": design_id}, {"_id": 0, "embedding": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Design not found")
    return Design(**doc)


@app.get("/api/designs", response_model=List[Design])
async def list_designs(
    catalog_id: Optional[str] = Query(None),
    limit: int = Query(200, le=500),
    _user: UserPublic = Depends(current_user),
):
    q = {}
    if catalog_id: q["catalog_id"] = catalog_id
    docs = await db.designs.find(q, {"_id": 0, "embedding": 0}).sort("created_at", -1).to_list(limit)
    return [Design(**d) for d in docs]


@app.patch("/api/designs/{design_id}", response_model=Design)
async def update_design(
    design_id: str,
    payload: DesignUpdate,
    _user: UserPublic = Depends(require_role("manager")),
):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if "image" in updates:
        try:
            updates["embedding"] = embed_image_b64(updates["image"])
            updates["thumbnail"] = make_thumbnail_b64(updates["image"], side=256)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Bad image data: {e}")
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    r = await db.designs.update_one({"id": design_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Design not found")
    doc = await db.designs.find_one({"id": design_id}, {"_id": 0, "embedding": 0})
    return Design(**doc)


@app.delete("/api/designs/{design_id}")
async def delete_design(
    design_id: str,
    _user: UserPublic = Depends(require_role("manager")),
):
    doc = await db.designs.find_one({"id": design_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Design not found")
    await db.designs.delete_one({"id": design_id})
    await db.catalogs.update_one({"id": doc["catalog_id"]}, {"$inc": {"design_count": -1}})
    return {"deleted": True}


# =========================================================================
#                              SIMILARITY SEARCH
# =========================================================================
@app.post("/api/search/similar", response_model=List[DesignSearchResult])
async def search_similar(
    req: SimilaritySearchRequest,
    user: UserPublic = Depends(current_user),
):
    try:
        q_vec = embed_query_multi(req.image)
        q_thumb = make_thumbnail_b64(req.image, side=200)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bad image data: {e}")

    docs = await db.designs.find({}, {
        "_id": 0, "image": 0,  # image is heavy; we'll return only thumbnail
    }).to_list(100000)
    if not docs:
        return []

    corpus_vecs = [d.get("embedding") or [] for d in docs]
    # Filter out any designs missing embeddings (shouldn't happen)
    valid_idx = [i for i, v in enumerate(corpus_vecs) if v]
    corpus_vecs = [corpus_vecs[i] for i in valid_idx]
    docs = [docs[i] for i in valid_idx]

    ranked = rank_top_k(q_vec, corpus_vecs, top_k=req.top_k)
    results: List[DesignSearchResult] = []
    for idx, sim in ranked:
        if sim < req.min_similarity:
            continue
        d = docs[idx]
        results.append(DesignSearchResult(
            id=d["id"],
            design_number=d["design_number"],
            catalog_id=d["catalog_id"],
            catalog_name=d.get("catalog_name", ""),
            brand=d.get("brand", ""),
            page_number=d.get("page_number"),
            color=d.get("color", ""),
            pattern=d.get("pattern", ""),
            tags=d.get("tags", []),
            remarks=d.get("remarks", ""),
            thumbnail=d.get("thumbnail", ""),
            similarity=sim,
        ))

    top = None
    top_sim = 0.0
    if ranked:
        top = docs[ranked[0][0]]
        top_sim = ranked[0][1]
    await _record_search(user.id, "image", "", q_thumb, top, top_sim)
    return results


@app.post("/api/search/text", response_model=List[Design])
async def search_text(
    req: TextSearchRequest,
    user: UserPublic = Depends(current_user),
):
    q: dict = {}
    if req.query:
        # Case-insensitive substring on design_number OR tags OR pattern OR color
        rx = {"$regex": req.query, "$options": "i"}
        q["$or"] = [
            {"design_number": rx},
            {"tags": rx},
            {"pattern": rx},
            {"color": rx},
            {"catalog_name": rx},
            {"brand": rx},
            {"remarks": rx},
        ]
    if req.color: q["color"] = {"$regex": req.color, "$options": "i"}
    if req.brand: q["brand"] = {"$regex": req.brand, "$options": "i"}
    if req.pattern: q["pattern"] = {"$regex": req.pattern, "$options": "i"}
    if req.catalog_id: q["catalog_id"] = req.catalog_id
    if req.tag: q["tags"] = req.tag

    docs = await db.designs.find(q, {"_id": 0, "embedding": 0}).limit(req.limit).to_list(req.limit)
    await _record_search(user.id, "text", req.query or "", "", docs[0] if docs else None,
                         1.0 if docs else 0.0)
    return [Design(**d) for d in docs]


@app.get("/api/search/related/{design_id}", response_model=List[DesignSearchResult])
async def related_designs(
    design_id: str,
    top_k: int = 10,
    _user: UserPublic = Depends(current_user),
):
    src = await db.designs.find_one({"id": design_id}, {"_id": 0})
    if not src or not src.get("embedding"):
        raise HTTPException(status_code=404, detail="Design not found")
    docs = await db.designs.find({"id": {"$ne": design_id}}, {"_id": 0, "image": 0}).to_list(100000)
    corpus = [d.get("embedding") or [] for d in docs]
    valid_idx = [i for i, v in enumerate(corpus) if v]
    corpus = [corpus[i] for i in valid_idx]
    docs = [docs[i] for i in valid_idx]
    ranked = rank_top_k(src["embedding"], corpus, top_k=top_k)
    return [
        DesignSearchResult(
            id=docs[i]["id"],
            design_number=docs[i]["design_number"],
            catalog_id=docs[i]["catalog_id"],
            catalog_name=docs[i].get("catalog_name", ""),
            brand=docs[i].get("brand", ""),
            page_number=docs[i].get("page_number"),
            color=docs[i].get("color", ""),
            pattern=docs[i].get("pattern", ""),
            tags=docs[i].get("tags", []),
            remarks=docs[i].get("remarks", ""),
            thumbnail=docs[i].get("thumbnail", ""),
            similarity=sim,
        )
        for i, sim in ranked
    ]


@app.get("/api/search/recent", response_model=List[RecentSearch])
async def recent_searches(user: UserPublic = Depends(current_user)):
    docs = await db.search_history.find({"user_id": user.id}, {"_id": 0})\
        .sort("created_at", -1).limit(20).to_list(20)
    return [RecentSearch(**d) for d in docs]


# =========================================================================
#                               FAVORITES
# =========================================================================
@app.post("/api/favorites", response_model=Favorite)
async def add_favorite(
    payload: FavoriteCreate,
    user: UserPublic = Depends(current_user),
):
    if not await db.designs.find_one({"id": payload.design_id}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=404, detail="Design not found")
    existing = await db.favorites.find_one(
        {"user_id": user.id, "design_id": payload.design_id}, {"_id": 0}
    )
    if existing:
        return Favorite(**existing)
    fav = Favorite(user_id=user.id, design_id=payload.design_id)
    await db.favorites.insert_one(fav.dict())
    return fav


@app.delete("/api/favorites/{design_id}")
async def remove_favorite(design_id: str, user: UserPublic = Depends(current_user)):
    r = await db.favorites.delete_one({"user_id": user.id, "design_id": design_id})
    return {"deleted": r.deleted_count > 0}


@app.get("/api/favorites", response_model=List[Design])
async def list_favorites(user: UserPublic = Depends(current_user)):
    favs = await db.favorites.find({"user_id": user.id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = [f["design_id"] for f in favs]
    if not ids:
        return []
    docs = await db.designs.find({"id": {"$in": ids}}, {"_id": 0, "embedding": 0}).to_list(500)
    order = {i: n for n, i in enumerate(ids)}
    docs.sort(key=lambda d: order.get(d["id"], 1e9))
    return [Design(**d) for d in docs]


# =========================================================================
#                             ADMIN / ANALYTICS
# =========================================================================
@app.get("/api/admin/stats", response_model=DashboardStats)
async def stats(_user: UserPublic = Depends(require_role("manager"))):
    users_count = await db.users.count_documents({})
    catalogs_count = await db.catalogs.count_documents({})
    designs_count = await db.designs.count_documents({})
    since = datetime.now(timezone.utc) - timedelta(days=7)
    searches_7d = await db.search_history.count_documents({"created_at": {"$gte": since}})

    # Storage estimate = sum of raw image lengths (approx bytes)
    total_bytes = 0
    async for d in db.designs.find({}, {"_id": 0, "image": 1}):
        total_bytes += len(d.get("image", ""))
    async for c in db.catalogs.find({}, {"_id": 0, "cover_image": 1}):
        total_bytes += len(c.get("cover_image") or "")

    # rough duplicate estimate (bounded)
    dup_estimate = 0
    docs = await db.designs.find({}, {"_id": 0, "id": 1, "embedding": 1}).limit(1000).to_list(1000)
    seen = set()
    for i in range(len(docs)):
        if not docs[i].get("embedding"): continue
        if docs[i]["id"] in seen: continue
        ranked = rank_top_k(docs[i]["embedding"],
                            [d["embedding"] for d in docs if d["id"] != docs[i]["id"] and d.get("embedding")],
                            top_k=1)
        if ranked and ranked[0][1] >= 0.96:
            dup_estimate += 1
            seen.add(docs[i]["id"])

    return DashboardStats(
        users=users_count,
        catalogs=catalogs_count,
        designs=designs_count,
        searches_last_7d=searches_7d,
        duplicates_estimate=dup_estimate,
        storage_bytes=total_bytes,
    )


@app.get("/api/admin/duplicates", response_model=List[DuplicatePair])
async def duplicates(
    threshold: float = 0.94,
    _user: UserPublic = Depends(require_role("manager")),
):
    docs = await db.designs.find({}, {"_id": 0, "embedding": 0 if False else 1,
                                       "id": 1, "design_number": 1, "thumbnail": 1}).to_list(5000)
    pairs: List[DuplicatePair] = []
    for i in range(len(docs)):
        if not docs[i].get("embedding"): continue
        rest = docs[i + 1:]
        vecs = [d.get("embedding") or [] for d in rest]
        if not vecs: break
        ranked = rank_top_k(docs[i]["embedding"], vecs, top_k=5)
        for idx, sim in ranked:
            if sim >= threshold:
                b = rest[idx]
                pairs.append(DuplicatePair(
                    design_a_id=docs[i]["id"],
                    design_a_number=docs[i]["design_number"],
                    design_a_thumb=docs[i].get("thumbnail", ""),
                    design_b_id=b["id"],
                    design_b_number=b["design_number"],
                    design_b_thumb=b.get("thumbnail", ""),
                    similarity=sim,
                ))
    return pairs[:200]


@app.post("/api/admin/regenerate-embeddings")
async def regenerate_embeddings(
    _admin: UserPublic = Depends(require_role("admin")),
):
    updated = 0
    async for d in db.designs.find({}, {"_id": 0, "id": 1, "image": 1}):
        try:
            emb = embed_image_b64(d["image"])
            thumb = make_thumbnail_b64(d["image"], side=256)
            await db.designs.update_one({"id": d["id"]}, {"$set": {"embedding": emb, "thumbnail": thumb}})
            updated += 1
        except Exception as e:  # pragma: no cover
            logger.warning("Skip %s: %s", d.get("id"), e)
    return {"updated": updated}
