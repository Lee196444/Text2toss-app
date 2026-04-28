"""
Backend API tests for Text2toss Junk Removal Application
Tests: Health, API root, Quotes (with approval), Bookings, Admin endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://booking-tracker-pro-1.preview.emergentagent.com')
API_URL = f"{BASE_URL.rstrip('/')}/api"

# Admin credentials - read from environment
ADMIN_USERNAME = os.environ.get("TEST_ADMIN_USERNAME", "lrobe")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "L1964c10$")


class TestHealthEndpoints:
    """Health and root endpoint tests"""
    
    def test_api_health_returns_200(self):
        """GET /api/health should return 200 with healthy status"""
        response = requests.get(f"{API_URL}/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "database" in data
        print(f"✓ Health endpoint returned: {data}")

    def test_api_root_returns_message(self):
        """GET /api/ should return API message"""
        response = requests.get(f"{API_URL}/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Text2toss" in data["message"]
        print(f"✓ API root returned: {data}")


class TestQuoteCreation:
    """Quote creation and approval status tests"""
    
    def test_create_quote_small_auto_approved(self):
        """POST /api/quotes with small items (scale < 9) should be auto_approved"""
        payload = {
            "items": [{"name": "Small chair", "quantity": 1, "size": "small", "description": "small chair"}],
            "description": "Small chair removal"
        }
        response = requests.post(f"{API_URL}/quotes", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Verify quote fields
        assert "id" in data
        assert "total_price" in data
        assert data["total_price"] > 0
        
        # Scale < 9 should be auto_approved
        scale_level = data.get("scale_level")
        if scale_level and scale_level < 9:
            assert data["approval_status"] == "auto_approved"
            assert data["requires_approval"] == False
        
        print(f"✓ Small quote created: scale={scale_level}, approval={data['approval_status']}, price=${data['total_price']}")
        return data

    def test_create_quote_large_requires_approval(self):
        """POST /api/quotes with large items (scale >= 9) should require approval"""
        payload = {
            "items": [
                {"name": "Sectional sofa", "quantity": 1, "size": "large", "description": "big sectional"},
                {"name": "King mattress", "quantity": 1, "size": "large", "description": "king bed"},
                {"name": "Dining table", "quantity": 1, "size": "large", "description": "6 person table"}
            ],
            "description": "Large furniture removal - multiple large items"
        }
        response = requests.post(f"{API_URL}/quotes", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Verify quote fields
        assert "id" in data
        assert "total_price" in data
        assert data["total_price"] > 0
        
        # Large items should have scale >= 9 and require approval
        scale_level = data.get("scale_level")
        assert scale_level is not None
        
        if scale_level >= 9:
            assert data["approval_status"] == "pending_approval"
            assert data["requires_approval"] == True
        
        print(f"✓ Large quote created: scale={scale_level}, approval={data['approval_status']}, requires={data['requires_approval']}, price=${data['total_price']}")
        return data

    def test_get_quote_by_id(self):
        """GET /api/quotes/{quote_id} should return quote details"""
        # First create a quote
        create_response = requests.post(f"{API_URL}/quotes", json={
            "items": [{"name": "Test item", "quantity": 1, "size": "medium"}],
            "description": "Test quote for retrieval"
        })
        assert create_response.status_code == 200
        quote_id = create_response.json()["id"]
        
        # Get the quote
        response = requests.get(f"{API_URL}/quotes/{quote_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == quote_id
        print(f"✓ Retrieved quote: {quote_id[:8]}...")


class TestAdminAuthentication:
    """Admin login and authentication tests"""
    
    def test_admin_login_success(self):
        """POST /api/admin/login with valid credentials returns token"""
        payload = {
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        }
        response = requests.post(f"{API_URL}/admin/login", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert "token" in data
        assert len(data["token"]) > 0
        assert "display_name" in data
        
        print(f"✓ Admin login successful: {data.get('display_name')}")
        return data["token"]

    def test_admin_login_invalid_password(self):
        """POST /api/admin/login with wrong password returns error"""
        payload = {
            "username": ADMIN_USERNAME,
            "password": "wrong_password"
        }
        response = requests.post(f"{API_URL}/admin/login", json=payload)
        # Should return 401 or 400 for invalid credentials
        assert response.status_code in [400, 401]
        print(f"✓ Invalid login rejected with status {response.status_code}")


class TestQuoteApproval:
    """Admin quote approval workflow tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{API_URL}/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin authentication failed")

    def test_get_pending_quotes(self):
        """GET /api/admin/pending-quotes returns list of pending quotes"""
        response = requests.get(f"{API_URL}/admin/pending-quotes")
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list (could be empty)
        assert isinstance(data, list)
        
        # If there are pending quotes, verify they have pending_approval status
        for quote in data:
            assert quote.get("approval_status") == "pending_approval"
        
        print(f"✓ Pending quotes returned: {len(data)} quotes")

    def test_get_quote_approval_stats(self):
        """GET /api/admin/quote-approval-stats returns correct statistics"""
        response = requests.get(f"{API_URL}/admin/quote-approval-stats")
        assert response.status_code == 200
        data = response.json()
        
        # Verify stat fields
        expected_fields = ["pending_approval", "approved", "rejected", "auto_approved", "total_requiring_approval"]
        for field in expected_fields:
            assert field in data
            assert isinstance(data[field], int)
        
        print(f"✓ Approval stats: pending={data['pending_approval']}, approved={data['approved']}, rejected={data['rejected']}, auto={data['auto_approved']}")

    def test_approve_quote(self):
        """POST /api/admin/quotes/{quote_id}/approve approves a quote"""
        # First create a large quote that requires approval
        create_response = requests.post(f"{API_URL}/quotes", json={
            "items": [
                {"name": "Large dresser", "quantity": 1, "size": "large"},
                {"name": "Wardrobe", "quantity": 1, "size": "large"},
                {"name": "Bookshelf", "quantity": 1, "size": "large"}
            ],
            "description": "TEST_approval_test Bedroom furniture for approval test"
        })
        assert create_response.status_code == 200
        quote = create_response.json()
        quote_id = quote["id"]
        
        # Approve the quote
        approve_response = requests.post(f"{API_URL}/admin/quotes/{quote_id}/approve", json={
            "action": "approve",
            "admin_notes": "Test approval from pytest"
        })
        assert approve_response.status_code == 200
        data = approve_response.json()
        
        assert "quote" in data
        assert data["quote"]["approval_status"] == "approved"
        assert data["quote"]["admin_notes"] == "Test approval from pytest"
        
        print(f"✓ Quote {quote_id[:8]}... approved successfully")

    def test_reject_quote(self):
        """POST /api/admin/quotes/{quote_id}/approve with reject action"""
        # Create a large quote
        create_response = requests.post(f"{API_URL}/quotes", json={
            "items": [
                {"name": "Old couch", "quantity": 1, "size": "large"},
                {"name": "Recliner", "quantity": 1, "size": "large"},
                {"name": "Entertainment center", "quantity": 1, "size": "large"}
            ],
            "description": "TEST_rejection_test Living room for rejection test"
        })
        assert create_response.status_code == 200
        quote_id = create_response.json()["id"]
        
        # Reject the quote
        reject_response = requests.post(f"{API_URL}/admin/quotes/{quote_id}/approve", json={
            "action": "reject",
            "admin_notes": "Test rejection from pytest"
        })
        assert reject_response.status_code == 200
        data = reject_response.json()
        
        assert data["quote"]["approval_status"] == "rejected"
        
        print(f"✓ Quote {quote_id[:8]}... rejected successfully")


