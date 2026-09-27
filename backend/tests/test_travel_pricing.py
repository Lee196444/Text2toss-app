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


class TestServiceRadius:
    def _route(self, pickup_mi):
        return {"miles": pickup_mi * 2 + 12, "legs": [{"miles": pickup_mi}, {"miles": 12.0}, {"miles": pickup_mi}]}

    def test_cap_logic(self):
        s = tp.coerce_settings({"max_service_miles": 40})
        assert tp.outside_service_area(self._route(39.9), s) is False
        assert tp.outside_service_area(self._route(40.1), s) is True
        assert tp.outside_service_area(self._route(500), tp.coerce_settings({"max_service_miles": 0})) is False
        assert tp.pickup_leg_miles(self._route(17.25)) == 17.25

    def test_message_setting_roundtrip(self, admin_session):
        original = admin_session.get(f"{BASE_URL}/api/admin/pricing/settings").json()
        assert original["max_service_miles"] == 40.0 or original["max_service_miles"] >= 0
        try:
            r = admin_session.post(f"{BASE_URL}/api/admin/pricing/settings", json={**original, "max_service_miles": 25, "out_of_area_message": "Call us at (928) 853-9619!"})
            assert r.status_code == 200
            got = admin_session.get(f"{BASE_URL}/api/admin/pricing/settings").json()
            assert got["max_service_miles"] == 25.0 and got["out_of_area_message"] == "Call us at (928) 853-9619!"
        finally:
            admin_session.post(f"{BASE_URL}/api/admin/pricing/settings", json=original)

    def test_out_of_area_booking_is_flagged_for_manual_review(self, db):
        qid = str(uuid.uuid4())
        addr = "1 Far Away Rd, Phoenix, AZ 85001"
        db.quotes.insert_one({"id": qid, "user_id": "anonymous", "items": [{"name": "Sofa", "size": "large", "quantity": 1}],
                              "total_price": 180.0, "description": "t", "requires_approval": False, "approval_status": "auto_approved",
                              "created_at": "2030-01-01T00:00:00",
                              "travel_estimate": {"status": "out_of_area", "address": addr, "pickup_miles": 145.2,
                                                  "reason": "Pickup is 145.2 mi one-way — beyond the 40 mi service radius",
                                                  "message": "Call us", "route": {"miles": 302.4, "legs": [{"miles": 145.2}, {"miles": 12}, {"miles": 145.2}]}}})
        bid = None
        try:
            rb = requests.post(f"{BASE_URL}/api/bookings", json={
                "quote_id": qid, "pickup_date": "2031-03-04", "pickup_time": "9:00 AM", "address": addr,
                "phone": "9285550100", "email": "travel@test.com", "consent_accepted": True, "curbside_confirmed": True})
            assert rb.status_code == 200, rb.text
            bid = rb.json()["id"]
            assert rb.json()["requires_manual_review"] is True
            bdoc = db.bookings.find_one({"id": bid})
            assert bdoc["travel_pricing"]["status"] == "out_of_area" and bdoc["final_quote_price"] is None
            assert bdoc["status"] == "pending_customer_approval"
            q = db.quotes.find_one({"id": qid})
            assert q["approval_status"] == "pending_approval" and q["admin_notes"].startswith("Out of service area")
            assert "approved_price" not in q or q["approved_price"] is None
        finally:
            db.quotes.delete_one({"id": qid})
            if bid:
                db.bookings.delete_one({"id": bid})


class TestPlacesAndAlerts:
    def test_places_suggest_is_public_and_degrades_gracefully(self):
        r = requests.get(f"{BASE_URL}/api/places/suggest", params={"q": "1500 N Fort Valley"})
        assert r.status_code == 200 and isinstance(r.json()["suggestions"], list)
        assert requests.get(f"{BASE_URL}/api/places/suggest", params={"q": "ab"}).json()["suggestions"] == []
        assert "key=" not in r.text  # never leaks the server key

    def test_alert_contact_settings_persist(self, admin_session):
        original = admin_session.get(f"{BASE_URL}/api/admin/pricing/settings").json()
        try:
            r = admin_session.post(f"{BASE_URL}/api/admin/pricing/settings", json={**original, "alert_phone": "+19285550100", "alert_email": "a@b.com"})
            assert r.status_code == 200
            got = admin_session.get(f"{BASE_URL}/api/admin/pricing/settings").json()
            assert got["alert_phone"] == "+19285550100" and got["alert_email"] == "a@b.com"
        finally:
            admin_session.post(f"{BASE_URL}/api/admin/pricing/settings", json=original)


