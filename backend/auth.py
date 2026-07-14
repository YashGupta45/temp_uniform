"""JWT auth, password hashing, and role-based dependencies."""
from datetime import datetime, timedelta, timezone
import os
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from models import UserPublic

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
JWT_ALG = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_EXP_MIN = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

_ROLE_ORDER = {"employee": 1, "manager": 2, "admin": 3}

_bearer = HTTPBearer(auto_error=False)


# ---------------------------- Password hashing --------------------------- #
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ---------------------------- JWT --------------------------------------- #
def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ACCESS_EXP_MIN)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None


# ---------------------------- Dependencies ------------------------------ #
async def _load_user(user_id: str):
    from server import db  # local import to avoid circulars at import time
    return await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})


async def current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> UserPublic:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_doc = await _load_user(payload["sub"])
    if not user_doc or not user_doc.get("is_active", True):
        raise HTTPException(status_code=401, detail="User not found or disabled")
    return UserPublic(**user_doc)


def require_role(min_role: str):
    async def _dep(user: UserPublic = Depends(current_user)) -> UserPublic:
        if _ROLE_ORDER.get(user.role, 0) < _ROLE_ORDER.get(min_role, 99):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires {min_role} role",
            )
        return user
    return _dep
