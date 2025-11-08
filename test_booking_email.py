#!/usr/bin/env python3
"""
Test booking confirmation email with a real booking
"""
import requests
import json
from datetime import datetime, timedelta

def test_booking_confirmation_with_real_booking():
    base_url = "https://junkai-platform.preview.emergentagent.com"
    api_url = f"{base_url}/api"
    
    # Step 1: Login as admin
    login_data = {
        "username": "lrobe",
        "password": "L1964c10$"
    }
    
    response = requests.post(f"{api_url}/admin/login", json=login_data)
    if response.status_code != 200:
        print("❌ Admin login failed")
        return False
    
    admin_token = response.json()['token']
    print("✅ Admin login successful")
    
    # Step 2: Create a test quote
    quote_data = {
        "items": [
            {"name": "Test Sofa", "quantity": 1, "size": "large", "description": "Large sofa for email testing"}
        ],
        "description": "Test items for email confirmation testing"
    }
    
    response = requests.post(f"{api_url}/quotes", json=quote_data)
    if response.status_code != 200:
        print("❌ Quote creation failed")
        return False
    
    quote_id = response.json()['id']
    print(f"✅ Quote created: {quote_id}")
    
    # Step 3: Create a test booking with email
    today = datetime.now()
    days_until_monday = (7 - today.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 7
    next_monday = (today + timedelta(days=days_until_monday)).strftime('%Y-%m-%d')
    
    booking_data = {
        "quote_id": quote_id,
        "pickup_date": f"{next_monday}T14:00:00",
        "pickup_time": "14:00-16:00",
        "address": "123 Email Test Street, Test City, TC 12345",
        "phone": "+12345678901",
        "email": "test@example.com",  # Include email for testing
        "special_instructions": "Test booking for email confirmation",
        "curbside_confirmed": True,
        "email_notifications": True
    }
    
    response = requests.post(f"{api_url}/bookings", json=booking_data)
    if response.status_code != 200:
        print(f"❌ Booking creation failed: {response.text}")
        return False
    
    booking_id = response.json()['id']
    print(f"✅ Booking created with email: {booking_id}")
    
    # Step 4: Test booking confirmation email endpoint
    url = f"{api_url}/admin/send-booking-confirmation-email/{booking_id}?token={admin_token}"
    response = requests.post(url)
    
    print(f"📧 Testing booking confirmation email...")
    print(f"   URL: {url}")
    print(f"   Status: {response.status_code}")
    
    if response.status_code == 200:
        try:
            data = response.json()
            print(f"   Response: {data}")
            
            if data.get('success'):
                print("✅ Booking confirmation email sent successfully")
                return True
            else:
                print("❌ Email sending failed")
                return False
        except:
            print("✅ Email sent (non-JSON response)")
            return True
    else:
        print(f"❌ Email sending failed with status {response.status_code}")
        print(f"   Response: {response.text}")
        return False

if __name__ == "__main__":
    success = test_booking_confirmation_with_real_booking()
    print(f"\n{'✅ SUCCESS' if success else '❌ FAILED'}")