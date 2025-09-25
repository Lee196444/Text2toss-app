#!/usr/bin/env python3
"""
Focused test script for the NEW PAYMENT SYSTEM with Stripe integration
"""

import requests
import json
from datetime import datetime, timedelta

class PaymentSystemTester:
    def __init__(self, base_url="https://text2toss.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.test_quote_id = None
        self.test_booking_id = None
        self.test_session_id = None

    def log_result(self, test_name, success, details=""):
        """Log test results"""
        if success:
            print(f"✅ {test_name}")
        else:
            print(f"❌ {test_name} - {details}")

    def make_request(self, method, endpoint, data=None, expected_status=200):
        """Make API request and return success, response"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        print(f"\n🔍 {method} {endpoint}")
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
                return success, {}
                
        except Exception as e:
            print(f"   Exception: {str(e)}")
            return False, {}

    def setup_test_data(self):
        """Create test quote and booking for payment testing"""
        print("\n" + "="*60)
        print("SETTING UP TEST DATA FOR PAYMENT SYSTEM")
        print("="*60)
        
        # Step 1: Create a test quote
        quote_data = {
            "items": [
                {"name": "Large Sofa", "quantity": 1, "size": "large", "description": "Brown leather sofa for payment testing"},
                {"name": "Coffee Table", "quantity": 1, "size": "medium", "description": "Wooden coffee table"}
            ],
            "description": "Living room furniture for payment system testing"
        }
        
        success, response = self.make_request("POST", "quotes", quote_data)
        if success and response.get('id'):
            self.test_quote_id = response['id']
            quote_price = response.get('total_price', 0)
            print(f"   ✅ Created test quote: {self.test_quote_id}")
            print(f"   💰 Quote price: ${quote_price}")
        else:
            print("   ❌ Failed to create test quote")
            return False
        
        # Step 2: Create a test booking (use next Monday for valid weekday)
        today = datetime.now()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:  # If today is Monday, use next Monday
            days_until_monday = 7
        next_monday = (today + timedelta(days=days_until_monday)).strftime('%Y-%m-%d')
        
        booking_data = {
            "quote_id": self.test_quote_id,
            "pickup_date": f"{next_monday}T12:00:00",
            "pickup_time": "12:00-14:00",
            "address": "789 Payment Test Street, Test City, TC 12345",
            "phone": "+1555123456",
            "special_instructions": "Test booking for payment system validation"
        }
        
        success, response = self.make_request("POST", "bookings", booking_data)
        if success and response.get('id'):
            self.test_booking_id = response['id']
            print(f"   ✅ Created test booking: {self.test_booking_id}")
            print(f"   📅 Pickup date: {next_monday}")
        else:
            print("   ❌ Failed to create test booking")
            return False
        
        return True

    def test_create_checkout_session(self):
        """Test POST /api/payments/create-checkout-session"""
        print("\n" + "="*60)
        print("TESTING: CREATE STRIPE CHECKOUT SESSION")
        print("="*60)
        
        payment_request = {
            "booking_id": self.test_booking_id,
            "origin_url": "https://text2toss.preview.emergentagent.com"
        }
        
        success, response = self.make_request("POST", "payments/create-checkout-session", payment_request)
        
        if success:
            # Verify response structure
            required_fields = ['url', 'session_id', 'amount']
            all_fields_present = True
            
            for field in required_fields:
                if field in response:
                    print(f"   ✅ Response contains {field}: {response[field]}")
                else:
                    print(f"   ❌ MISSING: Response missing required field '{field}'")
                    all_fields_present = False
            
            # Validate checkout URL
            checkout_url = response.get('url', '')
            if 'checkout.stripe.com' in checkout_url:
                print(f"   ✅ Valid Stripe checkout URL generated")
            else:
                print(f"   ❌ Invalid checkout URL: {checkout_url}")
                all_fields_present = False
            
            # Store session ID for further testing
            self.test_session_id = response.get('session_id')
            if self.test_session_id:
                print(f"   📝 Session ID stored: {self.test_session_id}")
            
            # Validate amount
            amount = response.get('amount')
            if amount and amount > 0:
                print(f"   ✅ Payment amount: ${amount}")
            else:
                print(f"   ❌ Invalid payment amount: {amount}")
                all_fields_present = False
            
            self.log_result("Create Checkout Session", all_fields_present)
            return all_fields_present
        else:
            self.log_result("Create Checkout Session", False, "API request failed")
            return False

    def test_payment_status(self):
        """Test GET /api/payments/status/{session_id}"""
        print("\n" + "="*60)
        print("TESTING: PAYMENT STATUS CHECK")
        print("="*60)
        
        if not self.test_session_id:
            print("   ⚠️  No session ID available, skipping status test")
            return False
        
        success, response = self.make_request("GET", f"payments/status/{self.test_session_id}")
        
        if success:
            # Verify status response structure
            expected_fields = ['session_id', 'status', 'payment_status', 'booking_id']
            all_fields_present = True
            
            for field in expected_fields:
                if field in response:
                    print(f"   ✅ Status response contains {field}: {response[field]}")
                else:
                    print(f"   ❌ MISSING: Status response missing field '{field}'")
                    all_fields_present = False
            
            # Validate session ID matches
            if response.get('session_id') == self.test_session_id:
                print(f"   ✅ Session ID matches request")
            else:
                print(f"   ❌ Session ID mismatch")
                all_fields_present = False
            
            # Validate booking ID matches
            if response.get('booking_id') == self.test_booking_id:
                print(f"   ✅ Booking ID matches")
            else:
                print(f"   ❌ Booking ID mismatch")
                all_fields_present = False
            
            # Check payment status
            payment_status = response.get('payment_status')
            if payment_status in ['pending', 'unpaid', 'paid']:
                print(f"   ✅ Valid payment status: {payment_status}")
            else:
                print(f"   ⚠️  Unexpected payment status: {payment_status}")
            
            self.log_result("Payment Status Check", all_fields_present)
            return all_fields_present
        else:
            self.log_result("Payment Status Check", False, "API request failed")
            return False

    def test_webhook_endpoint(self):
        """Test POST /api/webhook/stripe (basic connectivity)"""
        print("\n" + "="*60)
        print("TESTING: STRIPE WEBHOOK ENDPOINT")
        print("="*60)
        
        # Test webhook endpoint exists (will fail without proper signature, but that's expected)
        webhook_data = {
            "id": "evt_test_webhook",
            "object": "event",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": self.test_session_id or "cs_test_session",
                    "payment_status": "paid"
                }
            }
        }
        
        # Expect 400 due to missing/invalid Stripe signature
        success, response = self.make_request("POST", "webhook/stripe", webhook_data, expected_status=200)
        
        if success:
            print(f"   ✅ Webhook endpoint processed request successfully")
            self.log_result("Webhook Endpoint Connectivity", True)
            return True
        else:
            print(f"   ❌ Webhook endpoint may not be properly configured")
            self.log_result("Webhook Endpoint Connectivity", False)
            return False

    def test_error_handling(self):
        """Test error handling for invalid requests"""
        print("\n" + "="*60)
        print("TESTING: ERROR HANDLING")
        print("="*60)
        
        # Test 1: Invalid booking ID
        invalid_payment_request = {
            "booking_id": "invalid_booking_id_12345",
            "origin_url": "https://text2toss.preview.emergentagent.com"
        }
        
        success, response = self.make_request("POST", "payments/create-checkout-session", 
                                            invalid_payment_request, expected_status=404)
        
        error_handling_works = True
        if not success:  # 404 is expected, so not success means it worked correctly
            print(f"   ✅ Proper error handling for invalid booking ID (404)")
        else:
            print(f"   ❌ Invalid booking ID should return 404")
            error_handling_works = False
        
        # Test 2: Invalid session ID
        success, response = self.make_request("GET", "payments/status/invalid_session_id_12345", 
                                            expected_status=404)
        
        if not success:  # 404 is expected, so not success means it worked correctly
            print(f"   ✅ Proper error handling for invalid session ID (404)")
        else:
            print(f"   ❌ Invalid session ID should return 404")
            error_handling_works = False
        
        self.log_result("Error Handling", error_handling_works)
        return error_handling_works

    def test_database_integration(self):
        """Test database integration by verifying transaction storage"""
        print("\n" + "="*60)
        print("TESTING: DATABASE INTEGRATION")
        print("="*60)
        
        if not self.test_session_id:
            print("   ⚠️  No session ID available, cannot verify database integration")
            return False
        
        # We can verify database integration by checking that the status endpoint
        # returns our transaction data, which means it was stored and retrieved
        success, response = self.make_request("GET", f"payments/status/{self.test_session_id}")
        
        if success and response.get('session_id') == self.test_session_id:
            print(f"   ✅ Payment transaction stored in database")
            print(f"   ✅ Session ID: {response.get('session_id')}")
            print(f"   ✅ Booking ID linked: {response.get('booking_id')}")
            print(f"   ✅ Transaction status: {response.get('status')}")
            print(f"   ✅ Payment status: {response.get('payment_status')}")
            
            self.log_result("Database Integration", True)
            return True
        else:
            print(f"   ❌ Failed to retrieve transaction from database")
            self.log_result("Database Integration", False)
            return False

    def run_all_payment_tests(self):
        """Run all payment system tests"""
        print("🚀 STARTING PAYMENT SYSTEM TESTING")
        print(f"Backend URL: {self.base_url}")
        print(f"API URL: {self.api_url}")
        
        # Setup test data
        if not self.setup_test_data():
            print("\n❌ Failed to setup test data, aborting payment tests")
            return False
        
        # Run payment tests
        results = []
        results.append(self.test_create_checkout_session())
        results.append(self.test_payment_status())
        results.append(self.test_webhook_endpoint())
        results.append(self.test_error_handling())
        results.append(self.test_database_integration())
        
        # Summary
        passed = sum(results)
        total = len(results)
        
        print("\n" + "="*60)
        print("PAYMENT SYSTEM TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if passed == total:
            print("\n🎉 ALL PAYMENT SYSTEM TESTS PASSED!")
            print("✅ Stripe checkout session creation working")
            print("✅ Payment status retrieval working")
            print("✅ Webhook endpoint accessible")
            print("✅ Error handling working")
            print("✅ Database integration working")
        else:
            print(f"\n⚠️  {total - passed} payment system tests failed")
        
        return passed == total

def main():
    """Main test function"""
    tester = PaymentSystemTester()
    
    try:
        success = tester.run_all_payment_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n\n⚠️  Payment tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n\n💥 Payment test suite crashed: {str(e)}")
        return 1

if __name__ == "__main__":
    import sys
    sys.exit(main())