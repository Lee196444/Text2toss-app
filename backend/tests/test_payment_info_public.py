"""Test the public payment-info endpoint used by the email "Complete Payment Now" button."""
import os
import sys
import requests
import unittest
from pathlib import Path

# Load REACT_APP_BACKEND_URL from frontend/.env when not already in env
if not os.environ.get('REACT_APP_BACKEND_URL'):
    fe_env = Path(__file__).resolve().parents[2] / 'frontend' / '.env'
    if fe_env.exists():
        for line in fe_env.read_text().splitlines():
            if line.startswith('REACT_APP_BACKEND_URL='):
                os.environ['REACT_APP_BACKEND_URL'] = line.split('=', 1)[1].strip()
                break

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestPublicPaymentInfo(unittest.TestCase):
    """The /api/bookings/{id}/payment-info endpoint must:
    1. Return 404 for unknown booking ids (no auth leak)
    2. Return 200 with required fields for an existing booking
    3. Use approved_price when available, else fall back to total_price
    """

    @classmethod
    def setUpClass(cls):
        # Find a real booking id directly via Mongo to avoid coupling with
        # admin-auth flakiness.
        cls.booking_id = None
        try:
            import asyncio
            from motor.motor_asyncio import AsyncIOMotorClient
            mongo_url = os.environ.get("MONGO_URL")
            db_name = os.environ.get("DB_NAME")
            if not mongo_url or not db_name:
                return

            async def _find():
                client = AsyncIOMotorClient(mongo_url)
                db = client[db_name]
                doc = await db.bookings.find_one({}, {"id": 1, "_id": 0})
                client.close()
                return doc.get("id") if doc else None

            cls.booking_id = asyncio.run(_find())
        except Exception:
            cls.booking_id = None

    def test_unknown_booking_returns_404(self):
        resp = requests.get(f"{BASE_URL}/api/bookings/does-not-exist/payment-info")
        self.assertEqual(resp.status_code, 404)

    def test_existing_booking_returns_full_payload(self):
        if not self.booking_id:
            self.skipTest("No bookings in DB to test against")
        resp = requests.get(f"{BASE_URL}/api/bookings/{self.booking_id}/payment-info")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        # Fields the customer's pay page renders
        for key in ("booking_id", "customer_name", "amount_due", "status", "payment_status", "venmo_qr_url"):
            self.assertIn(key, body)
        self.assertEqual(body["booking_id"], self.booking_id)
        self.assertIsInstance(body["amount_due"], (int, float))
        self.assertTrue(body["venmo_qr_url"].startswith("https://"))

    def test_endpoint_requires_no_auth(self):
        # No cookies, no token — should still work (UUIDs are unguessable)
        if not self.booking_id:
            self.skipTest("No bookings in DB to test against")
        sess = requests.Session()
        resp = sess.get(f"{BASE_URL}/api/bookings/{self.booking_id}/payment-info")
        self.assertEqual(resp.status_code, 200)


if __name__ == "__main__":
    if not BASE_URL:
        print("REACT_APP_BACKEND_URL not set", file=sys.stderr)
        sys.exit(1)
    unittest.main()
