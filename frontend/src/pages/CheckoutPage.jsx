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
import { CreditCard, Wallet, Gamepad2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { buildPlisioInvoiceUrl, openPlisioInvoice } from '../utils/plisioInvoice';
import { getGameConfig } from '../utils/gameConfig';

const CheckoutPage = ({ user, logout, cart, clearCart, settings }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [paymentMethod, setPaymentMethod] = useState('crypto_plisio');
  const [loading, setLoading] = useState(false);
  const [playerIds, setPlayerIds] = useState({});
  const [serverIds, setServerIds] = useState({});
  const [credentials, setCredentials] = useState({});
  const [couponCode, setCouponCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);
  const [verifyStatus, setVerifyStatus] = useState({});
  const [verifying, setVerifying] = useState({});

  const verifyPlayerId = async (product) => {
    const pid = playerIds[product.id];
    if (!pid || !pid.trim()) { toast.error('Enter a Player ID first'); return; }
    const gameCode = product.g2bulk_game_code;
    if (!gameCode) { toast.info('Verification not available for this product'); return; }
    setVerifying(prev => ({ ...prev, [product.id]: true }));
    try {
      const verifyBody = { game_code: gameCode, player_id: pid.trim() };
      const sid = serverIds[product.id];
      if (sid && sid.trim()) verifyBody.server_id = sid.trim();
      const res = await axiosInstance.post('/verify-player-id', verifyBody);
      setVerifyStatus(prev => ({ ...prev, [product.id]: res.data }));
      if (res.data.valid) toast.success(res.data.message || 'Player ID verified!');
      else toast.error(res.data.message || 'Invalid Player ID');
    } catch { toast.error('Verification failed. Please try again.'); }
    finally { setVerifying(prev => ({ ...prev, [product.id]: false })); }
  };

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const total = Math.max(0, subtotal - (discountAmount || 0));

  // Check if any item needs player ID or credentials
  const needsPlayerIds = cart.some(item => item.product.requires_player_id);
  const needsCredentials = cart.some(item => item.product.requires_credentials);

  const getCredentialFields = (product) => {
    if (product?.credential_fields && product.credential_fields.length > 0) {
      return product.credential_fields;
    }
    return ['email', 'password'];
  };

  const loadWalletBalance = async () => {
    try {
      const res = await axiosInstance.get(`/wallet/balance?user_id=${user.user_id}`);
      setWalletBalance(res.data?.wallet_balance ?? 0);
    } catch (e) {
      setWalletBalance(null);
    }
  };

  const handlePlayerIdChange = (productId, value) => {
    setPlayerIds(prev => ({
      ...prev,
      [productId]: value
    }));
  };

  const handleServerIdChange = (productId, value) => {
    setServerIds(prev => ({
      ...prev,
      [productId]: value
    }));
  };

  const handleCredentialChange = (productId, field, value) => {
    setCredentials(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        [field]: value
      }
    }));
  };

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

    // Validate player IDs for products that require them
    for (const item of cart) {
      if (item.product.requires_player_id && !playerIds[item.product.id]) {
        const label = item.product.player_id_label || 'Player ID';
        toast.error(`Please enter ${label} for ${item.product.name}`);
        return;
      }
      const gc = getGameConfig(item.product.name);
      if ((item.product.requires_server_id || gc?.requiresServerId) && !serverIds[item.product.id]?.trim()) {
        const label = gc?.serverIdLabel || 'Server ID';
        toast.error(`Please enter ${label} for ${item.product.name}`);
        return;
      }
    }

    // Check credentials
    for (const item of cart) {
      if (item.product.requires_credentials) {
        const creds = credentials[item.product.id];
        const fields = getCredentialFields(item.product);
        const missing = fields.filter((f) => {
          const val = creds?.[f];
          return !val || !String(val).trim();
        });
        if (missing.length > 0) {
          toast.error(`Please enter ${missing.join(', ')} for ${item.product.name}`);
          return;
        }
      }
    }

    setLoading(true);

    try {
      const orderItems = cart.map(item => ({
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        price: item.product.price,
        player_id: playerIds[item.product.id] || null,
        server_id: serverIds[item.product.id] || null,
        credentials: credentials[item.product.id] || null,
        seller_id: item.product._seller_id || null
      }));

      const response = await axiosInstance.post(`/orders?user_id=${user.user_id}&user_email=${user.email}`, {
        items: orderItems,
        payment_method: paymentMethod,
        coupon_code: appliedCoupon?.code || null
      });

      const order = response.data;

      // Clear cart
      clearCart();

      if (paymentMethod === 'crypto_plisio' && (order.plisio_invoice_url || order.plisio_invoice_id)) {
        const invoiceUrl = buildPlisioInvoiceUrl(order.plisio_invoice_url, order.plisio_invoice_id);
        toast.success('Redirecting to payment...');
        openPlisioInvoice(invoiceUrl, order.plisio_invoice_id || order.id);
        navigate(`/track/${order.id}`);
      } else {
        toast.success(paymentMethod === 'wallet' ? 'Paid with wallet successfully!' : 'Order created! Please submit your payment proof.');
        navigate(`/track/${order.id}`);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(error.response?.data?.detail || 'Error creating order');
    } finally {
      setLoading(false);
    }
  };

  const applyCoupon = async () => {
    const code = (couponCode || '').trim();
    if (!code) {
      toast.error('Enter a coupon code');
      return;
    }
    setApplyingCoupon(true);
    try {
      const res = await axiosInstance.get(`/coupons/validate?code=${encodeURIComponent(code)}&amount=${subtotal}${user?.id ? `&user_id=${user.id}` : ''}`);
      setDiscountAmount(res.data?.discount_amount || 0);
      setAppliedCoupon({ code: res.data?.code || code.toUpperCase() });
      toast.success('Coupon applied');
    } catch (e) {
      setDiscountAmount(0);
      setAppliedCoupon(null);
      toast.error(e.response?.data?.detail || 'Invalid coupon');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const clearCoupon = () => {
    setCouponCode('');
    setDiscountAmount(0);
    setAppliedCoupon(null);
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
        <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-12" data-testid="checkout-title">
          Checkout
        </h1>

        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Payment Method */}
          <Card className="glass-effect border-white/20" data-testid="payment-method-card">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold text-white mb-6">Payment Method</h2>
              
              <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                <div className="space-y-4">
                  {/* Wallet Payment */}
                  <label
                    className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition ${
                      paymentMethod === 'wallet' ? 'border-green-400 bg-green-400/10' : 'border-white/20 hover:border-white/40'
                    }`}
                    onClick={() => {
                      if (walletBalance === null) loadWalletBalance();
                    }}
                  >
                    <RadioGroupItem value="wallet" className="mt-1" />
                    <div className="ml-4 flex-1">
                      <div className="flex items-center gap-2">
                        <Wallet className="text-green-400" size={20} />
                        <span className="text-white font-semibold">Wallet Balance</span>
                      </div>
                      <p className="text-white/70 text-sm mt-1">
                        {walletBalance === null ? 'Click to load wallet balance' : `Balance: $${Number(walletBalance).toFixed(2)}`}
                      </p>
                      {walletBalance !== null && walletBalance + 1e-9 < total && (
                        <p className="text-red-300 text-xs mt-1">Insufficient balance. Top up your wallet first.</p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-2 border-white/20 text-white"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate('/wallet');
                        }}
                      >
                        Top up wallet
                      </Button>
                    </div>
                  </label>

                  {/* Crypto Payment */}
                  <label className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition ${
                    paymentMethod === 'crypto_plisio' ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/20 hover:border-white/40'
                  }`}>
                    <RadioGroupItem value="crypto_plisio" className="mt-1" />
                    <div className="ml-4">
                      <div className="flex items-center gap-2">
                        <Wallet className="text-green-400" size={20} />
                        <span className="text-white font-semibold">Cryptocurrency (Automatic)</span>
                      </div>
                      <p className="text-white/70 text-sm mt-1">Bitcoin, Ethereum, USDT - Instant delivery</p>
                    </div>
                  </label>

                  {/* NatCash - Automatic */}
                  {settings?.payment_gateways?.natcash?.enabled && (
                    <label className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition ${
                      paymentMethod === 'natcash' ? 'border-yellow-400 bg-yellow-400/10' : 'border-white/20 hover:border-white/40'
                    }`}>
                      <RadioGroupItem value="natcash" className="mt-1" />
                      <div className="ml-4">
                        <div className="flex items-center gap-2">
                          <CreditCard className="text-yellow-400" size={20} />
                          <span className="text-white font-semibold">NatCash</span>
                          <span className="text-yellow-400/70 text-xs">(HTG)</span>
                          <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 text-[10px] font-bold uppercase tracking-wider">Auto</span>
                        </div>
                        <p className="text-white/70 text-sm mt-1">Peman otomatik — NatCash/Natcom</p>
                      </div>
                    </label>
                  )}

                  {/* Binance Pay - Automatic */}
                  {settings?.payment_gateways?.binance_pay?.enabled && (
                    <label className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition ${
                      paymentMethod === 'binance_pay' ? 'border-green-400 bg-green-400/10' : 'border-white/20 hover:border-white/40'
                    }`}>
                      <RadioGroupItem value="binance_pay" className="mt-1" />
                      <div className="ml-4">
                        <div className="flex items-center gap-2">
                          <CreditCard className="text-green-400" size={20} />
                          <span className="text-white font-semibold">Binance Pay</span>
                          <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 text-[10px] font-bold uppercase tracking-wider">Auto</span>
                        </div>
                        <p className="text-white/70 text-sm mt-1">Auto-verified</p>
                        {settings.payment_gateways.binance_pay.email && (
                          <p className="text-white/60 text-xs mt-1">ID: {settings.payment_gateways.binance_pay.email}</p>
                        )}
                      </div>
                    </label>
                  )}
                </div>
              </RadioGroup>

              {/* Player ID Section */}
              {needsPlayerIds && (
                <div className="mt-6 border-t border-white/20 pt-6">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Gamepad2 className="text-green-400" size={24} />
                    Player IDs Required
                  </h3>
                  <div className="space-y-4">
                    {cart.filter(item => item.product.requires_player_id).map(item => {
                      const gc = getGameConfig(item.product.name);
                      const needsServerId = item.product.requires_server_id || gc?.requiresServerId;
                      const pidLabel = item.product.player_id_label || gc?.playerIdLabel || 'Player ID';
                      const sidLabel = item.product.server_id_label || gc?.serverIdLabel || 'Server ID';
                      const sidPlaceholder = gc?.serverIdPlaceholder || `Enter ${sidLabel}`;
                      return (
                      <div key={item.product.id}>
                        <Label htmlFor={`player-id-${item.product.id}`} className="text-white">
                          {pidLabel} for {item.product.name}
                        </Label>
                        <div className="flex gap-2 mt-2">
                          <Input
                            id={`player-id-${item.product.id}`}
                            value={playerIds[item.product.id] || ''}
                            onChange={(e) => { handlePlayerIdChange(item.product.id, e.target.value); setVerifyStatus(prev => ({ ...prev, [item.product.id]: null })); }}
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50 flex-1"
                            placeholder={`Enter your ${pidLabel}`}
                            required
                            data-testid={`player-id-${item.product.id}`}
                          />
                          {item.product.g2bulk_game_code && (
                            <Button type="button" size="sm" variant="outline"
                              onClick={() => verifyPlayerId(item.product)}
                              disabled={verifying[item.product.id] || !playerIds[item.product.id]}
                              className="border-white/20 text-white hover:bg-white/10 whitespace-nowrap">
                              {verifying[item.product.id] ? <Loader2 size={14} className="animate-spin" /> : 'Verify'}
                            </Button>
                          )}
                        </div>
                        {verifyStatus[item.product.id] && (
                          <div className={`flex items-center gap-2 mt-1 text-xs ${verifyStatus[item.product.id].valid ? 'text-green-400' : 'text-red-400'}`}>
                            {verifyStatus[item.product.id].valid ? <CheckCircle size={14} /> : <XCircle size={14} />}
                            {verifyStatus[item.product.id].message}
                          </div>
                        )}
                        {needsServerId && (
                          <div className="mt-3">
                            <Label htmlFor={`server-id-${item.product.id}`} className="text-white">
                              {sidLabel} for {item.product.name}
                            </Label>
                            <Input
                              id={`server-id-${item.product.id}`}
                              value={serverIds[item.product.id] || ''}
                              onChange={(e) => handleServerIdChange(item.product.id, e.target.value)}
                              className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mt-2"
                              placeholder={sidPlaceholder}
                              required
                              data-testid={`server-id-${item.product.id}`}
                            />
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Credentials Section */}
              {needsCredentials && (
                <div className="mt-6 border-t border-white/20 pt-6">
                  <h3 className="text-xl font-bold text-white mb-4">
                    Account Credentials Required
                  </h3>
                  <div className="space-y-6">
                    {cart.filter(item => item.product.requires_credentials).map(item => {
                      const fields = getCredentialFields(item.product);
                      return (
                        <div key={item.product.id} className="p-4 rounded-lg bg-white/5 border border-white/10">
                          <p className="text-white font-semibold mb-3">{item.product.name}</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {fields.map((field) => (
                              <div key={field}>
                                <Label className="text-white capitalize">{field}</Label>
                                <Input
                                  type={field.toLowerCase().includes('password') ? 'password' : 'text'}
                                  value={(credentials[item.product.id] || {})[field] || ''}
                                  onChange={(e) => handleCredentialChange(item.product.id, field, e.target.value)}
                                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mt-2"
                                  placeholder={`Enter ${field}`}
                                  required
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                <div className="flex justify-between text-white/80">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-300">
                    <span>Discount{appliedCoupon?.code ? ` (${appliedCoupon.code})` : ''}:</span>
                    <span>- ${Number(discountAmount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-white text-xl font-bold">
                  <span>Total:</span>
                  <span data-testid="checkout-total">${total.toFixed(2)}</span>
                </div>
              </div>

              {/* Coupon */}
              <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-lg">
                <Label className="text-white">Coupon Code</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    className="bg-white/10 border-white/20 text-white"
                    placeholder="Enter coupon"
                  />
                  <Button
                    type="button"
                    onClick={applyCoupon}
                    disabled={applyingCoupon}
                    className="bg-white text-green-600 hover:bg-gray-100"
                  >
                    {applyingCoupon ? 'Applying...' : 'Apply'}
                  </Button>
                  {appliedCoupon && (
                    <Button type="button" variant="outline" className="border-white/20 text-white" onClick={clearCoupon}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <Button
                className="w-full bg-white text-green-600 hover:bg-gray-100 py-6 text-lg"
                onClick={handleCheckout}
                disabled={loading || (paymentMethod === 'wallet' && walletBalance !== null && walletBalance + 1e-9 < total)}
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
