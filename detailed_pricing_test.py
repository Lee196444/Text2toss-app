#!/usr/bin/env python3
"""
Detailed test for the NEW PRICING SYSTEM (1-10 scale)
This test specifically validates the new pricing implementation
"""

import requests
import json
import sys

def test_pricing_system():
    """Test the new 1-10 scale pricing system in detail"""
    base_url = "https://junkapp.preview.emergentagent.com/api"
    
    print("🔍 DETAILED NEW PRICING SYSTEM TEST")
    print("="*60)
    
    # Test 1: Scale 1 pricing (Small items)
    print("\n1️⃣ Testing Scale 1 Pricing (3x3x3 cubic feet)")
    scale1_data = {
        "items": [
            {"name": "Small Microwave", "quantity": 1, "size": "small", "description": "Countertop microwave"}
        ],
        "description": "Single small appliance, ground level pickup"
    }
    
    response = requests.post(f"{base_url}/quotes", json=scale1_data, timeout=30)
    if response.status_code == 200:
        data = response.json()
        price = data.get('total_price', 0)
        explanation = data.get('ai_explanation', '')
        
        print(f"   💰 Price: ${price}")
        print(f"   📝 AI Explanation: {explanation[:200]}...")
        
        # Check price range
        if 35 <= price <= 45:
            print(f"   ✅ PASS: Price ${price} is within Scale 1 range ($35-45)")
        else:
            print(f"   ❌ FAIL: Price ${price} is outside Scale 1 range ($35-45)")
        
        # Check for new format indicators
        if 'scale' in explanation.lower() or 'cubic feet' in explanation.lower():
            print(f"   ✅ PASS: Uses volume-based pricing language")
        else:
            print(f"   ⚠️  WARNING: May not use new volume-based system")
            
        # Try to parse JSON response for new format
        try:
            if 'scale_level' in str(data) or 'breakdown' in str(data):
                print(f"   ✅ PASS: Response includes new pricing format fields")
            else:
                print(f"   ⚠️  INFO: Response may not include scale_level/breakdown fields")
        except:
            pass
    else:
        print(f"   ❌ FAIL: Request failed with status {response.status_code}")
    
    # Test 2: Scale 10 pricing (Full truck load)
    print("\n🔟 Testing Scale 10 Pricing (Full truck load)")
    scale10_data = {
        "items": [
            {"name": "Sectional Sofa", "quantity": 1, "size": "large", "description": "Large L-shaped sectional"},
            {"name": "Dining Set", "quantity": 1, "size": "large", "description": "Table with 6 chairs"},
            {"name": "Refrigerator", "quantity": 1, "size": "large", "description": "Full-size fridge"},
            {"name": "Washer", "quantity": 1, "size": "large", "description": "Washing machine"},
            {"name": "Dryer", "quantity": 1, "size": "large", "description": "Electric dryer"},
            {"name": "Bedroom Set", "quantity": 1, "size": "large", "description": "King bed, dresser, nightstands"},
            {"name": "Entertainment Center", "quantity": 1, "size": "large", "description": "Large TV stand"},
            {"name": "Office Desk", "quantity": 1, "size": "large", "description": "Executive desk"}
        ],
        "description": "Full household cleanout - maximum truck capacity, ground level pickup"
    }
    
    response = requests.post(f"{base_url}/quotes", json=scale10_data, timeout=30)
    if response.status_code == 200:
        data = response.json()
        price = data.get('total_price', 0)
        explanation = data.get('ai_explanation', '')
        
        print(f"   💰 Price: ${price}")
        print(f"   📝 AI Explanation: {explanation[:200]}...")
        
        # Check price range
        if 350 <= price <= 450:
            print(f"   ✅ PASS: Price ${price} is within Scale 10 range ($350-450)")
        else:
            print(f"   ❌ FAIL: Price ${price} is outside Scale 10 range ($350-450)")
        
        # Check for volume language
        if 'scale' in explanation.lower() or 'cubic feet' in explanation.lower() or 'truck' in explanation.lower():
            print(f"   ✅ PASS: Uses volume/scale-based pricing language")
        else:
            print(f"   ⚠️  WARNING: May not use new volume-based system")
    else:
        print(f"   ❌ FAIL: Request failed with status {response.status_code}")
    
    # Test 3: Mid-range Scale 5 pricing
    print("\n5️⃣ Testing Scale 5 Pricing (9x9x9 cubic feet)")
    scale5_data = {
        "items": [
            {"name": "Dining Table", "quantity": 1, "size": "medium", "description": "6-person dining table"},
            {"name": "Dining Chairs", "quantity": 4, "size": "small", "description": "Wooden dining chairs"},
            {"name": "Queen Mattress", "quantity": 1, "size": "medium", "description": "Queen size mattress"},
            {"name": "Dresser", "quantity": 1, "size": "medium", "description": "6-drawer dresser"}
        ],
        "description": "Medium furniture load from dining room and bedroom, ground level pickup"
    }
    
    response = requests.post(f"{base_url}/quotes", json=scale5_data, timeout=30)
    if response.status_code == 200:
        data = response.json()
        price = data.get('total_price', 0)
        explanation = data.get('ai_explanation', '')
        
        print(f"   💰 Price: ${price}")
        print(f"   📝 AI Explanation: {explanation[:200]}...")
        
        # Check price range
        if 125 <= price <= 165:
            print(f"   ✅ PASS: Price ${price} is within Scale 5 range ($125-165)")
        else:
            print(f"   ❌ FAIL: Price ${price} is outside Scale 5 range ($125-165)")
    else:
        print(f"   ❌ FAIL: Request failed with status {response.status_code}")
    
    # Test 4: Check for consistent pricing logic
    print("\n🔄 Testing Pricing Consistency")
    
    # Test same items multiple times to check consistency
    test_data = {
        "items": [
            {"name": "Couch", "quantity": 1, "size": "large", "description": "3-seat couch"}
        ],
        "description": "Single large couch, ground level pickup"
    }
    
    prices = []
    for i in range(3):
        response = requests.post(f"{base_url}/quotes", json=test_data, timeout=30)
        if response.status_code == 200:
            data = response.json()
            prices.append(data.get('total_price', 0))
    
    if len(prices) >= 2:
        price_range = max(prices) - min(prices)
        print(f"   💰 Prices: {prices}")
        print(f"   📊 Price Range: ${price_range}")
        
        if price_range <= 50:  # Allow some variation due to AI
            print(f"   ✅ PASS: Pricing is reasonably consistent (range: ${price_range})")
        else:
            print(f"   ⚠️  WARNING: High price variation (range: ${price_range})")
    
    # Test 5: Fallback pricing (test with invalid/minimal data)
    print("\n🔧 Testing Fallback Pricing System")
    fallback_data = {
        "items": [
            {"name": "Unknown Item", "quantity": 1, "size": "medium", "description": ""}
        ],
        "description": ""
    }
    
    response = requests.post(f"{base_url}/quotes", json=fallback_data, timeout=30)
    if response.status_code == 200:
        data = response.json()
        price = data.get('total_price', 0)
        explanation = data.get('ai_explanation', '')
        
        print(f"   💰 Fallback Price: ${price}")
        print(f"   📝 Explanation: {explanation[:150]}...")
        
        # Check if it's using fallback
        if 'basic pricing' in explanation.lower() or 'temporarily unavailable' in explanation.lower():
            print(f"   ✅ PASS: Fallback pricing system activated")
            if 35 <= price <= 450:
                print(f"   ✅ PASS: Fallback price ${price} uses scale system range")
            else:
                print(f"   ❌ FAIL: Fallback price ${price} outside scale range ($35-450)")
        else:
            print(f"   ℹ️  INFO: AI pricing working (fallback not triggered)")
            if 35 <= price <= 450:
                print(f"   ✅ PASS: AI price ${price} within scale range")
            else:
                print(f"   ❌ FAIL: AI price ${price} outside scale range ($35-450)")
    else:
        print(f"   ❌ FAIL: Fallback test failed with status {response.status_code}")
    
    print("\n" + "="*60)
    print("📊 NEW PRICING SYSTEM TEST COMPLETE")
    print("="*60)
    
    # Summary
    print("\n✅ EXPECTED RESULTS:")
    print("   • Scale 1 (3x3x3 cubic feet): $35-45")
    print("   • Scale 5 (9x9x9 cubic feet): $125-165") 
    print("   • Scale 10 (Full truck load): $350-450")
    print("   • All responses should reference volume/scale")
    print("   • Fallback pricing should use new scale system")
    print("   • Pricing should be reasonably consistent")

if __name__ == "__main__":
    test_pricing_system()