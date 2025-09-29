#!/usr/bin/env python3

import requests
import json
from datetime import datetime, timedelta

class QuoteApprovalTester:
    def __init__(self, base_url="https://text2toss-junk.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
            self.failed_tests.append({"test": name, "error": details})

    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if self.admin_token:
            headers['Authorization'] = f'Bearer {self.admin_token}'

        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)

            success = response.status_code == expected_status
            
            if success:
                print(f"   Status: {response.status_code} ✅")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:300]}...")
                    self.log_test(name, True)
                    return True, response_data
                except:
                    self.log_test(name, True)
                    return True, {}
            else:
                error_msg = f"Expected {expected_status}, got {response.status_code}"
                try:
                    error_detail = response.json()
                    error_msg += f" - {error_detail}"
                except:
                    error_msg += f" - {response.text[:200]}"
                print(f"   Status: {response.status_code} ❌")
                print(f"   Error: {error_msg}")
                self.log_test(name, False, error_msg)
                return False, {}

        except Exception as e:
            error_msg = f"Request failed: {str(e)}"
            print(f"   Exception: {error_msg}")
            self.log_test(name, False, error_msg)
            return False, {}

    def test_quote_approval_system(self):
        """Test the complete quote approval system"""
        print("🎯 TESTING COMPLETE QUOTE APPROVAL SYSTEM")
        print("="*60)
        
        # Step 1: Admin Login
        print("\n🔐 Step 1: Admin Authentication")
        login_data = {"password": "admin123"}
        success, response = self.run_test("Admin Login", "POST", "admin/login", 200, login_data)
        
        if not success:
            print("❌ Cannot proceed without admin authentication")
            return
        
        self.admin_token = response.get('token')
        print(f"   Admin Token: {self.admin_token[:20]}...")
        
        # Step 2: Create High-Value Quote (Scale 4-10)
        print("\n📊 Step 2: Create High-Value Quote")
        high_value_data = {
            "items": [
                {"name": "Large Sectional Sofa", "quantity": 1, "size": "large", "description": "L-shaped sectional sofa"},
                {"name": "Dining Table Set", "quantity": 1, "size": "large", "description": "Large dining table with 6 chairs"},
                {"name": "Refrigerator", "quantity": 1, "size": "large", "description": "Full-size refrigerator"}
            ],
            "description": "Large furniture cleanout - multiple large items requiring approval"
        }
        
        success, response = self.run_test("Create High-Value Quote", "POST", "quotes", 200, high_value_data)
        if not success:
            print("❌ Cannot proceed without high-value quote")
            return
        
        high_value_quote_id = response.get('id')
        scale_level = response.get('scale_level')
        requires_approval = response.get('requires_approval')
        approval_status = response.get('approval_status')
        
        print(f"   💰 Quote Price: ${response.get('total_price', 0)}")
        print(f"   📊 Scale Level: {scale_level}")
        print(f"   🔒 Requires Approval: {requires_approval}")
        print(f"   📋 Approval Status: {approval_status}")
        
        # Verify high-value quote logic
        if scale_level and scale_level >= 4 and requires_approval and approval_status == "pending_approval":
            print("   ✅ High-value quote correctly requires approval")
        else:
            print("   ❌ High-value quote approval logic failed")
        
        # Step 3: Create Low-Value Quote (Scale 1-3)
        print("\n📊 Step 3: Create Low-Value Quote")
        low_value_data = {
            "items": [
                {"name": "Microwave", "quantity": 1, "size": "small", "description": "Small countertop microwave"}
            ],
            "description": "Small appliance, ground level pickup"
        }
        
        success, response = self.run_test("Create Low-Value Quote", "POST", "quotes", 200, low_value_data)
        if success:
            low_value_quote_id = response.get('id')
            scale_level = response.get('scale_level')
            requires_approval = response.get('requires_approval')
            approval_status = response.get('approval_status')
            
            print(f"   💰 Quote Price: ${response.get('total_price', 0)}")
            print(f"   📊 Scale Level: {scale_level}")
            print(f"   🔒 Requires Approval: {requires_approval}")
            print(f"   📋 Approval Status: {approval_status}")
            
            # Verify low-value quote logic
            if scale_level and scale_level <= 3 and not requires_approval and approval_status == "auto_approved":
                print("   ✅ Low-value quote correctly auto-approved")
            else:
                print("   ❌ Low-value quote auto-approval logic failed")
        
        # Step 4: Get Pending Quotes
        print("\n📋 Step 4: Get Pending Quotes")
        success, response = self.run_test("Get Pending Quotes", "GET", "admin/pending-quotes", 200)
        if success:
            pending_quotes = response
            print(f"   📊 Found {len(pending_quotes)} pending quotes")
            
            # Check if our high-value quote is in the list
            found_quote = any(quote.get('id') == high_value_quote_id for quote in pending_quotes)
            if found_quote:
                print("   ✅ High-value quote found in pending list")
            else:
                print("   ❌ High-value quote not found in pending list")
        
        # Step 5: Approve Quote with Price Adjustment
        print("\n✅ Step 5: Approve Quote with Price Adjustment")
        if high_value_quote_id:
            approval_data = {
                "action": "approve",
                "admin_notes": "Approved with price adjustment due to additional disposal fees",
                "approved_price": 275.00
            }
            
            success, response = self.run_test("Approve Quote", "POST", 
                                            f"admin/quotes/{high_value_quote_id}/approve", 200, approval_data)
            if success:
                message = response.get('message', '')
                quote_data = response.get('quote', {})
                
                print(f"   📝 Message: {message}")
                print(f"   📋 Approval Status: {quote_data.get('approval_status')}")
                print(f"   💰 Approved Price: ${quote_data.get('approved_price')}")
                print(f"   📄 Admin Notes: {quote_data.get('admin_notes')}")
                
                if (quote_data.get('approval_status') == 'approved' and 
                    quote_data.get('approved_price') == 275.00):
                    print("   ✅ Quote approval successful")
                else:
                    print("   ❌ Quote approval failed")
        
        # Step 6: Get Quote Approval Statistics
        print("\n📊 Step 6: Get Quote Approval Statistics")
        success, response = self.run_test("Get Approval Stats", "GET", "admin/quote-approval-stats", 200)
        if success:
            stats = response
            print(f"   📊 Pending: {stats.get('pending_approval', 0)}")
            print(f"   ✅ Approved: {stats.get('approved', 0)}")
            print(f"   ❌ Rejected: {stats.get('rejected', 0)}")
            print(f"   🔄 Auto-approved: {stats.get('auto_approved', 0)}")
            print(f"   📈 Total requiring approval: {stats.get('total_requiring_approval', 0)}")
            
            if all(field in stats for field in ['pending_approval', 'approved', 'rejected', 'auto_approved']):
                print("   ✅ Statistics endpoint working correctly")
            else:
                print("   ❌ Statistics endpoint missing fields")
        
        # Step 7: Test Payment Blocking for Unapproved Quote
        print("\n🚫 Step 7: Test Payment Blocking")
        
        # Create another high-value quote for payment blocking test
        block_test_data = {
            "items": [
                {"name": "Large Furniture Set", "quantity": 1, "size": "large", "description": "Complete living room set"}
            ],
            "description": "Large furniture set requiring approval for payment blocking test"
        }
        
        success, response = self.run_test("Create Quote for Payment Block Test", "POST", "quotes", 200, block_test_data)
        if success and response.get('requires_approval'):
            pending_quote_id = response.get('id')
            print(f"   📋 Created pending quote: {pending_quote_id}")
            
            # Create booking for the unapproved quote
            today = datetime.now()
            days_until_monday = (7 - today.weekday()) % 7
            if days_until_monday == 0:
                days_until_monday = 7
            next_monday = (today + timedelta(days=days_until_monday)).strftime('%Y-%m-%d')
            
            booking_data = {
                "quote_id": pending_quote_id,
                "pickup_date": f"{next_monday}T18:00:00",  # Use 18:00 to avoid conflicts
                "pickup_time": "18:00-20:00",  # Use a different time slot
                "address": "789 Payment Block Test St, Test City, TC 12345",
                "phone": "+1555123456",
                "special_instructions": "Test booking for payment blocking"
            }
            
            success, booking_response = self.run_test("Create Booking for Payment Block Test", "POST", "bookings", 200, booking_data)
            if success:
                test_booking_id = booking_response.get('id')
                print(f"   📋 Created test booking: {test_booking_id}")
                
                # Try to create payment for unapproved quote - should fail
                payment_request = {
                    "booking_id": test_booking_id,
                    "origin_url": "https://text2toss-junk.preview.emergentagent.com"
                }
                
                success, response = self.run_test("Create Payment for Unapproved Quote (Should Fail)", "POST", 
                                                "payments/create-checkout-session", 400, payment_request)
                
                if not success:
                    print("   ✅ Payment correctly blocked for unapproved quote")
                else:
                    print("   ❌ CRITICAL: Payment should be blocked for unapproved quote but succeeded")
        
        # Step 8: Test Payment Success for Auto-Approved Quote
        print("\n✅ Step 8: Test Payment for Auto-Approved Quote")
        if low_value_quote_id:
            # Create booking for auto-approved quote
            auto_approved_booking_data = {
                "quote_id": low_value_quote_id,
                "pickup_date": f"{next_monday}T06:00:00",  # Use early morning slot
                "pickup_time": "06:00-08:00",
                "address": "123 Auto Approved St, Test City, TC 12345",
                "phone": "+1555456789",
                "special_instructions": "Test booking for auto-approved quote payment"
            }
            
            success, booking_response = self.run_test("Create Booking for Auto-Approved Quote", "POST", "bookings", 200, auto_approved_booking_data)
            if success:
                auto_booking_id = booking_response.get('id')
                print(f"   📋 Created auto-approved booking: {auto_booking_id}")
                
                # Try to create payment for auto-approved quote - should succeed
                payment_request = {
                    "booking_id": auto_booking_id,
                    "origin_url": "https://text2toss-junk.preview.emergentagent.com"
                }
                
                success, response = self.run_test("Create Payment for Auto-Approved Quote (Should Succeed)", "POST", 
                                                "payments/create-checkout-session", 200, payment_request)
                
                if success:
                    print(f"   ✅ Payment correctly allowed for auto-approved quote")
                    print(f"   💰 Payment amount: ${response.get('amount')}")
                else:
                    print("   ❌ CRITICAL: Payment should succeed for auto-approved quote but failed")
        
        # Print final summary
        print("\n" + "="*60)
        print("🎯 QUOTE APPROVAL SYSTEM TEST SUMMARY")
        print("="*60)
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        
        print(f"📊 Tests Run: {self.tests_run}")
        print(f"✅ Tests Passed: {self.tests_passed}")
        print(f"❌ Tests Failed: {len(self.failed_tests)}")
        print(f"📈 Success Rate: {success_rate:.1f}%")
        
        if self.failed_tests:
            print(f"\n❌ FAILED TESTS:")
            for i, failed_test in enumerate(self.failed_tests, 1):
                print(f"   {i}. {failed_test['test']}")
                print(f"      Error: {failed_test['error']}")
        
        if success_rate >= 90:
            print(f"\n🎉 EXCELLENT! Quote approval system is working very well.")
        elif success_rate >= 75:
            print(f"\n✅ GOOD! Most quote approval functionality is working correctly.")
        elif success_rate >= 50:
            print(f"\n⚠️  MODERATE! Some quote approval issues need attention.")
        else:
            print(f"\n🚨 CRITICAL! Major quote approval issues detected.")

if __name__ == "__main__":
    tester = QuoteApprovalTester()
    tester.test_quote_approval_system()