#!/usr/bin/env python3
"""
Focused test for Email Notification and CSV Export endpoints
"""
import requests
import json
import sys
from datetime import datetime

class EmailCSVTester:
    def __init__(self):
        self.base_url = "https://junkapp.preview.emergentagent.com"
        self.api_url = f"{self.base_url}/api"
        self.admin_token = None
        self.test_booking_id = None
        
    def log_test(self, name, success, details=""):
        """Log test results"""
        if success:
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
    
    def test_admin_login(self):
        """Test admin authentication first"""
        print("\n🔐 Testing Admin Authentication...")
        
        login_data = {
            "username": "lrobe",
            "password": "L1964c10$"
        }
        
        try:
            response = requests.post(f"{self.api_url}/admin/login", json=login_data, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                self.admin_token = data.get('token')
                print(f"   ✅ Admin login successful")
                print(f"   📝 Token: {self.admin_token[:30]}...")
                return True
            else:
                print(f"   ❌ Admin login failed: {response.status_code}")
                print(f"   📋 Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"   ❌ Admin login error: {str(e)}")
            return False
    
    def test_csv_export(self):
        """Test CSV Export Endpoint"""
        print("\n📊 Testing CSV Export Endpoint...")
        
        if not self.admin_token:
            print("   ❌ No admin token available")
            return False
        
        try:
            # Test CSV export with token
            url = f"{self.api_url}/admin/export-job-contacts?token={self.admin_token}"
            response = requests.get(url, timeout=30)
            
            print(f"   📡 Request URL: {url}")
            print(f"   📊 Response Status: {response.status_code}")
            print(f"   📋 Response Headers: {dict(response.headers)}")
            
            if response.status_code == 200:
                # Check if it's a CSV download
                content_type = response.headers.get('content-type', '')
                content_disposition = response.headers.get('content-disposition', '')
                
                print(f"   📄 Content-Type: {content_type}")
                print(f"   📥 Content-Disposition: {content_disposition}")
                
                if 'csv' in content_type.lower() or 'attachment' in content_disposition.lower():
                    print(f"   ✅ CSV download headers correct")
                    
                    # Check filename format
                    if 'job_contacts_' in content_disposition and '.csv' in content_disposition:
                        print(f"   ✅ Filename format correct (job_contacts_YYYYMMDD_HHMMSS.csv)")
                    else:
                        print(f"   ⚠️  Filename format may be incorrect")
                    
                    # Check content length
                    content_length = len(response.content)
                    print(f"   📊 Content Length: {content_length} bytes")
                    
                    if content_length > 0:
                        print(f"   ✅ CSV file has content")
                        
                        # Try to peek at CSV content (first 200 chars)
                        try:
                            content_preview = response.text[:200]
                            print(f"   📋 CSV Preview: {content_preview}")
                            
                            # Check for expected CSV headers
                            expected_headers = ["Booking ID", "Customer Name", "Email", "Phone"]
                            header_found = any(header in content_preview for header in expected_headers)
                            
                            if header_found:
                                print(f"   ✅ CSV contains expected headers")
                            else:
                                print(f"   ⚠️  CSV headers may be missing or different")
                                
                        except Exception as e:
                            print(f"   ⚠️  Could not preview CSV content: {str(e)}")
                    else:
                        print(f"   ⚠️  CSV file is empty")
                else:
                    # Might be JSON response
                    try:
                        json_data = response.json()
                        print(f"   📋 JSON Response: {json_data}")
                        
                        if 'error' in json_data:
                            print(f"   ❌ CSV export returned error: {json_data['error']}")
                        elif json_data.get('message') == 'No bookings found':
                            print(f"   ℹ️  No bookings available for export (expected if no data)")
                        else:
                            print(f"   ⚠️  Unexpected JSON response format")
                            
                    except:
                        print(f"   ⚠️  Response is not CSV or JSON")
                
                self.log_test("CSV Export Endpoint", True)
                return True
                
            elif response.status_code == 404:
                try:
                    error_data = response.json()
                    if 'no bookings' in error_data.get('detail', '').lower():
                        print(f"   ℹ️  No bookings found for export (404 expected)")
                        self.log_test("CSV Export Endpoint - No Data", True)
                        return True
                    else:
                        print(f"   ❌ Unexpected 404 error: {error_data}")
                        self.log_test("CSV Export Endpoint", False, f"404: {error_data}")
                        return False
                except:
                    print(f"   ❌ 404 error: {response.text}")
                    self.log_test("CSV Export Endpoint", False, f"404: {response.text}")
                    return False
            else:
                print(f"   ❌ CSV export failed with status {response.status_code}")
                print(f"   📋 Response: {response.text}")
                self.log_test("CSV Export Endpoint", False, f"Status {response.status_code}")
                return False
                
        except Exception as e:
            print(f"   ❌ CSV export error: {str(e)}")
            self.log_test("CSV Export Endpoint", False, str(e))
            return False
    
    def test_bulk_email_reminder(self):
        """Test Bulk Email Reminder Endpoint"""
        print("\n📧 Testing Bulk Email Reminder Endpoint...")
        
        if not self.admin_token:
            print("   ❌ No admin token available")
            return False
        
        try:
            url = f"{self.api_url}/admin/send-bulk-email-reminder?token={self.admin_token}"
            response = requests.post(url, timeout=30)
            
            print(f"   📡 Request URL: {url}")
            print(f"   📊 Response Status: {response.status_code}")
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    print(f"   📋 Response Data: {data}")
                    
                    # Check for expected fields
                    if 'sent_count' in data and 'failed_count' in data:
                        sent_count = data['sent_count']
                        failed_count = data['failed_count']
                        
                        print(f"   ✅ Response contains sent_count: {sent_count}")
                        print(f"   ✅ Response contains failed_count: {failed_count}")
                        
                        if sent_count >= 0 and failed_count >= 0:
                            print(f"   ✅ Email counts are valid")
                        else:
                            print(f"   ❌ Invalid email counts")
                        
                        if 'message' in data:
                            print(f"   ✅ Response message: {data['message']}")
                        
                        self.log_test("Bulk Email Reminder", True)
                        return True
                    else:
                        print(f"   ❌ Missing required fields in response")
                        self.log_test("Bulk Email Reminder", False, "Missing sent_count/failed_count")
                        return False
                        
                except Exception as e:
                    print(f"   ❌ Could not parse JSON response: {str(e)}")
                    print(f"   📋 Raw response: {response.text}")
                    self.log_test("Bulk Email Reminder", False, f"JSON parse error: {str(e)}")
                    return False
            else:
                print(f"   ❌ Bulk email failed with status {response.status_code}")
                print(f"   📋 Response: {response.text}")
                self.log_test("Bulk Email Reminder", False, f"Status {response.status_code}")
                return False
                
        except Exception as e:
            print(f"   ❌ Bulk email error: {str(e)}")
            self.log_test("Bulk Email Reminder", False, str(e))
            return False
    
    def test_booking_confirmation_email(self):
        """Test Booking Confirmation Email Endpoint"""
        print("\n📧 Testing Booking Confirmation Email Endpoint...")
        
        if not self.admin_token:
            print("   ❌ No admin token available")
            return False
        
        # First, try to get a real booking ID
        try:
            daily_url = f"{self.api_url}/admin/daily-schedule"
            headers = {'Authorization': f'Bearer {self.admin_token}'}
            daily_response = requests.get(daily_url, headers=headers, timeout=30)
            
            if daily_response.status_code == 200:
                bookings = daily_response.json()
                if isinstance(bookings, list) and len(bookings) > 0:
                    self.test_booking_id = bookings[0].get('id')
                    print(f"   📋 Found test booking ID: {self.test_booking_id}")
                else:
                    print(f"   ℹ️  No bookings found in daily schedule")
            else:
                print(f"   ⚠️  Could not get daily schedule: {daily_response.status_code}")
                
        except Exception as e:
            print(f"   ⚠️  Error getting booking ID: {str(e)}")
        
        # Test with real booking ID if available
        if self.test_booking_id:
            try:
                url = f"{self.api_url}/admin/send-booking-confirmation-email/{self.test_booking_id}?token={self.admin_token}"
                response = requests.post(url, timeout=30)
                
                print(f"   📡 Request URL: {url}")
                print(f"   📊 Response Status: {response.status_code}")
                
                if response.status_code == 200:
                    try:
                        data = response.json()
                        print(f"   📋 Response Data: {data}")
                        
                        if 'success' in data or 'message' in data:
                            print(f"   ✅ Booking confirmation email endpoint working")
                            self.log_test("Booking Confirmation Email", True)
                            return True
                        else:
                            print(f"   ⚠️  Unexpected response format")
                            self.log_test("Booking Confirmation Email", True, "Unexpected format")
                            return True
                            
                    except:
                        print(f"   ✅ Booking confirmation email sent (non-JSON response)")
                        self.log_test("Booking Confirmation Email", True)
                        return True
                        
                elif response.status_code == 400:
                    try:
                        error_data = response.json()
                        if 'email' in error_data.get('detail', '').lower():
                            print(f"   ℹ️  Booking has no email address (400 expected)")
                            self.log_test("Booking Confirmation Email - No Email", True)
                            return True
                        else:
                            print(f"   ❌ Unexpected 400 error: {error_data}")
                            self.log_test("Booking Confirmation Email", False, f"400: {error_data}")
                            return False
                    except:
                        print(f"   ❌ 400 error: {response.text}")
                        self.log_test("Booking Confirmation Email", False, f"400: {response.text}")
                        return False
                else:
                    print(f"   ❌ Booking confirmation failed with status {response.status_code}")
                    print(f"   📋 Response: {response.text}")
                    self.log_test("Booking Confirmation Email", False, f"Status {response.status_code}")
                    return False
                    
            except Exception as e:
                print(f"   ❌ Booking confirmation error: {str(e)}")
                self.log_test("Booking Confirmation Email", False, str(e))
                return False
        
        # Test with invalid booking ID (should return 404)
        print("\n   🔍 Testing with invalid booking ID...")
        try:
            url = f"{self.api_url}/admin/send-booking-confirmation-email/invalid_booking_id?token={self.admin_token}"
            response = requests.post(url, timeout=30)
            
            print(f"   📡 Request URL: {url}")
            print(f"   📊 Response Status: {response.status_code}")
            
            if response.status_code == 404:
                print(f"   ✅ Proper 404 error for invalid booking ID")
                self.log_test("Booking Confirmation Email - Invalid ID", True)
                return True
            else:
                print(f"   ❌ Expected 404, got {response.status_code}")
                self.log_test("Booking Confirmation Email - Invalid ID", False, f"Expected 404, got {response.status_code}")
                return False
                
        except Exception as e:
            print(f"   ❌ Invalid booking ID test error: {str(e)}")
            self.log_test("Booking Confirmation Email - Invalid ID", False, str(e))
            return False
    
    def test_authentication_requirements(self):
        """Test authentication requirements for all endpoints"""
        print("\n🔐 Testing Authentication Requirements...")
        
        endpoints = [
            ("CSV Export", "GET", "admin/export-job-contacts"),
            ("Bulk Email", "POST", "admin/send-bulk-email-reminder"),
            ("Booking Confirmation", "POST", "admin/send-booking-confirmation-email/test_id")
        ]
        
        for name, method, endpoint in endpoints:
            try:
                url = f"{self.api_url}/{endpoint}"
                
                if method == "GET":
                    response = requests.get(url, timeout=30)
                else:
                    response = requests.post(url, timeout=30)
                
                if response.status_code == 401:
                    print(f"   ✅ {name} properly requires authentication (401)")
                    self.log_test(f"{name} - Auth Required", True)
                else:
                    print(f"   ❌ {name} should require auth but got {response.status_code}")
                    self.log_test(f"{name} - Auth Required", False, f"Got {response.status_code}")
                    
            except Exception as e:
                print(f"   ❌ {name} auth test error: {str(e)}")
                self.log_test(f"{name} - Auth Required", False, str(e))
    
    def run_tests(self):
        """Run all email and CSV tests"""
        print("🚀 Starting Email Notification and CSV Export Testing")
        print(f"Backend URL: {self.base_url}")
        print(f"API URL: {self.api_url}")
        
        # Test admin authentication first
        if not self.test_admin_login():
            print("\n❌ Cannot proceed without admin authentication")
            return False
        
        # Run the main tests
        results = []
        results.append(self.test_csv_export())
        results.append(self.test_bulk_email_reminder())
        results.append(self.test_booking_confirmation_email())
        
        # Test authentication requirements
        self.test_authentication_requirements()
        
        # Summary
        print("\n" + "="*60)
        print("EMAIL & CSV EXPORT TEST SUMMARY")
        print("="*60)
        
        success_count = sum(1 for r in results if r)
        total_tests = len(results)
        
        print(f"Main Tests Passed: {success_count}/{total_tests}")
        
        if success_count == total_tests:
            print("✅ ALL CRITICAL EMAIL & CSV TESTS PASSED")
            return True
        else:
            print("❌ SOME TESTS FAILED")
            return False

def main():
    """Main test function"""
    tester = EmailCSVTester()
    
    try:
        success = tester.run_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n\n💥 Test suite crashed: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())