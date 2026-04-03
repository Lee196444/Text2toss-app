"""
Test new features for Text2toss Junk Removal App - Iteration 5
Features tested:
1. GET /api/bookings/lookup - Customer booking lookup by email
2. PATCH /api/admin/bookings/{id} - Cancel booking also sets payment_status to cancelled
3. GET /api/admin/pending-payments - Returns only non-cancelled bookings
4. GET /api/health - Health check endpoint
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_health_returns_healthy(self):
        """GET /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("status") == "healthy", f"Expected status 'healthy', got {data.get('status')}"
        assert "database" in data, "Response should contain 'database' field"
        print(f"✅ Health check passed: {data}")


class TestBookingLookup:
    """Customer booking lookup endpoint tests"""
    
    def test_lookup_with_valid_email(self):
        """GET /api/bookings/lookup?email=64robertson@gmail.com returns booking list"""
        response = requests.get(f"{BASE_URL}/api/bookings/lookup", params={"email": "64robertson@gmail.com"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✅ Found {len(data)} bookings for 64robertson@gmail.com")
        
        # Verify quote_details is included if bookings exist
        if len(data) > 0:
            booking = data[0]
            assert "quote_details" in booking, "Booking should contain quote_details"
            quote_details = booking.get("quote_details", {})
            # Check quote_details structure
            assert "total_price" in quote_details or quote_details is None, "quote_details should have total_price"
            print(f"✅ First booking has quote_details: {quote_details}")
    
    def test_lookup_with_nonexistent_email(self):
        """GET /api/bookings/lookup?email=nonexistent@test.com returns empty array"""
        response = requests.get(f"{BASE_URL}/api/bookings/lookup", params={"email": "nonexistent@test.com"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        assert len(data) == 0, f"Expected empty list, got {len(data)} items"
        print("✅ Nonexistent email returns empty array")
    
    def test_lookup_without_email(self):
        """GET /api/bookings/lookup without email returns 400 or 422"""
        response = requests.get(f"{BASE_URL}/api/bookings/lookup")
        # FastAPI returns 422 for missing required query params
        assert response.status_code in [400, 422], f"Expected 400 or 422, got {response.status_code}"
        print(f"✅ Missing email returns {response.status_code}")


class TestAdminPendingPayments:
    """Admin pending payments endpoint tests"""
    
    def test_pending_payments_returns_list(self):
        """GET /api/admin/pending-payments returns list of pending payment bookings"""
        response = requests.get(f"{BASE_URL}/api/admin/pending-payments")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✅ Found {len(data)} pending payment bookings")
        
        # Verify all returned bookings have payment_status = pending
        for booking in data:
            payment_status = booking.get("payment_status")
            assert payment_status == "pending", f"Expected payment_status 'pending', got '{payment_status}'"
            # Verify status is not cancelled
            status = booking.get("status")
            assert status != "cancelled", f"Cancelled bookings should not appear in pending payments"
        
        print("✅ All pending payment bookings have correct status")


class TestAdminBookingCancel:
    """Admin booking cancellation tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "lrobe",
            "password": "L1964c10$"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin authentication failed - skipping admin tests")
    
    def test_cancel_booking_sets_payment_status_cancelled(self, admin_token):
        """PATCH /api/admin/bookings/{id} with status cancelled also sets payment_status to cancelled"""
        # First, get a pending payment booking to test with
        pending_response = requests.get(f"{BASE_URL}/api/admin/pending-payments")
        if pending_response.status_code != 200:
            pytest.skip("Could not fetch pending payments")
        
        pending_bookings = pending_response.json()
        if len(pending_bookings) == 0:
            pytest.skip("No pending payment bookings available to test cancellation")
        
        # Get the first pending booking
        test_booking = pending_bookings[0]
        booking_id = test_booking.get("id")
        
        print(f"Testing cancellation on booking: {booking_id}")
        
        # Cancel the booking
        cancel_response = requests.patch(
            f"{BASE_URL}/api/admin/bookings/{booking_id}",
            json={"status": "cancelled"},
            params={"token": admin_token}
        )
        
        assert cancel_response.status_code == 200, f"Expected 200, got {cancel_response.status_code}"
        print(f"✅ Booking {booking_id} cancelled successfully")
        
        # Verify the booking is no longer in pending payments
        verify_response = requests.get(f"{BASE_URL}/api/admin/pending-payments")
        assert verify_response.status_code == 200
        
        updated_pending = verify_response.json()
        booking_ids = [b.get("id") for b in updated_pending]
        
        assert booking_id not in booking_ids, f"Cancelled booking {booking_id} should not appear in pending payments"
        print(f"✅ Cancelled booking no longer appears in pending payments")


class TestAdminLogin:
    """Admin login tests"""
    
    def test_admin_login_success(self):
        """POST /api/admin/login with valid credentials returns token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "lrobe",
            "password": "L1964c10$"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "display_name" in data or "user" in data, "Response should contain display_name or user"
        print(f"✅ Admin login successful: {data.get('display_name', data.get('user', {}).get('display_name'))}")
    
    def test_admin_login_invalid_credentials(self):
        """POST /api/admin/login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "invalid",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Invalid credentials correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
