#!/usr/bin/env python3
"""
Backend API Testing for Order Management System
Tests all order-related endpoints and payment functionality
"""

import requests
import json
from datetime import datetime
import uuid

# Configuration
# Allow overriding the API base url for real environment testing:
#   BASE_URL="https://your-domain/api" python3 backend_test.py
import os
BASE_URL = os.environ.get("BASE_URL", "https://kayicom-payments.preview.emergentagent.com/api")
ADMIN_EMAIL = "Info.kayicom.com@gmx.fr"
ADMIN_PASSWORD = "admin123"

class OrderManagementTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_user = None
        self.test_orders = []
        
    def login_admin(self):
        """Login as admin user"""
        print("🔐 Testing admin login...")
        
        login_data = {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }
        
        try:
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            print(f"Login response status: {response.status_code}")
            
            if response.status_code == 200:
                self.admin_user = response.json()
                print(f"✅ Admin login successful: {self.admin_user['email']}")
                return True
            else:
                print(f"❌ Admin login failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return False
    
    def test_get_orders(self):
        """Test GET /api/orders endpoint"""
        print("\n📋 Testing GET /api/orders...")
        
        try:
            response = self.session.get(f"{BASE_URL}/orders")
            print(f"Get orders response status: {response.status_code}")
            
            if response.status_code == 200:
                orders = response.json()
                print(f"✅ Orders retrieved successfully. Count: {len(orders)}")
                
                # Store orders for later tests
                self.test_orders = orders
                
                # Verify order structure
                if orders:
                    sample_order = orders[0]
                    required_fields = ['id', 'user_email', 'items', 'payment_status', 
                                     'order_status', 'payment_method', 'total_amount']
                    
                    missing_fields = [field for field in required_fields if field not in sample_order]
                    if missing_fields:
                        print(f"❌ Missing required fields in order: {missing_fields}")
                        return False
                    
                    print(f"✅ Order structure validated")
                    
                    # Print order details for verification
                    for i, order in enumerate(orders[:2]):  # Show first 2 orders
                        print(f"Order {i+1}:")
                        print(f"  - ID: {order['id']}")
                        print(f"  - Email: {order['user_email']}")
                        print(f"  - Payment Status: {order['payment_status']}")
                        print(f"  - Order Status: {order['order_status']}")
                        print(f"  - Payment Method: {order['payment_method']}")
                        print(f"  - Total: ${order['total_amount']}")
                        if order.get('payment_proof_url'):
                            print(f"  - Payment Proof: {order['payment_proof_url']}")
                        if order.get('transaction_id'):
                            print(f"  - Transaction ID: {order['transaction_id']}")
                        if order.get('delivery_info'):
                            print(f"  - Delivery Info: {order['delivery_info']}")
                        print()
                    
                    return True
                else:
                    print("⚠️ No orders found in database")
                    return True
            else:
                print(f"❌ Failed to get orders: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Get orders error: {str(e)}")
            return False
    
    def test_payment_approval(self):
        """Test PUT /api/orders/{order_id}/status for payment approval"""
        print("\n💳 Testing payment approval/rejection...")
        
        # Find order with pending_verification status
        pending_order = None
        for order in self.test_orders:
            if order.get('payment_status') == 'pending_verification':
                pending_order = order
                break
        
        if not pending_order:
            print("⚠️ No orders with pending_verification status found")
            return True
        
        order_id = pending_order['id']
        print(f"Testing with order ID: {order_id}")
        
        # Test payment approval
        try:
            print("Testing payment approval...")
            response = self.session.put(
                f"{BASE_URL}/orders/{order_id}/status",
                params={
                    'payment_status': 'paid',
                    'order_status': 'processing'
                }
            )
            
            print(f"Payment approval response status: {response.status_code}")
            
            if response.status_code == 200:
                print("✅ Payment approval successful")
                
                # Verify the update
                verify_response = self.session.get(f"{BASE_URL}/orders/{order_id}")
                if verify_response.status_code == 200:
                    updated_order = verify_response.json()
                    if (updated_order['payment_status'] == 'paid' and 
                        updated_order['order_status'] == 'processing'):
                        print("✅ Order status verified after approval")
                        return True
                    else:
                        print(f"❌ Order status not updated correctly: payment_status={updated_order['payment_status']}, order_status={updated_order['order_status']}")
                        return False
                else:
                    print("❌ Failed to verify order update")
                    return False
            else:
                print(f"❌ Payment approval failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Payment approval error: {str(e)}")
            return False
    
    def test_payment_rejection(self):
        """Test payment rejection"""
        print("\n❌ Testing payment rejection...")
        
        # Find another order or create test scenario
        # For now, let's test rejection on the same order if it exists
        pending_orders = [o for o in self.test_orders if o.get('payment_status') == 'pending_verification']
        
        if len(pending_orders) < 2:
            print("⚠️ Not enough pending orders to test rejection separately")
            return True
        
        order_id = pending_orders[1]['id']
        
        try:
            response = self.session.put(
                f"{BASE_URL}/orders/{order_id}/status",
                params={'payment_status': 'failed'}
            )
            
            print(f"Payment rejection response status: {response.status_code}")
            
            if response.status_code == 200:
                print("✅ Payment rejection successful")
                return True
            else:
                print(f"❌ Payment rejection failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Payment rejection error: {str(e)}")
            return False
    
    def test_delivery_management(self):
        """Test PUT /api/orders/{order_id}/delivery endpoint"""
        print("\n🚚 Testing delivery management...")
        
        # Find order with paid status and processing order_status
        delivery_order = None
        for order in self.test_orders:
            if (order.get('payment_status') == 'paid' and 
                order.get('order_status') == 'processing'):
                delivery_order = order
                break
        
        if not delivery_order:
            print("⚠️ No orders ready for delivery (paid + processing status)")
            return True
        
        order_id = delivery_order['id']
        print(f"Testing delivery with order ID: {order_id}")
        
        # Test delivery update
        delivery_data = {
            "delivery_details": "Account credentials: username=testuser123, password=securepass456, expires=2024-12-31"
        }
        
        try:
            response = self.session.put(
                f"{BASE_URL}/orders/{order_id}/delivery",
                json=delivery_data
            )
            
            print(f"Delivery update response status: {response.status_code}")
            
            if response.status_code == 200:
                print("✅ Delivery update successful")
                
                # Verify the delivery info was saved
                verify_response = self.session.get(f"{BASE_URL}/orders/{order_id}")
                if verify_response.status_code == 200:
                    updated_order = verify_response.json()
                    
                    if updated_order.get('delivery_info'):
                        delivery_info = updated_order['delivery_info']
                        print(f"✅ Delivery info saved: {delivery_info}")
                        
                        # Check if order status changed to completed
                        if updated_order['order_status'] == 'completed':
                            print("✅ Order status changed to completed")
                            return True
                        else:
                            print(f"❌ Order status not changed to completed: {updated_order['order_status']}")
                            return False
                    else:
                        print("❌ Delivery info not saved to order")
                        return False
                else:
                    print("❌ Failed to verify delivery update")
                    return False
            else:
                print(f"❌ Delivery update failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Delivery update error: {str(e)}")
            return False
    
    def test_manual_payment_proof(self):
        """Test POST /api/payments/manual-proof endpoint"""
        print("\n📄 Testing manual payment proof upload...")
        
        # Find an order that can receive payment proof (pending status)
        target_order = None
        for order in self.test_orders:
            if order.get('payment_status') in ['pending', 'failed']:
                target_order = order
                break
        
        if not target_order:
            print("⚠️ No orders available for payment proof upload")
            return True
        
        order_id = target_order['id']
        print(f"Testing payment proof with order ID: {order_id}")
        
        # Test payment proof upload
        proof_data = {
            "order_id": order_id,
            "transaction_id": f"TXN_{uuid.uuid4().hex[:8].upper()}",
            "payment_proof_url": "https://example.com/payment-proof-screenshot.jpg"
        }
        
        try:
            response = self.session.post(
                f"{BASE_URL}/payments/manual-proof",
                json=proof_data
            )
            
            print(f"Payment proof upload response status: {response.status_code}")
            
            if response.status_code == 200:
                print("✅ Payment proof upload successful")
                
                # Verify the payment proof was saved
                verify_response = self.session.get(f"{BASE_URL}/orders/{order_id}")
                if verify_response.status_code == 200:
                    updated_order = verify_response.json()
                    
                    if (updated_order.get('payment_proof_url') == proof_data['payment_proof_url'] and
                        updated_order.get('transaction_id') == proof_data['transaction_id'] and
                        updated_order.get('payment_status') == 'pending_verification'):
                        print("✅ Payment proof data verified in order")
                        return True
                    else:
                        print("❌ Payment proof data not correctly saved")
                        print(f"Expected: proof_url={proof_data['payment_proof_url']}, txn_id={proof_data['transaction_id']}, status=pending_verification")
                        print(f"Actual: proof_url={updated_order.get('payment_proof_url')}, txn_id={updated_order.get('transaction_id')}, status={updated_order.get('payment_status')}")
                        return False
                else:
                    print("❌ Failed to verify payment proof update")
                    return False
            else:
                print(f"❌ Payment proof upload failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Payment proof upload error: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Order Management System Backend Tests")
        print("=" * 60)
        
        results = {}
        
        # Login first
        if not self.login_admin():
            print("❌ Cannot proceed without admin login")
            return False
        
        # Run all tests
        test_methods = [
            ('GET /api/orders', self.test_get_orders),
            ('Payment Approval', self.test_payment_approval),
            ('Payment Rejection', self.test_payment_rejection),
            ('Delivery Management', self.test_delivery_management),
            ('Manual Payment Proof', self.test_manual_payment_proof)
        ]
        
        for test_name, test_method in test_methods:
            try:
                results[test_name] = test_method()
            except Exception as e:
                print(f"❌ {test_name} failed with exception: {str(e)}")
                results[test_name] = False
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = 0
        total = len(results)
        
        for test_name, result in results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{test_name}: {status}")
            if result:
                passed += 1
        
        print(f"\nOverall: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All backend tests passed!")
            return True
        else:
            print("⚠️ Some backend tests failed")
            return False

if __name__ == "__main__":
    tester = OrderManagementTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)