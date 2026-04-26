"""
Tests for the new MarketingSettings.timezone field and scheduler robustness.

Covers:
- GET /api/admin/marketing/settings returns 'timezone':'UTC' by default.
- POST /api/admin/marketing/settings persists a valid IANA tz (America/Phoenix).
- POST /api/admin/marketing/settings with > 64 char tz returns 422.
- POST with an invalid IANA tz still saves (no validation enforced) AND
  the scheduler does NOT crash adjacent endpoints — sanity check that
  /api/admin/push/send-test still returns a clean JSON 200.

The marketing_settings singleton is restored to neutral defaults at the end.
"""
import os
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

NEUTRAL_DEFAULTS = {
    "deal_text": "",
    "deal_active": False,
    "reminder_enabled": False,
    "reminder_hour": 10,
    "timezone": "UTC",
}


# ---------- Fixtures ----------

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


@pytest.fixture(scope="module", autouse=True)
def _restore_settings(admin_session):
    """Snapshot original settings, run tests, then restore them so we don't
    pollute the marketing_settings singleton for other testers / live UI."""
    pre = admin_session.get(f"{BASE_URL}/api/admin/marketing/settings")
    original = pre.json() if pre.status_code == 200 else dict(NEUTRAL_DEFAULTS)
    yield
    # Strip any unexpected keys, ensure the 5 known keys are present
    payload = {k: original.get(k, NEUTRAL_DEFAULTS[k]) for k in NEUTRAL_DEFAULTS}
    # Ensure timezone is something valid for restore (fall back to UTC)
    if not isinstance(payload["timezone"], str) or not payload["timezone"]:
        payload["timezone"] = "UTC"
    if len(payload["timezone"]) > 64:
        payload["timezone"] = "UTC"
    admin_session.post(
        f"{BASE_URL}/api/admin/marketing/settings", json=payload
    )


# ---------- Tests ----------

class TestTimezoneDefault:
    """Default timezone must be 'UTC' when no value has been saved (or after
    restore)."""

    def test_default_timezone_is_utc(self, admin_session):
        # Force a known baseline first
        baseline = dict(NEUTRAL_DEFAULTS)
        r0 = admin_session.post(
            f"{BASE_URL}/api/admin/marketing/settings", json=baseline
        )
        assert r0.status_code == 200, r0.text

        r = admin_session.get(f"{BASE_URL}/api/admin/marketing/settings")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "timezone" in data, f"timezone missing from GET: {data}"
        assert data["timezone"] == "UTC"


class TestTimezonePersistence:
    """Valid IANA timezone is stored and returned on subsequent GETs."""

    def test_save_valid_iana_timezone(self, admin_session):
        payload = {
            "deal_text": "TEST_tz_persist",
            "deal_active": False,
            "reminder_enabled": False,
            "reminder_hour": 10,
            "timezone": "America/Phoenix",
        }
        r = admin_session.post(
            f"{BASE_URL}/api/admin/marketing/settings", json=payload
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True
        assert body.get("timezone") == "America/Phoenix"

        g = admin_session.get(f"{BASE_URL}/api/admin/marketing/settings")
        assert g.status_code == 200, g.text
        got = g.json()
        assert got["timezone"] == "America/Phoenix", got


class TestTimezoneValidation:
    """Pydantic enforces max_length=64 on the timezone string."""

    def test_timezone_over_64_chars_rejected(self, admin_session):
        long_tz = "X" * 65
        payload = {
            "deal_text": "",
            "deal_active": False,
            "reminder_enabled": False,
            "reminder_hour": 10,
            "timezone": long_tz,
        }
        r = admin_session.post(
            f"{BASE_URL}/api/admin/marketing/settings", json=payload
        )
        assert r.status_code == 422, (
            f"Expected 422 for tz > 64 chars, got {r.status_code}: {r.text}"
        )


class TestInvalidTimezoneSchedulerSafety:
    """An invalid IANA timezone string is allowed by the model (no IANA
    validation). The scheduler must NOT crash, so adjacent endpoints (e.g.
    /api/admin/push/send-test) must still return a clean JSON 200 response.
    """

    def test_invalid_tz_does_not_break_send_test(self, admin_session):
        # 1) Save a clearly-invalid timezone WITH reminder_enabled=True so
        #    _send_daily_reminder will hit the tz resolution path on its
        #    next 60s tick. We don't depend on the tick — we just verify
        #    that adjacent admin endpoints stay healthy.
        payload = {
            "deal_text": "TEST_invalid_tz",
            "deal_active": False,
            "reminder_enabled": True,
            "reminder_hour": 10,
            "timezone": "Not/Real_TZ",
        }
        r1 = admin_session.post(
            f"{BASE_URL}/api/admin/marketing/settings", json=payload
        )
        assert r1.status_code == 200, r1.text
        assert r1.json().get("timezone") == "Not/Real_TZ"

        # 2) GET the settings — must still succeed, no 500
        r2 = admin_session.get(f"{BASE_URL}/api/admin/marketing/settings")
        assert r2.status_code == 200, r2.text
        assert r2.json().get("timezone") == "Not/Real_TZ"

        # 3) /api/admin/push/send-test must still return 200 with clean JSON
        r3 = admin_session.post(f"{BASE_URL}/api/admin/push/send-test")
        assert r3.status_code == 200, (
            f"send-test broke after invalid tz save (got "
            f"{r3.status_code}): {r3.text}"
        )
        body = r3.json()
        assert {"sent", "failed", "subscriptions"} <= set(body.keys()), body
        assert isinstance(body["sent"], int)
        assert isinstance(body["failed"], int)
        assert isinstance(body["subscriptions"], int)
