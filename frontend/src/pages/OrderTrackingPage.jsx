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
import { Package, Clock, CheckCircle, AlertCircle, Upload, ShieldCheck, MessageSquare, AlertTriangle, Star, Copy } from 'lucide-react';
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
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  useEffect(() => {
    if (orderId) {
      loadOrder();
    }
  }, [orderId]);

  useEffect(() => {
    if (!order) return;
    const autoVerifyMethods = ['crypto_plisio'];
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

  useEffect(() => {
    if (!order) return;
    if (order.payment_method !== 'natcash' || order.payment_status !== 'pending') return;
    const poll = setInterval(async () => {
      try {
        const res = await axiosInstance.post(`/natcash/verify/${order.id}`);
        if (res.data.verified) {
          toast.success(res.data.message || 'Pèman konfime!');
          loadOrder();
          clearInterval(poll);
        }
      } catch (_) { /* silent */ }
    }, 10000);
    return () => clearInterval(poll);
  }, [order?.id, order?.payment_method, order?.payment_status]);

  useEffect(() => {
    if (!order) return;
    if (order.payment_method !== 'binance_pay' || order.payment_status !== 'pending') return;
    const poll = setInterval(async () => {
      try {
        const res = await axiosInstance.post('/payments/binance-pay/verify', { order_id: order.id });
        if (res.data.verified) {
          toast.success(res.data.message || 'Payment verified!');
          loadOrder();
          clearInterval(poll);
        }
      } catch (_) { /* silent */ }
    }, 10000);
    return () => clearInterval(poll);
  }, [order?.id, order?.payment_method, order?.payment_status]);

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
      const res = await axiosInstance.post('/payments/manual-proof', {
        order_id: orderId,
        transaction_id: transactionId,
        payment_proof_url: proofUrl
      });

      const status = res.data?.payment_status;
      if (status === 'paid') {
        toast.success('Payment approved!');
        navigate(`/payment-success?type=order&id=${orderId}`, { replace: true });
      } else {
        toast.success('Payment proof submitted successfully!');
        loadOrder();
      }
      setProofUrl('');
      setTransactionId('');
    } catch (error) {
      console.error('Error submitting proof:', error);
      toast.error(error.response?.data?.detail || 'Error submitting payment proof');
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
  const proofSubmitted = Boolean(order.payment_proof_url);
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
                    order.payment_method === 'binance_pay' ? 'Binance Pay (Auto)' :
                    order.payment_method === 'binance_pay_manual' ? 'Binance Pay (Manual)' :
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

          {/* NatCash Payment Instructions */}
          {order.payment_method === 'natcash' && order.payment_status === 'pending' && order.natcash_reference && (
            <Card className="glass-effect border-yellow-500/30 border-2">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold text-yellow-400 mb-4">📱 Pèman NatCash</h3>
                <div className="space-y-4">
                  {settings?.payment_gateways?.natcash?.account_name && (
                    <div className="bg-white/5 rounded-lg p-3">
                      <p className="text-white/50 text-xs">Non Kont</p>
                      <p className="text-white font-bold text-lg">{settings.payment_gateways.natcash.account_name}</p>
                    </div>
                  )}
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-white/50 text-xs">Nimewo NatCash</p>
                    <p className="text-white font-bold text-xl">{settings?.payment_gateways?.natcash?.phone || 'N/A'}</p>
                    <button onClick={() => { navigator.clipboard.writeText(settings?.payment_gateways?.natcash?.phone || ''); toast.success('Kopye!'); }}
                      className="text-xs bg-white/10 border border-white/20 rounded-full px-4 py-1 text-white/70 mt-2 hover:bg-white/20 transition">📋 KOPYE</button>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-white/50 text-xs">Montan pou Voye</p>
                    <p className="text-yellow-400 font-bold text-xl">G {(order.total_amount * (settings?.natcash_usd_htg_rate || 135)).toFixed(2)}</p>
                    <button onClick={() => { navigator.clipboard.writeText((order.total_amount * (settings?.natcash_usd_htg_rate || 135)).toFixed(2)); toast.success('Kopye!'); }}
                      className="text-xs bg-white/10 border border-white/20 rounded-full px-4 py-1 text-white/70 mt-2 hover:bg-white/20 transition">📋 KOPYE</button>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-white/50 text-xs">Kòd Referans (mete nan kontni)</p>
                    <p className="text-white font-bold text-xl font-mono tracking-wider">{order.natcash_reference}</p>
                    <button onClick={() => { navigator.clipboard.writeText(order.natcash_reference); toast.success('Kopye!'); }}
                      className="text-xs bg-white/10 border border-white/20 rounded-full px-4 py-1 text-white/70 mt-2 hover:bg-white/20 transition">📋 KOPYE</button>
                  </div>
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-yellow-300 text-sm font-semibold mb-2">⏳ En attente de paiement</p>
                    <p className="text-white/70 text-sm font-semibold mb-2">Kijan pou peye ak NatCash:</p>
                    <ol className="text-white/60 text-xs space-y-1 list-decimal list-inside">
                      <li>Ouvri app NatCash ou</li>
                      <li>Voye montan egzak la nan nimewo ki endike a</li>
                      <li>Nan chan <strong className="text-white/80">"kontni"</strong>, mete kòd referans la</li>
                      <li>Sistèm nan ap verifye otomatikman</li>
                    </ol>
                    <p className="text-yellow-400/80 text-xs mt-2">⚠️ Nimewo ou voye a dwe menm ak nimewo ou te bay lè ou pase kòmand la</p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const res = await axiosInstance.post(`/natcash/verify/${order.id}`);
                        if (res.data.verified) {
                          toast.success(res.data.message);
                          loadOrder();
                        } else {
                          toast.error(res.data.message);
                        }
                      } catch (err) { toast.error(err.response?.data?.detail || 'Verification failed'); }
                    }}
                    className="w-full mt-3 py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg text-sm transition"
                  >
                    🔍 VERIFYE KOUNYE A
                  </button>
                  <p className="text-white/40 text-xs text-center">Sistèm nan ap tcheke otomatikman chak 10 segonn</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Auto-delivery pending notice */}
          {autoDeliveryFailed && (
            <Card className="glass-effect border-yellow-500/30 border-2">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <AlertTriangle className="text-yellow-400" size={24} />
                  <h3 className="text-lg font-bold text-yellow-400">Your top-up is pending</h3>
                </div>
                <p className="text-white/70 text-sm">
                  Your order has been received and is being processed. Please be patient while we complete your delivery. You will be notified once it's done.
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
                  <h3 className="text-2xl font-bold text-green-400">
                    {order.delivery_info?.partial ? 'Partial Delivery' : 'Order Delivered!'}
                  </h3>
                </div>
                {order.delivery_info?.delivered_at && (
                  <p className="text-white/70 text-sm mb-4">
                    Delivered on: {new Date(order.delivery_info.delivered_at).toLocaleString('en-US')}
                  </p>
                )}
                {order.delivery_info?.partial && order.delivery_info?.pending_manual?.length > 0 && (
                  <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-yellow-300 text-sm font-semibold">Some items require manual delivery:</p>
                    <ul className="text-yellow-200/80 text-sm mt-1 list-disc list-inside">
                      {order.delivery_info.pending_manual.map((name, i) => (
                        <li key={i}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {deliveryItems.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-white font-semibold block">Your Codes / Credentials:</Label>
                    {deliveryItems.map((item, index) => (
                      <div
                        key={`${item.product_id || item.product_name || 'item'}-${index}`}
                        className="bg-white/5 border border-white/10 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-white/80 text-sm font-semibold">
                            {item.product_name || item.product_id || `Item ${index + 1}`}
                          </p>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(item.details).catch(() => {
                                const el = document.createElement('textarea');
                                el.value = item.details;
                                document.body.appendChild(el);
                                el.select();
                                document.execCommand('copy');
                                document.body.removeChild(el);
                              });
                              toast.success('Code copied!');
                            }}
                            className="text-white/40 hover:text-green-400 transition p-1.5 rounded hover:bg-white/5"
                            title="Copy code"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                        <pre className="text-green-300 whitespace-pre-wrap break-words font-mono text-sm bg-black/20 rounded p-3">
                          {item.details}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
                {deliveryDetails && deliveryItems.length === 0 && (
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-white font-semibold">Delivery Details:</Label>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(deliveryDetails).catch(() => {});
                          toast.success('Copied!');
                        }}
                        className="text-white/40 hover:text-green-400 transition p-1.5 rounded hover:bg-white/5"
                        title="Copy"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    <pre className="text-green-300 whitespace-pre-wrap break-words font-mono text-sm bg-black/20 rounded p-3">
                      {deliveryDetails}
                    </pre>
                  </div>
                )}
                <p className="text-white/60 text-xs mt-3">
                  💡 Please save this information. Contact support if you have any issues.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Seller Deliveries fallback (for orders before the fix) */}
          {!hasDeliveryInfo && order.seller_deliveries?.length > 0 && (
            <Card className="glass-effect border-green-500/30 border-2" data-testid="seller-delivery-info">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle className="text-green-400" size={28} />
                  <h3 className="text-2xl font-bold text-green-400">Order Delivered!</h3>
                </div>
                {order.seller_deliveries.map((sd, sdIdx) => (
                  <div key={sdIdx} className="mb-3">
                    {sd.delivered_at && (
                      <p className="text-white/70 text-sm mb-2">
                        Delivered on: {new Date(sd.delivered_at).toLocaleString('en-US')}
                      </p>
                    )}
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-white font-semibold">Your Codes:</Label>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(sd.codes.join('\n')).catch(() => {});
                            toast.success('Codes copied!');
                          }}
                          className="text-white/40 hover:text-green-400 transition p-1.5 rounded hover:bg-white/5"
                          title="Copy codes"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <pre className="text-green-300 whitespace-pre-wrap break-words font-mono text-sm bg-black/20 rounded p-3">
                        {sd.codes.join('\n')}
                      </pre>
                    </div>
                    {sd.note && (
                      <p className="text-white/60 text-sm mt-2">Note: {sd.note}</p>
                    )}
                  </div>
                ))}
                <p className="text-white/60 text-xs mt-3">
                  💡 Please save this information. Contact support if you have any issues.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Escrow Actions */}
          {order.escrow_status === 'held' && order.order_status === 'completed' && (
            <Card className="rounded-xl bg-[#141414] border border-yellow-500/20">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <ShieldCheck className="text-yellow-400" size={24} />
                  <h3 className="text-lg font-bold text-yellow-400">Payment in Escrow</h3>
                </div>
                <p className="text-white/60 text-sm mb-4">
                  Your payment is held securely. Please verify the delivery and confirm, or open a dispute if something is wrong.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button className="flex-1 bg-green-500 hover:bg-green-600 text-black font-semibold rounded-lg py-3" onClick={async () => {
                    if (!window.confirm('Are you sure the delivery is correct? This will release payment to the seller after 3 days.')) return;
                    try {
                      await axiosInstance.post(`/orders/${order.id}/escrow?user_id=${order.user_id}`, { action: 'confirm' });
                      toast.success('Delivery confirmed! Seller payment will release in 3 days.');
                      loadOrder();
                    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
                  }}>
                    <CheckCircle size={18} className="mr-2" /> Confirm Delivery
                  </Button>
                  <Button className="flex-1 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 font-semibold rounded-lg py-3" onClick={async () => {
                    const reason = window.prompt('Describe the issue with your order:');
                    if (!reason || !reason.trim()) return;
                    try {
                      await axiosInstance.post(`/orders/${order.id}/escrow?user_id=${order.user_id}`, { action: 'dispute', reason: reason.trim() });
                      toast.success('Dispute opened. Our team will review it.');
                      loadOrder();
                    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
                  }}>
                    <AlertTriangle size={18} className="mr-2" /> Open Dispute
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {order.escrow_status === 'buyer_confirmed' && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
              <CheckCircle className="text-green-400 mx-auto mb-2" size={24} />
              <p className="text-green-300 font-semibold text-sm">Delivery confirmed</p>
              <p className="text-white/40 text-xs mt-1">Seller payment releases on {order.escrow_release_at ? new Date(order.escrow_release_at).toLocaleDateString() : 'in 3 days'}</p>
            </div>
          )}

          {order.escrow_status === 'disputed' && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-red-400" size={20} />
                <p className="text-red-300 text-sm font-semibold">Dispute is open. Our team will review it.</p>
              </div>
              <Button size="sm" onClick={() => window.location.href = '/disputes'} className="bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg">
                View Dispute
              </Button>
            </div>
          )}

          {order.escrow_status === 'released' && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
              <CheckCircle className="text-green-400 mx-auto mb-2" size={24} />
              <p className="text-green-300 font-semibold text-sm">Escrow released - Seller has been paid</p>
            </div>
          )}

          {order.escrow_status === 'refunded' && (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
              <CheckCircle className="text-blue-400 mx-auto mb-2" size={24} />
              <p className="text-blue-300 font-semibold text-sm">Dispute resolved — You have been refunded</p>
              <p className="text-white/40 text-xs mt-1">The refund has been credited to your wallet</p>
            </div>
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

          {/* Binance Pay auto-verify section */}
          {order.payment_method === 'binance_pay' && order.payment_status === 'pending' && !proofSubmitted && (
            <BinancePaySection
              order={order}
              settings={settings}
              onVerified={() => loadOrder()}
            />
          )}

          {/* Leave a Review for Seller */}
          {order.payment_status === 'paid' && order.items?.some(i => i.seller_id) && !reviewSubmitted && (
            <Card className="glass-effect border-yellow-500/20">
              <CardContent className="p-5">
                <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                  <Star className="text-yellow-400" size={20} /> Rate Your Seller
                </h3>
                <div className="flex gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <button key={i} onClick={() => setReviewRating(i)} className="p-1">
                      <Star size={28} className={i <= reviewRating ? 'text-yellow-400 fill-yellow-400' : 'text-white/20'} />
                    </button>
                  ))}
                  {reviewRating > 0 && <span className="text-yellow-400 font-bold ml-2 self-center">{reviewRating}/5</span>}
                </div>
                <Textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share your experience with this seller (optional)..."
                  className="bg-white/5 border-white/10 text-white mb-3 text-sm"
                  rows={3}
                />
                <Button
                  disabled={reviewRating === 0 || reviewSubmitting}
                  onClick={async () => {
                    const sellerId = order.items.find(i => i.seller_id)?.seller_id;
                    if (!sellerId || reviewRating === 0) return;
                    setReviewSubmitting(true);
                    try {
                      await axiosInstance.post(`/reviews?user_id=${user?.user_id || user?.id}`, {
                        order_id: order.id, seller_id: sellerId, rating: reviewRating,
                        comment: reviewComment.trim() || null,
                      });
                      toast.success('Review submitted! Thank you.');
                      setReviewSubmitted(true);
                    } catch (e) {
                      const msg = e.response?.data?.detail || 'Error submitting review';
                      if (msg.includes('already reviewed')) { setReviewSubmitted(true); toast.info('Already reviewed'); }
                      else toast.error(msg);
                    } finally { setReviewSubmitting(false); }
                  }}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-lg"
                >
                  {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                </Button>
              </CardContent>
            </Card>
          )}
          {reviewSubmitted && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
              <CheckCircle className="text-green-400 mx-auto mb-2" size={28} />
              <p className="text-green-300 font-semibold text-sm">Thank you for your review!</p>
            </div>
          )}

          {/* Payment Proof Display */}
          {order.payment_proof_url && (
            <Card className="glass-effect border-white/20">
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-white mb-4">Payment Proof Submitted</h3>
                <div className="space-y-2">
                  {order.transaction_id && (
                    <div className="flex items-center gap-2">
                      <p className="text-white/70">Transaction ID: <span className="text-white font-semibold font-mono">{order.transaction_id}</span></p>
                      <button
                        onClick={() => { navigator.clipboard.writeText(order.transaction_id).catch(() => {}); toast.success('Transaction ID copied!'); }}
                        className="text-white/40 hover:text-green-400 transition p-1"
                        title="Copy Transaction ID"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  )}
                  {order.payment_proof_url.startsWith('http') || order.payment_proof_url.startsWith('data:') ? (
                    <a 
                      href={order.payment_proof_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      View Payment Proof
                    </a>
                  ) : (
                    <p className="text-white/50 text-sm">
                      {order.payment_proof_url.startsWith('binance-pay') ? 'Auto-verified' :
                       order.payment_proof_url.startsWith('binance-') ? 'Auto-verified' :
                       'Proof submitted'}
                    </p>
                  )}
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
