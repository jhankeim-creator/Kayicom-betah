import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, Eye, Clock, Copy } from 'lucide-react';
import { toast } from 'sonner';

const formatSubscriptionDurationLabel = (months) => {
  const value = Number(months);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value === 12) return '1 Year';
  return `${value} ${value === 1 ? 'Month' : 'Months'}`;
};

const CustomerDashboard = ({ user, logout, settings, cart }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (user) {
      loadOrders();
    }
  }, [user]);

  useEffect(() => {
    const hasSubscriptions = orders.some((order) => order.subscription_end_date);
    if (!hasSubscriptions) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [orders]);

  const loadOrders = async () => {
    try {
      const response = await axiosInstance.get(`/orders?user_id=${user.user_id}`);
      setOrders(response.data);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error('Error loading orders');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      'pending': 'secondary',
      'processing': 'default',
      'completed': 'default',
      'cancelled': 'destructive'
    };
    return variants[status] || 'secondary';
  };

  const getPaymentBadgeClass = (status) => {
    const variants = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      pending_verification: 'bg-blue-500/20 text-blue-400',
      paid: 'bg-green-500/20 text-green-400',
      failed: 'bg-red-500/20 text-red-400',
      rejected: 'bg-red-500/20 text-red-400'
    };
    return variants[status] || 'bg-gray-500/20 text-gray-400';
  };

  const parseDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const dateA = parseDate(a.created_at);
      const dateB = parseDate(b.created_at);
      return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
    });
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return sortedOrders;
    return sortedOrders.filter((order) => order.order_status === statusFilter);
  }, [sortedOrders, statusFilter]);

  const subscriptionOrders = useMemo(() => {
    return orders
      .filter(o => o.subscription_end_date)
      .map(o => {
        const end = parseDate(o.subscription_end_date);
        if (!end) return null;
        const start = parseDate(o.subscription_start_date);
        const diffMs = end.getTime() - now;
        const diff = Math.max(0, diffMs);
        const days = Math.floor(diff / (24 * 3600 * 1000));
        const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
        const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
        const secs = Math.floor((diff % (60 * 1000)) / 1000);
        const durationLabel = (() => {
          if (!start) return '';
          const durationMs = end.getTime() - start.getTime();
          if (durationMs <= 0) return '';
          const months = Math.round(durationMs / (30 * 24 * 3600 * 1000));
          return formatSubscriptionDurationLabel(months);
        })();
        return { order: o, end, diffMs, remaining: { days, hours, mins, secs }, durationLabel };
      })
      .filter(Boolean);
  }, [orders, now]);

  const copyCustomerId = async () => {
    const cid = user?.customer_id;
    if (!cid) return;
    try {
      await navigator.clipboard.writeText(cid);
      toast.success('Customer ID copied');
    } catch (e) {
      // Fallback
      try {
        const el = document.createElement('textarea');
        el.value = cid;
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        toast.success('Customer ID copied');
      } catch (err) {
        toast.error('Could not copy Customer ID');
      }
    }
  };

  const copyOrderId = async (orderId) => {
    if (!orderId) return;
    try {
      await navigator.clipboard.writeText(orderId);
      toast.success('Order ID copied');
    } catch (e) {
      try {
        const el = document.createElement('textarea');
        el.value = orderId;
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        toast.success('Order ID copied');
      } catch (err) {
        toast.error('Could not copy Order ID');
      }
    }
  };

  const cartItemCount = (cart || []).reduce((sum, item) => sum + item.quantity, 0);
  const displayName = user?.full_name || user?.username || user?.email || 'Customer';
  const processingCount = orders.filter(o => ['pending', 'processing'].includes(o.order_status)).length;

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4" data-testid="dashboard-title">My Account</h1>
          <p className="text-white/80 text-lg mb-12">Welcome, {displayName}!</p>
          {user?.customer_id && (
            <div className="inline-flex items-center gap-2 mb-8 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
              <span className="text-white/70 text-sm">Customer ID:</span>
              <span className="text-white font-semibold font-mono select-all">{user.customer_id}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10"
                onClick={copyCustomerId}
                data-testid="copy-customer-id"
              >
                <Copy size={14} className="mr-2" />
                Copy
              </Button>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <Card className="glass-effect border-white/20">
              <CardContent className="p-6 text-center">
                <p className="text-white/70 mb-2">Total Orders</p>
                <p className="text-4xl font-bold text-white" data-testid="total-orders">{orders.length}</p>
              </CardContent>
            </Card>
            <Card className="glass-effect border-white/20">
              <CardContent className="p-6 text-center">
                <p className="text-white/70 mb-2">Pending/Processing Orders</p>
                <p className="text-4xl font-bold text-white" data-testid="pending-orders">
                  {processingCount}
                </p>
              </CardContent>
            </Card>
            <Card className="glass-effect border-white/20">
              <CardContent className="p-6 text-center">
                <p className="text-white/70 mb-2">Completed Orders</p>
                <p className="text-4xl font-bold text-white" data-testid="completed-orders">
                  {orders.filter(o => o.order_status === 'completed').length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Orders List */}
          <Card className="glass-effect border-white/20">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold text-white mb-6">My Orders</h2>
              
              {loading ? (
                <div className="text-center text-white py-8">Loading...</div>
              ) : filteredOrders.length > 0 ? (
                <div className="space-y-4" data-testid="orders-list">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {['all', 'pending', 'processing', 'completed', 'cancelled'].map((status) => (
                      <Button
                        key={status}
                        type="button"
                        size="sm"
                        variant="outline"
                        className={statusFilter === status
                          ? 'border-cyan-400 text-cyan-200 bg-cyan-400/10'
                          : 'border-white/20 text-white hover:bg-white/10'}
                        onClick={() => setStatusFilter(status)}
                      >
                        {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                      </Button>
                    ))}
                  </div>
                  {filteredOrders.map((order) => {
                    const createdDate = parseDate(order.created_at);
                    const createdLabel = createdDate ? createdDate.toLocaleDateString('en-US') : 'Unknown date';
                    return (
                    <div key={order.id} className="glass-effect p-4 rounded-lg" data-testid={`order-${order.id}`}>
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Package className="text-white" size={20} />
                            <span className="text-white font-semibold">Order #{order.id.slice(0, 8)}</span>
                            <Badge variant={getStatusBadge(order.order_status)} className="capitalize">
                              {order.order_status}
                            </Badge>
                          </div>
                          <p className="text-white/70 text-sm">
                            {order.items.length} items - {createdLabel}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${getPaymentBadgeClass(order.payment_status)}`}>
                              {order.payment_status}
                            </span>
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-white/10 text-white/80">
                              {order.payment_method === 'crypto_plisio' ? 'Cryptocurrency' : order.payment_method}
                            </span>
                          </div>
                          <p className="text-white font-bold mt-1">${order.total_amount.toFixed(2)}</p>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="border-white/20 text-white hover:bg-white/10"
                            onClick={() => copyOrderId(order.id)}
                          >
                            <Copy size={16} className="mr-2" />
                            Copy ID
                          </Button>
                          <Link to={`/track/${order.id}`}>
                            <Button variant="outline" className="border-white text-white hover:bg-white/10" data-testid={`view-order-${order.id}`}>
                              <Eye size={16} className="mr-2" />
                              View Details
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                  })}
                </div>
              ) : (
                <div className="text-center text-white/70 py-8" data-testid="no-orders">
                  <Package className="mx-auto mb-4" size={48} />
                  <p>You don't have any orders yet</p>
                  <Link to="/products" className="inline-block mt-4">
                    <Button className="bg-white text-purple-600 hover:bg-gray-100">
                      Start Shopping
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subscriptions */}
          {subscriptionOrders.length > 0 && (
            <Card className="glass-effect border-white/20 mt-8">
              <CardContent className="p-6">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                  <Clock className="text-cyan-300" size={22} />
                  My Subscriptions
                </h2>
                <div className="space-y-4">
                  {subscriptionOrders.map(({ order, end, diffMs, remaining, durationLabel }) => (
                    <div key={order.id} className="p-4 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <p className="text-white font-semibold">Order #{order.id.slice(0, 8)}</p>
                          <p className="text-white/60 text-sm">Ends: {end.toLocaleString()}</p>
                          {durationLabel && (
                            <p className="text-white/60 text-sm">Duration: {durationLabel}</p>
                          )}
                        </div>
                        <div className="text-right">
                          {diffMs > 0 ? (
                            <p className="text-green-300 font-mono text-lg">
                              {remaining.days}d {String(remaining.hours).padStart(2, '0')}:{String(remaining.mins).padStart(2, '0')}:{String(remaining.secs).padStart(2, '0')}
                            </p>
                          ) : (
                            <p className="text-red-300 font-semibold">Expired</p>
                          )}
                          <div className="mt-2 flex gap-2 justify-end">
                            <Link to={`/track/${order.id}`}>
                              <Button size="sm" variant="outline" className="border-white/20 text-white">
                                View
                              </Button>
                            </Link>
                            <Link to="/products/subscription">
                              <Button size="sm" className="bg-white text-purple-600 hover:bg-gray-100">
                                Renew
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
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

export default CustomerDashboard;
