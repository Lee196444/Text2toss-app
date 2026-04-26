"""
Tests for the refactored AI vision quote pipeline + booking creation flow.

Refactor under test (no behavior change expected):
- analyze_image_for_quote() split into _compress_image_for_ai, _check_image_cache,
  _build_vision_prompt, _request_ai_vision_quote, _parse_ai_quote_response,
  _cache_quote_analysis, _enhanced_text_fallback
- create_booking() split into _resolve_user_id, _validate_pickup_request,
  _build_booking, _send_post_booking_emails, _send_post_booking_sms

Endpoints exercised:
- POST /api/quotes/image      (anonymous; multipart image upload)
- POST /api/bookings          (anonymous; JSON body referencing a quote_id)
"""
import io
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timedelta
from pathlib import Path
from PIL import Image


def _load_backend_url():
    url = os.environ.get('REACT_APP_BACKEND_URL', '').strip()
    if url:
        return url.rstrip('/')
    env_path = Path('/app/frontend/.env')
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip().rstrip('/')
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_backend_url()


def _make_jpeg_bytes(width=800, height=600, color=(123, 200, 80), unique=True) -> bytes:
    """Build a real Pillow JPEG. By default each call produces a unique image
    (random pixel) so the AI cache won't collide between independent tests."""
    img = Image.new("RGB", (width, height), color=color)
    if unique:
        # Punch a few unique pixels so the SHA-256 of every test image differs.
        marker = uuid.uuid4().bytes
        for i, b in enumerate(marker[:8]):
            img.putpixel((i, 0), (b, b, b))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def _next_monday_iso():
    """Return ISO datetime for the next Monday at noon (Mon=0)."""
    today = datetime.now()
    days_ahead = (0 - today.weekday()) % 7 or 7   # always strictly future Monday
    monday = (today + timedelta(days=days_ahead)).replace(hour=12, minute=0, second=0, microsecond=0)
    return monday.isoformat()


def _next_friday_iso():
    today = datetime.now()
    days_ahead = (4 - today.weekday()) % 7 or 7
    friday = (today + timedelta(days=days_ahead)).replace(hour=12, minute=0, second=0, microsecond=0)
    return friday.isoformat()


def _post_image_quote(image_bytes: bytes, description: str = "Test junk pile") -> requests.Response:
    files = {"file": (f"test_{uuid.uuid4().hex[:6]}.jpg", image_bytes, "image/jpeg")}
    data = {"description": description}
    return requests.post(f"{BASE_URL}/api/quotes/image", files=files, data=data, timeout=120)


# ---------------------------------------------------------------------------
# /api/quotes/image  — image-based AI quote (refactored helpers)
# ---------------------------------------------------------------------------
class TestImageQuoteEndpoint:
    """Verifies the public POST /api/quotes/image still works after refactor."""

    def test_image_quote_returns_full_payload(self):
        img_bytes = _make_jpeg_bytes()
        resp = _post_image_quote(img_bytes, description="Old couch and a wooden chair")
        assert resp.status_code == 200, f"Body: {resp.text[:500]}"
        data = resp.json()

        # Public function signature/return contract preserved
        assert "id" in data and isinstance(data["id"], str)
        assert "items" in data and isinstance(data["items"], list)
        assert "total_price" in data and isinstance(data["total_price"], (int, float))
        assert data["total_price"] >= 0
        assert "ai_explanation" in data and isinstance(data["ai_explanation"], str)
        assert "approval_status" in data
        # Approval status must be one of the two refactor-preserved values
        assert data["approval_status"] in {"auto_approved", "pending_approval"}

    def test_image_quote_rejects_non_image(self):
        files = {"file": ("notes.txt", b"hello world", "text/plain")}
        resp = requests.post(f"{BASE_URL}/api/quotes/image", files=files,
                             data={"description": ""}, timeout=30)
        assert resp.status_code == 400
        assert "image" in resp.text.lower()


# ---------------------------------------------------------------------------
# Cache hit path: same image twice -> 2nd should be at least as fast & identical
# ---------------------------------------------------------------------------
class TestImageQuoteCacheHit:
    """_check_image_cache should return cached items on a 2nd identical upload."""

    def test_same_image_returns_identical_result_faster(self):
        img_bytes = _make_jpeg_bytes()  # unique per test run

        t0 = time.monotonic()
        first = _post_image_quote(img_bytes, description="Cache test pile")
        first_elapsed = time.monotonic() - t0
        assert first.status_code == 200, first.text[:500]
        first_data = first.json()

        t1 = time.monotonic()
        second = _post_image_quote(img_bytes, description="Cache test pile")
        second_elapsed = time.monotonic() - t1
        assert second.status_code == 200, second.text[:500]
        second_data = second.json()

        # Items and total_price must be identical (cache hit)
        assert first_data["total_price"] == second_data["total_price"], \
            f"Cache miss: first={first_data['total_price']} second={second_data['total_price']}"
        assert len(first_data["items"]) == len(second_data["items"])
        first_names = sorted(i["name"] for i in first_data["items"])
        second_names = sorted(i["name"] for i in second_data["items"])
        assert first_names == second_names

        # Cached path should be meaningfully faster than the AI call. Allow
        # generous slack for network jitter -- assert at least 2x faster OR
        # under 5 seconds wall time.
        assert second_elapsed < 5.0 or second_elapsed * 2 < first_elapsed, (
            f"Cache hit not faster: first={first_elapsed:.1f}s second={second_elapsed:.1f}s"
        )


