"""Iteration 20 - regression tests.

Covers:
1. /api/admin/bookings/{id}/mark-paid transitions status: pending_payment -> scheduled,
   payment_status -> paid (unchanged behavior after frontend-only price fix).
2. Booking-list endpoints expose quote_details with BOTH total_price (333) and
   approved_price (645) so the frontend can render the adjusted number.
"""
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

# Env
frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or frontend_env.get("REACT_APP_BACKEND_URL")
).rstrip("/")

backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or backend_env.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or backend_env.get("DB_NAME")

TEST_TAG = "TEST_ITER20"


# Fixtures ---------------------------------------------------------------
@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def admin_creds():
    p = Path("/app/memory/test_credentials.md").read_text()
    u = re.search(r"Username:\s*`([^`]+)`", p).group(1)
    pw = re.search(r"Password:\s*`([^`]+)`", p).group(1)
    return {"username": u, "password": pw}


@pytest.fixture(scope="module")
def admin_session(admin_creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/admin/login", json=admin_creds, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture
def seeded_booking(mongo_db):
    """Insert a fresh quote + pending_payment booking with total=333, approved=645."""
    quote_id = str(uuid.uuid4())
    booking_id = str(uuid.uuid4())

    mongo_db.quotes.insert_one({
        "id": quote_id,
        "user_id": f"{TEST_TAG}_user",
        "items": [{"name": "Couch", "size": "large", "quantity": 1}],
        "total_price": 333.0,
        "approved_price": 645.0,
        "scale_level": 5,
        "description": f"{TEST_TAG} seed",
        "temp_image_paths": [],
        "approval_status": "auto_approved",
        "requires_approval": False,
        "heavy_pile": False,
        "equipment_fee": 0.0,
        "equipment_required": False,
        "created_at": datetime.now(timezone.utc),
    })

    mongo_db.bookings.insert_one({
        "id": booking_id,
        "user_id": f"{TEST_TAG}_user",
        "quote_id": quote_id,
        "pickup_date": datetime.now(timezone.utc),
        "pickup_time": "10:00-12:00",
        "address": f"{TEST_TAG} 123 Test St",
        "phone": "+15555550111",
        "email": "iter20@example.com",
        "curbside_confirmed": True,
        "email_notifications": False,
        "status": "pending_payment",
        "payment_status": "pending",
        "payment_method": "venmo",
        "created_at": datetime.now(timezone.utc),
        "priority_fee": 0.0,
        "equipment_required": False,
        "equipment_fee": 0.0,
        "tip_amount": 0.0,
        "consent_accepted": True,
    })
    yield {"booking_id": booking_id, "quote_id": quote_id}

    # cleanup
    mongo_db.bookings.delete_one({"id": booking_id})
    mongo_db.quotes.delete_one({"id": quote_id})


# Tests ------------------------------------------------------------------
class TestMarkPaidRegression:
    def test_mark_paid_transitions_status_and_payment(self, admin_session, seeded_booking, mongo_db):
        booking_id = seeded_booking["booking_id"]

        # precondition
        before = mongo_db.bookings.find_one({"id": booking_id})
        assert before["status"] == "pending_payment"
        assert before["payment_status"] == "pending"

        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/{booking_id}/mark-paid", timeout=15
        )
        assert r.status_code == 200, f"mark-paid failed: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert data.get("success") is True

        after = mongo_db.bookings.find_one({"id": booking_id})
        assert after["status"] == "scheduled", f"status not transitioned: {after['status']}"
        assert after["payment_status"] == "paid", f"payment_status not paid: {after['payment_status']}"

    def test_mark_paid_missing_booking_returns_404(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/does-not-exist-{uuid.uuid4()}/mark-paid",
            timeout=15,
        )
        assert r.status_code == 404


# Verify booking-list endpoints surface approved_price for frontend rendering
class TestBookingListExposesApprovedPrice:
    def _find_booking(self, listing, booking_id):
        # listing may be dict-of-lists (weekly-schedule) or flat list
        if isinstance(listing, dict):
            for arr in listing.values():
                if isinstance(arr, list):
                    for b in arr:
                        if b.get("id") == booking_id:
                            return b
        elif isinstance(listing, list):
            for b in listing:
                if b.get("id") == booking_id:
                    return b
        return None

    def test_admin_bookings_returns_approved_and_total_price(self, admin_session, seeded_booking):
        booking_id = seeded_booking["booking_id"]
        # try a couple of common endpoints
        candidates = [
            "/api/admin/pending-payments",
            "/api/admin/daily-schedule",
            "/api/admin/weekly-schedule",
            "/api/bookings",
        ]
        found = None
        for path in candidates:
            r = admin_session.get(f"{BASE_URL}{path}", timeout=20)
            if r.status_code != 200:
                continue
            payload = r.json()
            b = self._find_booking(payload, booking_id)
            if b:
                found = (path, b)
                break

        assert found is not None, (
            "seeded booking not returned by any admin listing endpoint; "
            "cannot verify approved_price exposure"
        )
        _path, b = found
        qd = b.get("quote_details") or {}
        assert qd.get("total_price") == 333.0, f"expected total_price=333, got {qd.get('total_price')}"
        assert qd.get("approved_price") == 645.0, (
            f"expected approved_price=645 to be surfaced in quote_details, got {qd.get('approved_price')}"
        )
