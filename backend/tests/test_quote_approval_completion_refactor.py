"""
Tests for code-review fixes round 2 (iteration 14).

Refactors under test (no behavior change expected):
- approve_quote() split into:
    _validate_quote_for_approval, _build_quote_update,
    _process_quote_price_increase, _send_quote_approval_decision_email,
    _build_quote_approval_email_html, _build_quote_rejection_email_html
- upload_completion_photo() split into:
    _validate_completion_upload, _save_completion_photo,
    _persist_completion_metadata, _notify_customer_completion
- Description-aware AI quote cache (image_hash + normalized_description),
  new cache_key field with index.

Endpoints exercised:
- POST /api/admin/quotes/{quote_id}/approve
- POST /api/admin/bookings/{booking_id}/completion
- POST /api/quotes/image  (cache key behaviour)
"""
import io
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path
from PIL import Image
from pymongo import MongoClient


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------
def _load_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if url:
        return url.rstrip("/")
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_backend_url()
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "lrobe")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "L1964c10$")


def _load_mongo():
    """Read MONGO_URL/DB_NAME directly from /app/backend/.env (no defaults)."""
    env_path = Path("/app/backend/.env")
    cfg = {}
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            cfg[k.strip()] = v.strip().strip('"').strip("'")
    client = MongoClient(cfg["MONGO_URL"])
    return client[cfg["DB_NAME"]]


db = _load_mongo()


