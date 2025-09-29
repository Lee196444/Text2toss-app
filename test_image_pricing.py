#!/usr/bin/env python3
"""
Test image-based pricing with the new system
"""

import requests
import io
import sys

def test_image_pricing():
    """Test image-based quote generation"""
    base_url = "https://text2toss-junk.preview.emergentagent.com/api"
    
    print("🖼️  TESTING IMAGE-BASED PRICING")
    print("="*50)
    
    try:
        from PIL import Image
        
        # Create a test image
        img = Image.new('RGB', (400, 300), color='brown')
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='JPEG')
        img_buffer.seek(0)
        
        files = {'file': ('furniture_test.jpg', img_buffer, 'image/jpeg')}
        data = {'description': 'Large furniture items for removal, ground level pickup'}
        
        print("📤 Uploading test image for pricing analysis...")
        response = requests.post(f"{base_url}/quotes/image", data=data, files=files, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            price = result.get('total_price', 0)
            explanation = result.get('ai_explanation', '')
            items = result.get('items', [])
            
            print(f"   ✅ SUCCESS: Image quote created")
            print(f"   💰 Price: ${price}")
            print(f"   📝 AI Explanation: {explanation[:200]}...")
            print(f"   📦 Items identified: {len(items)}")
            
            for item in items:
                print(f"      - {item.get('quantity', 1)}x {item.get('name', 'Unknown')} ({item.get('size', 'unknown')} size)")
            
            # Check if price is in valid range
            if 35 <= price <= 450:
                print(f"   ✅ PASS: Price ${price} is within valid scale range ($35-450)")
            else:
                print(f"   ❌ FAIL: Price ${price} is outside valid scale range ($35-450)")
            
            # Check if it's using AI vision or fallback
            if 'temporarily unavailable' in explanation.lower() or 'basic estimate' in explanation.lower():
                print(f"   ⚠️  INFO: Using fallback pricing (AI vision not available)")
                print(f"   📋 This is expected - AI vision requires Gemini provider")
            else:
                print(f"   ✅ PASS: AI vision analysis working")
                
                # Check for new pricing system language
                if 'scale' in explanation.lower() or 'cubic feet' in explanation.lower():
                    print(f"   ✅ PASS: Uses new volume-based pricing system")
                else:
                    print(f"   ⚠️  WARNING: May not use new volume-based system")
        else:
            print(f"   ❌ FAIL: Request failed with status {response.status_code}")
            print(f"   Error: {response.text}")
            
    except ImportError:
        print("   ⚠️  PIL not available, cannot test image upload")
    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
    
    print("\n" + "="*50)
    print("📊 IMAGE PRICING TEST COMPLETE")

if __name__ == "__main__":
    test_image_pricing()