"""Emergent Managed Object Storage helper.

Why this exists:
  Customer photos and completion photos used to be written to /app/static/...
  on the container's local disk. That disk is *ephemeral* — every redeploy
  wipes it, which means every customer photo uploaded since the last deploy
  is lost. We now persist those uploads to Emergent's managed object storage
  and only fall back to disk for legacy records.

Public surface:
  - init_storage()                 -> str        (call once at startup)
  - put_bytes(path, data, ctype)   -> dict       (upload, returns server result)
  - get_bytes(path)                -> tuple      (download bytes + content-type)
  - object_exists(path)            -> bool

Conventions:
  - All paths MUST start with the APP_NAME prefix (no leading slash).
  - On any error we log and re-raise — callers decide whether to fallback.
"""

from __future__ import annotations

import logging
import os
from typing import Optional, Tuple

import requests

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "text2toss"

_storage_key: Optional[str] = None


def _emergent_key() -> str:
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY is not set; cannot init object storage")
    return key


def init_storage(force: bool = False) -> str:
    """Init or refresh the storage session key. Idempotent."""
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(
        f"{STORAGE_URL}/init",
        json={"emergent_key": _emergent_key()},
        timeout=30,
    )
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    logger.info("Object storage initialized (app=%s)", APP_NAME)
    return _storage_key


def is_configured() -> bool:
    """True iff a storage key has been obtained (post-init)."""
    return _storage_key is not None


def _request_with_refresh(method: str, url: str, **kwargs) -> requests.Response:
    """Issue a request; on 403 (expired key) refresh and retry once."""
    key = init_storage()
    headers = kwargs.pop("headers", {}) or {}
    headers["X-Storage-Key"] = key
    resp = requests.request(method, url, headers=headers, **kwargs)
    if resp.status_code == 403:
        key = init_storage(force=True)
        headers["X-Storage-Key"] = key
        resp = requests.request(method, url, headers=headers, **kwargs)
    return resp


def put_bytes(path: str, data: bytes, content_type: str) -> dict:
    """Upload raw bytes. Path must already include APP_NAME prefix."""
    if not path.startswith(f"{APP_NAME}/"):
        raise ValueError(f"path must start with '{APP_NAME}/'")
    resp = _request_with_refresh(
        "PUT",
        f"{STORAGE_URL}/objects/{path}",
        headers={"Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_bytes(path: str) -> Tuple[bytes, str]:
    """Download bytes. Returns (content, content_type). Raises on 4xx/5xx."""
    resp = _request_with_refresh(
        "GET",
        f"{STORAGE_URL}/objects/{path}",
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def object_exists(path: str) -> bool:
    """Cheap check — try GET and treat 404 as "no", anything else as "yes"."""
    try:
        resp = _request_with_refresh("GET", f"{STORAGE_URL}/objects/{path}", timeout=20)
        return resp.status_code == 200
    except Exception as exc:  # network / 5xx — treat as "unknown / no"
        logger.warning("object_exists(%s) failed: %s", path, exc)
        return False


def storage_path(folder: str, filename: str) -> str:
    """Build a canonical storage path: text2toss/<folder>/<filename>."""
    return f"{APP_NAME}/{folder}/{filename}"


def looks_like_storage_path(value: str) -> bool:
    """Heuristic: True if `value` looks like a storage key (not a disk path)."""
    if not value:
        return False
    return value.startswith(f"{APP_NAME}/")
