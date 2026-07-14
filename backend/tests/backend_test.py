"""End-to-end pytest for the AI Fabric Design Search backend.

Covers: auth, RBAC, catalogs/designs CRUD, similarity + text search,
favorites, admin stats/duplicates/regenerate, and Mongo _id leakage.
"""
from __future__ import annotations

import base64
import io
import os
import uuid

import pytest
import requests
from PIL import Image

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL") else "https://design-search-4.preview.emergentagent.com"

ADMIN = {"email": "admin@fabric.app", "password": "Admin@123"}
MANAGER = {"email": "manager@fabric.app", "password": "Manager@123"}
EMPLOYEE = {"email": "employee@fabric.app", "password": "Employee@123"}


# ---------- helpers ----------
def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _no_underscore_id(obj):
    """Recursively assert no key '_id' exists anywhere."""
    if isinstance(obj, dict):
        assert "_id" not in obj, f"Found _id in {obj}"
        for v in obj.values():
            _no_underscore_id(v)
    elif isinstance(obj, list):
        for i in obj:
            _no_underscore_id(i)


def _make_png_data_uri(color=(200, 100, 50), size=128) -> str:
    img = Image.new("RGB", (size, size), color)
    # add slight pattern so embedding is non-trivial
    for x in range(0, size, 16):
        for y in range(0, size, 16):
            img.putpixel((x, y), (10, 10, 10))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_tok():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def manager_tok():
    return _login(MANAGER)


@pytest.fixture(scope="session")
def employee_tok():
    return _login(EMPLOYEE)


# ---------- AUTH ----------
class TestAuth:
    def test_login_admin_success(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data and data["user"]["role"] == "admin"
        _no_underscore_id(data)

    def test_login_wrong_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN["email"], "password": "wrong-pass"}, timeout=30)
        assert r.status_code == 401

    def test_auth_me(self, admin_tok):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(admin_tok), timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN["email"]

    def test_register_as_employee_forbidden(self, employee_tok):
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          headers=_hdr(employee_tok),
                          json={"email": f"TEST_{uuid.uuid4().hex[:6]}@x.com",
                                "password": "Passw0rd!", "name": "T", "role": "manager"},
                          timeout=30)
        assert r.status_code == 403

    def test_register_as_admin_creates_manager(self, admin_tok):
        email = f"test_{uuid.uuid4().hex[:8]}@fabric.app"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          headers=_hdr(admin_tok),
                          json={"email": email, "password": "Passw0rd!",
                                "name": "TEST Manager", "role": "manager"},
                          timeout=30)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["role"] == "manager" and u["email"] == email
        _no_underscore_id(u)


# ---------- CATALOGS RBAC + LIST ----------
class TestCatalogs:
    def test_list_catalogs_returns_seeded(self, admin_tok):
        r = requests.get(f"{BASE_URL}/api/catalogs", headers=_hdr(admin_tok), timeout=30)
        assert r.status_code == 200
        catalogs = r.json()
        assert len(catalogs) >= 1
        assert any("Uniforms 2026" in c["name"] for c in catalogs)
        assert all(c["design_count"] >= 8 for c in catalogs if "Uniforms 2026" in c["name"])
        _no_underscore_id(catalogs)

    def test_employee_get_catalogs_ok(self, employee_tok):
        r = requests.get(f"{BASE_URL}/api/catalogs", headers=_hdr(employee_tok), timeout=30)
        assert r.status_code == 200

    def test_employee_create_catalog_forbidden(self, employee_tok):
        r = requests.post(f"{BASE_URL}/api/catalogs",
                          headers=_hdr(employee_tok),
                          json={"name": "TEST_should_fail"}, timeout=30)
        assert r.status_code == 403


# ---------- DESIGNS ----------
class TestDesigns:
    def test_list_designs_no_embedding(self, admin_tok):
        cats = requests.get(f"{BASE_URL}/api/catalogs", headers=_hdr(admin_tok)).json()
        cid = cats[0]["id"]
        r = requests.get(f"{BASE_URL}/api/designs?catalog_id={cid}",
                         headers=_hdr(admin_tok), timeout=30)
        assert r.status_code == 200
        designs = r.json()
        assert len(designs) >= 8
        for d in designs:
            assert "id" in d and "design_number" in d
            assert "thumbnail" in d and "image" in d
            assert "embedding" not in d
        _no_underscore_id(designs)


