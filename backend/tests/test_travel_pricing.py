"""Route-based travel pricing: math, settings, and API wiring.

Google Directions is exercised only through the manual-review path here (the
preview key may lack billing); the math is verified directly.
"""
import os
import uuid
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import travel_pricing as tp  # noqa: E402


def _load_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if url:
        return url.rstrip("/")
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


def _backend_env(key: str) -> str:
    for line in Path("/app/backend/.env").read_text().splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


BASE_URL = _load_backend_url()


@pytest.fixture(scope="module")
def db():
    client = MongoClient(_backend_env("MONGO_URL"))
    yield client[_backend_env("DB_NAME")]
    client.close()


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/admin/login", json={"username": os.environ.get("ADMIN_USERNAME", "lrobe"), "password": os.environ.get("ADMIN_PASSWORD", "L1964c10$")})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return s


class TestMath:
    def test_round_up_examples(self):
        assert tp.round_up(421.13, 5) == 425.0
        assert tp.round_up(425.0, 5) == 425.0
        assert tp.round_up(100.01, 5) == 105.0
        assert tp.round_up(99.99, 1) == 100.0

    def test_fuel_and_gross_up(self):
        s = tp.coerce_settings({"tow_mpg": 8, "gas_price_per_gallon": 4.79, "maintenance_pct": 14,
                                "recover_processing_fees": True, "processing_pct": 2.9, "processing_fixed_fee": 0.30,
                                "default_disposal_fee": 35, "rounding_increment": 5})
        b = tp.compute_pricing(300.0, 40.0, s, heavy_item_fees=150.0)
        assert b["gallons"] == 5.0
        assert b["fuel_cost"] == round(5.0 * 4.79, 2)
        assert b["subtotal"] == round(300 + 23.95 + 150 + 35, 2)
        assert b["maintenance_reserve"] == round(b["subtotal"] * 0.14, 2)
        assert b["internal_price"] == round(b["subtotal"] * 1.14, 2)
        # NET after 2.9% + $0.30 on the pre-rounding price equals the internal price
        net = b["pre_rounding_price"] * (1 - 0.029) - 0.30
        assert abs(net - b["internal_price"]) < 0.02
        assert b["final_price"] % 5 == 0 and b["final_price"] >= b["pre_rounding_price"]
        assert b["inputs"]["gas_price_per_gallon"] == 4.79 and b["inputs"]["tow_mpg"] == 8.0

    def test_processing_recovery_off(self):
        s = tp.coerce_settings({"recover_processing_fees": False, "rounding_increment": 1, "default_disposal_fee": 0, "maintenance_pct": 0})
        b = tp.compute_pricing(100.0, 0.0, s)
        assert b["processing_allowance"] == 0.0 and b["internal_price"] == 100.0 and b["final_price"] == 100.0

    def test_settings_coercion_and_required(self):
        s = tp.coerce_settings({"tow_mpg": "abc", "gas_price_per_gallon": -3, "base_address": "  ", "rounding_increment": 0})
        assert s["tow_mpg"] == 8.0 and s["gas_price_per_gallon"] == 0.0 and s["rounding_increment"] == 0.01
        assert set(tp.missing_required(s)) == {"base_address", "gas_price_per_gallon"}


class TestApi:
    def test_settings_roundtrip(self, admin_session, db):
        original = admin_session.get(f"{BASE_URL}/api/admin/pricing/settings").json()
        try:
            r = admin_session.post(f"{BASE_URL}/api/admin/pricing/settings", json={**original, "gas_price_per_gallon": 5.25, "tow_mpg": 9})
            assert r.status_code == 200 and r.json()["gas_price_per_gallon"] == 5.25
            assert admin_session.get(f"{BASE_URL}/api/admin/pricing/settings").json()["tow_mpg"] == 9.0
        finally:
            admin_session.post(f"{BASE_URL}/api/admin/pricing/settings", json=original)

    def test_settings_require_admin(self):
        assert requests.get(f"{BASE_URL}/api/admin/pricing/settings").status_code == 401

    def test_estimate_never_leaks_internals_and_booking_flags_manual_review(self, db):
        qid = str(uuid.uuid4())
        db.quotes.insert_one({"id": qid, "user_id": "anonymous", "items": [{"name": "Sofa", "size": "large", "quantity": 1}],
                              "total_price": 250.0, "description": "t", "requires_approval": False, "approval_status": "auto_approved",
                              "created_at": "2030-01-01T00:00:00"})
        bid = None
        try:
            r = requests.post(f"{BASE_URL}/api/quotes/{qid}/travel-estimate", json={"address": "1500 N Fort Valley Rd, Flagstaff, AZ 86001"})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["status"] in ("ok", "manual_review", "disabled")
            for leaked in ("fuel", "maintenance", "processing", "breakdown", "gallons"):
                assert leaked not in r.text.lower()
            if body["status"] == "ok":
                assert body["display"].startswith("Your Text2Toss Quote: $")
            stored = db.quotes.find_one({"id": qid}).get("travel_estimate")
            assert stored is None or stored["status"] == body["status"]
            assert requests.post(f"{BASE_URL}/api/quotes/{qid}/travel-estimate", json={"address": "x"}).status_code == 400

            rb = requests.post(f"{BASE_URL}/api/bookings", json={
                "quote_id": qid, "pickup_date": "2031-03-03", "pickup_time": "9:00 AM",
                "address": "1500 N Fort Valley Rd, Flagstaff, AZ 86001", "phone": "9285550100",
                "email": "travel@test.com", "consent_accepted": True, "curbside_confirmed": True,
            })
            assert rb.status_code == 200, rb.text
            bid = rb.json()["id"]
            bdoc = db.bookings.find_one({"id": bid})
            qdoc = db.quotes.find_one({"id": qid})
            if body["status"] == "manual_review":
                assert bdoc["requires_manual_review"] is True
                assert bdoc["travel_pricing"]["status"] == "manual_review"
                assert qdoc["requires_approval"] is True and qdoc["approval_status"] == "pending_approval"
                assert "Manual review" in qdoc["admin_notes"]
                assert bdoc["status"] == "pending_customer_approval"
            elif body["status"] == "ok":
                tpz = bdoc["travel_pricing"]
                assert bdoc["final_quote_price"] == tpz["breakdown"]["final_price"] == body["final_price"]
                assert tpz["breakdown"]["inputs"]["tow_mpg"] > 0  # frozen snapshot
                assert qdoc["approved_price"] == tpz["breakdown"]["final_price"] - tpz["breakdown"]["heavy_item_fees"]
        finally:
            db.quotes.delete_one({"id": qid})
            if bid:
                db.bookings.delete_one({"id": bid})
