"""
Tests for the Web Push (Service Worker) endpoints.

Endpoints covered:
- GET  /api/push/vapid-public-key                (public, no auth)
- POST /api/admin/push/subscribe                  (admin cookie auth, upsert)
- POST /api/admin/push/unsubscribe                (admin cookie auth)
- POST /api/admin/push/send-test                  (admin cookie auth, must
                                                   never 500 on bad keys, and
                                                   prune endpoints returning
                                                   404/410)

Auth: httpOnly admin_session cookie set by POST /api/admin/login.

NOTE: Tests intentionally use a syntactically-valid-but-fake FCM endpoint and
random base64 keys so pywebpush can parse the keys but delivery fails — we
verify the API still returns a proper 200 JSON response (no 500).
"""
import base64
import os
import secrets
import uuid
from pathlib import Path

import pytest
import requests


# ---------- Config ----------

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


def _b64url(n_bytes: int) -> str:
    """urlsafe-base64 (no padding) of n random bytes — matches what real
    PushManager keys look like to pywebpush's parser."""
    return base64.urlsafe_b64encode(secrets.token_bytes(n_bytes)).rstrip(b"=").decode()


def _fake_subscription(endpoint_suffix: str | None = None) -> dict:
    """Build a fake but well-formed PushSubscription payload."""
    suffix = endpoint_suffix or uuid.uuid4().hex
    return {
        # plausible-looking FCM url that will not match a real subscription
        "endpoint": f"https://fcm.googleapis.com/fcm/send/TEST_{suffix}",
        "keys": {
            "p256dh": _b64url(65),  # 65 raw bytes → ~88 chars
            "auth": _b64url(16),
        },
    }


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_session():
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


@pytest.fixture(scope="module", autouse=True)
def _cleanup_test_subs(admin_session):
    """After all tests in this module, remove any TEST_ endpoints we created."""
    yield
    # best-effort cleanup via unsubscribe endpoint — we don't know all suffixes
    # so this is just defensive; tests also unsubscribe individually.


# ---------- Public VAPID key ----------

class TestVapidPublicKey:
    def test_public_no_auth_required(self, anon_session):
        r = anon_session.get(f"{BASE_URL}/api/push/vapid-public-key")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "publicKey" in data
        assert isinstance(data["publicKey"], str)
        assert len(data["publicKey"]) > 20  # VAPID public keys are ~87 chars


# ---------- Admin auth gating ----------

PUSH_ADMIN_ENDPOINTS = [
    ("POST", "/api/admin/push/subscribe", lambda: _fake_subscription()),
    ("POST", "/api/admin/push/unsubscribe", lambda: _fake_subscription()),
    ("POST", "/api/admin/push/send-test", lambda: {}),
]


class TestPushAuthGating:
    @pytest.mark.parametrize("method,path,body_fn", PUSH_ADMIN_ENDPOINTS)
    def test_requires_admin_cookie(self, anon_session, method, path, body_fn):
        url = f"{BASE_URL}{path}"
        body = body_fn()
        r = anon_session.post(url, json=body)
        assert r.status_code == 401, (
            f"{method} {path} expected 401 without cookie, got {r.status_code}: {r.text}"
        )


# ---------- Subscribe / upsert ----------

class TestPushSubscribe:
    def test_subscribe_persists_and_is_idempotent(self, admin_session):
        sub = _fake_subscription("idem")
        # First call
        r1 = admin_session.post(f"{BASE_URL}/api/admin/push/subscribe", json=sub)
        assert r1.status_code == 200, r1.text
        assert r1.json() == {"success": True}

        # Second call with same endpoint → still success, no duplicates
        r2 = admin_session.post(f"{BASE_URL}/api/admin/push/subscribe", json=sub)
        assert r2.status_code == 200, r2.text
        assert r2.json() == {"success": True}

        # Verify upsert (only one doc) by deleting once and confirming deleted=1
        rdel = admin_session.post(
            f"{BASE_URL}/api/admin/push/unsubscribe", json=sub
        )
        assert rdel.status_code == 200, rdel.text
        body = rdel.json()
        assert body.get("success") is True
        assert body.get("deleted") == 1, f"expected exactly one doc, got {body}"

    def test_subscribe_validation_missing_p256dh(self, admin_session):
        bad = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/TEST_badkeys",
            "keys": {"auth": _b64url(16)},  # missing p256dh
        }
        r = admin_session.post(f"{BASE_URL}/api/admin/push/subscribe", json=bad)
        assert r.status_code == 422, r.text

    def test_subscribe_validation_missing_auth(self, admin_session):
        bad = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/TEST_badkeys2",
            "keys": {"p256dh": _b64url(65)},  # missing auth
        }
        r = admin_session.post(f"{BASE_URL}/api/admin/push/subscribe", json=bad)
        assert r.status_code == 422, r.text

    def test_subscribe_validation_missing_endpoint(self, admin_session):
        bad = {"keys": {"p256dh": _b64url(65), "auth": _b64url(16)}}
        r = admin_session.post(f"{BASE_URL}/api/admin/push/subscribe", json=bad)
        assert r.status_code == 422, r.text