# ---------- SEARCH ----------
class TestSearch:
    def test_similar_returns_top20_with_high_top1(self, admin_tok):
        # use a seeded thumbnail as the query
        designs = requests.get(f"{BASE_URL}/api/designs",
                               headers=_hdr(admin_tok)).json()
        target = designs[0]
        thumb = target["thumbnail"]
        r = requests.post(f"{BASE_URL}/api/search/similar",
                          headers=_hdr(admin_tok),
                          json={"image": thumb, "top_k": 20}, timeout=60)
        assert r.status_code == 200, r.text
        results = r.json()
        assert len(results) > 0
        assert len(results) <= 20
        # top-1 must be the queried design and highly similar
        assert results[0]["id"] == target["id"], f"Top-1 mismatch. Got {results[0]['design_number']} exp {target['design_number']}"
        assert results[0]["similarity"] >= 0.9
        _no_underscore_id(results)

    def test_text_search_exact_design_number(self, admin_tok):
        r = requests.post(f"{BASE_URL}/api/search/text",
                          headers=_hdr(admin_tok),
                          json={"query": "UNI-001"}, timeout=30)
        assert r.status_code == 200
        res = r.json()
        # Must include UNI-001
        assert any(d["design_number"] == "UNI-001" for d in res)

    def test_text_search_pattern_stripe(self, admin_tok):
        r = requests.post(f"{BASE_URL}/api/search/text",
                          headers=_hdr(admin_tok),
                          json={"pattern": "Stripe"}, timeout=30)
        assert r.status_code == 200
        res = r.json()
        assert len(res) >= 1
        for d in res:
            assert "stripe" in d["pattern"].lower(), f"Non-stripe leaked: {d}"

    def test_related_designs(self, admin_tok):
        designs = requests.get(f"{BASE_URL}/api/designs",
                               headers=_hdr(admin_tok)).json()
        did = designs[0]["id"]
        r = requests.get(f"{BASE_URL}/api/search/related/{did}",
                         headers=_hdr(admin_tok), timeout=30)
        assert r.status_code == 200
        res = r.json()
        assert 1 <= len(res) <= 10
        sims = [x["similarity"] for x in res]
        assert sims == sorted(sims, reverse=True), "Related not sorted desc"


# ---------- FAVORITES ----------
class TestFavorites:
    def test_favorite_cycle(self, employee_tok, admin_tok):
        designs = requests.get(f"{BASE_URL}/api/designs",
                               headers=_hdr(admin_tok)).json()
        did = designs[0]["id"]
        # add
        r = requests.post(f"{BASE_URL}/api/favorites",
                          headers=_hdr(employee_tok),
                          json={"design_id": did}, timeout=30)
        assert r.status_code == 200
        # list
        r = requests.get(f"{BASE_URL}/api/favorites",
                         headers=_hdr(employee_tok), timeout=30)
        assert r.status_code == 200
        favs = r.json()
        assert any(d["id"] == did for d in favs)
        _no_underscore_id(favs)
        # delete
        r = requests.delete(f"{BASE_URL}/api/favorites/{did}",
                            headers=_hdr(employee_tok), timeout=30)
        assert r.status_code == 200
        assert r.json()["deleted"] is True


# ---------- CRUD full cycle (admin) ----------
class TestCRUDCycle:
    def test_create_catalog_design_update_delete(self, admin_tok):
        # create catalog
        cname = f"TEST_cat_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/catalogs", headers=_hdr(admin_tok),
                          json={"name": cname, "brand": "TESTBRAND"}, timeout=30)
        assert r.status_code == 200, r.text
        cat = r.json()
        cid = cat["id"]
        assert cat["design_count"] == 0

        # create design
        img = _make_png_data_uri()
        r = requests.post(f"{BASE_URL}/api/designs", headers=_hdr(admin_tok),
                          json={"design_number": "TEST-D-001", "catalog_id": cid,
                                "pattern": "Test", "image": img}, timeout=60)
        assert r.status_code == 200, r.text
        design = r.json()
        did = design["id"]
        assert "embedding" not in design

        # verify catalog design_count incremented
        r = requests.get(f"{BASE_URL}/api/catalogs/{cid}", headers=_hdr(admin_tok))
        assert r.json()["design_count"] == 1

        # patch design pattern
        r = requests.patch(f"{BASE_URL}/api/designs/{did}", headers=_hdr(admin_tok),
                           json={"pattern": "UpdatedStripe"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["pattern"] == "UpdatedStripe"

        # GET verify
        r = requests.get(f"{BASE_URL}/api/designs/{did}", headers=_hdr(admin_tok))
        assert r.json()["pattern"] == "UpdatedStripe"

        # delete design
        r = requests.delete(f"{BASE_URL}/api/designs/{did}", headers=_hdr(admin_tok))
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/designs/{did}", headers=_hdr(admin_tok))
        assert r.status_code == 404

        # delete catalog
        r = requests.delete(f"{BASE_URL}/api/catalogs/{cid}", headers=_hdr(admin_tok))
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/catalogs/{cid}", headers=_hdr(admin_tok))
        assert r.status_code == 404


# ---------- ADMIN / STATS ----------
class TestAdmin:
    def test_stats_admin(self, admin_tok):
        r = requests.get(f"{BASE_URL}/api/admin/stats",
                         headers=_hdr(admin_tok), timeout=60)
        assert r.status_code == 200, r.text
        s = r.json()
        for k in ["users", "catalogs", "designs", "searches_last_7d",
                  "duplicates_estimate", "storage_bytes"]:
            assert k in s and isinstance(s[k], int), f"{k} missing or not int: {s.get(k)}"

    def test_stats_employee_forbidden(self, employee_tok):
        r = requests.get(f"{BASE_URL}/api/admin/stats",
                         headers=_hdr(employee_tok), timeout=30)
        assert r.status_code == 403

    def test_duplicates_list(self, admin_tok):
        r = requests.get(f"{BASE_URL}/api/admin/duplicates",
                         headers=_hdr(admin_tok), timeout=60)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_regenerate_embeddings(self, admin_tok):
        r = requests.post(f"{BASE_URL}/api/admin/regenerate-embeddings",
                          headers=_hdr(admin_tok), timeout=120)
        assert r.status_code == 200
        assert r.json()["updated"] >= 8
