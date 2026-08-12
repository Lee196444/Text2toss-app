"""Backend tests for the new 'notify_customer' toggle on
PATCH /api/admin/bookings/{id}/quote-price.

Covers:
 - Silent path (notify_customer missing / false)
 - Notify path with email present
 - Notify path with phone present
 - Notify path with neither email nor phone (should not throw)
 - Contact-only edit (no price_change) should still fire notification
 - HTML template renders expected sections (unit-ish check of
   booking_updated_email)
"""
import os
import sys
import uuid
from datetime import datetime, timezone

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

# So we can import the email template helper directly
sys.path.insert(0, "/app/backend")
from templates import email_templates  # noqa: E402

frontend_env = dotenv_values("/app/frontend/.env")
backend_env = dotenv_values("/app/backend/.env")
BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or frontend_env.get("REACT_APP_BACKEND_URL")
).rstrip("/")
MONGO_URL = backend_env.get("MONGO_URL") or os.environ.get("MONGO_URL")
DB_NAME = backend_env.get("DB_NAME") or os.environ.get("DB_NAME")

ADMIN_USER = "lrobe"
ADMIN_PASS = "L1964c10$"


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def mongo_db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": ADMIN_USER, "password": ADMIN_PASS},
    )
    if r.status_code != 200:
        pytest.fail(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return s


def _seed(mongo_db, *, email="", phone=""):
    quote_id = f"TEST_notify_q_{uuid.uuid4().hex[:8]}"
    booking_id = f"TEST_notify_b_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    mongo_db.quotes.insert_one({
        "id": quote_id,
        "total_price": 180.0,
        "approval_status": "approved",
        "items": [{"name": "Sofa", "size": "large", "quantity": 1}],
        "created_at": now,
    })
    mongo_db.bookings.insert_one({
        "id": booking_id,
        "quote_id": quote_id,
        "name": "TEST Notify",
        "email": email,
        "phone": phone,
        "address": "123 Notify Ln",
        "pickup_date": "2026-08-05",
        "pickup_time": "08:00-10:00",
        "status": "scheduled",
        "payment_status": "pending",
        "amount_due": 180.0,
        "created_at": now,
    })
    return booking_id, quote_id


@pytest.fixture
def booking_no_contact(mongo_db):
    bid, qid = _seed(mongo_db)
    yield bid
    mongo_db.bookings.delete_one({"id": bid})
    mongo_db.quotes.delete_one({"id": qid})


@pytest.fixture
def booking_with_email(mongo_db):
    bid, qid = _seed(mongo_db, email="TEST_notify@example.test")
    yield bid
    mongo_db.bookings.delete_one({"id": bid})
    mongo_db.quotes.delete_one({"id": qid})


@pytest.fixture
def booking_with_phone(mongo_db):
    # NOTE: +1555… numbers are rejected by Twilio (error 21211). Use a
    # plausible-format US number so the API call is *accepted* — carrier
    # delivery may still fail with 30034 (A2P), which is fine per PRD.
    bid, qid = _seed(mongo_db, phone="+14155552671")
    yield bid
    mongo_db.bookings.delete_one({"id": bid})
    mongo_db.quotes.delete_one({"id": qid})


# ---------- tests ----------

class TestNotifyToggleSilent:
    """When notify_customer is missing or False, no messages should be sent."""

    def test_silent_when_flag_absent(self, admin_session, booking_with_email):
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{booking_with_email}/quote-price",
            json={"new_price": 220},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["success"] is True
        nr = body.get("notify_result")
        assert nr == {"sent_email": False, "sent_sms": False}, nr

    def test_silent_when_flag_false(self, admin_session, booking_with_email):
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{booking_with_email}/quote-price",
            json={"new_price": 210, "notify_customer": False},
        )
        assert r.status_code == 200, r.text
        nr = r.json().get("notify_result")
        assert nr["sent_email"] is False and nr["sent_sms"] is False


