"""
Tests for Quote Image Storage Bug Fix
Tests: Image upload to permanent quote_images directory, image serving, booking creation doesn't delete images
Bug: Photos were not showing in admin's Quote Approval view because booking creation was using shutil.move() which deleted the approval photo
Fix: Changed image storage to use permanent /app/static/quote_images/ directory for ALL quotes
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://quote-status-pending.preview.emergentagent.com')
API_URL = f"{BASE_URL.rstrip('/')}/api"

# Admin credentials - read from environment
ADMIN_USERNAME = os.environ.get("TEST_ADMIN_USERNAME", "lrobe")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "L1964c10$")


class TestQuoteImageStorage:
    """Test that quote images are stored correctly in permanent directory"""
    
    def test_upload_quote_image_stores_in_quote_images_directory(self):
        """POST /api/quotes/image should store photo in /app/static/quote_images/ with 'quote_' prefix"""
        # Create a small test image (1x1 pixel JPEG)
        image_data = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
            0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
            0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
            0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
            0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
            0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
            0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
            0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
            0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
            0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
            0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
            0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
            0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
            0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
            0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
            0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5,
            0xF4, 0x57, 0xFF, 0xD9
        ])
        
        files = {
            'file': ('test_image.jpg', io.BytesIO(image_data), 'image/jpeg')
        }
        data = {
            'description': 'TEST_image_storage Test furniture for image storage test'
        }
        
        response = requests.post(f"{API_URL}/quotes/image", files=files, data=data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        quote = response.json()
        
        # Verify the image path
        temp_image_path = quote.get("temp_image_path", "")
        assert temp_image_path, "Quote should have temp_image_path set"
        
        # Verify path is in quote_images directory with quote_ prefix
        assert "/app/static/quote_images/" in temp_image_path, f"Image should be in quote_images directory, got: {temp_image_path}"
        assert "/quote_" in temp_image_path, f"Image filename should have 'quote_' prefix, got: {temp_image_path}"
        
        print(f"✓ Quote image created with path: {temp_image_path}")
        print(f"✓ Quote id: {quote['id'][:8]}..., scale: {quote.get('scale_level')}, approval_status: {quote.get('approval_status')}")
        
        return quote


class TestQuoteImageServing:
    """Test that quote images are correctly served via API"""
    
    def test_serve_quote_image_returns_200(self):
        """GET /api/images/quote_images/{filename} should serve the uploaded photo"""
        # Use the known pending quote image
        filename = "quote_d520f22e-52a5-4d26-a182-72271bd9df0c.jpg"
        
        response = requests.get(f"{API_URL}/images/quote_images/{filename}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type', '').startswith('image/'), f"Expected image content-type, got: {response.headers.get('content-type')}"
        
        # Verify content was returned
        assert len(response.content) > 0, "Image should have content"
        
        print(f"✓ Quote image served successfully: {filename}")
        print(f"  Content-Type: {response.headers.get('content-type')}")
        print(f"  Size: {len(response.content)} bytes")

    def test_nonexistent_image_returns_404(self):
        """GET /api/images/quote_images/{nonexistent} should return 404"""
        response = requests.get(f"{API_URL}/images/quote_images/nonexistent_image.jpg")
        assert response.status_code == 404, f"Expected 404 for nonexistent image, got {response.status_code}"
        print(f"✓ Nonexistent image correctly returns 404")


class TestPendingQuotesWithImages:
    """Test that pending quotes have accessible images"""
    
    def test_pending_quotes_have_correct_image_path(self):
        """GET /api/admin/pending-quotes should return quotes with temp_image_path pointing to quote_images"""
        response = requests.get(f"{API_URL}/admin/pending-quotes")
        assert response.status_code == 200
        
        quotes = response.json()
        assert isinstance(quotes, list)
        
        for quote in quotes:
            temp_image_path = quote.get("temp_image_path")
            if temp_image_path:
                # Verify path is in quote_images directory
                assert "/app/static/quote_images/" in temp_image_path or temp_image_path.startswith("/app/static/quote_images/"), \
                    f"Image path should be in quote_images directory: {temp_image_path}"
                
                # Extract filename and verify we can access it
                filename = temp_image_path.split("/")[-1]
                image_response = requests.get(f"{API_URL}/images/quote_images/{filename}")
                assert image_response.status_code == 200, \
                    f"Image should be accessible at {API_URL}/images/quote_images/{filename}, got {image_response.status_code}"
                
                print(f"✓ Quote {quote['id'][:8]}... has accessible image: {filename}")
        
        print(f"✓ All {len(quotes)} pending quotes have correct image paths")


class TestBookingDoesNotDeleteImage:
    """Test that booking creation does NOT delete/move the original quote image"""
    
    def test_booking_preserves_quote_image(self):
        """POST /api/bookings should NOT delete/move the original quote image"""
        # First create a quote with an image
        image_data = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
            0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
            0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
            0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
            0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
            0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
            0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
            0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
            0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
            0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
            0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
            0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
            0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
            0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
            0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
            0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5,
            0xF4, 0x57, 0xFF, 0xD9
        ])
        
        files = {
            'file': ('booking_test.jpg', io.BytesIO(image_data), 'image/jpeg')
        }
        data = {
            'description': 'TEST_booking_image_preservation Test item'
        }
        
        # Create quote with image
        quote_response = requests.post(f"{API_URL}/quotes/image", files=files, data=data)
        assert quote_response.status_code == 200
        quote = quote_response.json()
        quote_id = quote['id']
        temp_image_path = quote.get('temp_image_path', '')
        
        # Extract filename
        filename = temp_image_path.split("/")[-1]
        
        # Verify image is accessible BEFORE booking
        image_before = requests.get(f"{API_URL}/images/quote_images/{filename}")
        assert image_before.status_code == 200, f"Image should be accessible before booking: {image_before.status_code}"
        print(f"✓ Image accessible BEFORE booking: {filename}")
        
        # Create booking using this quote
        booking_response = requests.post(f"{API_URL}/bookings", json={
            "quote_id": quote_id,
            "pickup_date": "2026-03-12T10:00:00",
            "pickup_time": "10:00-12:00",
            "address": "999 Test Blvd, Flagstaff AZ 86001",
            "phone": "+19285559999",
            "email": "imagetest@example.com"
        })
        assert booking_response.status_code == 200
        booking = booking_response.json()
        print(f"✓ Booking created: {booking['id'][:8]}..., status: {booking['status']}")
        
        # Verify image is STILL accessible AFTER booking
        image_after = requests.get(f"{API_URL}/images/quote_images/{filename}")
        assert image_after.status_code == 200, \
            f"Image should STILL be accessible after booking creation: {image_after.status_code}. Bug: shutil.move() was deleting images!"
        
        print(f"✓ Image STILL accessible AFTER booking: {filename}")
        print(f"✓ BUG FIX VERIFIED: Booking creation no longer deletes quote images!")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
