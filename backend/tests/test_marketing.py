"""
Tests for the Marketing endpoints used by the admin QR modal:
- POST /api/admin/marketing/share-event
- GET  /api/admin/marketing/stats
- GET  /api/admin/marketing/settings
- POST /api/admin/marketing/settings

Auth: httpOnly admin_session cookie set by POST /api/admin/login.
"""
import os
import pytest
import requests
from pathlib import Path


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
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "lrobe")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "L1964c10$")

VALID_CHANNELS = ["native", "facebook", "copy", "download"]
ENDPOINTS = [
    ("POST", "/api/admin/marketing/share-event", {"channel": "native"}),
    ("GET",  "/api/admin/marketing/stats", None),
    ("GET",  "/api/admin/marketing/settings", None),
    ("POST", "/api/admin/marketing/settings", {
        "deal_text": "test", "deal_active": False,
        "reminder_enabled": False, "reminder_hour": 10
    }),
]


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_session():
    """Authenticated session with admin_session cookie (used across tests)."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/admin/login",
               json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed ({r.status_code}): {r.text}")
    assert "admin_session" in s.cookies
    return s


@pytest.fixture
def anon_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Auth gating ----------

class TestMarketingAuthGating:
    """All 4 marketing endpoints must require admin_session cookie."""

    @pytest.mark.parametrize("method,path,body", ENDPOINTS)
    def test_endpoint_requires_admin_cookie(self, anon_session, method, path, body):
        url = f"{BASE_URL}{path}"
        if method == "GET":
            r = anon_session.get(url)
        else:
            r = anon_session.post(url, json=body)
        assert r.status_code == 401, (
            f"{method} {path} expected 401 without cookie, got {r.status_code}: {r.text}"
        )


# ---------- Share event ----------

class TestMarketingShareEvent:

    @pytest.mark.parametrize("channel", VALID_CHANNELS)
    def test_share_event_valid_channels(self, admin_session, channel):
        r = admin_session.post(
            f"{BASE_URL}/api/admin/marketing/share-event",
            json={"channel": channel},
        )
        assert r.status_code == 200, f"{channel}: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("success") is True
        # Must not leak Mongo _id
        assert "_id" not in data

    def test_share_event_invalid_channel_returns_400(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/admin/marketing/share-event",
            json={"channel": "twitter"},
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_share_event_missing_channel_returns_422(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/admin/marketing/share-event",
            json={},
        )
        # Pydantic validation -> 422
        assert r.status_code in (400, 422), f"Got {r.status_code}: {r.text}"

    def test_share_event_increments_stats(self, admin_session):
        # Snapshot
        before = admin_session.get(f"{BASE_URL}/api/admin/marketing/stats").json()
        # Fire one event on a known channel
        r = admin_session.post(
            f"{BASE_URL}/api/admin/marketing/share-event",
            json={"channel": "copy"},
        )
        assert r.status_code == 200
        after = admin_session.get(f"{BASE_URL}/api/admin/marketing/stats").json()

        assert after["total"] == before["total"] + 1, (
            f"total didn't increment: before={before}, after={after}"
        )
        assert after["this_week"] == before["this_week"] + 1
        assert after["by_channel"].get("copy", 0) == before["by_channel"].get("copy", 0) + 1


# ---------- Stats ----------

class TestMarketingStats:

    def test_stats_shape(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/marketing/stats")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("this_week", "total", "by_channel"):
            assert k in data, f"Missing key {k} in {data}"
        assert isinstance(data["this_week"], int)
        assert isinstance(data["total"], int)
        assert isinstance(data["by_channel"], dict)
        assert "_id" not in data


# ---------- Settings ----------

class TestMarketingSettings:

    def test_get_settings_returns_object(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/marketing/settings")
        assert r.status_code == 200, r.text
        data = r.json()
        # Required keys with correct types
        assert isinstance(data.get("deal_text"), str)
        assert isinstance(data.get("deal_active"), bool)
        assert isinstance(data.get("reminder_enabled"), bool)
        assert isinstance(data.get("reminder_hour"), int)
        assert 0 <= data["reminder_hour"] <= 23
        assert "_id" not in data

    def test_save_and_persist_settings(self, admin_session):
        payload = {
            "deal_text": "TEST_$10 off any pickup today!",
            "deal_active": True,
            "reminder_enabled": True,
            "reminder_hour": 15,
        }
        r = admin_session.post(
            f"{BASE_URL}/api/admin/marketing/settings", json=payload
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True
        # Returned values should match
        for k, v in payload.items():
            assert body[k] == v, f"Save response mismatch on {k}: {body[k]} != {v}"
        assert "_id" not in body

        # GET should reflect the saved values
        g = admin_session.get(f"{BASE_URL}/api/admin/marketing/settings")
        assert g.status_code == 200
        got = g.json()
        for k, v in payload.items():
            assert got[k] == v, f"Persisted value mismatch on {k}: {got[k]} != {v}"

        # Reset to neutral defaults so we don't pollute UI state for other testers
        reset = {
            "deal_text": "",
            "deal_active": False,
            "reminder_enabled": False,
            "reminder_hour": 10,
        }
        admin_session.post(f"{BASE_URL}/api/admin/marketing/settings", json=reset)

    def test_save_settings_rejects_long_deal_text(self, admin_session):
        payload = {
            "deal_text": "x" * 141,  # > 140
            "deal_active": False,
            "reminder_enabled": False,
            "reminder_hour": 10,
        }
        r = admin_session.post(
            f"{BASE_URL}/api/admin/marketing/settings", json=payload
        )
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"

    @pytest.mark.parametrize("hour", [-1, 24, 99])
    def test_save_settings_rejects_invalid_hour(self, admin_session, hour):
        payload = {
            "deal_text": "",
            "deal_active": False,
            "reminder_enabled": False,
            "reminder_hour": hour,
        }
        r = admin_session.post(
            f"{BASE_URL}/api/admin/marketing/settings", json=payload
        )
        assert r.status_code == 422, f"hour={hour}: Expected 422, got {r.status_code}: {r.text}"
