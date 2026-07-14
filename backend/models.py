"""Pydantic models for the Fabric Search API."""
from datetime import datetime, timezone
from typing import List, Optional
import uuid

from pydantic import BaseModel, EmailStr, Field


# ---------------------------- Users -------------------------------------- #
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str
    role: str = Field(default="employee", pattern="^(admin|manager|employee)$")


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str
    is_active: bool = True
    created_at: datetime


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


# ---------------------------- Catalogs ----------------------------------- #
class CatalogCreate(BaseModel):
    name: str
    brand: Optional[str] = ""
    manufacturer: Optional[str] = ""
    year: Optional[int] = None
    season: Optional[str] = ""
    description: Optional[str] = ""
    cover_image: Optional[str] = None  # base64 data uri


class CatalogUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    manufacturer: Optional[str] = None
    year: Optional[int] = None
    season: Optional[str] = None
    description: Optional[str] = None
    cover_image: Optional[str] = None


class Catalog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    brand: str = ""
    manufacturer: str = ""
    year: Optional[int] = None
    season: str = ""
    description: str = ""
    cover_image: Optional[str] = None
    design_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None


# ---------------------------- Designs ------------------------------------ #
class DesignCreate(BaseModel):
    design_number: str
    catalog_id: str
    page_number: Optional[int] = None
    color: Optional[str] = ""
    pattern: Optional[str] = ""
    tags: List[str] = []
    remarks: Optional[str] = ""
    image: str  # base64 data uri, primary image


class DesignUpdate(BaseModel):
    design_number: Optional[str] = None
    page_number: Optional[int] = None
    color: Optional[str] = None
    pattern: Optional[str] = None
    tags: Optional[List[str]] = None
    remarks: Optional[str] = None
    image: Optional[str] = None


class Design(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    design_number: str
    catalog_id: str
    catalog_name: str = ""
    brand: str = ""
    page_number: Optional[int] = None
    color: str = ""
    pattern: str = ""
    tags: List[str] = []
    remarks: str = ""
    image: str  # base64 data uri
    thumbnail: str = ""  # small base64 preview
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None


class DesignSearchResult(BaseModel):
    id: str
    design_number: str
    catalog_id: str
    catalog_name: str
    brand: str
    page_number: Optional[int] = None
    color: str
    pattern: str
    tags: List[str] = []
    remarks: str
    thumbnail: str
    similarity: float  # 0..1


# ---------------------------- Search / Favorites ------------------------- #
class SimilaritySearchRequest(BaseModel):
    image: str  # base64 data uri
    top_k: int = 20
    min_similarity: float = 0.0


class TextSearchRequest(BaseModel):
    query: Optional[str] = ""
    color: Optional[str] = None
    brand: Optional[str] = None
    pattern: Optional[str] = None
    catalog_id: Optional[str] = None
    tag: Optional[str] = None
    limit: int = 50


class FavoriteCreate(BaseModel):
    design_id: str


class Favorite(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    design_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RecentSearch(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    query_type: str  # "image" | "text"
    query_text: str = ""
    thumbnail: str = ""  # base64 preview of the query image
    top_design_id: Optional[str] = None
    top_similarity: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DuplicatePair(BaseModel):
    design_a_id: str
    design_a_number: str
    design_a_thumb: str
    design_b_id: str
    design_b_number: str
    design_b_thumb: str
    similarity: float


class DashboardStats(BaseModel):
    users: int
    catalogs: int
    designs: int
    searches_last_7d: int
    duplicates_estimate: int
    storage_bytes: int
