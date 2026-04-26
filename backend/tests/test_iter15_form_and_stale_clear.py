"""
Iteration 15 backend coverage:
  1) completion_note now uses `Form(default="")` → multipart-form clients
     finally see their note persisted instead of silently dropped.
  2) New `_clear_stale_price_adjustment_fields` helper: re-approving a quote
     at SAME-or-LOWER price after a prior price-increase wipes the booking's
     stale customer_approval_token / adjusted_price / requires_customer_approval
     and reverts status to 'pending_payment'.
  3) Approving a quote that has NO booking attached still succeeds and does
     NOT raise from the new helper.
"""
import io
import os
import uuid
import pytest
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path
from PIL import Image
from pymongo import MongoClient


# ---------------------------------------------------------------------------
# Setup / fixtures
# ---------------------------------------------------------------------------
def _backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if url:
        return url.rstrip("/")
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _backend_url()
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "lrobe")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "L1964c10$")


def _load_mongo():
    env_path = Path("/app/backend/.env")
    cfg = {}
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            cfg[k.strip()] = v.strip().strip('"').strip("'")
    client = MongoClient(cfg["MONGO_URL"])
    return client[cfg["DB_NAME"]]


db = _load_mongo()


def _jpeg(color=(180, 90, 40)) -> bytes:
    img = Image.new("RGB", (640, 480), color=color)
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
    """Quote forced into `pending_approval` so approve_quote() will accept it."""
    files = {"file": (f"q_{uuid.uuid4().hex[:6]}.jpg", _jpeg(color=(40, 200, 80)), "image/jpeg")}
    data = {"description": f"iter15 seed {uuid.uuid4().hex[:6]}"}
    r = requests.post(f"{BASE_URL}/api/quotes/image", files=files, data=data, timeout=120)
    assert r.status_code == 200, r.text[:300]
    quote_id = r.json()["id"]
    db.quotes.update_one(
        {"id": quote_id},
        {"$set": {
            "approval_status": "pending_approval",
            "requires_approval": True,
            "total_price": total_price,
        }},
    )
    return quote_id


def _seed_booking_for_quote(quote_id: str, status: str = "scheduled") -> str:
    booking_id = str(uuid.uuid4())
    db.bookings.insert_one({
        "id": booking_id,
        "quote_id": quote_id,
        "address": "123 Iter15 Test, Flagstaff AZ",
        "phone": "+15555550199",
        "email": f"iter15_{booking_id[:6]}@example.com",
        "pickup_date": _next_monday_iso(),
        "pickup_time": "10:00 AM",
        "status": status,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sms_notifications_enabled": False,
    })
    return booking_id


# ---------------------------------------------------------------------------
# Fix 1: completion_note as Form(default="")
# ---------------------------------------------------------------------------
class TestCompletionNoteFormBinding:
    def test_completion_note_persisted_via_multipart_form(self, admin_session):
        """Sending completion_note in multipart form data must now persist
        (previously was silently dropped because param wasn't `Form(...)`)."""
        quote_id = _seed_pending_quote(total_price=110.0)
        booking_id = _seed_booking_for_quote(quote_id, status="completed")

        note = f"Form-bound note {uuid.uuid4().hex[:8]}"
        files = {"file": ("done.jpg", _jpeg(color=(60, 140, 220)), "image/jpeg")}
        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/{booking_id}/completion",
            data={"completion_note": note},  # multipart form, NOT query params
            files=files,
            timeout=60,
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        # Response should echo the form-bound note
        assert body["completion_note"] == note, (
            f"Expected note from form data, got: {body.get('completion_note')!r}"
        )
        # And be persisted in DB
        doc = db.bookings.find_one({"id": booking_id})
        assert doc.get("completion_note") == note, (
            f"DB completion_note mismatch: {doc.get('completion_note')!r} != {note!r}"
        )
        # Photo path also recorded
        assert doc.get("completion_photo_path"), "completion_photo_path missing"
        saved = Path(doc["completion_photo_path"])
        assert saved.exists(), f"Saved photo missing on disk: {saved}"

    def test_completion_note_empty_when_not_provided(self, admin_session):
        """Default Form(default='') still works when client omits the note."""
        quote_id = _seed_pending_quote(total_price=120.0)
        booking_id = _seed_booking_for_quote(quote_id, status="completed")

        files = {"file": ("done.jpg", _jpeg(color=(120, 200, 60)), "image/jpeg")}
        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/{booking_id}/completion",
            files=files,
            timeout=60,
        )
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("completion_note") == ""
        doc = db.bookings.find_one({"id": booking_id})
        assert doc.get("completion_note") == ""


