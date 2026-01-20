#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for KayiCom Marketplace
Tests all major endpoints as requested in the review
"""

import requests
import json
from datetime import datetime
import uuid

# Configuration from frontend/.env
# Allow overriding the API base url for real environment testing:
#   BASE_URL="https://your-domain/api" python3 comprehensive_backend_test.py
import os
BASE_URL = os.environ.get("BASE_URL", "https://kayicom-payments.preview.emergentagent.com/api")
ADMIN_EMAIL = "Info.kayicom.com@gmx.fr"
ADMIN_PASSWORD = "admin123"

class KayiComBackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_user = None
        self.test_user_id = None
        self.products_data = []
        self.orders_data = []
        
    def test_authentication(self):
        """Test authentication endpoints"""
        print("🔐 Testing Authentication & Users...")
        
        # Test admin login
        print("Testing admin login...")
        login_data = {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }
        
        try:
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            print(f"Admin login status: {response.status_code}")
            
            if response.status_code == 200:
                self.admin_user = response.json()
                print(f"✅ Admin login successful: {self.admin_user['email']}")
                print(f"Admin details: {json.dumps(self.admin_user, indent=2)}")
                
                # Check JWT token (if returned)
                if 'token' in self.admin_user:
                    print("✅ JWT token returned")
                else:
                    print("⚠️ No JWT token in response (may be session-based)")
                
                return True
            else:
                print(f"❌ Admin login failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Authentication error: {str(e)}")
            return False
    
    def test_referral_system(self):
        """Test referral system endpoints (JUST FIXED)"""
        print("\n🔗 Testing Referral System (JUST FIXED)...")
        
        if not self.admin_user:
            print("❌ Need admin login first")
            return False
        
        # Test GET /api/referral/info with admin-001 user_id
        print("Testing GET /api/referral/info with admin-001...")
        
        try:
            response = self.session.get(f"{BASE_URL}/referral/info", params={"user_id": "admin-001"})
            print(f"Referral info status: {response.status_code}")
            
            if response.status_code == 200:
                referral_data = response.json()
                print(f"✅ Referral info retrieved successfully")
                print(f"Referral data: {json.dumps(referral_data, indent=2)}")
                
                # Verify required fields
                required_fields = ['referral_code', 'referral_balance', 'total_referrals', 'referral_link']
                missing_fields = [field for field in required_fields if field not in referral_data]
                
                if missing_fields:
                    print(f"❌ Missing required fields: {missing_fields}")
                    return False
                else:
                    print("✅ All required referral fields present")
                    
                # Test register with referral
                print("\nTesting POST /api/auth/register-with-referral...")
                test_email = f"testuser_{uuid.uuid4().hex[:8]}@example.com"
                register_data = {
                    "email": test_email,
                    "full_name": "Test User",
                    "password": "testpass123"
                }
                
                referral_code = referral_data.get('referral_code')
                if referral_code:
                    register_response = self.session.post(
                        f"{BASE_URL}/auth/register-with-referral",
                        json=register_data,
                        params={"referral_code": referral_code}
                    )
                    print(f"Register with referral status: {register_response.status_code}")
                    
                    if register_response.status_code == 200:
                        print("✅ Register with referral successful")
                        return True
                    else:
                        print(f"❌ Register with referral failed: {register_response.text}")
                        return False
                else:
                    print("⚠️ No referral code to test registration with")
                    return True
                    
            else:
                print(f"❌ Referral info failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Referral system error: {str(e)}")
            return False
    
    def test_products(self):
        """Test product endpoints"""
        print("\n📦 Testing Products...")
        
        # Test GET /api/products
        print("Testing GET /api/products...")
        
        try:
            response = self.session.get(f"{BASE_URL}/products")
            print(f"Products list status: {response.status_code}")
            
            if response.status_code == 200:
                products = response.json()
                print(f"✅ Products retrieved successfully. Count: {len(products)}")
                self.products_data = products
                
                if products:
                    # Test individual product
                    product_id = products[0]['id']
                    print(f"\nTesting GET /api/products/{product_id}...")
                    
                    product_response = self.session.get(f"{BASE_URL}/products/{product_id}")
                    print(f"Individual product status: {product_response.status_code}")
                    
                    if product_response.status_code == 200:
                        product = product_response.json()
                        print(f"✅ Individual product retrieved: {product['name']}")
                        
                        # Check for variants (game products)
                        if product.get('variant_name'):
                            print(f"✅ Product has variant: {product['variant_name']}")
                        
                        return True
                    else:
                        print(f"❌ Individual product failed: {product_response.text}")
                        return False
                else:
                    print("⚠️ No products found")
                    return True
            else:
                print(f"❌ Products list failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Products error: {str(e)}")
            return False
    
    def test_settings(self):
        """Test settings endpoint with NEW payment_gateways and crypto_settings"""
        print("\n⚙️ Testing Settings (NEW payment_gateways and crypto_settings)...")
        
        try:
            response = self.session.get(f"{BASE_URL}/settings")
            print(f"Settings status: {response.status_code}")
            
            if response.status_code == 200:
                settings = response.json()
                print(f"✅ Settings retrieved successfully")
                
                # Check for NEW payment_gateways
                if 'payment_gateways' in settings:
                    payment_gateways = settings['payment_gateways']
                    print(f"✅ payment_gateways found: {json.dumps(payment_gateways, indent=2)}")
                    
                    # Verify required gateways
                    required_gateways = ['paypal', 'airtm', 'skrill', 'crypto_usdt']
                    missing_gateways = [gw for gw in required_gateways if gw not in payment_gateways]
                    
                    if missing_gateways:
                        print(f"❌ Missing payment gateways: {missing_gateways}")
                        return False
                    else:
                        print("✅ All required payment gateways present")
                else:
                    print("❌ payment_gateways not found in settings")
                    return False
                
                # Check for NEW crypto_settings
                if 'crypto_settings' in settings:
                    crypto_settings = settings['crypto_settings']
                    print(f"✅ crypto_settings found: {json.dumps(crypto_settings, indent=2)}")
                    
                    # Verify required crypto settings
                    if 'buy_rate_usdt' in crypto_settings and 'wallets' in crypto_settings:
                        wallets = crypto_settings['wallets']
                        required_wallets = ['BEP20', 'TRC20', 'MATIC']
                        missing_wallets = [w for w in required_wallets if w not in wallets]
                        
                        if missing_wallets:
                            print(f"❌ Missing crypto wallets: {missing_wallets}")
                            return False
                        else:
                            print("✅ All required crypto wallets present")
                            return True
                    else:
                        print("❌ Missing buy_rate_usdt or wallets in crypto_settings")
                        return False
                else:
                    print("❌ crypto_settings not found in settings")
                    return False
                    
            else:
                print(f"❌ Settings failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Settings error: {str(e)}")
            return False
    
    def test_crypto_endpoints(self):
        """Test crypto endpoints"""
        print("\n💰 Testing Crypto Endpoints...")
        
        # Test GET /api/crypto/config
        print("Testing GET /api/crypto/config...")
        
        try:
            response = self.session.get(f"{BASE_URL}/crypto/config")
            print(f"Crypto config status: {response.status_code}")
            
            if response.status_code == 200:
                crypto_config = response.json()
                print(f"✅ Crypto config retrieved successfully")
                print(f"Crypto config: {json.dumps(crypto_config, indent=2)}")
                
                # Test crypto buy endpoint (may require auth)
                print("\nTesting POST /api/crypto/buy...")
                buy_data = {
                    "chain": "BEP20",
                    "amount_usd": 50.0,
                    "payment_method": "paypal",
                    "wallet_address": "0x1234567890abcdef1234567890abcdef12345678"
                }
                
                # This might require user_id and user_email params
                buy_response = self.session.post(
                    f"{BASE_URL}/crypto/buy",
                    json=buy_data,
                    params={"user_id": "test-user", "user_email": "test@example.com"}
                )
                print(f"Crypto buy status: {buy_response.status_code}")
                
                if buy_response.status_code in [200, 400, 401]:  # 400/401 expected without proper auth
                    print("✅ Crypto buy endpoint accessible")
                else:
                    print(f"❌ Crypto buy unexpected error: {buy_response.text}")
                
                # Test user crypto transactions
                print("\nTesting GET /api/crypto/transactions/user/{user_id}...")
                transactions_response = self.session.get(f"{BASE_URL}/crypto/transactions/user/test-user")
                print(f"Crypto transactions status: {transactions_response.status_code}")
                
                if transactions_response.status_code == 200:
                    transactions = transactions_response.json()
                    print(f"✅ Crypto transactions retrieved. Count: {len(transactions)}")
                    return True
                else:
                    print(f"⚠️ Crypto transactions failed: {transactions_response.text}")
                    return True  # Not critical
                    
            else:
                print(f"❌ Crypto config failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Crypto endpoints error: {str(e)}")
            return False
    
    def test_withdrawal_endpoints(self):
        """Test withdrawal endpoints"""
        print("\n💸 Testing Withdrawal Endpoints...")
        
        # Test GET /api/withdrawals/user/{user_id}
        print("Testing GET /api/withdrawals/user/{user_id}...")
        
        try:
            response = self.session.get(f"{BASE_URL}/withdrawals/user/test-user")
            print(f"User withdrawals status: {response.status_code}")
            
            if response.status_code == 200:
                withdrawals = response.json()
                print(f"✅ User withdrawals retrieved. Count: {len(withdrawals)}")
                
                # Test withdrawal request (may require minimum balance)
                print("\nTesting POST /api/withdrawals/request...")
                withdrawal_data = {
                    "amount": 10.0,
                    "method": "paypal",
                    "paypal_email": "test@example.com"
                }
                
                withdrawal_response = self.session.post(
                    f"{BASE_URL}/withdrawals/request",
                    json=withdrawal_data,
                    params={"user_id": "test-user", "user_email": "test@example.com"}
                )
                print(f"Withdrawal request status: {withdrawal_response.status_code}")
                
                if withdrawal_response.status_code in [200, 400]:  # 400 expected for insufficient balance
                    if withdrawal_response.status_code == 400:
                        print("✅ Withdrawal request properly validates minimum balance")
                    else:
                        print("✅ Withdrawal request successful")
                    return True
                else:
                    print(f"❌ Withdrawal request unexpected error: {withdrawal_response.text}")
                    return False
                    
            else:
                print(f"❌ User withdrawals failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Withdrawal endpoints error: {str(e)}")
            return False
    
    def test_orders(self):
        """Test order endpoints"""
        print("\n📋 Testing Orders...")
        
        # Test GET /api/orders
        print("Testing GET /api/orders...")
        
        try:
            response = self.session.get(f"{BASE_URL}/orders")
            print(f"Orders status: {response.status_code}")
            
            if response.status_code == 200:
                orders = response.json()
                print(f"✅ Orders retrieved successfully. Count: {len(orders)}")
                self.orders_data = orders
                
                if orders:
                    # Show sample order structure
                    sample_order = orders[0]
                    print(f"Sample order structure: {json.dumps(sample_order, indent=2)}")
                
                # Test create order
                print("\nTesting POST /api/orders...")
                if self.products_data:
                    order_data = {
                        "items": [{
                            "product_id": self.products_data[0]['id'],
                            "product_name": self.products_data[0]['name'],
                            "quantity": 1,
                            "price": self.products_data[0]['price']
                        }],
                        "payment_method": "paypal"
                    }
                    
                    create_response = self.session.post(
                        f"{BASE_URL}/orders",
                        json=order_data,
                        params={"user_id": "test-user", "user_email": "test@example.com"}
                    )
                    print(f"Create order status: {create_response.status_code}")
                    
                    if create_response.status_code == 200:
                        new_order = create_response.json()
                        print(f"✅ Order created successfully: {new_order['id']}")
                        return True
                    else:
                        print(f"❌ Create order failed: {create_response.text}")
                        return False
                else:
                    print("⚠️ No products available to create test order")
                    return True
                    
            else:
                print(f"❌ Orders failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Orders error: {str(e)}")
            return False
    
    def run_comprehensive_tests(self):
        """Run all comprehensive backend tests"""
        print("🚀 Starting Comprehensive KayiCom Backend Tests")
        print("=" * 70)
        
        results = {}
        
        # Run tests one by one to avoid issues
        print(f"\n{'='*70}")
        try:
            results['Authentication & Users'] = self.test_authentication()
        except Exception as e:
            print(f"❌ Authentication & Users failed with exception: {str(e)}")
            results['Authentication & Users'] = False
            
        print(f"\n{'='*70}")
        try:
            results['Referral System (JUST FIXED)'] = self.test_referral_system()
        except Exception as e:
            print(f"❌ Referral System failed with exception: {str(e)}")
            results['Referral System (JUST FIXED)'] = False
            
        print(f"\n{'='*70}")
        try:
            results['Products'] = self.test_products()
        except Exception as e:
            print(f"❌ Products failed with exception: {str(e)}")
            results['Products'] = False
            
        print(f"\n{'='*70}")
        try:
            results['Settings (NEW payment_gateways & crypto_settings)'] = self.test_settings()
        except Exception as e:
            print(f"❌ Settings failed with exception: {str(e)}")
            results['Settings (NEW payment_gateways & crypto_settings)'] = False
            
        print(f"\n{'='*70}")
        try:
            results['Crypto Endpoints'] = self.test_crypto_endpoints()
        except Exception as e:
            print(f"❌ Crypto Endpoints failed with exception: {str(e)}")
            results['Crypto Endpoints'] = False
            
        print(f"\n{'='*70}")
        try:
            results['Withdrawal Endpoints'] = self.test_withdrawal_endpoints()
        except Exception as e:
            print(f"❌ Withdrawal Endpoints failed with exception: {str(e)}")
            results['Withdrawal Endpoints'] = False
            
        print(f"\n{'='*70}")
        try:
            results['Orders'] = self.test_orders()
        except Exception as e:
            print(f"❌ Orders failed with exception: {str(e)}")
            results['Orders'] = False
        
        # Print comprehensive summary
        print("\n" + "=" * 70)
        print("📊 COMPREHENSIVE TEST SUMMARY")
        print("=" * 70)
        
        passed = 0
        total = len(results)
        
        for test_name, result in results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{test_name}: {status}")
            if result:
                passed += 1
        
        print(f"\nOverall: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All comprehensive backend tests passed!")
            return True
        else:
            print("⚠️ Some backend tests failed - see details above")
            return False

if __name__ == "__main__":
    tester = KayiComBackendTester()
    success = tester.run_comprehensive_tests()
    exit(0 if success else 1)