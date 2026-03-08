import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Package, Clock, CheckCircle, AlertCircle, Upload, ShieldCheck, MessageSquare, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { buildPlisioInvoiceUrl, openPlisioInvoice } from '../utils/plisioInvoice';
import BinancePaySection from '../components/BinancePaySection';

const OrderTrackingPage = ({ user, logout, settings }) => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [proofUrl, setProofUrl] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (orderId) {
      loadOrder();
    }
  }, [orderId]);

  useEffect(() => {
    if (!order) return;
    const autoVerifyMethods = ['crypto_plisio', 'payerurl'];
    if (autoVerifyMethods.includes(order.payment_method) && order.payment_status === 'paid') {
      navigate(`/payment-success?type=order&id=${order.id}`, { replace: true });
      return;
    }
    if (
      order.payment_method === 'crypto_plisio' &&
      order.payment_status === 'pending' &&
      (order.plisio_invoice_url || order.plisio_invoice_id)
    ) {
      const invoiceUrl = buildPlisioInvoiceUrl(order.plisio_invoice_url, order.plisio_invoice_id);
      openPlisioInvoice(invoiceUrl, order.plisio_invoice_id || order.id);
    }
  }, [order, navigate]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadOrder = async () => {
    try {
      const response = await axiosInstance.get(`/orders/${orderId}`);
      setOrder(response.data);
    } catch (error) {
      console.error('Error loading order:', error);
      toast.error('Error loading order');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB');
      return;
    }
    
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axiosInstance.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setProofUrl(response.data.url);
      toast.success('Image uploaded!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitProof = async () => {
    if (!proofUrl || !transactionId) {
      toast.error('Please fill all fields');
      return;
    }

    setSubmitting(true);

    try {
      await axiosInstance.post('/payments/manual-proof', {
        order_id: orderId,
        transaction_id: transactionId,
        payment_proof_url: proofUrl
      });

      toast.success('Payment proof submitted successfully!');
      loadOrder();
      setProofUrl('');
      setTransactionId('');
    } catch (error) {
      console.error('Error submitting proof:', error);
      toast.error('Error submitting payment proof');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'pending': return <Clock className="text-yellow-400" size={24} />;
      case 'processing': return <Clock className="text-blue-400" size={24} />;
      case 'completed': return <CheckCircle className="text-green-400" size={24} />;
      case 'cancelled': return <AlertCircle className="text-red-400" size={24} />;
      default: return <Package className="text-gray-400" size={24} />;
    }
  };

  const getPaymentStatusBadge = (status) => {
    const badges = {
      'pending': 'bg-yellow-500/20 text-yellow-400',
      'pending_verification': 'bg-blue-500/20 text-blue-400',
      'paid': 'bg-green-500/20 text-green-400',
      'failed': 'bg-red-500/20 text-red-400'
    };
    return badges[status] || 'bg-gray-500/20 text-gray-400';
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg">
        <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
        <div className="container mx-auto px-4 py-20 text-center text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen gradient-bg">
        <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
        <div className="container mx-auto px-4 py-20 text-center text-white text-xl">Order not found</div>
      </div>
    );
  }

  const subscriptionEnd = order.subscription_end_date ? new Date(order.subscription_end_date) : null;
  const invoiceUrl = buildPlisioInvoiceUrl(order.plisio_invoice_url, order.plisio_invoice_id);
  const deliveryDetails = (order.delivery_info?.details || '').trim();
  const deliveryItems = Array.isArray(order.delivery_info?.items)
    ? order.delivery_info.items.filter((item) => item?.details && String(item.details).trim())
    : [];
  const hasDeliveryInfo = order.delivery_info && (deliveryDetails || deliveryItems.length > 0);
  const autoDeliveryFailed = order.auto_delivery_failed_reason && !hasDeliveryInfo;
  const manualPaymentMethods = ['paypal', 'skrill', 'moncash', 'binance_pay', 'zelle', 'cashapp'];
  const isManualPayment = manualPaymentMethods.includes(order.payment_method);
  const proofSubmitted = Boolean(order.payment_proof_url);
  const isAwaitingReview = order.payment_status === 'pending_verification' || proofSubmitted;
  const showManualProofForm = isManualPayment && order.payment_status === 'pending' && !proofSubmitted;
  const subscriptionRemaining = (() => {
    if (!subscriptionEnd) return null;
    const diffMs = subscriptionEnd.getTime() - now;
    const diff = Math.max(0, diffMs);
    const days = Math.floor(diff / (24 * 3600 * 1000));
    const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
    const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    const secs = Math.floor((diff % (60 * 1000)) / 1000);
    return { diffMs, days, hours, mins, secs };
  })();

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-12" data-testid="tracking-title">
          Order Tracking
        </h1>

        <div className="max-w-4xl mx-auto space-y-6">
          {/* Order Status */}
          <Card className="glass-effect border-white/20" data-testid="order-status">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">Order #{order.id.slice(0, 8)}</h2>
                  <p className="text-white/70">Date: {new Date(order.created_at).toLocaleDateString('en-US')}</p>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(order.order_status)}
                  <span className="text-white font-semibold capitalize" data-testid="order-status-text">{order.order_status}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-white/80">Payment Status:</span>
                  <span className={`px-3 py-1 rounded text-sm font-semibold ${getPaymentStatusBadge(order.payment_status)}`} data-testid="payment-status">
                    {order.payment_status}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/80">Payment Method:</span>
                  <span className="text-white font-semibold">{
                    order.payment_method === 'crypto_plisio' ? 'Cryptocurrency (Plisio)' :
                    order.payment_method === 'payerurl' ? 'Crypto (PayerURL)' :
                    order.payment_method === 'binance_pay' ? 'Binance Pay' :
                    order.payment_method
                  }</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/80">Total:</span>
                  <span className="text-white font-bold text-xl" data-testid="order-total">${order.total_amount.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Auto-delivery failure notice */}
          {autoDeliveryFailed && (
            <Card className="glass-effect border-orange-500/30 border-2">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <AlertTriangle className="text-orange-400" size={24} />
                  <h3 className="text-lg font-bold text-orange-400">Automatic delivery pending</h3>
                </div>
                <p className="text-white/70 text-sm">
                  {order.auto_delivery_failed_reason}. Our team will process your order manually.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Delivery Information - Shows when order is completed */}
          {hasDeliveryInfo && (
            <Card className="glass-effect border-green-500/30 border-2" data-testid="delivery-info">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle className="text-green-400" size={28} />
                  <h3 className="text-2xl font-bold text-green-400">Order Delivered!</h3>
                </div>
                <p className="text-white/70 text-sm mb-4">
                  Delivered on: {new Date(order.delivery_info.delivered_at).toLocaleString('en-US')}
                </p>
                {deliveryDetails && (
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <Label className="text-white font-semibold mb-2 block">Delivery Notes:</Label>
                    <pre className="text-green-300 whitespace-pre-wrap break-words font-mono text-sm">
                      {deliveryDetails}
                    </pre>
                  </div>
                )}
                {deliveryItems.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <Label className="text-white font-semibold block">Item Delivery Details:</Label>
                    {deliveryItems.map((item, index) => (
                      <div
                        key={`${item.product_id || item.product_name || 'item'}-${index}`}
                        className="bg-white/5 border border-white/10 rounded-lg p-4"
                      >
                        <p className="text-white/80 text-sm font-semibold mb-2">
                          {item.product_name || item.product_id || `Item ${index + 1}`}
                        </p>
                        <pre className="text-green-300 whitespace-pre-wrap break-words font-mono text-sm">
                          {item.details}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-white/60 text-xs mt-3">
                  💡 Please save this information. Contact support if you have any issues.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Escrow Actions */}
          {order.escrow_status === 'held' && order.order_status === 'completed' && (
            <Card className="glass-effect border-yellow-500/30 border-2">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck className="text-yellow-400" size={28} />
                  <h3 className="text-xl font-bold text-yellow-400">Payment in Escrow</h3>
                </div>
                <p className="text-white/70 text-sm mb-4">
                  Your payment is held securely. Please confirm if the delivery is correct, or open a dispute if there's an issue.
                </p>
                <div className="flex gap-3">
                  <Button className="flex-1 bg-green-600 text-white" onClick={async () => {
                    try {
                      await axiosInstance.post(`/orders/${order.id}/escrow?user_id=${order.user_id}`, { action: 'confirm' });
                      toast.success('Delivery confirmed! Seller payment will release in 3 days.');
                      window.location.reload();
                    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
                  }}>
                    <CheckCircle size={18} className="mr-2" /> Confirm Delivery
                  </Button>
                  <Button variant="outline" className="flex-1 border-red-400 text-red-400" onClick={async () => {
                    const reason = prompt('Describe the issue:');
                    if (!reason) return;
                    try {
                      await axiosInstance.post(`/orders/${order.id}/escrow?user_id=${order.user_id}`, { action: 'dispute', reason });
                      toast.success('Dispute opened');
                      window.location.reload();
                    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
                  }}>
                    <AlertTriangle size={18} className="mr-2" /> Open Dispute
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {order.escrow_status === 'buyer_confirmed' && (
            <Card className="glass-effect border-green-500/20">
              <CardContent className="p-4 text-center">
                <p className="text-green-300">Delivery confirmed. Seller payment releases on {order.escrow_release_at ? new Date(order.escrow_release_at).toLocaleDateString() : '3 days'}.</p>
              </CardContent>
            </Card>
          )}

          {order.escrow_status === 'disputed' && (
            <Card className="glass-effect border-red-500/20">
              <CardContent className="p-4 flex items-center justify-between">
                <p className="text-red-300">Dispute is open. Our team will review it.</p>
                <Button size="sm" onClick={() => window.location.href = '/disputes'} className="bg-red-600 text-white text-xs">
                  <AlertTriangle size={14} className="mr-1" /> View Dispute
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Message Seller */}
          {order.items?.some(i => i.seller_id) && order.payment_status === 'paid' && (
            <Card className="glass-effect border-green-500/20">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="text-green-400" size={20} />
                  <span className="text-white text-sm">Contact the seller about this order</span>
                </div>
                <Button size="sm" onClick={() => {
                  const sellerId = order.items.find(i => i.seller_id)?.seller_id;
                  if (sellerId) {
                    window.location.href = `/messages?order=${order.id}&seller=${sellerId}`;
                  }
                }} className="bg-cyan-600 text-white text-xs">
                  <MessageSquare size={14} className="mr-1" /> Message
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Order Items */}
          <Card className="glass-effect border-white/20" data-testid="order-items">
            <CardContent className="p-6">
              <h3 className="text-xl font-bold text-white mb-4">Order Items</h3>
              <div className="space-y-3">
                {order.items.map((item, index) => (
                  <div key={index} className="flex justify-between items-center text-white" data-testid={`order-item-${index}`}>
                    <div>
                      <p className="font-semibold">{item.product_name}</p>
                      <p className="text-white/70 text-sm">Quantity: {item.quantity}</p>
                      {item.player_id && (
                        <p className="text-green-400 text-sm">Player ID: {item.player_id}</p>
                      )}
                    </div>
                    <p className="font-bold">${(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Subscription Countdown */}
          {subscriptionEnd && subscriptionRemaining && (
            <Card className="glass-effect border-green-500/30 border-2">
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-white mb-2">Subscription Status</h3>
                <p className="text-white/70 text-sm">Ends: {subscriptionEnd.toLocaleString()}</p>
                {subscriptionRemaining.diffMs > 0 ? (
                  <p className="text-green-300 font-mono text-2xl mt-3">
                    {subscriptionRemaining.days}d {String(subscriptionRemaining.hours).padStart(2, '0')}:{String(subscriptionRemaining.mins).padStart(2, '0')}:{String(subscriptionRemaining.secs).padStart(2, '0')}
                  </p>
                ) : (
                  <p className="text-red-300 font-semibold mt-3">Expired</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Plisio Crypto Payment Instructions */}
          {order.payment_method === 'crypto_plisio' && order.payment_status === 'pending' && order.plisio_invoice_id && (
            <Card className="glass-effect border-green-500/30 border-2" data-testid="plisio-payment-card">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Package className="text-green-400" size={28} />
                  <h3 className="text-2xl font-bold text-green-400">Complete Your Crypto Payment</h3>
                </div>
                
                <div className="bg-cyan-500/10 border border-green-500/30 rounded-lg p-5 space-y-4">
                  <p className="text-white/90 text-lg font-semibold">
                    Payment Amount: <span className="text-green-300">${order.total_amount.toFixed(2)} USD</span>
                  </p>
                  
                  <div className="space-y-2">
                    <p className="text-white/80 text-sm">
                      Your Plisio invoice is opening automatically.
                    </p>
                    {invoiceUrl && (
                      <p className="text-white/70 text-sm">
                        If it did not open,{" "}
                        <a
                          href={invoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-200 underline"
                        >
                          open the invoice here
                        </a>
                        .
                      </p>
                    )}
                  </div>
                  
                  <div className="border-t border-green-500/30 pt-4 mt-4">
                    <p className="text-white/70 text-sm">
                      💡 You can pay with Bitcoin, Ethereum, USDT, and other cryptocurrencies.
                    </p>
                    <p className="text-white/70 text-sm mt-2">
                      ⏱️ Your order will be automatically confirmed once payment is received.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* PayerURL Crypto Payment */}
          {order.payment_method === 'payerurl' && order.payment_status === 'pending' && order.payerurl_payment_url && (
            <Card className="glass-effect border-yellow-500/30 border-2" data-testid="payerurl-payment-card">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Package className="text-yellow-400" size={28} />
                  <h3 className="text-2xl font-bold text-yellow-400">Complete Your Crypto Payment</h3>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-5 space-y-4">
                  <p className="text-white/90 text-lg font-semibold">
                    Payment Amount: <span className="text-yellow-300">${order.total_amount.toFixed(2)} USD</span>
                  </p>

                  <div className="space-y-3">
                    <p className="text-white/80 text-sm">
                      Click the button below to complete your crypto payment via PayerURL.
                    </p>
                    <a
                      href={order.payerurl_payment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-6 py-3 rounded-lg transition"
                    >
                      💰 Pay with Crypto
                    </a>
                  </div>

                  <div className="border-t border-yellow-500/30 pt-4 mt-4 space-y-2">
                    <p className="text-white/70 text-sm">
                      💡 Supported: USDT, BTC, ETH, and other cryptocurrencies.
                    </p>
                    <p className="text-white/70 text-sm">
                      ⏱️ Your order will be automatically confirmed once payment is received.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Manual Payment Review Pending */}
          {isManualPayment && isAwaitingReview && (
            <Card className="glass-effect border-blue-500/30 border-2" data-testid="payment-review-card">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <Clock className="text-blue-400" size={24} />
                  <h3 className="text-xl font-bold text-blue-300">Payment Under Review</h3>
                </div>
                <p className="text-white/80 text-sm">
                  Your payment proof has been received. Our team is reviewing it now.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Binance Pay auto-verify section */}
          {showManualProofForm && order.payment_method === 'binance_pay' && (
            <BinancePaySection
              order={order}
              settings={settings}
              onVerified={() => loadOrder()}
            />
          )}

          {/* Manual Payment Proof Upload (non-Binance methods) */}
          {showManualProofForm && order.payment_method !== 'binance_pay' && (
            <Card className="glass-effect border-white/20" data-testid="payment-proof-form">
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                  <Upload className="mr-2" size={24} />
                  Submit Payment Proof
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="transactionId" className="text-white">Transaction ID</Label>
                    <Input
                      id="transactionId"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                      placeholder="Enter your transaction ID"
                      data-testid="transaction-id-input"
                    />
                  </div>

                  <div>
                    <Label htmlFor="proofUrl" className="text-white">Payment Proof</Label>
                    <div className="space-y-3 mt-2">
                      {/* File Upload Button */}
                      <div className="flex gap-3">
                        <label className="flex-1">
                          <div className="bg-cyan-500 hover:bg-cyan-600 text-white px-4 py-3 rounded cursor-pointer text-center font-semibold">
                            {uploading ? 'Uploading...' : '📤 Upload Screenshot'}
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileUpload}
                            className="hidden"
                            disabled={uploading}
                          />
                        </label>
                      </div>
                      
                      {/* OR Divider */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 border-t border-white/20"></div>
                        <span className="text-white/50 text-sm">OR</span>
                        <div className="flex-1 border-t border-white/20"></div>
                      </div>
                      
                      {/* Link Input */}
                      <Input
                        id="proofUrl"
                        value={proofUrl}
                        onChange={(e) => setProofUrl(e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                        placeholder="Paste image link (imgur, etc.)"
                        data-testid="proof-url-input"
                      />
                      
                      {/* Preview */}
                      {proofUrl && (
                        <div className="mt-2">
                          <p className="text-white/70 text-xs mb-2">Preview:</p>
                          <img src={proofUrl} alt="Proof" className="max-h-32 rounded border border-white/20" />
                        </div>
                      )}
                    </div>
                  </div>

                  <Button 
                    onClick={handleSubmitProof}
                    disabled={submitting}
                    className="w-full bg-white text-green-600 hover:bg-gray-100"
                    data-testid="submit-proof-btn"
                  >
                    {submitting ? 'Submitting...' : 'Submit Proof'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payment Proof Display */}
          {order.payment_proof_url && (
            <Card className="glass-effect border-white/20">
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-white mb-4">Payment Proof Submitted</h3>
                <div className="space-y-2">
                  <p className="text-white/70">Transaction ID: <span className="text-white font-semibold">{order.transaction_id}</span></p>
                  <a 
                    href={order.payment_proof_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    View Payment Proof
                  </a>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default OrderTrackingPage;
