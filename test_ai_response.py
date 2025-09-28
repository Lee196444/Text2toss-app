#!/usr/bin/env python3
"""
Test to check what the AI is actually returning vs what the backend is processing
"""

import requests
import json
import sys
import re

def test_ai_response_parsing():
    """Test to see if AI is generating correct format but backend isn't parsing it"""
    base_url = "https://text2toss-venmo.preview.emergentagent.com/api"
    
    print("🔍 TESTING AI RESPONSE PARSING")
    print("="*60)
    
    # Create a quote and examine the full response
    test_data = {
        "items": [
            {"name": "Test Sofa", "quantity": 1, "size": "large", "description": "Large 3-seat sofa"}
        ],
        "description": "Large sofa for removal, ground level pickup"
    }
    
    print("📤 Creating quote to analyze AI response processing...")
    response = requests.post(f"{base_url}/quotes", json=test_data, timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        
        print("✅ Quote created successfully")
        print(f"💰 Returned Price: ${data.get('total_price', 0)}")
        print(f"📝 Returned Explanation: {data.get('ai_explanation', '')}")
        
        # Check if the explanation contains JSON that wasn't parsed
        explanation = data.get('ai_explanation', '')
        
        print(f"\n🔍 ANALYZING AI EXPLANATION FOR HIDDEN JSON:")
        print(f"Full explanation: {explanation}")
        
        # Look for JSON patterns
        json_patterns = [
            r'\{[^{}]*"scale_level"[^{}]*\}',
            r'\{[^{}]*"breakdown"[^{}]*\}',
            r'\{.*?"total_price".*?"scale_level".*?\}',
            r'\{.*?"breakdown".*?"base_cost".*?\}'
        ]
        
        found_json = False
        for pattern in json_patterns:
            matches = re.findall(pattern, explanation, re.DOTALL | re.IGNORECASE)
            if matches:
                found_json = True
                print(f"   ✅ Found JSON pattern: {pattern}")
                for match in matches:
                    print(f"   📋 Match: {match}")
                    try:
                        parsed = json.loads(match)
                        print(f"   ✅ Valid JSON found:")
                        print(json.dumps(parsed, indent=6))
                    except:
                        print(f"   ⚠️  Found pattern but not valid JSON")
        
        if not found_json:
            print(f"   ❌ No JSON patterns with scale_level/breakdown found in explanation")
            
            # Check if explanation mentions scale but no JSON
            if 'scale' in explanation.lower():
                print(f"   ℹ️  Explanation mentions 'scale' but no structured JSON")
                print(f"   🔍 This suggests AI is following new prompts but backend isn't parsing full response")
        
        # Test multiple quotes to see if we can catch a full JSON response
        print(f"\n🔄 TESTING MULTIPLE QUOTES TO FIND FULL AI RESPONSE:")
        for i in range(3):
            test_data_multi = {
                "items": [
                    {"name": f"Test Item {i+1}", "quantity": 1, "size": "medium", "description": f"Test item {i+1}"}
                ],
                "description": f"Test quote {i+1} for AI response analysis"
            }
            
            response_multi = requests.post(f"{base_url}/quotes", json=test_data_multi, timeout=30)
            if response_multi.status_code == 200:
                data_multi = response_multi.json()
                explanation_multi = data_multi.get('ai_explanation', '')
                
                print(f"   Quote {i+1}: {explanation_multi[:100]}...")
                
                # Look for any JSON structure
                json_match = re.search(r'\{.*\}', explanation_multi, re.DOTALL)
                if json_match:
                    try:
                        json_str = json_match.group(0)
                        parsed_json = json.loads(json_str)
                        if 'scale_level' in parsed_json or 'breakdown' in parsed_json:
                            print(f"   🎯 FOUND COMPLETE AI RESPONSE IN QUOTE {i+1}:")
                            print(json.dumps(parsed_json, indent=6))
                            break
                    except:
                        pass
    
    else:
        print(f"❌ FAIL: Request failed with status {response.status_code}")
    
    print("\n" + "="*60)
    print("📊 AI RESPONSE ANALYSIS COMPLETE")
    print("="*60)
    
    print("\n🔍 DIAGNOSIS:")
    print("   • AI is being instructed to return scale_level and breakdown")
    print("   • Backend code only extracts total_price and explanation")
    print("   • The scale_level and breakdown fields are being discarded")
    print("   • This is a backend parsing issue, not an AI issue")

if __name__ == "__main__":
    test_ai_response_parsing()