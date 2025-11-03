import requests
import json

def test_specific_scenarios():
    """Test specific scenarios from the review request"""
    base_url = "https://trash-estimator.preview.emergentagent.com"
    api_url = f"{base_url}/api"
    
    print("🔍 FOCUSED PRICING ACCURACY TEST")
    print("="*50)
    
    # Test scenarios from review request
    test_cases = [
        {
            "name": "Single Large Item - Old Sofa",
            "items": [{"name": "Old Sofa", "quantity": 1, "size": "large", "description": "Large brown leather sofa"}],
            "description": "Single large sofa, ground level pickup only",
            "expected": "Conservative pricing, $50-175 range"
        },
        {
            "name": "Multiple Items - Dining Set", 
            "items": [
                {"name": "Dining Table", "quantity": 1, "size": "large", "description": "Large wooden dining table"},
                {"name": "Dining Chairs", "quantity": 4, "size": "medium", "description": "Wooden dining chairs"},
                {"name": "Dresser", "quantity": 1, "size": "large", "description": "Large bedroom dresser"}
            ],
            "description": "Dining room furniture set plus bedroom dresser, ground level pickup",
            "expected": "Volume-based calculation, conservative estimate"
        },
        {
            "name": "Heavy Items - Washing Machine + Dryer",
            "items": [
                {"name": "Washing Machine", "quantity": 1, "size": "large", "description": "Front-loading washing machine, very heavy"},
                {"name": "Dryer", "quantity": 1, "size": "large", "description": "Electric dryer, heavy appliance"}
            ],
            "description": "Heavy appliances requiring special handling, ground level pickup only",
            "expected": "20% heavy item surcharge applied"
        },
        {
            "name": "Mixed Sizes - Small TV + Large Refrigerator + Medium Desk",
            "items": [
                {"name": "Small TV", "quantity": 1, "size": "small", "description": "32-inch flat screen TV"},
                {"name": "Large Refrigerator", "quantity": 1, "size": "large", "description": "Full-size refrigerator"},
                {"name": "Medium Desk", "quantity": 1, "size": "medium", "description": "Office desk"}
            ],
            "description": "Mixed electronics and furniture, various sizes, ground level pickup",
            "expected": "Scale progression verification"
        }
    ]
    
    results = []
    
    for test_case in test_cases:
        print(f"\n🔍 Testing: {test_case['name']}")
        
        quote_data = {
            "items": test_case["items"],
            "description": test_case["description"]
        }
        
        try:
            response = requests.post(f"{api_url}/quotes", json=quote_data, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                price = data.get('total_price', 0)
                scale_level = data.get('scale_level')
                breakdown = data.get('breakdown')
                explanation = data.get('ai_explanation', '')
                
                print(f"   💰 Price: ${price}")
                print(f"   📊 Scale Level: {scale_level}")
                print(f"   🤖 AI Explanation: {explanation[:100]}...")
                
                # Check for business logic compliance
                item_count = sum(item.get('quantity', 1) for item in test_case['items'])
                
                # Business logic validation
                issues = []
                
                # Check minimum pricing
                if price < 45:
                    issues.append(f"Below absolute minimum $45")
                
                # Check per-item minimum ($30)
                price_per_item = price / item_count if item_count > 0 else 0
                if price_per_item < 30:
                    issues.append(f"Below $30 per item (${price_per_item:.2f})")
                
                # Check for required fields
                if scale_level is None:
                    issues.append("Missing scale_level")
                
                if breakdown is None:
                    issues.append("Missing breakdown")
                
                # Check for conservative language
                conservative_indicators = ['conservative', 'overestimate', 'safety', 'margin']
                has_conservative = any(word in explanation.lower() for word in conservative_indicators)
                
                # Check for volume-based language
                volume_indicators = ['volume', 'cubic feet', 'scale', 'load']
                has_volume = any(word in explanation.lower() for word in volume_indicators)
                
                result = {
                    'name': test_case['name'],
                    'price': price,
                    'scale_level': scale_level,
                    'item_count': item_count,
                    'price_per_item': price_per_item,
                    'has_conservative': has_conservative,
                    'has_volume': has_volume,
                    'issues': issues,
                    'explanation': explanation
                }
                
                results.append(result)
                
                if issues:
                    print(f"   ❌ Issues: {'; '.join(issues)}")
                else:
                    print(f"   ✅ All business logic checks passed")
                
                if has_conservative:
                    print(f"   ✅ Conservative pricing language detected")
                
                if has_volume:
                    print(f"   ✅ Volume-based pricing language detected")
                    
            else:
                print(f"   ❌ Request failed: {response.status_code}")
                
        except Exception as e:
            print(f"   ❌ Error: {str(e)}")
    
    # Summary
    print(f"\n📊 SUMMARY ANALYSIS")
    print("="*50)
    
    if results:
        total_tests = len(results)
        passed_tests = len([r for r in results if not r['issues']])
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed Tests: {passed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
        
        # Price analysis
        prices = [r['price'] for r in results]
        print(f"Price Range: ${min(prices):.2f} - ${max(prices):.2f}")
        
        # Conservative pricing analysis
        conservative_count = len([r for r in results if r['has_conservative']])
        print(f"Conservative Language: {conservative_count}/{total_tests} quotes")
        
        # Volume-based analysis
        volume_count = len([r for r in results if r['has_volume']])
        print(f"Volume-based Language: {volume_count}/{total_tests} quotes")
        
        # Business logic compliance
        min_price_compliant = len([r for r in results if r['price'] >= 45])
        per_item_compliant = len([r for r in results if r['price_per_item'] >= 30])
        
        print(f"Minimum Price Compliance: {min_price_compliant}/{total_tests}")
        print(f"Per-Item Minimum Compliance: {per_item_compliant}/{total_tests}")
        
        # Critical issues
        critical_issues = []
        for r in results:
            if r['issues']:
                critical_issues.extend(r['issues'])
        
        if critical_issues:
            print(f"\n❌ CRITICAL ISSUES FOUND:")
            for issue in set(critical_issues):
                count = critical_issues.count(issue)
                print(f"   - {issue}: {count} occurrence(s)")
        else:
            print(f"\n✅ NO CRITICAL ISSUES FOUND")
        
        # Overall assessment
        if passed_tests == total_tests:
            print(f"\n🎉 SUCCESS: All pricing accuracy requirements met!")
            return True
        else:
            print(f"\n⚠️  PARTIAL SUCCESS: {total_tests - passed_tests} issues need addressing")
            return False
    else:
        print("No test results to analyze")
        return False

if __name__ == "__main__":
    test_specific_scenarios()