def _make_jpeg_bytes(color=(180, 90, 40), unique=True) -> bytes:
    img = Image.new("RGB", (800, 600), color=color)
    if unique:
        marker = uuid.uuid4().bytes
        for i, b in enumerate(marker[:8]):
            img.putpixel((i, 0), (b, b, b))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def _next_monday_iso():
    today = datetime.now()
    days_ahead = (0 - today.weekday()) % 7 or 7
    monday = (today + timedelta(days=days_ahead)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    return monday.isoformat()


def _post_image_quote(image_bytes: bytes, description: str = "Test pile") -> requests.Response:
    files = {"file": (f"q_{uuid.uuid4().hex[:6]}.jpg", image_bytes, "image/jpeg")}
    data = {"description": description}
    return requests.post(f"{BASE_URL}/api/quotes/image", files=files, data=data, timeout=120)


@pytest.fixture(scope="module")
def admin_session() -> requests.Session:
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return s


def _seed_pending_quote(total_price: float = 200.0) -> str:
    """Create a quote via the public endpoint, then force it into
    'pending_approval' state by stamping requires_approval=True directly in
    Mongo. This avoids relying on the AI assigning scale_level >= 9."""
    img_bytes = _make_jpeg_bytes(color=(40, 200, 80))
    resp = _post_image_quote(img_bytes, description="Approval seed quote")
    assert resp.status_code == 200, resp.text[:300]
    quote_id = resp.json()["id"]
    db.quotes.update_one(
        {"id": quote_id},
        {
            "$set": {
                "approval_status": "pending_approval",
                "requires_approval": True,
                "total_price": total_price,
            }
        },
    )
    return quote_id


def _seed_booking_for_quote(quote_id: str, status: str = "completed") -> str:
    """Insert a booking directly tied to a quote so completion-upload tests
    don't depend on the public booking creation flow / weekday rules."""
    booking_id = str(uuid.uuid4())
    db.bookings.insert_one(
        {
            "id": booking_id,
            "quote_id": quote_id,
            "address": "123 Test Lane, Flagstaff AZ",
            "phone": "+15555550199",
            "email": f"completion_{booking_id[:6]}@example.com",
            "pickup_date": _next_monday_iso(),
            "pickup_time": "10:00 AM",
            "status": status,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "sms_notifications_enabled": False,
        }
    )
    return booking_id


# ---------------------------------------------------------------------------
# /api/admin/quotes/{quote_id}/approve  (refactored)
# ---------------------------------------------------------------------------
class TestApproveQuoteEndpoint:
    def test_approve_no_price_change_returns_approved(self, admin_session):
        quote_id = _seed_pending_quote(total_price=180.0)
        r = admin_session.post(
            f"{BASE_URL}/api/admin/quotes/{quote_id}/approve",
            json={"action": "approve", "admin_notes": "Looks good"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert "quote" in body
        assert body["quote"]["approval_status"] == "approved"
        # DB-level confirmation
        doc = db.quotes.find_one({"id": quote_id})
        assert doc["approval_status"] == "approved"
        assert doc.get("admin_notes") == "Looks good"
        assert doc.get("approved_by") == "admin"

    def test_reject_quote_returns_rejected(self, admin_session):
        quote_id = _seed_pending_quote(total_price=150.0)
        r = admin_session.post(
            f"{BASE_URL}/api/admin/quotes/{quote_id}/approve",
            json={"action": "reject", "admin_notes": "Out of service area"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        assert r.json()["quote"]["approval_status"] == "rejected"
        doc = db.quotes.find_one({"id": quote_id})
        assert doc["approval_status"] == "rejected"

    def test_approve_quote_not_found_returns_404(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/admin/quotes/no-such-quote-{uuid.uuid4().hex}/approve",
            json={"action": "approve"},
            timeout=30,
        )
        assert r.status_code == 404
        assert "quote" in (r.json().get("detail") or "").lower()

    def test_approve_quote_not_pending_returns_400(self, admin_session):
        # Seed and immediately approve so it transitions out of pending_approval
        quote_id = _seed_pending_quote(total_price=120.0)
        first = admin_session.post(
            f"{BASE_URL}/api/admin/quotes/{quote_id}/approve",
            json={"action": "approve"},
            timeout=30,
        )
        assert first.status_code == 200
        # Second call should now be 400 (not pending anymore)
        r = admin_session.post(
            f"{BASE_URL}/api/admin/quotes/{quote_id}/approve",
            json={"action": "approve"},
            timeout=30,
        )
        assert r.status_code == 400
        assert "pending" in (r.json().get("detail") or "").lower()

    def test_approve_with_higher_price_marks_booking_pending_customer(self, admin_session):
        original = 200.0
        quote_id = _seed_pending_quote(total_price=original)
        booking_id = _seed_booking_for_quote(quote_id, status="pending_customer_approval")

        higher = 275.0
        r = admin_session.post(
            f"{BASE_URL}/api/admin/quotes/{quote_id}/approve",
            json={
                "action": "approve",
                "admin_notes": "Heavier load than expected",
                "approved_price": higher,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]

        # Quote got the approved price + status flipped to approved_pending_customer
        quote_doc = db.quotes.find_one({"id": quote_id})
        assert quote_doc["approved_price"] == higher
        assert quote_doc["approval_status"] == "approved_pending_customer"

        # Booking received the customer-approval token + adjusted price
        booking_doc = db.bookings.find_one({"id": booking_id})
        assert booking_doc["status"] == "pending_customer_approval"
        assert booking_doc.get("customer_approval_token"), "Missing customer_approval_token"
        assert booking_doc.get("original_price") == original
        assert booking_doc.get("adjusted_price") == higher
        assert booking_doc.get("requires_customer_approval") is True


# ---------------------------------------------------------------------------
# /api/admin/bookings/{booking_id}/completion (refactored)
# ---------------------------------------------------------------------------
class TestCompletionPhotoUpload:
    def test_completion_upload_404_when_booking_missing(self, admin_session):
        files = {"file": ("done.jpg", _make_jpeg_bytes(), "image/jpeg")}
        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/no-such-booking-{uuid.uuid4().hex}/completion",
            files=files,
            data={"completion_note": ""},
            timeout=30,
        )
        assert r.status_code == 404
        assert "booking" in (r.json().get("detail") or "").lower()

    def test_completion_upload_400_when_status_not_completed(self, admin_session):
        quote_id = _seed_pending_quote(total_price=110.0)
        booking_id = _seed_booking_for_quote(quote_id, status="scheduled")  # NOT completed
        files = {"file": ("done.jpg", _make_jpeg_bytes(), "image/jpeg")}
        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/{booking_id}/completion",
            files=files,
            data={"completion_note": ""},
            timeout=30,
        )
        assert r.status_code == 400
        detail = (r.json().get("detail") or "").lower()
        assert "completed" in detail

    def test_completion_upload_400_when_not_image(self, admin_session):
        quote_id = _seed_pending_quote(total_price=110.0)
        booking_id = _seed_booking_for_quote(quote_id, status="completed")
        files = {"file": ("notes.txt", b"plain text", "text/plain")}
        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/{booking_id}/completion",
            files=files,
            data={"completion_note": ""},
            timeout=30,
        )
        assert r.status_code == 400
        detail = (r.json().get("detail") or "").lower()
        assert "image" in detail

    def test_completion_upload_success_persists_path_and_note(self, admin_session):
        quote_id = _seed_pending_quote(total_price=110.0)
        booking_id = _seed_booking_for_quote(quote_id, status="completed")
        note = f"All clear {uuid.uuid4().hex[:6]}"
        files = {"file": ("done.jpg", _make_jpeg_bytes(color=(20, 100, 200)), "image/jpeg")}
        # NOTE: completion_note is declared `str = ""` (no Form()), so FastAPI
        # treats it as a query parameter, not multipart form data. Pass as
        # query string to actually populate it.
        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/{booking_id}/completion",
            params={"completion_note": note},
            files=files,
            timeout=60,
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        # Response shape preserved
        assert body["completion_note"] == note
        assert "photo_path" in body and body["photo_path"]
        # File saved under /app/backend/static/completion_photos
        saved = Path(body["photo_path"])
        assert str(saved).startswith("/app/backend/static/completion_photos"), \
            f"Unexpected save dir: {saved}"
        assert saved.exists(), f"Saved photo missing on disk: {saved}"
        # DB row updated
        doc = db.bookings.find_one({"id": booking_id})
        assert doc.get("completion_photo_path") == str(saved)
        assert doc.get("completion_note") == note


# ---------------------------------------------------------------------------
# Description-aware image cache
# ---------------------------------------------------------------------------
class TestDescriptionAwareImageCache:
    """Same image+desc HITS; same image with DIFFERENT desc MISSES (separate AI call)."""

    def test_same_image_same_description_is_cache_hit(self):
        img_bytes = _make_jpeg_bytes(color=(70, 130, 180))

        t0 = time.monotonic()
        first = _post_image_quote(img_bytes, description="")
        first_elapsed = time.monotonic() - t0
        assert first.status_code == 200, first.text[:300]
        first_total = first.json()["total_price"]

        t1 = time.monotonic()
        second = _post_image_quote(img_bytes, description="")
        second_elapsed = time.monotonic() - t1
        assert second.status_code == 200, second.text[:300]
        second_total = second.json()["total_price"]

        # Cache hit returns identical totals AND is meaningfully faster
        assert first_total == second_total, (
            f"Cache MISS expected HIT: first={first_total} second={second_total}"
        )
        assert second_elapsed < 5.0 or second_elapsed * 2 < first_elapsed, (
            f"Cache hit not faster: first={first_elapsed:.1f}s second={second_elapsed:.1f}s"
        )

    def test_same_image_different_description_is_cache_miss(self):
        """Description is part of the cache key now → a new desc must trigger a fresh AI call."""
        img_bytes = _make_jpeg_bytes(color=(220, 60, 90))

        # Prime cache with empty description
        prime = _post_image_quote(img_bytes, description="")
        assert prime.status_code == 200, prime.text[:300]
        prime_hash_count = db.image_cache.count_documents(
            {}  # we'll filter by image_hash below after measuring
        )

        # New description → MISS → must produce a new image_cache row keyed
        # on (image_hash, "heavy items")
        t0 = time.monotonic()
        miss = _post_image_quote(img_bytes, description="heavy items")
        miss_elapsed = time.monotonic() - t0
        assert miss.status_code == 200, miss.text[:300]

        # The new desc should produce a SECOND db row (different cache_key)
        # for the same image_hash. Compute image_hash same way the server does:
        # SHA-256 of the *compressed* JPEG -- we can't reproduce that locally
        # without running compression, so instead assert by description_norm
        # that BOTH variants exist in image_cache.
        rows = list(db.image_cache.find({"description_norm": {"$in": ["", "heavy items"]}}))
        descs = {r.get("description_norm") for r in rows}
        assert "" in descs and "heavy items" in descs, (
            f"Expected both '' and 'heavy items' rows in image_cache, got {descs}"
        )

        # And: hitting again with desc='heavy items' must now be a HIT
        t1 = time.monotonic()
        hit = _post_image_quote(img_bytes, description="heavy items")
        hit_elapsed = time.monotonic() - t1
        assert hit.status_code == 200, hit.text[:300]
        assert hit.json()["total_price"] == miss.json()["total_price"], (
            "Same image+desc must HIT cache and return identical price"
        )
        assert hit_elapsed < 5.0 or hit_elapsed * 2 < miss_elapsed, (
            f"Description-keyed HIT not faster than MISS: miss={miss_elapsed:.1f}s hit={hit_elapsed:.1f}s"
        )

    def test_image_cache_documents_have_cache_key_field(self):
        # Sanity: refactor introduced cache_key field with an index
        sample = db.image_cache.find_one({"cache_key": {"$exists": True}})
        assert sample is not None, "No image_cache row has the new cache_key field"
        # Index on cache_key must exist
        idx = db.image_cache.index_information()
        idx_keys = [v["key"][0][0] for v in idx.values() if v.get("key")]
        assert "cache_key" in idx_keys, f"cache_key index missing. Indexes: {idx_keys}"
