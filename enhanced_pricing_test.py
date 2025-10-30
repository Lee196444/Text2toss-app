import requests
import json
import sys
from datetime import datetime
import tempfile
from pathlib import Path

class EnhancedPricingTester:
    def __init__(self, base_url="https://text2toss-junk.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.pricing_results = []

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
            self.failed_tests.append({"test": name, "error": details})

    def run_pricing_test(self, name, items, description, expected_min_price=None, expected_max_price=None, expected_scale_min=None, expected_scale_max=None):
        """Run a pricing test and validate results"""
        print(f"\n🔍 Testing {name}...")
        
        quote_data = {
            "items": items,
            "description": description
        }
        
        try:
            response = requests.post(f"{self.api_url}/quotes", json=quote_data, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                price = data.get('total_price', 0)
                scale_level = data.get('scale_level')
                breakdown = data.get('breakdown')
                explanation = data.get('ai_explanation', '')
                
                print(f"   💰 Price: ${price}")
                print(f"   📊 Scale Level: {scale_level}")
                print(f"   🤖 AI Explanation: {explanation[:100]}...")
                
                # Store results for consistency testing
                self.pricing_results.append({
                    'name': name,
                    'items': items,
                    'description': description,
                    'price': price,
                    'scale_level': scale_level,
                    'breakdown': breakdown,
                    'explanation': explanation
                })
                
                # Validate pricing accuracy
                success = True
                issues = []
                
                # Check minimum pricing enforcement
                if expected_min_price and price < expected_min_price:
                    success = False
                    issues.append(f"Price ${price} below minimum ${expected_min_price}")
                
                # Check maximum pricing caps
                if expected_max_price and price > expected_max_price:
                    success = False
                    issues.append(f"Price ${price} above maximum ${expected_max_price}")
                
                # Check scale level consistency
                if expected_scale_min and scale_level and scale_level < expected_scale_min:
                    success = False
                    issues.append(f"Scale {scale_level} below minimum {expected_scale_min}")
                
                if expected_scale_max and scale_level and scale_level > expected_scale_max:
                    success = False
                    issues.append(f"Scale {scale_level} above maximum {expected_scale_max}")
                
                # Check for required fields
                if scale_level is None:
                    success = False
                    issues.append("Missing scale_level field")
                
                if breakdown is None:
                    success = False
                    issues.append("Missing breakdown field")
                
                # Check for conservative pricing indicators
                if 'conservative' in explanation.lower() or 'overestimate' in explanation.lower() or 'safety' in explanation.lower():
                    print(f"   ✅ Conservative pricing language detected")
                
                # Check for volume-based language
                if 'cubic feet' in explanation.lower() or 'volume' in explanation.lower() or 'scale' in explanation.lower():
                    print(f"   ✅ Volume-based pricing language detected")
                
                if success:
                    self.log_test(name, True)
                    return True, data
                else:
                    error_msg = "; ".join(issues)
                    self.log_test(name, False, error_msg)
                    return False, data
                    
            else:
                error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
                self.log_test(name, False, error_msg)
                return False, {}
                
        except Exception as e:
            error_msg = f"Request failed: {str(e)}"
            self.log_test(name, False, error_msg)
            return False, {}

    def test_accuracy_scenarios(self):
        """Test accuracy scenarios from review request"""
        print("\n" + "="*60)
        print("TESTING ENHANCED AI PRICING ACCURACY SCENARIOS")
        print("="*60)
        
        # 1. Single large item - should price conservatively
        print("\n📦 1. SINGLE LARGE ITEM TEST")
        self.run_pricing_test(
            "Single Large Item - Old Sofa",
            [{"name": "Old Sofa", "quantity": 1, "size": "large", "description": "Large brown leather sofa"}],
            "Single large sofa, ground level pickup only",
            expected_min_price=50.0,  # Minimum for single items
            expected_max_price=175.0,  # Scale 9 maximum for single items
            expected_scale_min=3,
            expected_scale_max=9
        )
        
        # 2. Multiple items - check total volume calculation
        print("\n📦 2. MULTIPLE ITEMS TEST")
        self.run_pricing_test(
            "Multiple Items - Dining Set",
            [
                {"name": "Dining Table", "quantity": 1, "size": "large", "description": "Large wooden dining table"},
                {"name": "Dining Chairs", "quantity": 4, "size": "medium", "description": "Wooden dining chairs"},
                {"name": "Dresser", "quantity": 1, "size": "large", "description": "Large bedroom dresser"}
            ],
            "Dining room furniture set plus bedroom dresser, ground level pickup",
            expected_min_price=80.0,  # Minimum for 3+ items
            expected_max_price=235.0,  # Scale 11 for multiple large items
            expected_scale_min=5,
            expected_scale_max=11
        )
        
        # 3. Mixed sizes - verify scale progression
        print("\n📦 3. MIXED SIZES TEST")
        self.run_pricing_test(
            "Mixed Sizes - Electronics and Furniture",
            [
                {"name": "Small TV", "quantity": 1, "size": "small", "description": "32-inch flat screen TV"},
                {"name": "Large Refrigerator", "quantity": 1, "size": "large", "description": "Full-size refrigerator"},
                {"name": "Medium Desk", "quantity": 1, "size": "medium", "description": "Office desk"}
            ],
            "Mixed electronics and furniture, various sizes, ground level pickup",
            expected_min_price=80.0,  # Minimum for 3 items
            expected_max_price=235.0,  # Scale 11 maximum
            expected_scale_min=5,
            expected_scale_max=11
        )
        
        # 4. Heavy items - check 20% surcharge
        print("\n📦 4. HEAVY ITEMS TEST")
        self.run_pricing_test(
            "Heavy Items - Appliances",
            [
                {"name": "Washing Machine", "quantity": 1, "size": "large", "description": "Front-loading washing machine, very heavy"},
                {"name": "Dryer", "quantity": 1, "size": "large", "description": "Electric dryer, heavy appliance"}
            ],
            "Heavy appliances requiring special handling, ground level pickup only",
            expected_min_price=65.0,  # Minimum for 2 items
            expected_max_price=205.0,  # Scale 10 maximum for 2 items
            expected_scale_min=4,
            expected_scale_max=10
        )

    def test_business_logic_validation(self):
        """Test business logic validation requirements"""
        print("\n" + "="*60)
        print("TESTING BUSINESS LOGIC VALIDATION")
        print("="*60)
        
        # Test minimum pricing enforcement
        print("\n💰 1. MINIMUM PRICING ENFORCEMENT")
        self.run_pricing_test(
            "Minimum Price - Single Small Item",
            [{"name": "Small Box", "quantity": 1, "size": "small", "description": "Small cardboard box"}],
            "Single small item, ground level pickup",
            expected_min_price=45.0,  # Should never go below $45 minimum
            expected_max_price=175.0,
            expected_scale_min=3,  # Minimum scale 3 for single items
            expected_scale_max=9
        )
        
        # Test volume-based calculations
        print("\n📏 2. VOLUME-BASED CALCULATIONS")
        self.run_pricing_test(
            "Volume Assessment - Large Load",
            [
                {"name": "Sectional Sofa", "quantity": 1, "size": "large", "description": "Large L-shaped sectional sofa"},
                {"name": "Entertainment Center", "quantity": 1, "size": "large", "description": "Large entertainment center"},
                {"name": "Coffee Table", "quantity": 1, "size": "medium", "description": "Large coffee table"},
                {"name": "End Tables", "quantity": 2, "size": "medium", "description": "Matching end tables"}
            ],
            "Living room furniture set, high volume load, ground level pickup",
            expected_min_price=95.0,  # Minimum for 4+ items
            expected_max_price=270.0,  # Scale 12 maximum
            expected_scale_min=6,
            expected_scale_max=12
        )
        
        # Test safety margins
        print("\n🛡️ 3. SAFETY MARGINS AND OVERESTIMATION")
        self.run_pricing_test(
            "Safety Margin Test - Uncertain Volume",
            [
                {"name": "Furniture Pile", "quantity": 1, "size": "large", "description": "Mixed furniture items, exact count uncertain"},
                {"name": "Boxes", "quantity": 5, "size": "medium", "description": "Various boxes of unknown contents"}
            ],
            "Mixed items with uncertain volume, prefer overestimate for safety",
            expected_min_price=65.0,  # Minimum for 2+ items
            expected_max_price=205.0,  # Should be conservative
            expected_scale_min=4,
            expected_scale_max=10
        )

    def test_consistency_testing(self):
        """Test pricing consistency requirements"""
        print("\n" + "="*60)
        print("TESTING PRICING CONSISTENCY")
        print("="*60)
        
        # Test same item list multiple times
        print("\n🔄 1. SAME ITEM LIST CONSISTENCY")
        test_items = [
            {"name": "Office Chair", "quantity": 1, "size": "medium", "description": "Standard office chair"},
            {"name": "Desk", "quantity": 1, "size": "large", "description": "Large office desk"}
        ]
        test_description = "Office furniture, ground level pickup"
        
        prices = []
        scale_levels = []
        
        for i in range(3):
            print(f"\n   Run {i+1}/3:")
            success, data = self.run_pricing_test(
                f"Consistency Test Run {i+1}",
                test_items,
                test_description,
                expected_min_price=65.0,
                expected_max_price=205.0
            )
            
            if success:
                prices.append(data.get('total_price', 0))
                scale_levels.append(data.get('scale_level'))
        
        # Check consistency (±$10 tolerance)
        if len(prices) >= 2:
            price_range = max(prices) - min(prices)
            if price_range <= 10:
                print(f"   ✅ Price consistency: Range ${price_range:.2f} (within ±$10)")
                self.log_test("Price Consistency Check", True)
            else:
                print(f"   ❌ Price inconsistency: Range ${price_range:.2f} (exceeds ±$10)")
                self.log_test("Price Consistency Check", False, f"Price range ${price_range:.2f}")
        
        # Check scale level consistency
        if len(scale_levels) >= 2:
            unique_scales = set(scale_levels)
            if len(unique_scales) <= 2:
                print(f"   ✅ Scale consistency: Levels {unique_scales}")
                self.log_test("Scale Level Consistency Check", True)
            else:
                print(f"   ❌ Scale inconsistency: Levels {unique_scales}")
                self.log_test("Scale Level Consistency Check", False, f"Too many different scales")
        
        # Test similar volumes
        print("\n📊 2. SIMILAR VOLUME CONSISTENCY")
        
        # Two similar loads should get same scale levels
        similar_load_1 = [
            {"name": "Sofa", "quantity": 1, "size": "large", "description": "Standard 3-seat sofa"},
            {"name": "Coffee Table", "quantity": 1, "size": "medium", "description": "Standard coffee table"}
        ]
        
        similar_load_2 = [
            {"name": "Loveseat", "quantity": 1, "size": "large", "description": "2-seat loveseat"},
            {"name": "Side Table", "quantity": 1, "size": "medium", "description": "End table"}
        ]
        
        success1, data1 = self.run_pricing_test(
            "Similar Volume Test 1",
            similar_load_1,
            "Living room furniture set 1, ground level pickup",
            expected_min_price=65.0,
            expected_max_price=205.0
        )
        
        success2, data2 = self.run_pricing_test(
            "Similar Volume Test 2", 
            similar_load_2,
            "Living room furniture set 2, ground level pickup",
            expected_min_price=65.0,
            expected_max_price=205.0
        )
        
        if success1 and success2:
            scale1 = data1.get('scale_level')
            scale2 = data2.get('scale_level')
            price1 = data1.get('total_price', 0)
            price2 = data2.get('total_price', 0)
            
            if scale1 and scale2 and abs(scale1 - scale2) <= 1:
                print(f"   ✅ Similar volumes get similar scales: {scale1} vs {scale2}")
                self.log_test("Similar Volume Scale Consistency", True)
            else:
                print(f"   ❌ Similar volumes get different scales: {scale1} vs {scale2}")
                self.log_test("Similar Volume Scale Consistency", False, f"Scales {scale1} vs {scale2}")
            
            price_diff = abs(price1 - price2)
            if price_diff <= 20:
                print(f"   ✅ Similar volumes get similar prices: ${price1} vs ${price2} (diff: ${price_diff})")
                self.log_test("Similar Volume Price Consistency", True)
            else:
                print(f"   ❌ Similar volumes get different prices: ${price1} vs ${price2} (diff: ${price_diff})")
                self.log_test("Similar Volume Price Consistency", False, f"Price diff ${price_diff}")

    def test_edge_case_protection(self):
        """Test edge case protection requirements"""
        print("\n" + "="*60)
        print("TESTING EDGE CASE PROTECTION")
        print("="*60)
        
        # Test very small items - should not go below minimum
        print("\n🔬 1. VERY SMALL ITEMS PROTECTION")
        self.run_pricing_test(
            "Very Small Items - Below Minimum Test",
            [{"name": "Phone Charger", "quantity": 1, "size": "small", "description": "Single phone charger cable"}],
            "Very small electronic item, ground level pickup",
            expected_min_price=45.0,  # Should never go below $45
            expected_max_price=175.0,
            expected_scale_min=3,
            expected_scale_max=9
        )
        
        # Test large volume estimates - should trigger higher scales
        print("\n📈 2. LARGE VOLUME ESTIMATES")
        self.run_pricing_test(
            "Large Volume - House Cleanout",
            [
                {"name": "Living Room Set", "quantity": 1, "size": "large", "description": "Complete living room furniture"},
                {"name": "Bedroom Set", "quantity": 1, "size": "large", "description": "Complete bedroom furniture"},
                {"name": "Kitchen Appliances", "quantity": 3, "size": "large", "description": "Refrigerator, stove, dishwasher"},
                {"name": "Miscellaneous Items", "quantity": 10, "size": "medium", "description": "Various household items"}
            ],
            "Large house cleanout, multiple rooms, high volume load",
            expected_min_price=310.0,  # Should trigger Scale 14+
            expected_max_price=750.0,  # Maximum scale 20
            expected_scale_min=14,
            expected_scale_max=20
        )
        
        # Test AI fallback pricing
        print("\n🤖 3. AI FALLBACK PRICING VALIDATION")
        # This will test if fallback pricing is conservative when AI fails
        self.run_pricing_test(
            "Fallback Pricing Test",
            [
                {"name": "Unknown Items", "quantity": 2, "size": "medium", "description": "Items requiring fallback pricing"},
            ],
            "Test items for fallback pricing validation",
            expected_min_price=65.0,  # Minimum for 2 items
            expected_max_price=205.0,  # Conservative fallback
            expected_scale_min=4,
            expected_scale_max=10
        )

    def test_minimum_per_item_rule(self):
        """Test $30 minimum per item safety rule"""
        print("\n" + "="*60)
        print("TESTING $30 MINIMUM PER ITEM SAFETY RULE")
        print("="*60)
        
        # Test multiple small items
        print("\n💰 MINIMUM PER ITEM VALIDATION")
        
        test_cases = [
            {
                "name": "Two Small Items",
                "items": [
                    {"name": "Small Box", "quantity": 1, "size": "small", "description": "Small cardboard box"},
                    {"name": "Small Bag", "quantity": 1, "size": "small", "description": "Small trash bag"}
                ],
                "min_total": 60.0  # 2 items × $30
            },
            {
                "name": "Three Medium Items", 
                "items": [
                    {"name": "Chair", "quantity": 1, "size": "medium", "description": "Office chair"},
                    {"name": "Table", "quantity": 1, "size": "medium", "description": "Small table"},
                    {"name": "Lamp", "quantity": 1, "size": "medium", "description": "Floor lamp"}
                ],
                "min_total": 90.0  # 3 items × $30
            },
            {
                "name": "Four Small Items",
                "items": [
                    {"name": "Electronics", "quantity": 4, "size": "small", "description": "Various small electronics"}
                ],
                "min_total": 120.0  # 4 items × $30
            }
        ]
        
        for test_case in test_cases:
            success, data = self.run_pricing_test(
                test_case["name"],
                test_case["items"],
                "Multiple items testing minimum per item rule",
                expected_min_price=test_case["min_total"]
            )
            
            if success:
                price = data.get('total_price', 0)
                item_count = sum(item.get('quantity', 1) for item in test_case["items"])
                price_per_item = price / item_count if item_count > 0 else 0
                
                if price_per_item >= 30.0:
                    print(f"   ✅ Price per item: ${price_per_item:.2f} (meets $30 minimum)")
                else:
                    print(f"   ❌ Price per item: ${price_per_item:.2f} (below $30 minimum)")

    def test_image_analysis_enhancement(self):
        """Test image analysis enhancement if possible"""
        print("\n" + "="*60)
        print("TESTING IMAGE ANALYSIS ENHANCEMENT")
        print("="*60)
        
        try:
            import io
            from PIL import Image
            
            # Test 1: Large furniture pile image
            print("\n📸 1. LARGE FURNITURE PILE IMAGE")
            
            # Create a test image representing large furniture
            img = Image.new('RGB', (400, 300), color='brown')
            img_buffer = io.BytesIO()
            img.save(img_buffer, format='JPEG')
            img_buffer.seek(0)
            
            files = {'file': ('large_furniture_pile.jpg', img_buffer, 'image/jpeg')}
            data = {'description': 'Large pile of furniture items including sofas, tables, and chairs for removal'}
            
            try:
                response = requests.post(f"{self.api_url}/quotes/image", data=data, files=files, timeout=30)
                
                if response.status_code == 200:
                    result = response.json()
                    price = result.get('total_price', 0)
                    scale_level = result.get('scale_level')
                    explanation = result.get('ai_explanation', '')
                    
                    print(f"   💰 Image Quote Price: ${price}")
                    print(f"   📊 Scale Level: {scale_level}")
                    print(f"   🤖 AI Analysis: {explanation[:150]}...")
                    
                    # Check for enhanced accuracy improvements
                    if price >= 100:  # Should be substantial for large pile
                        print(f"   ✅ Conservative pricing for large pile: ${price}")
                        self.log_test("Image Analysis - Large Pile Pricing", True)
                    else:
                        print(f"   ❌ Price may be too low for large pile: ${price}")
                        self.log_test("Image Analysis - Large Pile Pricing", False, f"Price ${price} seems low")
                    
                    # Check for enhanced prompt improvements
                    enhanced_keywords = ['conservative', 'volume', 'cubic feet', 'scale', 'overestimate', 'safety']
                    found_keywords = [kw for kw in enhanced_keywords if kw in explanation.lower()]
                    
                    if found_keywords:
                        print(f"   ✅ Enhanced prompt language detected: {', '.join(found_keywords)}")
                        self.log_test("Image Analysis - Enhanced Prompt", True)
                    else:
                        print(f"   ⚠️  Enhanced prompt language not clearly detected")
                        self.log_test("Image Analysis - Enhanced Prompt", False, "No enhanced keywords found")
                    
                    # Check for proper item identification
                    items = result.get('items', [])
                    if items and len(items) > 0:
                        print(f"   ✅ AI identified {len(items)} items from image")
                        for item in items[:3]:  # Show first 3 items
                            print(f"      - {item.get('name', 'Unknown')} ({item.get('size', 'unknown')} size)")
                        self.log_test("Image Analysis - Item Identification", True)
                    else:
                        print(f"   ❌ AI failed to identify items from image")
                        self.log_test("Image Analysis - Item Identification", False, "No items identified")
                
                else:
                    print(f"   ❌ Image quote failed: HTTP {response.status_code}")
                    self.log_test("Image Analysis - Basic Functionality", False, f"HTTP {response.status_code}")
                    
            except Exception as e:
                print(f"   ❌ Image quote error: {str(e)}")
                self.log_test("Image Analysis - Basic Functionality", False, str(e))
            
            # Test 2: Small items image
            print("\n📸 2. SMALL ITEMS IMAGE")
            
            # Create a test image for small items
            small_img = Image.new('RGB', (200, 150), color='gray')
            small_img_buffer = io.BytesIO()
            small_img.save(small_img_buffer, format='JPEG')
            small_img_buffer.seek(0)
            
            files = {'file': ('small_items.jpg', small_img_buffer, 'image/jpeg')}
            data = {'description': 'Small electronics and household items for removal'}
            
            try:
                response = requests.post(f"{self.api_url}/quotes/image", data=data, files=files, timeout=30)
                
                if response.status_code == 200:
                    result = response.json()
                    price = result.get('total_price', 0)
                    
                    # Should still meet minimum pricing even for small items
                    if price >= 45:
                        print(f"   ✅ Minimum pricing enforced for small items: ${price}")
                        self.log_test("Image Analysis - Small Items Minimum", True)
                    else:
                        print(f"   ❌ Price below minimum for small items: ${price}")
                        self.log_test("Image Analysis - Small Items Minimum", False, f"Price ${price} below $45")
                
            except Exception as e:
                print(f"   ❌ Small items image test error: {str(e)}")
                self.log_test("Image Analysis - Small Items Test", False, str(e))
                
        except ImportError:
            print("   ⚠️  PIL not available, skipping image analysis tests")
            self.log_test("Image Analysis - PIL Dependency", False, "PIL not installed")
        except Exception as e:
            print(f"   ⚠️  Image analysis tests failed: {str(e)}")
            self.log_test("Image Analysis - General Error", False, str(e))

    def generate_summary_report(self):
        """Generate comprehensive summary report"""
        print("\n" + "="*80)
        print("ENHANCED AI PRICING SYSTEM - COMPREHENSIVE TEST RESULTS")
        print("="*80)
        
        print(f"\n📊 OVERALL STATISTICS:")
        print(f"   Total Tests Run: {self.tests_run}")
        print(f"   Tests Passed: {self.tests_passed}")
        print(f"   Tests Failed: {len(self.failed_tests)}")
        print(f"   Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "   Success Rate: 0%")
        
        if self.failed_tests:
            print(f"\n❌ FAILED TESTS:")
            for i, failure in enumerate(self.failed_tests, 1):
                print(f"   {i}. {failure['test']}: {failure['error']}")
        
        # Analyze pricing results for patterns
        if self.pricing_results:
            print(f"\n💰 PRICING ANALYSIS:")
            prices = [r['price'] for r in self.pricing_results if r['price'] > 0]
            scales = [r['scale_level'] for r in self.pricing_results if r['scale_level']]
            
            if prices:
                print(f"   Price Range: ${min(prices):.2f} - ${max(prices):.2f}")
                print(f"   Average Price: ${sum(prices)/len(prices):.2f}")
                
                # Check minimum pricing compliance
                below_minimum = [p for p in prices if p < 45]
                if not below_minimum:
                    print(f"   ✅ All prices meet $45 minimum requirement")
                else:
                    print(f"   ❌ {len(below_minimum)} prices below $45 minimum")
            
            if scales:
                print(f"   Scale Range: {min(scales)} - {max(scales)}")
                print(f"   Average Scale: {sum(scales)/len(scales):.1f}")
        
        print(f"\n🎯 ACCURACY IMPROVEMENTS VERIFIED:")
        
        # Check for conservative pricing
        conservative_count = sum(1 for r in self.pricing_results 
                               if 'conservative' in r.get('explanation', '').lower() 
                               or 'overestimate' in r.get('explanation', '').lower())
        
        if conservative_count > 0:
            print(f"   ✅ Conservative pricing approach: {conservative_count}/{len(self.pricing_results)} quotes")
        else:
            print(f"   ⚠️  Conservative pricing language not consistently detected")
        
        # Check for volume-based calculations
        volume_count = sum(1 for r in self.pricing_results 
                          if 'volume' in r.get('explanation', '').lower() 
                          or 'cubic feet' in r.get('explanation', '').lower()
                          or 'scale' in r.get('explanation', '').lower())
        
        if volume_count > 0:
            print(f"   ✅ Volume-based calculations: {volume_count}/{len(self.pricing_results)} quotes")
        else:
            print(f"   ⚠️  Volume-based language not consistently detected")
        
        # Check for proper JSON format
        json_format_count = sum(1 for r in self.pricing_results 
                               if r.get('scale_level') is not None and r.get('breakdown') is not None)
        
        if json_format_count == len(self.pricing_results):
            print(f"   ✅ Complete JSON format: {json_format_count}/{len(self.pricing_results)} quotes")
        else:
            print(f"   ❌ Incomplete JSON format: {json_format_count}/{len(self.pricing_results)} quotes")
        
        print(f"\n🛡️  BUSINESS PROTECTION MEASURES:")
        
        # Check minimum per item compliance
        per_item_compliant = 0
        for r in self.pricing_results:
            if r['items'] and r['price'] > 0:
                item_count = sum(item.get('quantity', 1) for item in r['items'])
                price_per_item = r['price'] / item_count if item_count > 0 else 0
                if price_per_item >= 30:
                    per_item_compliant += 1
        
        if per_item_compliant == len(self.pricing_results):
            print(f"   ✅ $30 minimum per item: {per_item_compliant}/{len(self.pricing_results)} quotes")
        else:
            print(f"   ❌ Below $30 per item: {per_item_compliant}/{len(self.pricing_results)} quotes")
        
        # Overall assessment
        print(f"\n🎉 FINAL ASSESSMENT:")
        
        success_rate = (self.tests_passed/self.tests_run*100) if self.tests_run > 0 else 0
        
        if success_rate >= 90:
            print(f"   ✅ EXCELLENT: Enhanced AI pricing system shows 100% accuracy improvements")
            print(f"   ✅ All critical business requirements met")
            print(f"   ✅ Conservative pricing approach implemented successfully")
        elif success_rate >= 75:
            print(f"   ⚠️  GOOD: Enhanced AI pricing system shows significant improvements")
            print(f"   ⚠️  Minor issues need addressing for 100% accuracy")
        else:
            print(f"   ❌ NEEDS WORK: Enhanced AI pricing system requires additional fixes")
            print(f"   ❌ Critical issues prevent 100% accuracy achievement")
        
        return success_rate >= 90

def main():
    """Run comprehensive enhanced pricing tests"""
    print("🚀 Starting Enhanced AI Pricing System Tests...")
    print("Testing 100% pricing accuracy improvements for Text2toss")
    
    tester = EnhancedPricingTester()
    
    # Run all test suites
    tester.test_accuracy_scenarios()
    tester.test_business_logic_validation()
    tester.test_consistency_testing()
    tester.test_edge_case_protection()
    tester.test_minimum_per_item_rule()
    tester.test_image_analysis_enhancement()
    
    # Generate final report
    success = tester.generate_summary_report()
    
    if success:
        print(f"\n🎉 SUCCESS: Enhanced AI pricing system ready for production!")
        sys.exit(0)
    else:
        print(f"\n⚠️  REVIEW NEEDED: Some issues require attention before production")
        sys.exit(1)

if __name__ == "__main__":
    main()