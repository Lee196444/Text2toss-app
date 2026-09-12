"""Iteration 22 - Admin invoice endpoint tests.

Covers GET /api/admin/bookings/{booking_id}/invoice:
- Auth enforcement (401 without cookie)
- 404 for unknown booking
- 200 + text/html + T2T branding + line items for valid booking
- Volume math (VOLUME_BY_SIZE: small=8, medium=25, large=60 cu ft)
- Per-item cost proportional and sums to base
- approved_price overrides total_price
- Extras rows (priority, equipment, tip) rendered when > 0
- Grand total = base + extras
- PAID badge shown when payment_status='paid', absent otherwise
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

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or frontend_env.get("REACT_APP_BACKEND_URL")
).rstrip("/")

backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or backend_env.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or backend_env.get("DB_NAME")

TEST_TAG = "TEST_ITER22"

VOLUME_BY_SIZE = {"small": 8, "medium": 25, "large": 60}


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


def _seed(mongo_db, *, items, total_price=200.0, approved_price=None,
          priority_fee=0.0, equipment_fee=0.0, tip_amount=0.0,
          payment_status="pending"):
    quote_id = str(uuid.uuid4())
    booking_id = str(uuid.uuid4())
    quote_doc = {
        "id": quote_id,
        "user_id": f"{TEST_TAG}_user",
        "items": items,
        "total_price": total_price,
        "scale_level": 5,
        "description": f"{TEST_TAG} seed",
        "temp_image_paths": [],
        "approval_status": "auto_approved",
        "requires_approval": False,
        "heavy_pile": False,
        "equipment_fee": equipment_fee,
        "equipment_required": equipment_fee > 0,
        "created_at": datetime.now(timezone.utc),
    }
    if approved_price is not None:
        quote_doc["approved_price"] = approved_price
    mongo_db.quotes.insert_one(quote_doc)

    mongo_db.bookings.insert_one({
        "id": booking_id,
        "user_id": f"{TEST_TAG}_user",
        "quote_id": quote_id,
        "pickup_date": datetime.now(timezone.utc),
        "pickup_time": "10:00-12:00",
        "address": f"{TEST_TAG} 123 Test St",
        "phone": "+15555550111",
        "email": "iter22@example.com",
        "curbside_confirmed": True,
        "email_notifications": False,
        "status": "scheduled",
        "payment_status": payment_status,
        "payment_method": "venmo",
        "created_at": datetime.now(timezone.utc),
        "priority_fee": priority_fee,
        "equipment_required": equipment_fee > 0,
        "equipment_fee": equipment_fee,
        "tip_amount": tip_amount,
        "consent_accepted": True,
    })
    return booking_id, quote_id


@pytest.fixture
def cleanup_ids(mongo_db):
    tracker = {"bookings": [], "quotes": []}
    yield tracker
    if tracker["bookings"]:
        mongo_db.bookings.delete_many({"id": {"$in": tracker["bookings"]}})
    if tracker["quotes"]:
        mongo_db.quotes.delete_many({"id": {"$in": tracker["quotes"]}})


# Tests ------------------------------------------------------------------
class TestInvoiceAuth:
    def test_unauthenticated_returns_401(self):
        r = requests.get(
            f"{BASE_URL}/api/admin/bookings/anything/invoice", timeout=15
        )
        assert r.status_code == 401, r.text[:200]

    def test_nonexistent_returns_404(self, admin_session):
        fake = str(uuid.uuid4())
        r = admin_session.get(
            f"{BASE_URL}/api/admin/bookings/{fake}/invoice", timeout=15
        )
        assert r.status_code == 404
        assert "Booking not found" in r.text


class TestInvoiceRendering:
    def test_basic_html_and_branding(self, mongo_db, admin_session, cleanup_ids):
        bid, qid = _seed(
            mongo_db,
            items=[{"name": "Sofa", "size": "large", "quantity": 1,
                    "description": "brown"}],
            total_price=200.0,
        )
        cleanup_ids["bookings"].append(bid)
        cleanup_ids["quotes"].append(qid)

        r = admin_session.get(
            f"{BASE_URL}/api/admin/bookings/{bid}/invoice", timeout=15
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("text/html")
        html = r.text
        assert len(html) > 2000, f"body too short: {len(html)}"
        # Branding
        assert "Text" in html and "2" in html and "toss" in html
        # Invoice number = first 8 of booking_id, uppercased
        assert bid[:8].upper() in html
        # Line items section (case-insensitive match on 'line item' text used in header)
        assert re.search(r"line\s*items?", html, re.IGNORECASE), \
            "Missing 'Line items' section"
        # Per-item name shown
        assert "Sofa" in html
        # cu ft rendered
        assert "cu ft" in html

    def test_volume_and_cost_math_single_item(self, mongo_db, admin_session,
                                              cleanup_ids):
        # 2 medium items -> 2*25 = 50 cu ft, base = 200 => cost=200.00
        bid, qid = _seed(
            mongo_db,
            items=[{"name": "Chair", "size": "medium", "quantity": 2}],
            total_price=200.0,
        )
        cleanup_ids["bookings"].append(bid)
        cleanup_ids["quotes"].append(qid)
        r = admin_session.get(
            f"{BASE_URL}/api/admin/bookings/{bid}/invoice", timeout=15
        )
        assert r.status_code == 200
        html = r.text
        # 50 cu ft rendered
        assert "50 cu ft" in html, "expected 50 cu ft in invoice"
        # cost $200.00
        assert "$200.00" in html

    def test_multi_item_cost_sums_to_base(self, mongo_db, admin_session,
                                         cleanup_ids):
        # Small(8) + Medium(25) + Large(60) = 93 cu ft, base=300
        bid, qid = _seed(
            mongo_db,
            items=[
                {"name": "Lamp", "size": "small", "quantity": 1},
                {"name": "Desk", "size": "medium", "quantity": 1},
                {"name": "Sofa", "size": "large", "quantity": 1},
            ],
            total_price=300.0,
        )
        cleanup_ids["bookings"].append(bid)
        cleanup_ids["quotes"].append(qid)
        r = admin_session.get(
            f"{BASE_URL}/api/admin/bookings/{bid}/invoice", timeout=15
        )
        assert r.status_code == 200
        html = r.text
        for expected in ["8 cu ft", "25 cu ft", "60 cu ft"]:
            assert expected in html, f"missing {expected}"
        # Cost is allocated per *category* bucket proportional to cu ft;
        # the bucket costs must sum back to the base price.
        bucket_costs = [
            float(m) for m in re.findall(
                r'class="right money"><strong>\$([\d.]+)</strong>', html
            )
        ]
        assert bucket_costs, "no category cost cells rendered"
        assert abs(sum(bucket_costs) - 300.0) < 0.02, bucket_costs

    def test_approved_price_overrides_total(self, mongo_db, admin_session,
                                            cleanup_ids):
        bid, qid = _seed(
            mongo_db,
            items=[{"name": "Couch", "size": "large", "quantity": 1}],
            total_price=200.0,
            approved_price=300.0,
        )
        cleanup_ids["bookings"].append(bid)
        cleanup_ids["quotes"].append(qid)
        r = admin_session.get(
            f"{BASE_URL}/api/admin/bookings/{bid}/invoice", timeout=15
        )
        assert r.status_code == 200
        html = r.text
        # per-item cost + grand total should be $300.00, not $200.00
        assert "$300.00" in html
        # Ensure "$200.00" not surfaced anywhere as a monetary cell
        # (may show up incidentally but we assert 300 is grand total)
        # Grand total row is the largest currency; check appears at least twice
        # (once per-item, once grand total)
        assert html.count("$300.00") >= 2

    def test_extras_rows_and_grand_total(self, mongo_db, admin_session,
                                        cleanup_ids):
        bid, qid = _seed(
            mongo_db,
            items=[{"name": "Fridge", "size": "large", "quantity": 1}],
            total_price=200.0,
            priority_fee=25.0,
            equipment_fee=50.0,
            tip_amount=15.0,
        )
        cleanup_ids["bookings"].append(bid)
        cleanup_ids["quotes"].append(qid)
        r = admin_session.get(
            f"{BASE_URL}/api/admin/bookings/{bid}/invoice", timeout=15
        )
        assert r.status_code == 200
        html = r.text
        assert "Priority" in html and "$25.00" in html
        assert "quipment" in html and "$50.00" in html  # 'Heavy-pile equipment'
        assert "ip" in html and "$15.00" in html
        # Grand total = 200+25+50+15 = 290
        assert "$290.00" in html

    def test_paid_badge_when_paid(self, mongo_db, admin_session, cleanup_ids):
        bid, qid = _seed(
            mongo_db,
            items=[{"name": "Box", "size": "small", "quantity": 1}],
            total_price=50.0,
            payment_status="paid",
        )
        cleanup_ids["bookings"].append(bid)
        cleanup_ids["quotes"].append(qid)
        r = admin_session.get(
            f"{BASE_URL}/api/admin/bookings/{bid}/invoice", timeout=15
        )
        assert r.status_code == 200
        html = r.text
        assert 'class="paid-badge"' in html
        assert re.search(r">\s*PAID\s*<", html), "missing PAID text"

    def test_no_paid_badge_when_unpaid(self, mongo_db, admin_session,
                                     cleanup_ids):
        bid, qid = _seed(
            mongo_db,
            items=[{"name": "Box", "size": "small", "quantity": 1}],
            total_price=50.0,
            payment_status="pending",
        )
        cleanup_ids["bookings"].append(bid)
        cleanup_ids["quotes"].append(qid)
        r = admin_session.get(
            f"{BASE_URL}/api/admin/bookings/{bid}/invoice", timeout=15
        )
        assert r.status_code == 200
        html = r.text
        # The .paid-badge CSS class definition is always in <style>, so check
        # for the actual badge span element instead.
        assert 'class="paid-badge"' not in html
        assert not re.search(r">\s*PAID\s*<", html)
