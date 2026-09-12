"""
- GET /api/admin/reel-photos auto-pads a legacy 6-slot reel to 10 on read
- DELETE /api/admin/gallery-photo finds photos by filename tail when the
  stored URL has drifted (old domain / http) and unpins them from the reel
- POST /api/webhooks/venmo-payment: 401 without secret, parses raw Gmail
  {subject, body} payload and flips the booking to paid
"""
import os
import uuid
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient


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
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "lrobe")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "L1964c10$")


@pytest.fixture(scope="module")
def db():
    client = MongoClient(_backend_env("MONGO_URL"))
    yield client[_backend_env("DB_NAME")]
    client.close()


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/admin/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed ({r.status_code})")
    return s


@pytest.fixture
def original_reel(db):
    doc = db.photo_reel.find_one({"type": "main_reel"})
    saved = list(doc["photos"]) if doc else [None] * 10
    yield saved
    db.photo_reel.update_one({"type": "main_reel"}, {"$set": {"photos": saved}}, upsert=True)


class TestReelMigration:
    def test_legacy_six_slot_reel_pads_to_ten_on_read(self, db, admin_session, original_reel):
        legacy = ["https://old.example.com/api/images/gallery/a.jpg"] + [None] * 5
        db.photo_reel.update_one({"type": "main_reel"}, {"$set": {"photos": legacy}}, upsert=True)
        r = admin_session.get(f"{BASE_URL}/api/admin/reel-photos")
        assert r.status_code == 200, r.text
        photos = r.json()["photos"]
        assert len(photos) == 10
        assert photos[0] and photos[0].endswith("/a.jpg")
        assert photos[6:] == [None] * 4


class TestRobustGalleryDelete:
    def test_deletes_by_filename_tail_and_unpins_reel(self, db, admin_session, original_reel):
        fname = f"legacy_{uuid.uuid4().hex}.jpg"
        stale_url = f"http://text2toss-junk.preview.emergentagent.com/static/gallery/{fname}"
        db.gallery_photos.insert_one({"url": stale_url, "created_at": "2024-01-01T00:00:00"})
        reel = [stale_url] + [None] * 9
        db.photo_reel.update_one({"type": "main_reel"}, {"$set": {"photos": reel}}, upsert=True)

        current_url = f"{BASE_URL}/api/images/gallery/{fname}"
        r = admin_session.delete(f"{BASE_URL}/api/admin/gallery-photo", json={"photo_url": current_url})
        assert r.status_code == 200, r.text
        assert r.json()["removed_count"] == 1
        assert db.gallery_photos.count_documents({"url": stale_url}) == 0
        assert db.photo_reel.find_one({"type": "main_reel"})["photos"][0] is None

    def test_missing_photo_returns_404(self, admin_session):
        r = admin_session.delete(f"{BASE_URL}/api/admin/gallery-photo", json={"photo_url": f"{BASE_URL}/api/images/gallery/nope_{uuid.uuid4().hex}.jpg"})
        assert r.status_code == 404