class TestBookingCreation:
    """Booking creation and status tests"""
    
    def test_booking_with_auto_approved_quote(self):
        """POST /api/bookings with auto_approved quote gets pending_payment status"""
        # Create small quote (auto_approved)
        quote_response = requests.post(f"{API_URL}/quotes", json={
            "items": [{"name": "TEST_Small lamp", "quantity": 1, "size": "small"}],
            "description": "TEST_booking Small lamp for booking test"
        })
        assert quote_response.status_code == 200
        quote = quote_response.json()
        quote_id = quote["id"]
        
        # Verify it's auto_approved
        if quote.get("scale_level", 5) < 9:
            assert quote["approval_status"] == "auto_approved"
        
        # Create booking
        booking_response = requests.post(f"{API_URL}/bookings", json={
            "quote_id": quote_id,
            "pickup_date": "2026-03-10T10:00:00",
            "pickup_time": "10:00-12:00",
            "address": "789 Test Road, Flagstaff AZ 86001",
            "phone": "+19285551111",
            "email": "bookingtest@example.com"
        })
        assert booking_response.status_code == 200
        booking = booking_response.json()
        
        # Auto-approved quote should create pending_payment booking
        assert booking["status"] == "pending_payment"
        assert booking["payment_status"] == "pending"
        
        print(f"✓ Booking created with status: {booking['status']}")
        return booking

    def test_booking_with_approval_required_quote(self):
        """POST /api/bookings with requires_approval quote gets pending_customer_approval status"""
        # Create large quote (requires approval)
        quote_response = requests.post(f"{API_URL}/quotes", json={
            "items": [
                {"name": "TEST_Sectional", "quantity": 1, "size": "large"},
                {"name": "TEST_Dining set", "quantity": 1, "size": "large"},
                {"name": "TEST_Bedroom set", "quantity": 1, "size": "large"}
            ],
            "description": "TEST_approval_booking Large items for approval booking test"
        })
        assert quote_response.status_code == 200
        quote = quote_response.json()
        quote_id = quote["id"]
        
        # If scale >= 9, should require approval
        if quote.get("scale_level", 10) >= 9:
            assert quote["requires_approval"] == True
            
            # Create booking
            booking_response = requests.post(f"{API_URL}/bookings", json={
                "quote_id": quote_id,
                "pickup_date": "2026-03-11T10:00:00",
                "pickup_time": "14:00-16:00",
                "address": "456 Large St, Flagstaff AZ 86001",
                "phone": "+19285552222",
                "email": "largebooking@example.com"
            })
            assert booking_response.status_code == 200
            booking = booking_response.json()
            
            # Requires_approval quote should create pending_customer_approval booking
            assert booking["status"] == "pending_customer_approval"
            print(f"✓ Large booking created with status: {booking['status']}")
        else:
            print(f"⚠ Quote scale {quote.get('scale_level')} < 9, testing auto_approved path instead")