class TestCallbackLog:
    def test_callback_log_appends_with_admin_name(self, db, admin_session):
        bid = str(uuid.uuid4())
        db.bookings.insert_one({"id": bid, "phone": "+19285550100", "requires_manual_review": True, "payment_status": "pending", "created_at": "2030-01-01"})
        try:
            r = admin_session.post(f"{BASE_URL}/api/admin/bookings/{bid}/callback-log", json={"note": "left voicemail"})
            assert r.status_code == 200, r.text
            log = r.json()["callback_log"]
            assert len(log) == 1 and log[0]["note"] == "left voicemail" and log[0]["by"]
            r2 = admin_session.post(f"{BASE_URL}/api/admin/bookings/{bid}/callback-log")
            assert len(r2.json()["callback_log"]) == 2
            doc = db.bookings.find_one({"id": bid})
            assert doc["last_callback_at"] == doc["callback_log"][-1]["at"]
            assert requests.post(f"{BASE_URL}/api/admin/bookings/{bid}/callback-log").status_code == 401
            assert admin_session.post(f"{BASE_URL}/api/admin/bookings/nope/callback-log").status_code == 404
        finally:
            db.bookings.delete_one({"id": bid})


class TestApproveWithPrice:
    def test_customer_agreed_skips_sms_and_schedules_payment(self, db, admin_session):
        qid, bid = str(uuid.uuid4()), str(uuid.uuid4())
        db.quotes.insert_one({"id": qid, "total_price": 180.0, "items": [], "requires_approval": True, "approval_status": "pending_approval", "created_at": "2031-01-01"})
        db.bookings.insert_one({"id": bid, "quote_id": qid, "phone": "+19285550100", "email": "approve-test@example.invalid", "status": "pending_customer_approval",
                                "payment_status": "pending", "requires_manual_review": True, "travel_pricing": {"status": "manual_review", "reason": "x"}, "created_at": "2031-01-01"})
        try:
            r = admin_session.post(f"{BASE_URL}/api/admin/quotes/{qid}/approve", json={"action": "approve", "approved_price": 450.0, "customer_agreed": True, "admin_notes": "phone"})
            assert r.status_code == 200, r.text
            q = db.quotes.find_one({"id": qid}); b = db.bookings.find_one({"id": bid})
            assert q["approved_price"] == 450.0 and q["approval_status"] == "approved"
            assert b["status"] == "pending_payment" and b["requires_manual_review"] is False
            assert b["travel_pricing"]["status"] == "priced_by_admin" and b["travel_pricing"]["admin_price"] == 450.0
            assert not b.get("customer_approval_token")
        finally:
            db.quotes.delete_one({"id": qid}); db.bookings.delete_one({"id": bid})

    def test_editable_email_text_roundtrip(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/emails/editable", params={"template": "quote_under_review"})
        assert r.status_code == 200 and any(f["key"] == "title" for f in r.json()["fields"])
        try:
            assert admin_session.post(f"{BASE_URL}/api/admin/emails/editable", json={"template": "quote_under_review", "values": {"title": "We got your photos!", "bogus": "x"}}).status_code == 200
            html = admin_session.get(f"{BASE_URL}/api/admin/emails/preview", params={"template": "quote_under_review"}).text
            assert "We got your photos!" in html and "Quote Successfully Submitted" not in html
        finally:
            admin_session.post(f"{BASE_URL}/api/admin/emails/editable", json={"template": "quote_under_review", "values": {}})
        html = admin_session.get(f"{BASE_URL}/api/admin/emails/preview", params={"template": "quote_under_review"}).text
        assert "Quote Successfully Submitted" in html
        assert admin_session.get(f"{BASE_URL}/api/admin/emails/editable", params={"template": "manual_review_alert"}).status_code == 404