# ---------------------------------------------------------------------------
# /api/bookings — booking creation (refactored helpers)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def fresh_quote_id():
    """Create a real image-based quote and return its ID for booking tests."""
    img_bytes = _make_jpeg_bytes(color=(50, 50, 200))  # different colour, unique
    resp = _post_image_quote(img_bytes, description="Booking-flow seed quote")
    assert resp.status_code == 200, f"Failed to seed quote: {resp.text[:500]}"
    return resp.json()["id"]


def _booking_payload(quote_id: str, pickup_iso: str, pickup_time: str = "10:00 AM"):
    return {
        "quote_id": quote_id,
        "pickup_date": pickup_iso,
        "pickup_time": pickup_time,
        "address": "123 Test Lane, Flagstaff AZ",
        "phone": "+15555550101",
        "email": "test+booking@example.com",
        "special_instructions": "Curbside pickup, ring bell",
        "curbside_confirmed": True,
        "email_notifications": False,
    }


class TestBookingCreationFlow:
    """End-to-end: quote -> booking with weekday + slot-conflict enforcement."""

    def test_booking_create_success(self, fresh_quote_id):
        # Use a unique time slot per test run to avoid 409 from prior runs
        unique_time = f"{(datetime.now().minute % 12) + 1:02d}:00 AM"
        payload = _booking_payload(fresh_quote_id, _next_monday_iso(),
                                   pickup_time=f"{uuid.uuid4().hex[:4]} AM")
        resp = requests.post(f"{BASE_URL}/api/bookings", json=payload, timeout=30)
        assert resp.status_code == 200, f"Body: {resp.text[:500]}"
        data = resp.json()

        # Refactored _build_booking still produces the canonical Booking shape
        assert data["quote_id"] == fresh_quote_id
        assert data["address"] == payload["address"]
        assert data["phone"].endswith("0101")
        assert data["email"] == payload["email"]
        assert "id" in data and isinstance(data["id"], str)
        assert data["status"] in {"pending_payment", "pending_customer_approval"}
        assert data["pickup_time"] == payload["pickup_time"]

    def test_booking_friday_returns_400(self, fresh_quote_id):
        payload = _booking_payload(fresh_quote_id, _next_friday_iso(),
                                   pickup_time=f"{uuid.uuid4().hex[:4]} AM")
        resp = requests.post(f"{BASE_URL}/api/bookings", json=payload, timeout=30)
        assert resp.status_code == 400, f"Expected 400 for Friday, got {resp.status_code}: {resp.text[:300]}"
        body = resp.json()
        detail = (body.get("detail") or "").lower()
        assert "friday" in detail or "weekend" in detail or "monday-thursday" in detail

    def test_booking_slot_conflict_returns_409(self, fresh_quote_id):
        """Slot-conflict guard in _validate_pickup_request only fires when an
        existing booking is in {'scheduled', 'in_progress'}. New bookings start
        in 'pending_payment'/'pending_customer_approval', so we must promote
        the seed booking to 'scheduled' (admin PATCH) before re-booking
        the same slot -- which should then produce 409."""
        same_monday = _next_monday_iso()
        same_time = f"{uuid.uuid4().hex[:4]} PM"  # unique-per-run

        first_payload = _booking_payload(fresh_quote_id, same_monday, pickup_time=same_time)
        first = requests.post(f"{BASE_URL}/api/bookings", json=first_payload, timeout=30)
        assert first.status_code == 200, f"Seed booking failed: {first.text[:500]}"
        seeded_id = first.json()["id"]

        # Promote seeded booking to 'scheduled' via admin so the slot guard kicks in
        admin_session = requests.Session()
        login = admin_session.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": os.environ.get("ADMIN_USERNAME", "lrobe"),
                  "password": os.environ.get("ADMIN_PASSWORD", "L1964c10$")},
            timeout=15,
        )
        assert login.status_code == 200, f"Admin login failed: {login.text[:200]}"

        promote = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{seeded_id}",
            json={"status": "scheduled"},
            timeout=15,
        )
        assert promote.status_code == 200, f"Promote failed: {promote.text[:300]}"

        conflict_payload = _booking_payload(fresh_quote_id, same_monday, pickup_time=same_time)
        conflict = requests.post(f"{BASE_URL}/api/bookings", json=conflict_payload, timeout=30)
        assert conflict.status_code == 409, (
            f"Expected 409 for slot conflict, got {conflict.status_code}: {conflict.text[:300]}"
        )
        body = conflict.json()
        detail = (body.get("detail") or "").lower()
        assert "already booked" in detail or "slot" in detail

    def test_booking_unknown_quote_returns_404(self):
        payload = _booking_payload("no-such-quote-" + uuid.uuid4().hex,
                                   _next_monday_iso(),
                                   pickup_time=f"{uuid.uuid4().hex[:4]} AM")
        resp = requests.post(f"{BASE_URL}/api/bookings", json=payload, timeout=30)
        assert resp.status_code == 404
        assert "quote" in (resp.json().get("detail") or "").lower()
