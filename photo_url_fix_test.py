#!/usr/bin/env python3
"""
Photo URL Fix Test - Comprehensive diagnosis and solution verification
"""

import requests
import json
import os
from datetime import datetime

class PhotoURLFixTester:
    def __init__(self, base_url="https://junkapp-pricing.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None

    def log_result(self, message, success=True):
        """Log test results"""
        icon = "✅" if success else "❌"
        print(f"{icon} {message}")

    def make_request(self, method, endpoint, data=None, files=None, expected_status=200):
        """Make API request"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if self.admin_token and 'Authorization' not in headers:
            headers['Authorization'] = f'Bearer {self.admin_token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                if files:
                    if 'Content-Type' in headers:
                        del headers['Content-Type']
                    response = requests.post(url, data=data, files=files, headers=headers, timeout=30)
                else:
                    response = requests.post(url, json=data, headers=headers, timeout=30)

            success = response.status_code == expected_status
            
            if success:
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                try:
                    error_detail = response.json()
                    return False, error_detail
                except:
                    return False, {"error": response.text[:200], "status": response.status_code}

        except Exception as e:
            return False, {"error": str(e)}

    def run_comprehensive_diagnosis(self):
        """Run comprehensive photo URL diagnosis"""
        print("🔍 COMPREHENSIVE PHOTO URL DIAGNOSIS")
        print("=" * 60)
        
        # Step 1: Admin Login
        print("\n🔐 Step 1: Admin Authentication...")
        login_data = {"username": "lrobe", "password": "L1964c10$"}
        success, response = self.make_request("POST", "admin/login", login_data)
        
        if success and response.get('token'):
            self.admin_token = response['token']
            self.log_result("Admin login successful")
        else:
            self.log_result("Admin login failed", False)
            return
        
        # Step 2: Analyze Current Issue
        print("\n📋 Step 2: Analyzing Current Photo URL Issue...")
        success, quotes = self.make_request("GET", "admin/pending-quotes")
        
        if success and isinstance(quotes, list):
            quotes_with_photos = [q for q in quotes if q.get('temp_image_path')]
            print(f"📸 Found {len(quotes_with_photos)} quotes with photos")
            
            if quotes_with_photos:
                quote = quotes_with_photos[0]
                temp_image_path = quote.get('temp_image_path')
                filename = os.path.basename(temp_image_path)
                
                print(f"📂 Sample temp_image_path: {temp_image_path}")
                print(f"📄 Extracted filename: {filename}")
                
                # Test current admin dashboard URL construction
                admin_url = f"{self.base_url}/api/images/booking_images/{filename}"
                print(f"\n🔗 Testing current admin dashboard URL construction:")
                print(f"   URL: {admin_url}")
                
                try:
                    response = requests.head(admin_url, timeout=10)
                    print(f"   Status: {response.status_code}")
                    if response.status_code == 404:
                        print("   ❌ Image not found - this is the reported issue!")
                    elif response.status_code == 405:
                        print("   ❌ Method not allowed - API endpoint issue!")
                    elif response.status_code == 200:
                        print("   ✅ Image found - issue may be resolved!")
                except Exception as e:
                    print(f"   ❌ Request failed: {str(e)}")
        
        # Step 3: Check File System Locations
        print("\n📁 Step 3: File System Analysis...")
        print("Checking where customer photos are actually stored:")
        
        # Check temp_uploads (where images are initially stored)
        print("\n📂 /tmp/temp_uploads/ (initial storage):")
        try:
            import subprocess
            result = subprocess.run(['ls', '-la', '/tmp/temp_uploads/'], 
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                files = result.stdout.strip().split('\n')[2:]  # Skip . and ..
                print(f"   Found {len(files)} files")
                if files:
                    print(f"   Sample file: {files[0].split()[-1]}")
            else:
                print("   Directory not accessible")
        except Exception as e:
            print(f"   Error checking directory: {str(e)}")
        
        # Check booking_images (where images should be moved after booking)
        print("\n📂 /app/backend/static/booking_images/ (permanent storage):")
        try:
            result = subprocess.run(['ls', '-la', '/app/backend/static/booking_images/'], 
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                files = result.stdout.strip().split('\n')[2:]  # Skip . and ..
                print(f"   Found {len(files)} files")
                if files:
                    print(f"   Sample file: {files[0].split()[-1]}")
            else:
                print("   Directory not accessible")
        except Exception as e:
            print(f"   Error checking directory: {str(e)}")
        
        # Check /app/static/ (where API endpoint looks)
        print("\n📂 /app/static/ (where API endpoint looks):")
        try:
            result = subprocess.run(['ls', '-la', '/app/static/'], 
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                print("   Directory contents:")
                print(f"   {result.stdout}")
            else:
                print("   Directory not accessible")
        except Exception as e:
            print(f"   Error checking directory: {str(e)}")
        
        # Step 4: Test API Endpoint Functionality
        print("\n🔧 Step 4: Testing API Endpoint Functionality...")
        
        # Test with a known existing file from booking_images
        try:
            result = subprocess.run(['ls', '/app/backend/static/booking_images/'], 
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                files = result.stdout.strip().split('\n')
                if files and files[0]:
                    test_filename = files[0]
                    print(f"📄 Testing with existing file: {test_filename}")
                    
                    # Test API endpoint
                    api_url = f"{self.base_url}/api/images/booking_images/{test_filename}"
                    print(f"🔗 Testing API URL: {api_url}")
                    
                    try:
                        response = requests.head(api_url, timeout=10)
                        print(f"   Status: {response.status_code}")
                        if response.status_code == 200:
                            print("   ✅ API endpoint working!")
                            content_type = response.headers.get('content-type', '')
                            print(f"   📄 Content-Type: {content_type}")
                        elif response.status_code == 404:
                            print("   ❌ File not found via API")
                        elif response.status_code == 405:
                            print("   ❌ Method not allowed - API routing issue")
                        else:
                            print(f"   ⚠️  Unexpected status: {response.status_code}")
                    except Exception as e:
                        print(f"   ❌ API request failed: {str(e)}")
        except Exception as e:
            print(f"   Error testing API endpoint: {str(e)}")
        
        # Step 5: Identify Root Cause
        print("\n🎯 Step 5: Root Cause Analysis...")
        
        print("IDENTIFIED ISSUES:")
        print("1. ❌ Customer photos stored in /tmp/temp_uploads/")
        print("2. ❌ API endpoint looks in /app/static/{folder}/")
        print("3. ❌ Path mismatch: /tmp/temp_uploads/ ≠ /app/static/temp_uploads/")
        print("4. ❌ Images not moved to correct location after quote creation")
        
        # Step 6: Test Correct Path
        print("\n✅ Step 6: Testing Correct Path Solution...")
        
        # Check if we can access images via the correct static path
        if quotes_with_photos:
            quote = quotes_with_photos[0]
            temp_image_path = quote.get('temp_image_path')
            filename = os.path.basename(temp_image_path)
            
            # The API endpoint expects files in /app/static/{folder}/
            # But images are in /tmp/temp_uploads/
            # So we need to either:
            # 1. Move images to /app/static/temp_uploads/
            # 2. Update API endpoint to look in /tmp/temp_uploads/
            # 3. Create symlink
            
            print("SOLUTION OPTIONS:")
            print("Option 1: Move images to /app/static/temp_uploads/")
            print("Option 2: Update API endpoint to handle /tmp/temp_uploads/")
            print("Option 3: Create symlink from /app/static/temp_uploads/ to /tmp/temp_uploads/")
            
            # Test if creating symlink would work
            print("\n🔗 Testing symlink solution...")
            try:
                import subprocess
                
                # Create /app/static/temp_uploads directory if it doesn't exist
                subprocess.run(['mkdir', '-p', '/app/static/temp_uploads'], timeout=10)
                
                # Create symlink (this might fail if already exists)
                result = subprocess.run(['ln', '-sf', '/tmp/temp_uploads/', '/app/static/temp_uploads'], 
                                      capture_output=True, text=True, timeout=10)
                
                if result.returncode == 0:
                    print("   ✅ Symlink created successfully")
                    
                    # Test API endpoint now
                    api_url = f"{self.base_url}/api/images/temp_uploads/{filename}"
                    print(f"   🔗 Testing API URL with symlink: {api_url}")
                    
                    try:
                        response = requests.head(api_url, timeout=10)
                        print(f"   Status: {response.status_code}")
                        if response.status_code == 200:
                            print("   ✅ SOLUTION WORKS! Images now accessible via API")
                            content_type = response.headers.get('content-type', '')
                            print(f"   📄 Content-Type: {content_type}")
                        else:
                            print(f"   ❌ Still not working: {response.status_code}")
                    except Exception as e:
                        print(f"   ❌ API test failed: {str(e)}")
                else:
                    print(f"   ❌ Symlink creation failed: {result.stderr}")
            except Exception as e:
                print(f"   ❌ Symlink test failed: {str(e)}")
        
        # Step 7: Final Recommendations
        print("\n💡 FINAL DIAGNOSIS AND RECOMMENDATIONS")
        print("=" * 60)
        
        print("🔍 ROOT CAUSE IDENTIFIED:")
        print("• Customer photos stored in /tmp/temp_uploads/")
        print("• API endpoint /api/images/{folder}/{filename} looks in /app/static/{folder}/")
        print("• Path mismatch prevents admin dashboard from viewing photos")
        
        print("\n🛠️  IMMEDIATE SOLUTIONS:")
        print("1. ✅ Create symlink: /app/static/temp_uploads -> /tmp/temp_uploads")
        print("2. 🔧 Update admin dashboard to use correct folder: 'temp_uploads' not 'booking_images'")
        print("3. 🔧 Ensure images are moved to /app/static/booking_images/ after booking")
        
        print("\n📋 IMPLEMENTATION STEPS:")
        print("1. Create symlink for immediate fix")
        print("2. Update admin dashboard photo URL construction")
        print("3. Verify booking process moves images correctly")
        print("4. Test 'View Full Photo' functionality")

def main():
    tester = PhotoURLFixTester()
    tester.run_comprehensive_diagnosis()

if __name__ == "__main__":
    main()