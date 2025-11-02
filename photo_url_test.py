#!/usr/bin/env python3
"""
Photo URL Diagnosis Test - Debug 'Image not found' issue for admin dashboard
"""

import requests
import json
import os
from datetime import datetime
import tempfile
from pathlib import Path

class PhotoURLDiagnoser:
    def __init__(self, base_url="https://text2toss-junk.preview.emergentagent.com"):
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
                    # Remove Content-Type for file uploads
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
                    return False, {"error": response.text[:200]}

        except Exception as e:
            return False, {"error": str(e)}

    def diagnose_photo_urls(self):
        """Main diagnosis function"""
        print("🔍 PHOTO URL DIAGNOSIS - DEBUG IMAGE NOT FOUND ISSUE")
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
        
        # Step 2: Get Pending Quotes with Photos
        print("\n📋 Step 2: Examining Quotes with Photos...")
        success, quotes = self.make_request("GET", "admin/pending-quotes")
        
        if success and isinstance(quotes, list):
            self.log_result(f"Found {len(quotes)} pending quotes")
            
            # Look for quotes with temp_image_path
            quotes_with_photos = [q for q in quotes if q.get('temp_image_path')]
            print(f"📸 Quotes with photos: {len(quotes_with_photos)}")
            
            if quotes_with_photos:
                # Analyze the first quote with photo
                test_quote = quotes_with_photos[0]
                self.analyze_quote_photo(test_quote)
            else:
                print("ℹ️  No existing quotes with photos found")
                # Create a test quote with photo
                self.create_test_quote_with_photo()
        else:
            self.log_result("Failed to get pending quotes", False)
    
    def analyze_quote_photo(self, quote):
        """Analyze a specific quote's photo URL structure"""
        print(f"\n🔍 Step 3: Analyzing Quote Photo Structure...")
        
        quote_id = quote.get('id')
        temp_image_path = quote.get('temp_image_path')
        
        print(f"📋 Quote ID: {quote_id}")
        print(f"📸 temp_image_path: {temp_image_path}")
        
        if temp_image_path:
            # Extract filename
            filename = os.path.basename(temp_image_path)
            print(f"📄 Extracted filename: {filename}")
            
            # Analyze path structure
            if temp_image_path.startswith('/'):
                path_parts = temp_image_path.split('/')
                print(f"📂 Path parts: {path_parts}")
                
                # Determine folder
                if 'temp_uploads' in path_parts:
                    folder = 'temp_uploads'
                elif 'booking_images' in path_parts:
                    folder = 'booking_images'
                elif 'gallery' in path_parts:
                    folder = 'gallery'
                else:
                    folder = 'unknown'
                
                print(f"📁 Detected folder: {folder}")
                
                # Test different URL constructions
                self.test_image_url_constructions(filename, folder)
            else:
                print("⚠️  temp_image_path is not an absolute path")
        else:
            print("❌ temp_image_path is None or missing")
    
    def test_image_url_constructions(self, filename, detected_folder):
        """Test different ways to construct image URLs"""
        print(f"\n🔗 Step 4: Testing Image URL Constructions...")
        
        # Test different folder possibilities
        test_folders = ['booking_images', 'gallery', 'temp_uploads', detected_folder]
        test_folders = list(set(test_folders))  # Remove duplicates
        
        for folder in test_folders:
            if folder == 'unknown':
                continue
                
            # Test API endpoint
            api_url = f"{self.base_url}/api/images/{folder}/{filename}"
            print(f"🔍 Testing API URL: {api_url}")
            
            try:
                response = requests.head(api_url, timeout=10)
                print(f"   Status: {response.status_code}")
                
                if response.status_code == 200:
                    self.log_result(f"WORKING URL FOUND: {api_url}")
                    content_type = response.headers.get('content-type', '')
                    print(f"   📄 Content-Type: {content_type}")
                elif response.status_code == 404:
                    print(f"   ❌ Image not found at this URL")
                else:
                    print(f"   ⚠️  Unexpected status: {response.status_code}")
            except Exception as e:
                print(f"   ❌ Request failed: {str(e)}")
            
            # Test static URL
            static_url = f"{self.base_url}/static/{folder}/{filename}"
            print(f"🔍 Testing Static URL: {static_url}")
            
            try:
                response = requests.head(static_url, timeout=10)
                print(f"   Status: {response.status_code}")
                
                if response.status_code == 200:
                    self.log_result(f"WORKING STATIC URL FOUND: {static_url}")
                    content_type = response.headers.get('content-type', '')
                    print(f"   📄 Content-Type: {content_type}")
                elif response.status_code == 404:
                    print(f"   ❌ Image not found at static URL")
                else:
                    print(f"   ⚠️  Unexpected status: {response.status_code}")
            except Exception as e:
                print(f"   ❌ Static request failed: {str(e)}")
    
    def create_test_quote_with_photo(self):
        """Create a test quote with photo for analysis"""
        print(f"\n📸 Step 5: Creating Test Quote with Photo...")
        
        try:
            # Create a simple test image
            from PIL import Image
            import io
            
            img = Image.new('RGB', (100, 100), color='red')
            img_buffer = io.BytesIO()
            img.save(img_buffer, format='JPEG')
            img_buffer.seek(0)
            
            files = {'file': ('test_customer_photo.jpg', img_buffer, 'image/jpeg')}
            data = {'description': 'Test customer photo for URL diagnosis'}
            
            success, response = self.make_request("POST", "quotes/image", data=data, files=files)
            
            if success and response.get('id'):
                quote_id = response['id']
                temp_image_path = response.get('temp_image_path')
                
                self.log_result(f"Created test quote: {quote_id}")
                print(f"📸 temp_image_path: {temp_image_path}")
                
                if temp_image_path:
                    # Analyze this new quote
                    self.analyze_quote_photo(response)
                else:
                    print("❌ No temp_image_path in response")
            else:
                self.log_result("Failed to create test quote with photo", False)
                
        except ImportError:
            print("⚠️  PIL not available for creating test image")
        except Exception as e:
            print(f"❌ Error creating test quote: {str(e)}")
    
    def check_file_system_structure(self):
        """Check what directories exist for images"""
        print(f"\n📁 Step 6: Checking File System Structure...")
        
        # Test different static endpoints to see what exists
        test_paths = [
            "static/gallery/",
            "static/booking_images/", 
            "static/temp_uploads/",
            "api/images/gallery/",
            "api/images/booking_images/",
            "api/images/temp_uploads/"
        ]
        
        for path in test_paths:
            url = f"{self.base_url}/{path}test.jpg"
            try:
                response = requests.head(url, timeout=5)
                if response.status_code == 404:
                    print(f"✅ Directory exists: /{path} (404 expected for non-existent file)")
                elif response.status_code == 403:
                    print(f"✅ Directory exists but forbidden: /{path}")
                else:
                    print(f"⚠️  Unexpected response for /{path}: {response.status_code}")
            except Exception as e:
                print(f"❌ Cannot access /{path}: {str(e)}")
    
    def provide_diagnosis_summary(self):
        """Provide final diagnosis and recommendations"""
        print(f"\n💡 DIAGNOSIS SUMMARY AND RECOMMENDATIONS")
        print("=" * 60)
        
        print("🔍 FINDINGS:")
        print("• Backend URL: https://text2toss-junk.preview.emergentagent.com")
        print("• Image serving should use: /api/images/{folder}/{filename}")
        print("• Customer photos stored with temp_image_path in quotes")
        print("• Photos may be in temp_uploads initially, moved to booking_images after booking")
        
        print("\n🛠️  LIKELY ISSUES:")
        print("1. Admin dashboard constructing wrong URL format")
        print("2. Images not moved from temp_uploads to booking_images folder")
        print("3. Incorrect folder name in URL construction")
        print("4. Missing image serving endpoint for the correct folder")
        
        print("\n✅ RECOMMENDATIONS:")
        print("1. Check admin dashboard photo URL construction")
        print("2. Verify image file movement during booking process")
        print("3. Ensure /api/images/booking_images/ endpoint exists")
        print("4. Test with actual quote photo paths from database")
        print("5. Check if REACT_APP_BACKEND_URL is correctly configured")

def main():
    diagnoser = PhotoURLDiagnoser()
    diagnoser.diagnose_photo_urls()
    diagnoser.check_file_system_structure()
    diagnoser.provide_diagnosis_summary()

if __name__ == "__main__":
    main()