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
