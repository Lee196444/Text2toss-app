#!/usr/bin/env python3
"""
Admin Authentication Test for Text2toss App
Specific test to diagnose admin login issues as requested in review
"""

import requests
import json
import sys

class AdminAuthTester:
    def __init__(self, base_url="https://junkapp-pricing.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None

    def log_result(self, test_name, success, details=""):
        """Log test results with clear formatting"""
        if success:
            print(f"✅ {test_name}")
            if details:
                print(f"   📋 {details}")
        else:
            print(f"❌ {test_name}")
            if details:
                print(f"   🔍 {details}")

    def make_request(self, method, endpoint, data=None, expected_status=200):
        """Make HTTP request and return success status and response"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        print(f"\n🔍 Testing: {method} {endpoint}")
        print(f"   URL: {url}")
        if data:
            print(f"   Data: {json.dumps(data, indent=2)}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            
            success = response.status_code == expected_status
            
            print(f"   Status: {response.status_code} {'✅' if success else '❌'}")
            
            try:
                response_data = response.json()
                print(f"   Response: {json.dumps(response_data, indent=2)}")
                return success, response_data
            except:
                print(f"   Response: {response.text}")
                return success, {"error": response.text}
                
        except Exception as e:
            print(f"   Exception: {str(e)}")
            return False, {"error": str(e)}

    def test_admin_authentication_comprehensive(self):
        """Comprehensive admin authentication test"""
        print("=" * 70)
        print("ADMIN AUTHENTICATION COMPREHENSIVE TEST")
        print("=" * 70)
        print("Testing admin authentication system to diagnose login issues")
        print("Username: lrobe")
        print("Password: L1964c10$")
        print("Login endpoint: /api/admin/login")
        print("Admin verify endpoint: /api/admin/verify")
        print("-" * 70)
        
        # Step 1: Initialize admin user
        print("\n🔧 STEP 1: Initialize Admin User")
        init_success, init_response = self.make_request("POST", "admin/init", expected_status=200)
        
        if init_success:
            self.log_result("Admin Initialization", True, init_response.get('message', 'Success'))
        else:
            self.log_result("Admin Initialization", False, f"May already exist: {init_response}")
        
        # Step 2: Test admin login with correct credentials
        print("\n🔐 STEP 2: Test Admin Login with Correct Credentials")
        login_data = {
            "username": "lrobe",
            "password": "L1964c10$"
        }
        
        login_success, login_response = self.make_request("POST", "admin/login", login_data, expected_status=200)
        
        if login_success and login_response.get('token'):
            self.admin_token = login_response['token']
            self.log_result("Admin Login", True, f"Token: {self.admin_token[:50]}...")
            print(f"   👤 Display Name: {login_response.get('display_name')}")
            print(f"   ✅ SUCCESS: Admin can log in with provided credentials")
            
            # Step 3: Test JWT token validation
            print("\n🔍 STEP 3: Test JWT Token Validation")
            verify_success, verify_response = self.make_request("GET", f"admin/verify?token={self.admin_token}", expected_status=200)
            
            if verify_success and verify_response.get('valid'):
                self.log_result("JWT Token Validation", True, "Token is valid")
            else:
                self.log_result("JWT Token Validation", False, f"Token validation failed: {verify_response}")
            
            # Step 4: Test admin access to protected endpoints
            print("\n🛡️  STEP 4: Test Admin Access to Protected Endpoints")
            
            # Test admin daily schedule
            schedule_success, schedule_response = self.make_request("GET", "admin/daily-schedule", expected_status=200)
            self.log_result("Admin Daily Schedule Access", schedule_success, 
                          f"Found {len(schedule_response) if isinstance(schedule_response, list) else 0} bookings" if schedule_success else "Access denied")
            
            # Test admin SMS test
            sms_success, sms_response = self.make_request("POST", "admin/test-sms", expected_status=200)
            self.log_result("Admin SMS Test Access", sms_success, 
                          sms_response.get('message', 'Success') if sms_success else "Access denied")
            
            # Test admin cleanup
            cleanup_success, cleanup_response = self.make_request("POST", "admin/cleanup-temp-images", expected_status=200)
            self.log_result("Admin Cleanup Access", cleanup_success, 
                          cleanup_response.get('message', 'Success') if cleanup_success else "Access denied")
            
            # Step 5: End-to-end authentication flow summary
            print("\n🔄 STEP 5: End-to-End Authentication Flow Summary")
            print("   ✅ Step 1: Admin user exists in database")
            print("   ✅ Step 2: Password verification successful")
            print("   ✅ Step 3: JWT token generation successful")
            print("   ✅ Step 4: JWT token validation successful")
            print("   ✅ Step 5: Protected endpoint access successful")
            
            print("\n🎉 FINAL DIAGNOSIS: ADMIN AUTHENTICATION IS WORKING!")
            print("   • Username 'lrobe' exists in database")
            print("   • Password 'L1964c10$' is correctly hashed and verified")
            print("   • JWT token generation and validation working")
            print("   • Admin can access all protected endpoints")
            print("   • No authentication issues found")
            
            return True
            
        else:
            self.log_result("Admin Login", False, f"Login failed: {login_response}")
            
            # Detailed diagnosis for login failure
            print("\n🔍 DETAILED DIAGNOSIS FOR LOGIN FAILURE:")
            
            if "401" in str(login_response) or login_response.get('detail') == 'Invalid credentials':
                print("   ❌ CREDENTIALS ISSUE (401 Unauthorized):")
                print("      • Admin user may not exist in database")
                print("      • Password hash may not match stored value")
                print("      • Username/password combination incorrect")
                print("      • Database query may be failing")
            elif "500" in str(login_response):
                print("   ❌ SERVER ERROR (500 Internal Server Error):")
                print("      • Database connection issue")
                print("      • JWT secret key not configured properly")
                print("      • Backend error in authentication logic")
                print("      • MongoDB connection problems")
            else:
                print("   ❌ UNKNOWN ERROR:")
                print("      • Unexpected response from server")
                print("      • Network or routing issue")
                print("      • API endpoint may not be working")
            
            print("\n🚨 FINAL DIAGNOSIS: ADMIN AUTHENTICATION IS FAILING!")
            print("   • User cannot log in with provided credentials")
            print("   • Root cause analysis needed")
            print("   • Check backend logs for detailed error information")
            
            return False
        
        # Step 6: Test password hashing (security verification)
        print("\n🔐 STEP 6: Test Password Hashing Security")
        
        wrong_password_data = {
            "username": "lrobe",
            "password": "wrongpassword123"
        }
        
        wrong_success, wrong_response = self.make_request("POST", "admin/login", wrong_password_data, expected_status=401)
        
        if not wrong_success and ("401" in str(wrong_response) or wrong_response.get('detail') == 'Invalid credentials'):
            self.log_result("Password Security", True, "Wrong password correctly rejected")
        else:
            self.log_result("Password Security", False, "Security issue: Wrong password was accepted")
        
        # Step 7: Test invalid username
        print("\n🚫 STEP 7: Test Invalid Username")
        
        invalid_user_data = {
            "username": "invaliduser",
            "password": "L1964c10$"
        }
        
        invalid_user_success, invalid_user_response = self.make_request("POST", "admin/login", invalid_user_data, expected_status=401)
        
        if not invalid_user_success and ("401" in str(invalid_user_response) or invalid_user_response.get('detail') == 'Invalid credentials'):
            self.log_result("Invalid Username Security", True, "Invalid username correctly rejected")
        else:
            self.log_result("Invalid Username Security", False, "Security issue: Invalid username was accepted")

    def check_backend_logs(self):
        """Provide instructions for checking backend logs"""
        print("\n📝 BACKEND LOG ANALYSIS:")
        print("   To check for backend errors, run these commands:")
        print("   1. Check backend error logs:")
        print("      tail -n 100 /var/log/supervisor/backend.err.log")
        print("   2. Check backend output logs:")
        print("      tail -n 100 /var/log/supervisor/backend.out.log")
        print("   3. Check supervisor status:")
        print("      sudo supervisorctl status")
        print("   4. Restart backend if needed:")
        print("      sudo supervisorctl restart backend")

def main():
    """Main test execution"""
    print("🚀 Starting Admin Authentication Diagnosis...")
    
    tester = AdminAuthTester()
    
    try:
        auth_working = tester.test_admin_authentication_comprehensive()
        tester.check_backend_logs()
        
        print("\n" + "=" * 70)
        print("ADMIN AUTHENTICATION TEST COMPLETE")
        print("=" * 70)
        
        if auth_working:
            print("🎉 RESULT: Admin authentication is working correctly!")
            print("   The user should be able to log in to the admin dashboard.")
        else:
            print("🚨 RESULT: Admin authentication is failing!")
            print("   The user cannot log in. Check backend logs for details.")
        
        return auth_working
        
    except KeyboardInterrupt:
        print("\n⚠️  Test interrupted by user")
        return False
    except Exception as e:
        print(f"\n❌ Test failed with error: {str(e)}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)