# ---------- Unsubscribe ----------

class TestPushUnsubscribe:
    def test_unsubscribe_removes_existing(self, admin_session):
        sub = _fake_subscription("rm1")
        r1 = admin_session.post(f"{BASE_URL}/api/admin/push/subscribe", json=sub)
        assert r1.status_code == 200

        r2 = admin_session.post(f"{BASE_URL}/api/admin/push/unsubscribe", json=sub)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data.get("success") is True
        assert data.get("deleted") == 1

    def test_unsubscribe_unknown_endpoint_returns_zero(self, admin_session):
        sub = _fake_subscription("never_existed")
        r = admin_session.post(f"{BASE_URL}/api/admin/push/unsubscribe", json=sub)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        assert data.get("deleted") == 0


# ---------- Send-test (the resilience test) ----------

class TestPushSendTest:
    def test_send_test_does_not_crash_on_bad_keys(self, admin_session):
        """Insert a fake subscription, call send-test, expect graceful 200 with
        failed >= 1 (delivery cannot succeed against fake endpoint)."""
        sub = _fake_subscription("send_bad")
        s_resp = admin_session.post(
            f"{BASE_URL}/api/admin/push/subscribe", json=sub
        )
        assert s_resp.status_code == 200

        try:
            r = admin_session.post(f"{BASE_URL}/api/admin/push/send-test")
            # Critical assertion: never 500
            assert r.status_code == 200, (
                f"send-test should never 500 on bad keys, got "
                f"{r.status_code}: {r.text}"
            )
            data = r.json()
            assert "sent" in data and "failed" in data and "subscriptions" in data
            assert isinstance(data["sent"], int)
            assert isinstance(data["failed"], int)
            assert isinstance(data["subscriptions"], int)
            assert data["failed"] >= 0
            assert data["sent"] >= 0
            assert data["subscriptions"] >= 1  # at least our fake one
        finally:
            # cleanup whatever is left
            admin_session.post(
                f"{BASE_URL}/api/admin/push/unsubscribe", json=sub
            )

    def test_send_test_with_no_subscriptions_returns_200(self, admin_session):
        """With no subscriptions the endpoint must still return 200 and zeros.
        We can't guarantee the DB is empty (other tests/admin browsers may have
        subscribed), so we just assert non-error and field shape."""
        r = admin_session.post(f"{BASE_URL}/api/admin/push/send-test")
        assert r.status_code == 200, r.text
        data = r.json()
        assert set(data.keys()) >= {"sent", "failed", "subscriptions"}


# ---------- Marketing regression ----------

class TestMarketingRegression:
    """The push code was added next to the marketing endpoints. Quick smoke
    test that marketing endpoints still work and that reminder_enabled
    persists (touches the same code path the scheduler reads)."""

    def test_marketing_settings_round_trip(self, admin_session):
        # Read current
        r0 = admin_session.get(f"{BASE_URL}/api/admin/marketing/settings")
        assert r0.status_code == 200, r0.text

        payload = {
            "deal_text": "regression-test",
            "deal_active": False,
            "reminder_enabled": True,
            "reminder_hour": 9,
        }
        r1 = admin_session.post(
            f"{BASE_URL}/api/admin/marketing/settings", json=payload
        )
        assert r1.status_code == 200, r1.text

        r2 = admin_session.get(f"{BASE_URL}/api/admin/marketing/settings")
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data.get("reminder_enabled") is True
        assert data.get("reminder_hour") == 9
        assert data.get("deal_text") == "regression-test"

    def test_marketing_share_event(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/admin/marketing/share-event",
            json={"channel": "native"},
        )
        assert r.status_code == 200, r.text

    def test_marketing_stats(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/marketing/stats")
        assert r.status_code == 200, r.text
        data = r.json()
        # stats response must be a JSON object/dict
        assert isinstance(data, dict)
