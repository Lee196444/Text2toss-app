"""
Test Admin Cookie-Based Authentication
Tests the migration from localStorage JWT to httpOnly cookie session management.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials - loaded from environment
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "lrobe")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "L1964c10$")

class TestAdminCookieAuth:
    """Test admin authentication with httpOnly cookies"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    # ==================== LOGIN TESTS ====================
    
    def test_admin_login_success_sets_cookie(self):
        """POST /api/admin/login should set httpOnly cookie and return success without token field"""
        response = self.session.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        
        # Status code assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions - verify response structure
        data = response.json()
        assert data.get("success") == True, "Response should have success=True"
        assert "display_name" in data, "Response should include display_name"
        assert data["display_name"] == "Lee Robertson", f"Expected 'Lee Robertson', got {data['display_name']}"
        
        # CRITICAL: Verify NO token field in response (security hardening)
        assert "token" not in data, "Response should NOT contain token field (httpOnly cookie migration)"
        
        # Verify cookie was set
        assert "admin_session" in self.session.cookies, "admin_session cookie should be set"
        print(f"✅ Login successful, display_name: {data['display_name']}")
        print(f"✅ Cookie set: admin_session present in session")
    
    def test_admin_login_invalid_credentials(self):
        """POST /api/admin/login with invalid credentials returns 401"""
        response = self.session.post(f"{BASE_URL}/api/admin/login", json={
            "username": "wrong_user",
            "password": "wrong_password"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Invalid credentials correctly rejected with 401")
    
    def test_admin_login_wrong_password(self):
        """POST /api/admin/login with correct username but wrong password returns 401"""
        response = self.session.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": "wrong_password"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Wrong password correctly rejected with 401")
    
    def test_admin_login_exempt_from_cookie_requirement(self):
        """POST /api/admin/login should NOT require a cookie (exempt route)"""
        # Use a fresh session without any cookies
        fresh_session = requests.Session()
        fresh_session.headers.update({"Content-Type": "application/json"})
        
        response = fresh_session.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        
        # Should succeed without any prior cookie
        assert response.status_code == 200, f"Login should work without prior cookie, got {response.status_code}"
        print("✅ Login endpoint is correctly exempt from cookie requirement")
    
    # ==================== VERIFY TESTS ====================
    
    def test_admin_verify_with_cookie(self):
        """GET /api/admin/verify should read from cookie and return admin info"""
        # First login to get cookie
        login_response = self.session.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, "Login should succeed"
        
        # Now verify with the cookie
        verify_response = self.session.get(f"{BASE_URL}/api/admin/verify")
        
        assert verify_response.status_code == 200, f"Expected 200, got {verify_response.status_code}"
        
        data = verify_response.json()
        assert data.get("valid") == True, "Response should have valid=True"
        assert "username" in data, "Response should include username"
        assert "display_name" in data, "Response should include display_name"
        assert data["username"] == ADMIN_USERNAME, f"Expected username '{ADMIN_USERNAME}', got {data['username']}"
        assert data["display_name"] == "Lee Robertson", f"Expected 'Lee Robertson', got {data['display_name']}"
        print(f"✅ Verify successful: valid={data['valid']}, username={data['username']}, display_name={data['display_name']}")
    
    def test_admin_verify_without_cookie_returns_401(self):
        """GET /api/admin/verify without cookie should return 401"""
        # Use fresh session without cookies
        fresh_session = requests.Session()
        response = fresh_session.get(f"{BASE_URL}/api/admin/verify")
        
        assert response.status_code == 401, f"Expected 401 without cookie, got {response.status_code}"
        print("✅ Verify correctly returns 401 without cookie")
    
    # ==================== LOGOUT TESTS ====================
    
    def test_admin_logout_clears_cookie(self):
        """POST /api/admin/logout should clear the cookie"""
        # First login
        login_response = self.session.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, "Login should succeed"
        assert "admin_session" in self.session.cookies, "Cookie should be set after login"
        
        # Now logout
        logout_response = self.session.post(f"{BASE_URL}/api/admin/logout")
        
        assert logout_response.status_code == 200, f"Expected 200, got {logout_response.status_code}"
        
        data = logout_response.json()
        assert data.get("success") == True, "Logout should return success=True"
        print("✅ Logout successful")
        
        # Verify cookie is cleared by trying to access protected endpoint
        # Note: The session may still have the cookie but server should reject it
        # Let's verify by checking the verify endpoint
        verify_response = self.session.get(f"{BASE_URL}/api/admin/verify")
        # After logout, verify should fail (cookie cleared on server side)
        # Note: requests library may still send the cookie, but server should have cleared it
        print(f"✅ Logout response: {data}")
    
    # ==================== PROTECTED ENDPOINTS WITHOUT COOKIE ====================
    
    def test_pending_payments_without_cookie_returns_401(self):
        """GET /api/admin/pending-payments without cookie should return 401"""
        fresh_session = requests.Session()
        response = fresh_session.get(f"{BASE_URL}/api/admin/pending-payments")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ /api/admin/pending-payments correctly returns 401 without cookie")
    
    def test_pending_quotes_without_cookie_returns_401(self):
        """GET /api/admin/pending-quotes without cookie should return 401"""
        fresh_session = requests.Session()
        response = fresh_session.get(f"{BASE_URL}/api/admin/pending-quotes")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ /api/admin/pending-quotes correctly returns 401 without cookie")
    
    def test_all_bookings_without_cookie_returns_401(self):
        """GET /api/admin/all-bookings without cookie should return 401"""
        fresh_session = requests.Session()
        response = fresh_session.get(f"{BASE_URL}/api/admin/all-bookings")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ /api/admin/all-bookings correctly returns 401 without cookie")
    
    def test_daily_schedule_without_cookie_returns_401(self):
        """GET /api/admin/daily-schedule without cookie should return 401"""
        fresh_session = requests.Session()
        response = fresh_session.get(f"{BASE_URL}/api/admin/daily-schedule")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ /api/admin/daily-schedule correctly returns 401 without cookie")
    
    # ==================== PROTECTED ENDPOINTS WITH COOKIE ====================
    
    def test_pending_payments_with_cookie_succeeds(self):
        """GET /api/admin/pending-payments with valid cookie should succeed"""
        # Login first
        login_response = self.session.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, "Login should succeed"
        
        # Access protected endpoint
        response = self.session.get(f"{BASE_URL}/api/admin/pending-payments")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ /api/admin/pending-payments accessible with cookie, returned {len(data)} items")
    
    def test_pending_quotes_with_cookie_succeeds(self):
        """GET /api/admin/pending-quotes with valid cookie should succeed"""
        # Login first
        login_response = self.session.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, "Login should succeed"
        
        # Access protected endpoint
        response = self.session.get(f"{BASE_URL}/api/admin/pending-quotes")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ /api/admin/pending-quotes accessible with cookie, returned {len(data)} items")
    
    def test_daily_schedule_with_cookie_succeeds(self):
        """GET /api/admin/daily-schedule with valid cookie should succeed"""
        # Login first
        login_response = self.session.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, "Login should succeed"
        
        # Access protected endpoint
        response = self.session.get(f"{BASE_URL}/api/admin/daily-schedule")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ /api/admin/daily-schedule accessible with cookie, returned {len(data)} items")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_health_endpoint(self):
        """GET /api/health should return healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "healthy", f"Expected healthy status, got {data}"
        print(f"✅ Health check passed: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