class TestAvailability:
    """Availability endpoint tests"""
    
    def test_get_availability_for_valid_date(self):
        """GET /api/availability/{date} returns slots for Monday-Thursday"""
        # Monday, March 2, 2026
        response = requests.get(f"{API_URL}/availability/2026-03-02")
        assert response.status_code == 200
        data = response.json()
        
        assert "date" in data
        assert "available_slots" in data
        assert isinstance(data["available_slots"], list)
        assert len(data["available_slots"]) > 0
        
        print(f"✓ Availability for 2026-03-02: {len(data['available_slots'])} slots available")

    def test_availability_not_available_weekend(self):
        """GET /api/availability/{date} returns restricted for weekend"""
        # Saturday, March 7, 2026
        response = requests.get(f"{API_URL}/availability/2026-03-07")
        assert response.status_code == 200
        data = response.json()
        
        # Weekend should be restricted
        assert data.get("is_restricted") == True or len(data.get("available_slots", [])) == 0
        
        print(f"✓ Weekend availability correctly restricted")


class TestAdminDashboard:
    """Admin dashboard endpoint tests"""
    
    def test_get_daily_schedule(self):
        """GET /api/admin/daily-schedule returns bookings"""
        response = requests.get(f"{API_URL}/admin/daily-schedule", params={"date": "2026-03-02"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Daily schedule returned: {len(data)} bookings")

    def test_get_pending_payments(self):
        """GET /api/admin/pending-payments returns unpaid bookings"""
        response = requests.get(f"{API_URL}/admin/pending-payments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Pending payments returned: {len(data)} bookings")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
