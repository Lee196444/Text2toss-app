#!/usr/bin/env python3
"""
Test the new JSON response format with scale_level and breakdown
"""

import requests
import json
import sys

def test_json_format():
    """Test if the new JSON format is being returned"""
    base_url = "https://text2toss-venmo.preview.emergentagent.com/api"
    
    print("🔍 TESTING NEW JSON RESPONSE FORMAT")
    print("="*60)
    
    # Test with a simple quote to check response format
    test_data = {
        "items": [
            {"name": "Office Chair", "quantity": 1, "size": "medium", "description": "Ergonomic office chair"}
        ],
        "description": "Single office chair, ground level pickup"
    }
    
    print("📤 Creating quote to check response format...")
    response = requests.post(f"{base_url}/quotes", json=test_data, timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        
        print("✅ Quote created successfully")
        print("\n📋 FULL RESPONSE STRUCTURE:")
        print(json.dumps(data, indent=2))
        
        # Check for expected fields
        print("\n🔍 CHECKING FOR NEW FORMAT FIELDS:")
        
        # Standard fields that should exist
        standard_fields = ['id', 'user_id', 'items', 'total_price', 'description', 'ai_explanation', 'created_at']
        for field in standard_fields:
            if field in data:
                print(f"   ✅ {field}: Present")
            else:
                print(f"   ❌ {field}: Missing")
        
        # New format fields we're looking for
        new_fields = ['scale_level', 'breakdown']
        print(f"\n🆕 CHECKING FOR NEW PRICING FORMAT FIELDS:")
        
        for field in new_fields:
            if field in data:
                print(f"   ✅ {field}: Present - {data[field]}")
            else:
                print(f"   ❌ {field}: Missing from response")
        
        # Check if breakdown has the expected structure
        if 'breakdown' in data:
            breakdown = data['breakdown']
            expected_breakdown_fields = ['base_cost', 'additional_charges', 'total']
            print(f"\n📊 BREAKDOWN STRUCTURE:")
            for field in expected_breakdown_fields:
                if field in breakdown:
                    print(f"   ✅ breakdown.{field}: ${breakdown[field]}")
                else:
                    print(f"   ❌ breakdown.{field}: Missing")
        
        # Check AI explanation for new format indicators
        explanation = data.get('ai_explanation', '')
        print(f"\n🤖 AI EXPLANATION ANALYSIS:")
        print(f"   Full explanation: {explanation}")
        
        # Look for new pricing system indicators
        indicators = ['scale', 'cubic feet', 'volume', 'breakdown', 'base_cost', 'additional_charges']
        found_indicators = []
        for indicator in indicators:
            if indicator.lower() in explanation.lower():
                found_indicators.append(indicator)
        
        if found_indicators:
            print(f"   ✅ New pricing indicators found: {', '.join(found_indicators)}")
        else:
            print(f"   ⚠️  No new pricing system indicators found in explanation")
        
        # Try to parse any JSON within the explanation
        print(f"\n🔍 CHECKING FOR JSON IN AI EXPLANATION:")
        try:
            # Look for JSON patterns in the explanation
            import re
            json_match = re.search(r'\{.*\}', explanation, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                parsed_json = json.loads(json_str)
                print(f"   ✅ Found JSON in explanation:")
                print(json.dumps(parsed_json, indent=4))
                
                # Check if this JSON has the new format
                if 'scale_level' in parsed_json:
                    print(f"   ✅ JSON contains scale_level: {parsed_json['scale_level']}")
                if 'breakdown' in parsed_json:
                    print(f"   ✅ JSON contains breakdown: {parsed_json['breakdown']}")
            else:
                print(f"   ℹ️  No JSON structure found in AI explanation")
        except Exception as e:
            print(f"   ⚠️  Could not parse JSON from explanation: {str(e)}")
    
    else:
        print(f"❌ FAIL: Request failed with status {response.status_code}")
        print(f"Error: {response.text}")
    
    print("\n" + "="*60)
    print("📊 JSON FORMAT TEST COMPLETE")
    print("="*60)
    
    print("\n📋 EXPECTED NEW FORMAT:")
    print("""
    {
      "total_price": 150.00,
      "scale_level": 5,
      "breakdown": {
        "base_cost": 140.00,
        "additional_charges": 10.00,
        "total": 150.00
      },
      "explanation": "Scale 5 load (9x9x9 cubic feet) - ..."
    }
    """)

if __name__ == "__main__":
    test_json_format()