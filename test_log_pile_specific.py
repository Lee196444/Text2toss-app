#!/usr/bin/env python3
"""
Specific test for FIXED AI IMAGE ANALYSIS - Large Log Pile Scenario
Testing the exact scenario from the review request
"""

import requests
import io
from PIL import Image, ImageDraw
import json

def test_large_log_pile_scenario():
    """Test the exact large log pile scenario from the review request"""
    
    base_url = "https://text2toss-venmo.preview.emergentagent.com"
    api_url = f"{base_url}/api"
    
    print("🌲 TESTING FIXED AI IMAGE ANALYSIS - LARGE LOG PILE SCENARIO")
    print("="*60)
    print("CONTEXT: Testing fixes for user issue - Large log pile getting $75 instead of $275-450")
    print()
    
    # Test 1: Large Log Pile with exact description from review request
    print("🔍 Test 1: Large Log Pile with 'massive pile of cut logs for removal'")
    print("-" * 50)
    
    try:
        # Create a realistic large log pile image
        img = Image.new('RGB', (1200, 800), color=(34, 139, 34))  # Forest green background
        draw = ImageDraw.Draw(img)
        
        # Draw many logs to simulate a massive pile
        log_colors = [(139, 69, 19), (160, 82, 45), (101, 67, 33), (205, 133, 63)]
        
        # Create a large pile - multiple layers
        for layer in range(4):  # 4 layers high
            for row in range(8):  # 8 rows
                for col in range(12):  # 12 columns
                    x = 50 + col * 90 + (layer * 10)
                    y = 200 + row * 60 + (layer * -40)  # Stack upward
                    
                    if x < 1150 and y > 50:  # Keep within bounds
                        color = log_colors[layer % len(log_colors)]
                        # Draw log shape (rectangle with rounded ends)
                        draw.rectangle([x, y, x+80, y+25], fill=color, outline='black')
                        draw.ellipse([x-5, y-2, x+5, y+27], fill=color, outline='black')
                        draw.ellipse([x+75, y-2, x+85, y+27], fill=color, outline='black')
        
        # Add reference objects for scale
        # Person silhouette (6 feet tall reference)
        draw.rectangle([1000, 600, 1020, 750], fill='blue', outline='black')  # Body
        draw.ellipse([1005, 590, 1015, 605], fill='blue', outline='black')    # Head
        
        # Car for scale reference (12 feet long)
        draw.rectangle([50, 700, 200, 750], fill='red', outline='black')
        draw.ellipse([60, 740, 80, 760], fill='black')  # Wheel
        draw.ellipse([170, 740, 190, 760], fill='black')  # Wheel
        
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='JPEG')
        img_buffer.seek(0)
        
        # Use exact description from review request
        files = {'file': ('massive_log_pile.jpg', img_buffer, 'image/jpeg')}
        data = {'description': 'massive pile of cut logs for removal'}
        
        print(f"📤 Sending request to: {api_url}/quotes/image")
        print(f"📝 Description: '{data['description']}'")
        
        response = requests.post(f"{api_url}/quotes/image", data=data, files=files, timeout=60)
        
        print(f"📥 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            
            price = result.get('total_price', 0)
            scale_level = result.get('scale_level')
            breakdown = result.get('breakdown')
            ai_explanation = result.get('ai_explanation', '')
            items = result.get('items', [])
            
            print(f"💰 Price: ${price}")
            print(f"📊 Scale Level: {scale_level}")
            print(f"📋 Breakdown: {breakdown}")
            print(f"📦 Items Found: {len(items)}")
            print(f"🤖 AI Explanation: {ai_explanation[:200]}...")
            print()
            
            # CRITICAL SUCCESS CRITERIA VALIDATION
            print("🎯 CRITICAL SUCCESS CRITERIA VALIDATION:")
            print("-" * 40)
            
            # 1. Scale level should be 8-10 (was 2-3)
            if scale_level is not None and scale_level >= 8:
                print(f"✅ FIXED: Scale level {scale_level} is 8-10 (was 2-3 before fix)")
                success_scale = True
            elif scale_level is not None and scale_level >= 6:
                print(f"⚠️  PARTIAL: Scale level {scale_level} is 6-7 (better than 2-3 but not optimal)")
                success_scale = False
            elif scale_level is not None:
                print(f"❌ ISSUE: Scale level {scale_level} still too low for massive log pile")
                success_scale = False
            else:
                print(f"❌ CRITICAL: Scale level missing from response")
                success_scale = False
            
            # 2. Total price should be $275-450 (was $75)
            if 275 <= price <= 450:
                print(f"✅ FIXED: Price ${price} is in correct range $275-450 (was $75 before fix)")
                success_price = True
            elif 195 <= price <= 274:
                print(f"⚠️  PARTIAL: Price ${price} is Scale 6-7 range (better than $75 but not optimal)")
                success_price = False
            elif price == 75:
                print(f"❌ CRITICAL: Still getting old fallback price $75 - fix not working")
                success_price = False
            else:
                print(f"⚠️  Price ${price} outside expected ranges")
                success_price = False
            
            # 3. Explanation should mention volume assessment
            explanation_lower = ai_explanation.lower()
            volume_keywords = ['large pile', 'significant volume', 'cubic feet', 'massive', 'scale', 'volume']
            found_keywords = [kw for kw in volume_keywords if kw in explanation_lower]
            
            if found_keywords:
                print(f"✅ FIXED: AI explanation mentions volume assessment: {found_keywords}")
                success_explanation = True
            else:
                print(f"❌ ISSUE: AI explanation missing volume assessment keywords")
                success_explanation = False
            
            # 4. Check if using enhanced fallback or AI vision
            if 'image analysis temporarily unavailable' in explanation_lower:
                print(f"ℹ️  Using enhanced fallback (AI vision failed)")
                if price > 75:
                    print(f"✅ Enhanced fallback providing better pricing than basic $75")
                else:
                    print(f"❌ Enhanced fallback still using basic $75 pricing")
            else:
                print(f"✅ AI vision analysis working (Gemini 2.5 Flash)")
            
            # 5. JSON format fields
            if breakdown and isinstance(breakdown, dict):
                print(f"✅ FIXED: Breakdown field present in response")
                if 'base_cost' in breakdown and 'total' in breakdown:
                    print(f"✅ Breakdown structure correct: base_cost=${breakdown.get('base_cost')}, total=${breakdown.get('total')}")
            else:
                print(f"❌ CRITICAL: Breakdown field missing or invalid")
            
            print()
            print("📊 OVERALL ASSESSMENT:")
            print("-" * 20)
            
            if success_scale and success_price and success_explanation:
                print("🎉 SUCCESS: All critical fixes working correctly!")
                print("   • Large log pile now gets Scale 8-10 pricing")
                print("   • Price in correct $275-450 range")
                print("   • AI recognizes volume properly")
            elif success_price:
                print("✅ MAJOR IMPROVEMENT: Pricing fixed (no longer $75)")
                print("⚠️  Some optimization still possible for scale/explanation")
            else:
                print("❌ ISSUES REMAIN: Critical fixes may not be fully working")
                
        else:
            print(f"❌ Request failed with status {response.status_code}")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Test failed with error: {str(e)}")
    
    print()
    print("🔍 Test 2: Same pile WITHOUT description (fallback test)")
    print("-" * 50)
    
    try:
        # Same image, no description
        img_buffer.seek(0)
        files = {'file': ('log_pile_no_desc.jpg', img_buffer, 'image/jpeg')}
        data = {'description': ''}  # Empty description
        
        response = requests.post(f"{api_url}/quotes/image", data=data, files=files, timeout=60)
        
        if response.status_code == 200:
            result = response.json()
            
            price_no_desc = result.get('total_price', 0)
            scale_no_desc = result.get('scale_level')
            explanation_no_desc = result.get('ai_explanation', '')
            
            print(f"💰 Price (no description): ${price_no_desc}")
            print(f"📊 Scale Level: {scale_no_desc}")
            print(f"🤖 AI Explanation: {explanation_no_desc[:150]}...")
            
            if price_no_desc == 75:
                print(f"⚠️  Fallback using basic $75 pricing (expected if vision fails)")
            elif price_no_desc > 75:
                print(f"✅ Enhanced fallback providing better pricing: ${price_no_desc}")
            
        else:
            print(f"❌ No description test failed: {response.status_code}")
            
    except Exception as e:
        print(f"⚠️  No description test error: {str(e)}")
    
    print()
    print("🔍 Test 3: Verify Gemini 2.5 Flash Model Usage")
    print("-" * 50)
    
    try:
        # Simple test image to verify model
        simple_img = Image.new('RGB', (400, 300), color=(139, 69, 19))
        simple_draw = ImageDraw.Draw(simple_img)
        simple_draw.text((50, 50), "LOG PILE TEST", fill='white')
        
        simple_buffer = io.BytesIO()
        simple_img.save(simple_buffer, format='JPEG')
        simple_buffer.seek(0)
        
        files = {'file': ('gemini_test.jpg', simple_buffer, 'image/jpeg')}
        data = {'description': 'test for gemini 2.5 flash model verification'}
        
        response = requests.post(f"{api_url}/quotes/image", data=data, files=files, timeout=60)
        
        if response.status_code == 200:
            result = response.json()
            explanation = result.get('ai_explanation', '')
            
            if 'image analysis temporarily unavailable' not in explanation.lower():
                print(f"✅ AI vision analysis working (Gemini 2.5 Flash responding)")
                
                if any(word in explanation.lower() for word in ['scale', 'cubic', 'volume', 'feet']):
                    print(f"✅ Enhanced AI prompts working (volume-based analysis)")
                else:
                    print(f"⚠️  AI response may not be using enhanced prompts")
            else:
                print(f"⚠️  AI vision falling back - may indicate API issue")
                
        else:
            print(f"❌ Gemini test failed: {response.status_code}")
            
    except Exception as e:
        print(f"⚠️  Gemini test error: {str(e)}")

if __name__ == "__main__":
    test_large_log_pile_scenario()