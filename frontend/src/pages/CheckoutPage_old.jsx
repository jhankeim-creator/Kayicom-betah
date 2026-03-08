import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CreditCard, Wallet } from 'lucide-react';
import { toast } from 'sonner';

const CheckoutPage = ({ user, logout, cart, clearCart, settings }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [paymentMethod, setPaymentMethod] = useState('crypto_plisio');
  const [loading, setLoading] = useState(false);

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  const handleCheckout = async () => {
    if (!user) {
      toast.error('You must login before purchasing');
      navigate('/login', { state: { from: location }, replace: true });
      return;
    }

    if (cart.length === 0) {
      toast.error('Your cart is empty');
      return;
    }

    setLoading(true);

    try {
      const orderItems = cart.map(item => ({
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        price: item.product.price
      }));

      const response = await axiosInstance.post(`/orders?user_id=${user.user_id}&user_email=${user.email}`, {
        items: orderItems,
        payment_method: paymentMethod
      });

      const order = response.data;

      // Clear cart
      clearCart();

      if (paymentMethod === 'crypto_plisio' && order.plisio_invoice_id) {
        // Redirect to Plisio payment
        toast.success('Redirecting to payment...');
        // In production, redirect to Plisio payment page
        navigate(`/track/${order.id}`);
      } else {
        // Manual payment - redirect to order tracking
        toast.success('Order created! Please submit your payment proof.');
        navigate(`/track/${order.id}`);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(error.response?.data?.detail || 'Error creating order');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen gradient-bg">
        <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl text-white mb-4">You must login to continue</h2>
          <Button onClick={() => navigate('/login', { state: { from: location }, replace: true })} className="bg-white text-green-600 hover:bg-gray-100">
            Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-12" data-testid="checkout-title">Checkout</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Payment Method */}
          <Card className="glass-effect border-white/20" data-testid="payment-methods">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold text-white mb-6">Choose Payment Method</h2>
              
              <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3 p-3 rounded-lg glass-effect cursor-pointer" data-testid="payment-crypto">
                    <RadioGroupItem value="crypto_plisio" id="crypto" />
                    <Label htmlFor="crypto" className="flex items-center space-x-3 cursor-pointer flex-1">
                      <Wallet className="text-green-400" size={20} />
                      <div>
                        <div className="text-white font-semibold text-sm">Cryptocurrency (Automatic)</div>
                        <div className="text-white/70 text-xs">Bitcoin, Ethereum, USDT</div>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 p-3 rounded-lg glass-effect cursor-pointer" data-testid="payment-paypal">
                    <RadioGroupItem value="paypal" id="paypal" />
                    <Label htmlFor="paypal" className="flex items-center space-x-3 cursor-pointer flex-1">
                      <CreditCard className="text-blue-400" size={20} />
                      <div>
                        <div className="text-white font-semibold text-sm">PayPal</div>
                        <div className="text-white/70 text-xs">Manual verification required</div>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 p-3 rounded-lg glass-effect cursor-pointer" data-testid="payment-skrill">
                    <RadioGroupItem value="skrill" id="skrill" />
                    <Label htmlFor="skrill" className="flex items-center space-x-3 cursor-pointer flex-1">
                      <CreditCard className="text-green-400" size={20} />
                      <div>
                        <div className="text-white font-semibold text-sm">Skrill</div>
                        <div className="text-white/70 text-xs">Manual verification required</div>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 p-3 rounded-lg glass-effect cursor-pointer" data-testid="payment-moncash">
                    <RadioGroupItem value="moncash" id="moncash" />
                    <Label htmlFor="moncash" className="flex items-center space-x-3 cursor-pointer flex-1">
                      <CreditCard className="text-green-400" size={20} />
                      <div>
                        <div className="text-white font-semibold text-sm">MonCash</div>
                        <div className="text-white/70 text-xs">Manual verification required</div>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 p-3 rounded-lg glass-effect cursor-pointer" data-testid="payment-binance">
                    <RadioGroupItem value="binance_pay" id="binance" />
                    <Label htmlFor="binance" className="flex items-center space-x-3 cursor-pointer flex-1">
                      <Wallet className="text-yellow-400" size={20} />
                      <div>
                        <div className="text-white font-semibold text-sm">Binance Pay</div>
                        <div className="text-white/70 text-xs">Manual verification required</div>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 p-3 rounded-lg glass-effect cursor-pointer" data-testid="payment-zelle">
                    <RadioGroupItem value="zelle" id="zelle" />
                    <Label htmlFor="zelle" className="flex items-center space-x-3 cursor-pointer flex-1">
                      <CreditCard className="text-indigo-400" size={20} />
                      <div>
                        <div className="text-white font-semibold text-sm">Zelle</div>
                        <div className="text-white/70 text-xs">Manual verification required</div>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 p-3 rounded-lg glass-effect cursor-pointer" data-testid="payment-cashapp">
                    <RadioGroupItem value="cashapp" id="cashapp" />
                    <Label htmlFor="cashapp" className="flex items-center space-x-3 cursor-pointer flex-1">
                      <CreditCard className="text-green-500" size={20} />
                      <div>
                        <div className="text-white font-semibold text-sm">Cash App</div>
                        <div className="text-white/70 text-xs">Manual verification required</div>
                      </div>
                    </Label>
                  </div>
                </div>
              </RadioGroup>

              {['paypal', 'skrill', 'moncash', 'binance_pay', 'zelle', 'cashapp'].includes(paymentMethod) && (
                <div className="mt-6 p-4 bg-yellow-400/10 border border-yellow-400/30 rounded-lg">
                  <p className="text-yellow-200 text-sm">
                    <strong>Note:</strong> After placing your order, you will need to submit your payment proof and transaction ID on the order tracking page.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Summary */}
          <Card className="glass-effect border-white/20" data-testid="checkout-summary">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold text-white mb-6">Order Summary</h2>
              
              <div className="space-y-3 mb-6">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex justify-between text-white" data-testid={`summary-item-${item.product.id}`}>
                    <span className="text-white/80">
                      {item.product.name} x {item.quantity}
                    </span>
                    <span className="font-semibold">${(item.product.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/20 pt-4 mb-6">
                <div className="flex justify-between text-white text-xl font-bold">
                  <span>Total:</span>
                  <span data-testid="checkout-total">${total.toFixed(2)}</span>
                </div>
              </div>

              <Button
                className="w-full bg-white text-green-600 hover:bg-gray-100 py-6 text-lg"
                onClick={handleCheckout}
                disabled={loading}
                data-testid="place-order-btn"
              >
                {loading ? 'Processing...' : 'Place Order'}
              </Button>

              <div className="mt-6 space-y-2 text-white/70 text-sm">
                <p className="flex items-center">
                  <span className="mr-2">✅</span>
                  Secure transaction
                </p>
                <p className="flex items-center">
                  <span className="mr-2">⚡</span>
                  Fast delivery
                </p>
                <p className="flex items-center">
                  <span className="mr-2">💬</span>
                  24/7 Support
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default CheckoutPage;