# ---------------------------------------------------------------------------
# Fix 2: _clear_stale_price_adjustment_fields
# ---------------------------------------------------------------------------
class TestClearStalePriceAdjustment:
    def test_reapproval_at_lower_price_clears_stale_token_and_resets_status(self, admin_session):
        """Step 1: approve quote at HIGHER price → booking gets token + adjusted_price.
        Step 2: reset quote to pending_approval, re-approve at LOWER price →
                stale fields must be cleared and booking status=pending_payment."""
        original_price = 200.0
        quote_id = _seed_pending_quote(total_price=original_price)
        booking_id = _seed_booking_for_quote(quote_id, status="scheduled")

        # --- Step 1: HIGHER price approval --------------------------------
        higher = 275.0
        r1 = admin_session.post(
            f"{BASE_URL}/api/admin/quotes/{quote_id}/approve",
            json={"action": "approve",
                  "admin_notes": "Heavier than expected",
                  "approved_price": higher},
            timeout=30,
        )
        assert r1.status_code == 200, r1.text[:300]

        booking = db.bookings.find_one({"id": booking_id})
        assert booking["status"] == "pending_customer_approval"
        assert booking.get("customer_approval_token"), "Step1: missing token"
        assert booking.get("adjusted_price") == higher
        assert booking.get("requires_customer_approval") is True
        assert booking.get("original_price") == original_price

        # --- Step 2: reset quote to pending and re-approve at LOWER price -
        db.quotes.update_one(
            {"id": quote_id},
            {"$set": {"approval_status": "pending_approval",
                      "requires_approval": True}},
        )
        lower = 180.0  # <= original
        r2 = admin_session.post(
            f"{BASE_URL}/api/admin/quotes/{quote_id}/approve",
            json={"action": "approve",
                  "admin_notes": "Re-approved at original",
                  "approved_price": lower},
            timeout=30,
        )
        assert r2.status_code == 200, r2.text[:300]

        # --- Verify cleanup ---------------------------------------------
        booking_after = db.bookings.find_one({"id": booking_id})
        assert booking_after is not None
        # Status reverted
        assert booking_after.get("status") == "pending_payment", (
            f"Expected status=pending_payment, got {booking_after.get('status')}"
        )
        # Stale fields removed
        for stale_field in (
            "customer_approval_token",
            "adjusted_price",
            "original_price",
            "price_adjustment_reason",
            "requires_customer_approval",
        ):
            assert stale_field not in booking_after, (
                f"Stale field '{stale_field}' was not cleared: {booking_after.get(stale_field)!r}"
            )

    def test_reapproval_with_no_price_change_clears_stale_state(self, admin_session):
        """Re-approve at SAME price (approved_price == original_price) should
        also trigger _clear_stale_price_adjustment_fields when stale fields exist."""
        original_price = 150.0
        quote_id = _seed_pending_quote(total_price=original_price)
        booking_id = _seed_booking_for_quote(quote_id, status="scheduled")

        # Pre-stage stale customer-approval state on the booking
        db.bookings.update_one(
            {"id": booking_id},
            {"$set": {
                "status": "pending_customer_approval",
                "original_price": original_price,
                "adjusted_price": original_price + 50,
                "customer_approval_token": str(uuid.uuid4()),
                "requires_customer_approval": True,
                "price_adjustment_reason": "previous bump",
            }},
        )

        # Re-approve at SAME price (not greater than original) → goes through
        # the else-branch and calls _clear_stale_price_adjustment_fields.
        r = admin_session.post(
            f"{BASE_URL}/api/admin/quotes/{quote_id}/approve",
            json={"action": "approve",
                  "admin_notes": "Same price re-approve",
                  "approved_price": original_price},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]

        booking_after = db.bookings.find_one({"id": booking_id})
        assert booking_after.get("status") == "pending_payment"
        for stale_field in (
            "customer_approval_token",
            "adjusted_price",
            "original_price",
            "price_adjustment_reason",
            "requires_customer_approval",
        ):
            assert stale_field not in booking_after, (
                f"Stale field '{stale_field}' was not cleared on equal-price re-approval"
            )

    def test_reapproval_lower_price_with_no_booking_does_not_error(self, admin_session):
        """The new helper looks up booking by quote_id; if there is no booking
        it must return cleanly. Verifies the helper's no-op early-return path
        is exercised end-to-end through approve_quote."""
        quote_id = _seed_pending_quote(total_price=180.0)
        # Confirm there is no booking attached
        assert db.bookings.find_one({"quote_id": quote_id}) is None

        r = admin_session.post(
            f"{BASE_URL}/api/admin/quotes/{quote_id}/approve",
            json={"action": "approve",
                  "admin_notes": "No booking, lower price",
                  "approved_price": 175.0},  # <= 180, hits clear-stale branch
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body["quote"]["approval_status"] == "approved"
        assert body["quote"]["approved_price"] == 175.0

    def test_reapproval_lower_price_does_not_clear_when_no_stale_fields(self, admin_session):
        """If a booking exists but has NO stale customer-approval state, the
        helper's second early-return must leave the booking untouched."""
        original_price = 220.0
        quote_id = _seed_pending_quote(total_price=original_price)
        booking_id = _seed_booking_for_quote(quote_id, status="scheduled")

        snapshot = db.bookings.find_one({"id": booking_id})
        # Sanity: no stale token already
        assert "customer_approval_token" not in snapshot

        r = admin_session.post(
            f"{BASE_URL}/api/admin/quotes/{quote_id}/approve",
            json={"action": "approve",
                  "admin_notes": "lower price, no stale state",
                  "approved_price": 200.0},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]

        # Booking should be untouched (status still 'scheduled')
        booking_after = db.bookings.find_one({"id": booking_id})
        assert booking_after["status"] == "scheduled", (
            f"Helper should not have modified booking with no stale fields, "
            f"got status={booking_after['status']}"
        )