class TestVenmoWebhook:
    def test_missing_secret_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/webhooks/venmo-payment", json={"subject": "x", "body": "y"})
        assert r.status_code == 401

    def test_gmail_payload_marks_booking_paid(self, db):
        secret = _backend_env("VENMO_WEBHOOK_SECRET")
        if not secret:
            pytest.skip("VENMO_WEBHOOK_SECRET not set")
        booking_id = str(uuid.uuid4())
        db.bookings.insert_one({
            "id": booking_id, "payment_status": "pending", "approved_price": 150.0,
            "created_at": "2030-01-01T00:00:00", "customer_details": {"name": "Webhook Test"},
        })
        try:
            inv = booking_id[:8].upper()
            r = requests.post(
                f"{BASE_URL}/api/webhooks/venmo-payment",
                headers={"X-Webhook-Secret": secret},
                json={
                    "subject": f"Jane Doe paid you $150.00",
                    "body": f"Jane Doe paid you $150.00\nText2toss Invoice #{inv}\nThanks!",
                    "from": "venmo@venmo.com",
                },
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["matched"] is True
            assert body["booking_id"] == booking_id
            assert body["matched_by"] == "invoice_number"
            assert body["amount"] == 150.0
            doc = db.bookings.find_one({"id": booking_id})
            assert doc["payment_status"] == "paid"
            assert doc["paid_via"] == "venmo_webhook"
            assert doc["venmo_webhook_meta"]["sender"] == "Jane Doe"
        finally:
            db.bookings.delete_one({"id": booking_id})


class TestInvoiceNumberAndDuplicate:
    def _cleanup(self, db, bid):
        b = db.bookings.find_one({"id": bid})
        if b:
            db.quotes.delete_one({"id": b.get("quote_id")})
            db.bookings.delete_one({"id": bid})

    def test_duplicate_from_customer_copies_details(self, db, admin_session):
        src_id = str(uuid.uuid4())
        db.bookings.insert_one({"id": src_id, "customer_details": {"name": "Dup Src", "email": "dup@x.com", "phone": "555", "address": "1 Main"}, "payment_status": "paid", "created_at": "2030-01-01"})
        r = admin_session.post(f"{BASE_URL}/api/admin/bookings/manual-invoice", json={"from_booking_id": src_id})
        assert r.status_code == 200, r.text
        new_id = r.json()["id"]
        try:
            data = admin_session.get(f"{BASE_URL}/api/admin/bookings/{new_id}/invoice-data").json()
            assert data["customer"] == {"name": "Dup Src", "email": "dup@x.com", "phone": "555", "address": "1 Main"}
            assert data["invoice_number"] == new_id[:8].upper()
        finally:
            self._cleanup(db, new_id)
            db.bookings.delete_one({"id": src_id})

    def test_duplicate_unknown_source_404(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/admin/bookings/manual-invoice", json={"from_booking_id": "nope"})
        assert r.status_code == 404

    def test_editable_invoice_number_validation_clash_and_render(self, db, admin_session):
        other_id = str(uuid.uuid4())
        db.bookings.insert_one({"id": other_id, "invoice_number": "TAKEN-1", "payment_status": "paid"})
        new_id = admin_session.post(f"{BASE_URL}/api/admin/bookings/manual-invoice", json={}).json()["id"]
        url = f"{BASE_URL}/api/admin/bookings/{new_id}/invoice-data"
        try:
            assert admin_session.patch(url, json={"invoice_number": "a!"}).status_code == 400
            assert admin_session.patch(url, json={"invoice_number": "taken-1"}).status_code == 409
            assert admin_session.patch(url, json={"invoice_number": other_id[:8]}).status_code == 409
            assert admin_session.patch(url, json={"invoice_number": "inv-2026-7"}).status_code == 200
            assert admin_session.get(url).json()["invoice_number"] == "INV-2026-7"
            assert "Invoice #INV-2026-7" in admin_session.get(f"{BASE_URL}/api/admin/bookings/{new_id}/invoice").text
            # resetting to the default clears the override
            assert admin_session.patch(url, json={"invoice_number": new_id[:8]}).status_code == 200
            assert db.bookings.find_one({"id": new_id})["invoice_number"] is None
        finally:
            self._cleanup(db, new_id)
            db.bookings.delete_one({"id": other_id})

    def test_webhook_matches_custom_number_and_recent_feed(self, db, admin_session):
        secret = _backend_env("VENMO_WEBHOOK_SECRET")
        if not secret:
            pytest.skip("VENMO_WEBHOOK_SECRET not set")
        bid = str(uuid.uuid4())
        db.bookings.insert_one({"id": bid, "invoice_number": "CUST-99", "payment_status": "unpaid", "approved_price": 12345.67, "created_at": "2030-01-01", "customer_details": {"name": "Custom Num"}})
        try:
            r = requests.post(f"{BASE_URL}/api/webhooks/venmo-payment", headers={"X-Webhook-Secret": secret},
                              json={"subject": "Pat paid you $12,345.67", "body": "Pat paid you $12,345.67\nText2toss Invoice #CUST-99"})
            assert r.status_code == 200 and r.json()["booking_id"] == bid and r.json()["matched_by"] == "invoice_number"
            feed = admin_session.get(f"{BASE_URL}/api/admin/venmo-payments/recent", params={"since": "2020-01-01T00:00:00"}).json()["payments"]
            hit = next(p for p in feed if p["booking_id"] == bid)
            assert hit["invoice_number"] == "CUST-99" and hit["amount"] == 12345.67 and hit["customer_name"] == "Custom Num"
            later = admin_session.get(f"{BASE_URL}/api/admin/venmo-payments/recent", params={"since": "2999-01-01T00:00:00"}).json()["payments"]
            assert all(p["booking_id"] != bid for p in later)
        finally:
            db.bookings.delete_one({"id": bid})


class TestReturningCustomerFlag:
    def test_all_bookings_flags_repeat_customer_by_email(self, db, admin_session):
        email = f"repeat_{uuid.uuid4().hex[:6]}@x.com"
        ids = [str(uuid.uuid4()) for _ in range(3)]
        db.bookings.insert_many([
            {"id": ids[0], "email": email, "name": "Jane Repeat", "status": "completed", "payment_status": "paid", "created_at": "2030-01-01T00:00:00"},
            {"id": ids[1], "customer_details": {"email": email.upper(), "name": "Jane Repeat"}, "status": "cancelled", "created_at": "2030-01-02T00:00:00"},
            {"id": ids[2], "customer_details": {"email": email, "name": "Jane Repeat"}, "status": "scheduled", "payment_status": "paid", "created_at": "2030-01-03T00:00:00"},
        ])
        try:
            data = {b["id"]: b for b in admin_session.get(f"{BASE_URL}/api/admin/all-bookings").json()}
            assert data[ids[0]]["returning_customer"] is None
            # cancelled bookings don't count as prior jobs, so the third sees exactly 1
            assert data[ids[2]]["returning_customer"] == {"previous_jobs": 1, "first_name": "Jane"}
        finally:
            db.bookings.delete_many({"id": {"$in": ids}})


class TestInvoiceNotesAndCustomerHistory:
    def test_invoice_notes_saved_escaped_and_rendered(self, db, admin_session):
        new_id = admin_session.post(f"{BASE_URL}/api/admin/bookings/manual-invoice", json={}).json()["id"]
        url = f"{BASE_URL}/api/admin/bookings/{new_id}/invoice-data"
        try:
            assert admin_session.patch(url, json={"invoice_notes": "x" * 1001}).status_code == 400
            assert admin_session.patch(url, json={"invoice_notes": "Due in 7 days.\n<b>Thanks</b> & bye"}).status_code == 200
            assert admin_session.get(url).json()["invoice_notes"] == "Due in 7 days.\n<b>Thanks</b> & bye"
            html = admin_session.get(f"{BASE_URL}/api/admin/bookings/{new_id}/invoice").text
            assert "Notes &amp; payment terms" in html
            assert "Due in 7 days.<br>&lt;b&gt;Thanks&lt;/b&gt; &amp; bye" in html
            assert admin_session.patch(url, json={"invoice_notes": ""}).status_code == 200
            assert "Notes &amp; payment terms" not in admin_session.get(f"{BASE_URL}/api/admin/bookings/{new_id}/invoice").text
        finally:
            b = db.bookings.find_one({"id": new_id})
            db.quotes.delete_one({"id": b["quote_id"]})
            db.bookings.delete_one({"id": new_id})

    def test_customer_history_by_email_excludes_current_and_cancelled(self, db, admin_session):
        email = f"hist_{uuid.uuid4().hex[:6]}@x.com"
        ids = [str(uuid.uuid4()) for _ in range(3)]
        qid = str(uuid.uuid4())
        db.quotes.insert_one({"id": qid, "items": [{"name": "Couch", "quantity": 2}], "approved_price": 200.0})
        db.bookings.insert_many([
            {"id": ids[0], "email": email, "quote_id": qid, "status": "completed", "payment_status": "paid", "pickup_date": "2030-01-01", "tip_amount": 20, "created_at": "2030-01-01"},
            {"id": ids[1], "customer_details": {"email": email}, "status": "cancelled", "payment_status": "paid", "approved_price": 999, "pickup_date": "2030-01-02", "created_at": "2030-01-02"},
            {"id": ids[2], "customer_details": {"email": email}, "status": "scheduled", "payment_status": "unpaid", "approved_price": 50, "pickup_date": "2030-01-03", "created_at": "2030-01-03"},
        ])
        try:
            r = admin_session.get(f"{BASE_URL}/api/admin/customers/history", params={"email": email.upper(), "exclude": ids[2]})
            assert r.status_code == 200, r.text
            d = r.json()
            assert [j["id"] for j in d["jobs"]] == [ids[0]]
            assert d["jobs"][0]["total"] == 220.0 and d["jobs"][0]["items"] == ["2× Couch"]
            assert d["lifetime_paid"] == 220.0 and d["job_count"] == 1
            assert admin_session.get(f"{BASE_URL}/api/admin/customers/history").status_code == 400
        finally:
            db.bookings.delete_many({"id": {"$in": ids}})
            db.quotes.delete_one({"id": qid})
