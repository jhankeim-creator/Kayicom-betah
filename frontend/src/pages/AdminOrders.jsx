import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Eye, CheckCircle, XCircle, Send, Package } from 'lucide-react';
import { toast } from 'sonner';
import {
  canPreviewInlineImage,
  formatBytes,
  getInlineImageBytes,
  isInlineImage,
  openPaymentProof
} from '../utils/paymentProof';

const formatSubscriptionDurationLabel = (months) => {
  const value = Number(months);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value === 12) return '1 Year';
  return `${value} ${value === 1 ? 'Month' : 'Months'}`;
};

const getSubscriptionMeta = (order) => {
  if (!order?.subscription_end_date) return null;
  const end = new Date(order.subscription_end_date);
  const start = order.subscription_start_date ? new Date(order.subscription_start_date) : null;
  let durationLabel = '';
  if (start && !Number.isNaN(start.getTime())) {
    const durationMs = end.getTime() - start.getTime();
    if (durationMs > 0) {
      const months = Math.round(durationMs / (30 * 24 * 3600 * 1000));
      durationLabel = formatSubscriptionDurationLabel(months);
    }
  }
  return { start, end, durationLabel };
};

const AdminOrders = ({ user, logout, settings }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [deliveryDialog, setDeliveryDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [deliveryInfo, setDeliveryInfo] = useState('');
  const [deliveryItems, setDeliveryItems] = useState([]);
  const [refundDialog, setRefundDialog] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [rejectDialog, setRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [selectedRejectOrder, setSelectedRejectOrder] = useState(null);
  const [proofViewerOpen, setProofViewerOpen] = useState(false);
  const [selectedProofUrl, setSelectedProofUrl] = useState(null);
  const [proofZoom, setProofZoom] = useState(1);
  const [proofLoadError, setProofLoadError] = useState(false);
  const selectedProofIsInline = isInlineImage(selectedProofUrl);
  const selectedProofSize = selectedProofIsInline ? getInlineImageBytes(selectedProofUrl) : 0;
  const canPreviewSelectedProof = selectedProofIsInline && canPreviewInlineImage(selectedProofUrl);
  const selectedProofSizeLabel = selectedProofIsInline ? formatBytes(selectedProofSize) : null;
  const canRenderSelectedProof = selectedProofUrl && (!selectedProofIsInline || canPreviewSelectedProof) && !proofLoadError;

  useEffect(() => {
    loadOrders({ showLoader: true });
  }, []);

  const loadOrders = async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const response = await axiosInstance.get('/orders');
      setOrders(response.data);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error('Error loading orders');
    } finally {
      if (showLoader) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  };

  const handleApprovePayment = async (order) => {
    if (!order?.payment_proof_url) {
      toast.error('Payment proof is required before approval');
      return;
    }
    try {
      await axiosInstance.put(`/orders/${order.id}/status?payment_status=paid&order_status=processing`);
      toast.success('Payment approved!');
      loadOrders();
    } catch (error) {
      console.error('Error approving payment:', error);
      toast.error('Error approving payment');
    }
  };

  const handleRejectPayment = (order) => {
    setSelectedRejectOrder(order);
    setRejectReason('');
    setRejectDialog(true);
  };

  const handleCompleteOrder = async (orderId) => {
    try {
      await axiosInstance.put(`/orders/${orderId}/status?order_status=completed`);
      toast.success('Order completed!');
      loadOrders();
    } catch (error) {
      console.error('Error completing order:', error);
      toast.error('Error completing order');
    }
  };

  const buildDeliveryItems = (order) => {
    const existingItems = order?.delivery_info?.items || [];
    return (order?.items || []).map((item, index) => {
      const existing = existingItems.find((entry) => (
        (entry.product_id && entry.product_id === item.product_id) ||
        (entry.product_name && entry.product_name === item.product_name)
      ));
      return {
        key: `${item.product_id || item.product_name || index}-${index}`,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        details: existing?.details || ''
      };
    });
  };

  const handleDeliverOrder = (order) => {
    setSelectedOrder(order);
    setDeliveryInfo(order?.delivery_info?.details || '');
    setDeliveryItems(buildDeliveryItems(order));
    setDeliveryDialog(true);
  };

  const handleRefundOrder = (order) => {
    setSelectedOrder(order);
    setRefundAmount(String(order.total_amount || ''));
    setRefundReason('Order refund');
    setRefundDialog(true);
  };

  const updateDeliveryItem = (index, value) => {
    setDeliveryItems((prev) => prev.map((item, i) => (
      i === index ? { ...item, details: value } : item
    )));
  };

  const submitRefund = async () => {
    const amt = parseFloat(refundAmount);
    if (!amt || amt <= 0) {
      toast.error('Please enter a valid refund amount');
      return;
    }

    try {
      await axiosInstance.post(`/orders/${selectedOrder.id}/refund`, {
        amount: amt,
        reason: refundReason
      });
      toast.success('Refunded to wallet successfully');
      setRefundDialog(false);
      loadOrders();
    } catch (error) {
      console.error('Error refunding order:', error);
      toast.error(error.response?.data?.detail || 'Error refunding order');
    }
  };

  const submitReject = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error('Please provide a rejection reason');
      return;
    }

    setRejecting(true);
    try {
      await axiosInstance.put(`/orders/${selectedRejectOrder.id}/status`, null, {
        params: {
          payment_status: 'failed',
          order_status: 'cancelled',
          reason
        }
      });
      toast.success('Payment rejected');
      setRejectDialog(false);
      setSelectedRejectOrder(null);
      loadOrders();
    } catch (error) {
      console.error('Error rejecting payment:', error);
      toast.error(error.response?.data?.detail || 'Error rejecting payment');
    } finally {
      setRejecting(false);
    }
  };

  const submitDelivery = async () => {
    const trimmedDetails = deliveryInfo.trim();
    const itemPayload = (deliveryItems || [])
      .map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        details: (item.details || '').trim()
      }))
      .filter((item) => item.details);

    if (!trimmedDetails && itemPayload.length === 0) {
      toast.error('Please enter delivery information');
      return;
    }

    try {
      // Update order with delivery info and mark as completed
      await axiosInstance.put(`/orders/${selectedOrder.id}/delivery`, {
        delivery_details: trimmedDetails,
        items: itemPayload
      });
      
      toast.success('Order delivered successfully! Customer will receive the information.');
      setDeliveryDialog(false);
      loadOrders();
    } catch (error) {
      console.error('Error delivering order:', error);
      toast.error('Error delivering order');
    }
  };

  const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const dateA = parseDate(a.created_at);
      const dateB = parseDate(b.created_at);
      return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
    });
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return sortedOrders.filter(order => {
      const matchesFilter = (() => {
        if (filter === 'all') return true;
        if (filter === 'awaiting_proof') return order.payment_status === 'pending';
        if (filter === 'pending_verification') return order.payment_status === 'pending_verification';
        if (filter === 'processing') return order.order_status === 'processing';
        if (filter === 'completed') return order.order_status === 'completed';
        if (filter === 'cancelled') return order.order_status === 'cancelled';
        return true;
      })();
      if (!matchesFilter) return false;
      if (!normalizedSearch) return true;
      const haystack = [
        order.id,
        order.user_email,
        order.transaction_id
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [filter, search, sortedOrders]);

  const getPaymentStatusBadge = (status) => {
    const badges = {
      'pending': 'secondary',
      'pending_verification': 'default',
      'paid': 'default',
      'failed': 'destructive',
      'cancelled': 'secondary'
    };
    return badges[status] || 'secondary';
  };

  const getOrderStatusBadge = (status) => {
    const badges = {
      'pending': 'secondary',
      'processing': 'default',
      'completed': 'default',
      'cancelled': 'destructive'
    };
    return badges[status] || 'secondary';
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-12">
            <div className="flex justify-between items-center w-full">
              <h1 className="text-4xl md:text-5xl font-bold text-white" data-testid="orders-title">Manage Orders</h1>
              <Button 
                onClick={() => window.location.href = '/admin'}
                className="bg-green-500 text-white px-6 py-3"
              >
                🏠 Admin Home
              </Button>
            </div>

            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by order ID, email, or transaction ID"
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50 md:w-[320px]"
                data-testid="orders-search"
              />
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-full md:w-[220px] bg-white/10 border-white/20 text-white" data-testid="filter-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  <SelectItem value="awaiting_proof">Awaiting Proof</SelectItem>
                  <SelectItem value="pending_verification">Pending Verification</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10"
                onClick={() => loadOrders()}
                disabled={refreshing}
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-white text-xl py-12">Loading...</div>
          ) : filteredOrders.length > 0 ? (
            <div className="space-y-4" data-testid="orders-list">
              {filteredOrders.map((order) => {
                const subscriptionMeta = getSubscriptionMeta(order);
                const proofUrl = order.payment_proof_url;
                const proofIsInline = isInlineImage(proofUrl);
                const canPreviewProof = proofIsInline && canPreviewInlineImage(proofUrl);
                const proofSizeLabel = proofIsInline ? formatBytes(getInlineImageBytes(proofUrl)) : null;
                return (
                  <Card key={order.id} className="glass-effect border-white/20" data-testid={`order-${order.id}`}>
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                      {/* Order Info */}
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          <h3 className="text-xl font-bold text-white">Order #{order.id.slice(0, 8)}</h3>
                          <Badge variant={getPaymentStatusBadge(order.payment_status)} className="capitalize">
                            {order.payment_status}
                          </Badge>
                          <Badge variant={getOrderStatusBadge(order.order_status)} className="capitalize">
                            {order.order_status}
                          </Badge>
                        </div>
                        
                        <div className="space-y-1 text-white/80 text-sm">
                          <p><strong>Customer:</strong> {order.user_email}</p>
                          <p><strong>Payment Method:</strong> {
                            order.payment_method === 'crypto_plisio' ? 'Cryptocurrency' :
                            order.payment_method === 'payerurl' ? 'Crypto (PayerURL)' :
                            order.payment_method === 'binance_pay' ? 'Binance Pay (Auto)' :
                            order.payment_method === 'binance_pay_manual' ? 'Binance Pay (Manual)' :
                            order.payment_method
                          }</p>
                          <p><strong>Total:</strong> ${order.total_amount.toFixed(2)}</p>
                          <p><strong>Items:</strong> {order.items.length} product(s)</p>
                          <p><strong>Date:</strong> {new Date(order.created_at).toLocaleString('en-US')}</p>
                        </div>

                        {/* Payment Proof */}
                        {order.payment_proof_url && (
                          <div className="mt-3 p-3 bg-white/5 rounded">
                            <p className="text-white text-sm mb-1"><strong>Payment Proof:</strong></p>
                            <p className="text-white/70 text-sm mb-2">ID: {order.transaction_id}</p>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-green-400 text-green-400 hover:bg-green-400/10"
                                onClick={() => {
                                  setSelectedProofUrl(order.payment_proof_url);
                                  setProofZoom(1);
                                  setProofLoadError(false);
                                  setProofViewerOpen(true);
                                }}
                                data-testid={`proof-link-${order.id}`}
                              >
                                📸 View Payment Proof
                              </Button>
                              {canPreviewProof && (
                                <img 
                                  src={order.payment_proof_url} 
                                  alt="Payment proof thumbnail" 
                                  className="h-12 w-12 object-cover rounded border border-green-400/30 cursor-pointer hover:border-green-400/60 transition"
                                  onClick={() => {
                                    setSelectedProofUrl(order.payment_proof_url);
                                    setProofZoom(1);
                                    setProofLoadError(false);
                                    setProofViewerOpen(true);
                                  }}
                                  title="Click to view full size"
                                />
                              )}
                              {proofIsInline && !canPreviewProof && (
                                <span className="text-xs text-white/50">
                                  Large inline proof ({proofSizeLabel}). Use View Payment Proof to download.
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Order Items with Details */}
                        <div className="mt-4 space-y-2">
                          <p className="text-white font-semibold text-sm mb-2">Order Items:</p>
                          {order.items && order.items.map((item, idx) => (
                            <div key={idx} className="p-3 bg-white/5 border border-white/10 rounded-lg">
                              <p className="text-white font-medium text-sm">{item.product_name} x {item.quantity}</p>
                              <p className="text-white/70 text-xs">Price: ${Number(item.price).toFixed(2)} each</p>
                              
                              {/* Player ID */}
                              {item.player_id && (
                                <div className="mt-2 p-2 bg-cyan-500/10 border border-green-500/20 rounded">
                                  <p className="text-green-300 text-xs font-semibold mb-1">Player ID:</p>
                                  <p className="text-white text-sm font-mono">{item.player_id}</p>
                                </div>
                              )}
                              
                              {/* Credentials */}
                              {item.credentials && Object.keys(item.credentials).length > 0 && (
                                <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded">
                                  <p className="text-purple-300 text-xs font-semibold mb-1">Account Credentials:</p>
                                  <div className="space-y-1">
                                    {Object.entries(item.credentials).map(([key, value]) => (
                                      <div key={key} className="flex gap-2">
                                        <span className="text-white/70 text-xs capitalize min-w-[80px]">{key}:</span>
                                        <span className="text-white text-xs font-mono break-all">{String(value)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {subscriptionMeta && (
                          <div className="mt-3 p-3 bg-cyan-500/10 border border-green-500/30 rounded">
                            <p className="text-green-300 text-sm font-semibold mb-1">Subscription</p>
                            <p className="text-white/70 text-xs">
                              Ends: {subscriptionMeta.end.toLocaleString('en-US')}
                            </p>
                            {subscriptionMeta.start && (
                              <p className="text-white/70 text-xs">
                                Started: {subscriptionMeta.start.toLocaleString('en-US')}
                              </p>
                            )}
                            {subscriptionMeta.durationLabel && (
                              <p className="text-white/70 text-xs">
                                Duration: {subscriptionMeta.durationLabel}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Auto-delivery failure reason */}
                        {order.auto_delivery_failed_reason && !order.delivery_info && (
                          <div className="mt-3 p-3 bg-orange-900/20 border border-orange-500/30 rounded">
                            <p className="text-orange-400 text-sm mb-1"><strong>⚠ Auto-delivery failed</strong></p>
                            <p className="text-white/70 text-xs">{order.auto_delivery_failed_reason}</p>
                          </div>
                        )}

                        {/* Delivery Information */}
                        {order.delivery_info && (
                          <div className="mt-3 p-3 bg-green-900/20 border border-green-500/30 rounded">
                            <p className="text-green-400 text-sm mb-1"><strong>✓ Delivered</strong></p>
                            <p className="text-white/70 text-xs">
                              {new Date(order.delivery_info.delivered_at).toLocaleString('en-US')}
                            </p>
                            {order.delivery_info.details && (
                              <div className="mt-2 p-2 bg-white/5 rounded">
                                <p className="text-white/80 text-xs whitespace-pre-wrap">{order.delivery_info.details}</p>
                              </div>
                            )}
                            {Array.isArray(order.delivery_info.items) && order.delivery_info.items.length > 0 && (
                              <div className="mt-3 space-y-2">
                                <p className="text-white/80 text-xs font-semibold">Item Credentials:</p>
                                {order.delivery_info.items.map((item, index) => (
                                  <div key={`${item.product_id || item.product_name}-${index}`} className="p-2 bg-white/5 rounded">
                                    <p className="text-white/80 text-xs font-semibold">
                                      {item.product_name || item.product_id || 'Item'}
                                    </p>
                                    <p className="text-white/70 text-xs whitespace-pre-wrap">{item.details}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 min-w-[180px]">
                        <Link to={`/track/${order.id}`}>
                          <Button variant="outline" className="w-full border-white text-white hover:bg-white/10" data-testid={`view-order-${order.id}`}>
                            <Eye size={16} className="mr-2" />
                            View Details
                          </Button>
                        </Link>

                        {['paypal', 'skrill', 'moncash', 'binance_pay', 'binance_pay_manual', 'zelle', 'cashapp'].includes(order.payment_method)
                          && order.payment_status === 'pending_verification' && (
                          <>
                            <Button
                              className="w-full bg-green-500 hover:bg-green-600 text-white"
                              onClick={() => handleApprovePayment(order)}
                              disabled={!order.payment_proof_url}
                              data-testid={`approve-payment-${order.id}`}
                            >
                              <CheckCircle size={16} className="mr-2" />
                              Approve Payment
                            </Button>
                            <Button
                              variant="destructive"
                              className="w-full"
                              onClick={() => handleRejectPayment(order)}
                              data-testid={`reject-payment-${order.id}`}
                            >
                              <XCircle size={16} className="mr-2" />
                              Reject Order
                            </Button>
                          </>
                        )}

                        {(order.payment_status === 'paid' || order.order_status === 'completed' || order.order_status === 'processing') && (
                          <>
                            <Button
                              className="w-full gradient-button text-white"
                              onClick={() => handleDeliverOrder(order)}
                              data-testid={`deliver-order-${order.id}`}
                            >
                              <Send size={16} className="mr-2" />
                              {order.delivery_info ? 'Update Delivery' : 'Deliver Order'}
                            </Button>
                            {order.order_status === 'processing' && (
                              <Button
                                className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                                onClick={() => handleCompleteOrder(order.id)}
                                data-testid={`complete-order-${order.id}`}
                              >
                                <CheckCircle size={16} className="mr-2" />
                                Mark Complete
                              </Button>
                            )}
                          </>
                        )}

                        {order.payment_status === 'paid' && !order.refunded_at && (
                          <Button
                            variant="outline"
                            className="w-full border-yellow-400 text-yellow-300 hover:bg-yellow-400/10"
                            onClick={() => handleRefundOrder(order)}
                          >
                            Refund to Wallet
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-white/70 py-12" data-testid="no-orders">
              <Package size={64} className="mx-auto mb-4 text-white/30" />
              <p>No orders found for this filter</p>
            </div>
          )}
        </div>
      </div>

      {/* Delivery Dialog */}
      <Dialog open={deliveryDialog} onOpenChange={setDeliveryDialog}>
        <DialogContent className="bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-white">Deliver Order #{selectedOrder?.id?.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {deliveryItems.length > 0 && (
              <div>
                <Label className="text-white">Item Credentials</Label>
                <div className="mt-2 space-y-3">
                  {deliveryItems.map((item, index) => (
                    <div key={item.key} className="p-3 bg-white/5 border border-white/10 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-white text-sm font-semibold">
                          {item.product_name || item.product_id || 'Item'}
                        </p>
                        {item.quantity && (
                          <span className="text-xs text-white/60">Qty: {item.quantity}</span>
                        )}
                      </div>
                      <Textarea
                        value={item.details}
                        onChange={(e) => updateDeliveryItem(index, e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-gray-500"
                        placeholder="Enter credentials, codes, or delivery details for this item..."
                        rows={3}
                        data-testid={`delivery-item-${index}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label className="text-white">Delivery Notes (Optional)</Label>
              <Textarea
                value={deliveryInfo}
                onChange={(e) => setDeliveryInfo(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 mt-2"
                placeholder="General delivery instructions for the customer..."
                rows={4}
                data-testid="delivery-info-input"
              />
            </div>
            <p className="text-gray-400 text-sm">
              This information will be sent to the customer: {selectedOrder?.user_email}
            </p>
            <div className="flex gap-3">
              <Button onClick={submitDelivery} className="flex-1 gradient-button text-white" data-testid="submit-delivery-btn">
                <Send className="mr-2" size={16} />
                Send & Complete
              </Button>
              <Button onClick={() => setDeliveryDialog(false)} variant="outline" className="border-white/20 text-white">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={refundDialog} onOpenChange={setRefundDialog}>
        <DialogContent className="bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-white">Refund Order #{selectedOrder?.id?.slice(0, 8)} to Wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-white">Refund Amount (USD)</Label>
              <Input
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 mt-2"
                placeholder="Enter amount"
              />
            </div>
            <div>
              <Label className="text-white">Reason</Label>
              <Input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 mt-2"
                placeholder="Refund reason"
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={submitRefund} className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black">
                Refund
              </Button>
              <Button onClick={() => setRefundDialog(false)} variant="outline" className="border-white/20 text-white">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Payment Dialog */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent className="bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-white">
              Reject Payment for Order #{selectedRejectOrder?.id?.slice(0, 8)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-white">Rejection Reason</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 mt-2"
                placeholder="Explain why the payment is rejected..."
                rows={4}
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={submitReject}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                disabled={rejecting}
              >
                {rejecting ? 'Rejecting...' : 'Reject Payment'}
              </Button>
              <Button onClick={() => setRejectDialog(false)} variant="outline" className="border-white/20 text-white">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Proof Viewer Modal */}
      <Dialog open={proofViewerOpen} onOpenChange={setProofViewerOpen}>
        <DialogContent className="bg-gray-900 border-white/20 max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Payment Proof</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {selectedProofUrl && (
              <div className="flex flex-col items-center gap-4">
                {canRenderSelectedProof ? (
                  <div className="w-full max-h-[70vh] overflow-auto rounded border border-white/20">
                    <img 
                      src={selectedProofUrl} 
                      alt="Payment proof" 
                      className="block h-auto max-w-full origin-top-left transition-transform"
                      style={{ transform: `scale(${proofZoom})` }}
                      onError={() => setProofLoadError(true)}
                    />
                  </div>
                ) : selectedProofIsInline ? (
                  <div className="text-center text-white/70 text-sm">
                    {proofLoadError
                      ? 'Preview failed to load. Use Download below.'
                      : `Large inline proof (${selectedProofSizeLabel}). Use Download below.`}
                  </div>
                ) : (
                  <a 
                    href={selectedProofUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-green-400 hover:underline"
                  >
                    Open proof in new tab
                  </a>
                )}
                {canRenderSelectedProof && (
                  <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-white/70">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/20 text-white"
                      onClick={() => setProofZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
                    >
                      Zoom -
                    </Button>
                    <span>{Math.round(proofZoom * 100)}%</span>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/20 text-white"
                      onClick={() => setProofZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                    >
                      Zoom +
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/20 text-white"
                      onClick={() => setProofZoom(1)}
                    >
                      Reset
                    </Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="border-white/20 text-white"
                    onClick={() => setProofViewerOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    variant="outline"
                    className="border-green-400 text-green-400 hover:bg-green-400/10"
                    onClick={() => {
                      openPaymentProof(selectedProofUrl, { filename: 'payment-proof.png', action: 'open' });
                    }}
                  >
                    Download / Open
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Footer settings={settings} />
    </div>
  );
};

export default AdminOrders;
