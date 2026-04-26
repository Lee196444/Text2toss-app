"""
Tests for the new GET /api/admin/push/health endpoint.

Acceptance criteria from the review request:
- Auth: GET /api/admin/push/health requires admin cookie -> 401 without cookie.
- With valid admin cookie returns {subscriptions: int, last_event, last_daily}.
- After POST /api/admin/push/send-test, a record with kind='test' appears in
  push_reminder_log; subsequent GET /push/health returns last_event with
  kind='test' and the timestamp matches recent UTC.
"""
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests


def _load_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if url:
        return url.rstrip("/")
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_backend_url()
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "lrobe")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "L1964c10$")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
    )
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

class TestPushHealthAuth:
    def test_no_cookie_returns_401(self, anon_session):
        r = anon_session.get(f"{BASE_URL}/api/admin/push/health")
        assert r.status_code == 401, (
            f"expected 401 without cookie, got {r.status_code}: {r.text}"
        )


# ---------- Shape ----------

class TestPushHealthShape:
    def test_returns_expected_keys(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/push/health")
        assert r.status_code == 200, r.text
        data = r.json()
        # Required keys exist (values can be None)
        assert set(data.keys()) >= {"subscriptions", "last_event", "last_daily"}
        assert isinstance(data["subscriptions"], int)
        assert data["subscriptions"] >= 0
        # Verify no MongoDB ObjectId leakage (project sets _id: 0)
        for key in ("last_event", "last_daily"):
            val = data[key]
            assert val is None or isinstance(val, dict)
            if isinstance(val, dict):
                assert "_id" not in val, f"{key} leaks _id field"


# ---------- send-test -> health round trip ----------

class TestSendTestUpdatesHealth:
    def test_send_test_then_health_shows_kind_test(self, admin_session):
        before_iso = datetime.now(timezone.utc).isoformat()

        # Trigger a test push (gracefully returns 200 even if no subs/keys bad)
        r_send = admin_session.post(f"{BASE_URL}/api/admin/push/send-test")
        assert r_send.status_code == 200, r_send.text

        # Poll health
        r_health = admin_session.get(f"{BASE_URL}/api/admin/push/health")
        assert r_health.status_code == 200, r_health.text
        data = r_health.json()

        last_event = data["last_event"]
        assert last_event is not None, (
            "last_event must be populated after a send-test call"
        )
        assert last_event.get("kind") == "test", (
            f"last_event.kind expected 'test', got: {last_event}"
        )

        # Validate timestamp is recent UTC ISO and >= our before_iso
        ts = last_event.get("created_at")
        assert isinstance(ts, str) and len(ts) > 0
        # ISO 8601 UTC: 2026-01-XXTXX:XX:XX[.fff]+00:00 or Z
        assert re.match(
            r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", ts
        ), f"timestamp not ISO-like: {ts}"
        # Compare lexically since both are ISO strings with same TZ offset
        assert ts >= before_iso[:19], (
            f"last_event timestamp {ts} should be >= {before_iso}"
        )

        # last_daily is independent of test events. If present, it must NOT
        # be the same record we just inserted (kind != 'test').
        last_daily = data["last_daily"]
        if last_daily is not None:
            assert last_daily.get("kind") != "test"
