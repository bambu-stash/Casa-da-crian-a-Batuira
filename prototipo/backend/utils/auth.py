"""
Autenticação: JWT local (HS256), Supabase JWT (ES256) ou API Key.
Modo dev sem Supabase: usa LOCAL_SECRET para assinar/verificar tokens.
"""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import httpx
from fastapi import HTTPException, Security, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError, jwk

from config import settings
from database import get_conn

security = HTTPBearer(auto_error=False)

# Segredo local para JWT quando Supabase não está configurado.
# Gerado uma vez por processo; em produção use LOCAL_SECRET no .env.
_LOCAL_SECRET = os.getenv("LOCAL_SECRET") or secrets.token_hex(32)


def create_local_token(attendant_id: int, email: str) -> str:
    payload = {
        "sub": email,
        "attendant_id": attendant_id,
        "type": "local",
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, _LOCAL_SECRET, algorithm="HS256")


def _verify_local_token(token: str) -> dict:
    payload = jwt.decode(token, _LOCAL_SECRET, algorithms=["HS256"])
    payload["type"] = "local"
    return payload


@lru_cache(maxsize=1)
def _get_jwks() -> list:
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    return resp.json()["keys"]


def _verify_supabase_jwt(token: str) -> dict:
    keys = _get_jwks()
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    alg = header.get("alg", "ES256")
    candidates = [k for k in keys if k.get("kid") == kid] if kid else keys
    for key_data in candidates:
        try:
            public_key = jwk.construct(key_data)
            payload = jwt.decode(token, public_key, algorithms=[alg], options={"verify_aud": False})
            payload["type"] = "jwt"
            return payload
        except JWTError:
            continue
    raise JWTError("Nenhuma chave JWKS válida encontrada")


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _check_api_key(raw: str) -> dict | None:
    h = _hash_key(raw)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, user_email, name FROM api_keys WHERE key_hash=? AND active=1", (h,)
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE api_keys SET last_used_at=datetime('now','localtime') WHERE id=?", (row["id"],)
            )
            return {"sub": row["user_email"], "key_name": row["name"], "type": "api_key"}
    return None


def require_auth(
    credentials: HTTPAuthorizationCredentials = Security(security),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict:
    # 1. Header X-API-Key
    if x_api_key:
        info = _check_api_key(x_api_key)
        if info:
            return info
        raise HTTPException(status_code=401, detail="API Key inválida")

    if not credentials:
        raise HTTPException(status_code=401, detail="Autenticação necessária")

    token = credentials.credentials

    # 2. Bearer btr_... (API key no Authorization)
    if token.startswith("btr_"):
        info = _check_api_key(token)
        if info:
            return info
        raise HTTPException(status_code=401, detail="API Key inválida")

    # 3. JWT local (HS256) — quando Supabase não está configurado
    try:
        unverified = jwt.get_unverified_header(token)
        if unverified.get("alg") == "HS256":
            return _verify_local_token(token)
    except JWTError:
        pass

    # 4. Supabase JWT (ES256 via JWKS)
    if not settings.supabase_url:
        raise HTTPException(status_code=401, detail="Token inválido")
    try:
        return _verify_supabase_jwt(token)
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Token inválido: {e}")