class TestNotifyToggleActive:

    def test_notify_email_sent_when_email_present(
        self, admin_session, booking_with_email
    ):
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{booking_with_email}/quote-price",
            json={
                "new_price": 250,
                "reason": "Added extra mattress",
                "notify_customer": True,
            },
        )
        assert r.status_code == 200, r.text
        nr = r.json().get("notify_result") or {}
        # Email is enabled in env — should get sent=True. If SMTP fails,
        # log it as an env issue but do not silently pass.
        assert nr.get("sent_email") is True, (
            f"Expected sent_email True with EMAIL_ENABLED=true, got {nr}"
        )
        # No phone on this booking
        assert nr.get("sent_sms") is False

    def test_notify_sms_sent_when_phone_present(
        self, admin_session, booking_with_phone
    ):
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{booking_with_phone}/quote-price",
            json={"new_price": 260, "notify_customer": True},
        )
        assert r.status_code == 200, r.text
        nr = r.json().get("notify_result") or {}
        # Twilio is configured → send_sms returns status='sent' at
        # API-acceptance level (even if carrier later rejects 30034).
        assert nr.get("sent_sms") is True, (
            f"Expected sent_sms True with Twilio configured, got {nr}"
        )
        assert nr.get("sent_email") is False  # no email on this booking

    def test_notify_no_contact_still_succeeds(
        self, admin_session, booking_no_contact
    ):
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{booking_no_contact}/quote-price",
            json={"new_price": 270, "notify_customer": True},
        )
        assert r.status_code == 200, r.text
        nr = r.json().get("notify_result") or {}
        assert nr == {"sent_email": False, "sent_sms": False}

    def test_contact_only_edit_still_triggers_notify(
        self, admin_session, booking_with_email
    ):
        """No price change, only address changed → notify path must fire."""
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{booking_with_email}/quote-price",
            json={
                "address": "555 Newly Updated Rd",
                "notify_customer": True,
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("price_change") is None
        assert "address" in (body.get("fields_updated") or [])
        nr = body.get("notify_result") or {}
        assert nr.get("sent_email") is True


class TestBookingUpdatedEmailTemplate:
    """Direct unit checks on the pure HTML template helper."""

    def test_price_block_shown_when_prices_differ(self):
        html = email_templates.booking_updated_email(
            customer_name="Jane Doe",
            booking_id="abcdef1234",
            old_price=180.0,
            new_price=250.0,
            changes=["Pickup address"],
            reason="Added mattress",
            pay_link="https://example.com/pay/abcdef1234",
        )
        assert "$250.00" in html
        assert "was $180.00" in html
        assert "price-block" in html
        assert "What changed" in html
        assert "<li>Pickup address</li>" in html
        assert "Added mattress" in html
        assert "https://example.com/pay/abcdef1234" in html
        assert "Text2toss" in html  # branding
        assert "#bef264" in html or "bef264" in html  # lime accent

    def test_price_block_hidden_when_no_price_change(self):
        """Contact-only edit → no 'new total' price block in the HTML."""
        html = email_templates.booking_updated_email(
            customer_name="Jane",
            booking_id="abcdef1234",
            old_price=None,
            new_price=None,
            changes=["Pickup address"],
            reason=None,
            pay_link="https://example.com/pay/abcdef1234",
        )
        # 'price-block' string appears in the CSS <style>, so check for the
        # actual rendered div and the "New total" label instead.
        assert '<div class="price-block">' not in html
        assert "New total" not in html
        assert "What changed" in html
        assert "<li>Pickup address</li>" in html

    def test_price_block_hidden_when_prices_equal(self):
        html = email_templates.booking_updated_email(
            customer_name="Jane",
            booking_id="abcdef1234",
            old_price=180.0,
            new_price=180.0,
            changes=[],
            reason=None,
            pay_link="https://example.com/pay/abcdef1234",
        )
        assert '<div class="price-block">' not in html
        assert "New total" not in html

    def test_reason_omitted_when_empty(self):
        html = email_templates.booking_updated_email(
            customer_name="Jane",
            booking_id="abcdef1234",
            old_price=180.0,
            new_price=200.0,
            changes=["Pickup date"],
            reason=None,
            pay_link="https://example.com/pay/abcdef1234",
        )
        assert "Note from our team" not in html


@pytest.fixture(scope="module", autouse=True)
def _reset_booking_at_end():
    """Reset the shared booking 0e82e85a-… back to $180 after this file runs
    (per task cleanup instructions)."""
    yield
    try:
        s = requests.Session()
        r = s.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USER, "password": ADMIN_PASS},
        )
        if r.status_code == 200:
            s.patch(
                f"{BASE_URL}/api/admin/bookings/0e82e85a-d70c-447c-85d9-4028f8cab2bd/quote-price",
                json={"new_price": 180},
            )
    except Exception:
        pass
