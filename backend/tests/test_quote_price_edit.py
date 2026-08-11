"""Backend tests for admin quote-price edit + card display bug fix.

Verifies:
 - PATCH /api/admin/bookings/{id}/quote-price updates quote.approved_price
 - GET /api/admin/pending-payments returns approved_price in quote_details
 - GET /api/admin/all-bookings returns approved_price in quote_details
 - customer fields (name/email/phone/address) update on booking
 - rejects when booking is paid; rejects on invalid price
"""
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
backend_env = dotenv_values("/app/backend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")
MONGO_URL = backend_env.get("MONGO_URL") or os.environ.get("MONGO_URL")
DB_NAME = backend_env.get("DB_NAME") or os.environ.get("DB_NAME")

ADMIN_USER = "lrobe"
ADMIN_PASS = "L1964c10$"


# --- fixtures ---

@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/admin/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    if r.status_code != 200:
        pytest.fail(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture
def seeded_booking(mongo_db):
    """Seed a quote + booking directly in Mongo so we always have something to edit."""
    quote_id = f"TEST_quote_{uuid.uuid4().hex[:8]}"
    booking_id = f"TEST_booking_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    mongo_db.quotes.insert_one({
        "id": quote_id,
        "total_price": 180.0,        # AI-generated original
        "approval_status": "approved",
        "items": [{"name": "Sofa", "size": "large", "quantity": 1}],
        "created_at": now,
    })
    mongo_db.bookings.insert_one({
        "id": booking_id,
        "quote_id": quote_id,
        "name": "TEST User",
        "email": "test_edit@example.test",
        "phone": "+15555550101",
        "address": "123 Test Ln",
        "pickup_date": "2026-07-20",
        "pickup_time": "08:00-10:00",
        "status": "scheduled",
        "payment_status": "pending",
        "amount_due": 180.0,
        "created_at": now,
    })
    yield {"booking_id": booking_id, "quote_id": quote_id}
    mongo_db.bookings.delete_one({"id": booking_id})
    mongo_db.quotes.delete_one({"id": quote_id})


# --- tests ---

class TestQuotePriceEdit:

    def test_edit_price_reflected_in_pending_payments(self, admin_session, seeded_booking):
        bid = seeded_booking["booking_id"]
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}/quote-price",
            json={"new_price": 250},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True

        # GET pending-payments and find our booking
        r2 = admin_session.get(f"{BASE_URL}/api/admin/pending-payments")
        assert r2.status_code == 200, r2.text
        items = r2.json()
        entry = next((b for b in items if b["id"] == bid), None)
        assert entry is not None, "seeded booking not returned by pending-payments"
        qd = entry.get("quote_details") or {}
        assert qd.get("approved_price") == 250, f"approved_price wrong: {qd}"
        # audit trail preserved
        assert qd.get("total_price") == 180, f"total_price should stay original 180: {qd}"
        # amount_due updated
        assert float(entry.get("amount_due") or 0) == 250

    def test_edit_price_reflected_in_all_bookings(self, admin_session, seeded_booking):
        bid = seeded_booking["booking_id"]
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}/quote-price",
            json={"new_price": 299},
        )
        assert r.status_code == 200, r.text

        r2 = admin_session.get(f"{BASE_URL}/api/admin/all-bookings")
        assert r2.status_code == 200, r2.text
        items = r2.json()
        entry = next((b for b in items if b["id"] == bid), None)
        assert entry is not None, "booking missing from all-bookings"
        qd = entry.get("quote_details") or {}
        assert qd.get("approved_price") == 299, f"approved_price wrong: {qd}"

    def test_edit_all_fields_at_once(self, admin_session, seeded_booking):
        bid = seeded_booking["booking_id"]
        payload = {
            "new_price": 275,
            "name": "TEST Updated Name",
            "email": "TEST_updated@example.test",
            "phone": "+15555550202",
            "address": "999 Updated Blvd",
        }
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}/quote-price", json=payload,
        )
        assert r.status_code == 200, r.text

        r2 = admin_session.get(f"{BASE_URL}/api/admin/pending-payments")
        assert r2.status_code == 200
        entry = next((b for b in r2.json() if b["id"] == bid), None)
        assert entry is not None
        assert entry.get("name") == payload["name"]
        assert entry.get("email") == payload["email"]
        assert entry.get("phone") == payload["phone"]
        assert entry.get("address") == payload["address"]
        assert (entry.get("quote_details") or {}).get("approved_price") == 275

    def test_reject_edit_when_paid(self, admin_session, seeded_booking, mongo_db):
        bid = seeded_booking["booking_id"]
        mongo_db.bookings.update_one({"id": bid}, {"$set": {"payment_status": "paid"}})
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}/quote-price", json={"new_price": 100},
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_reject_negative_price(self, admin_session, seeded_booking):
        bid = seeded_booking["booking_id"]
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}/quote-price", json={"new_price": -5},
        )
        assert r.status_code == 400

    def test_reject_over_max_price(self, admin_session, seeded_booking):
        bid = seeded_booking["booking_id"]
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}/quote-price", json={"new_price": 200000},
        )
        assert r.status_code == 400
