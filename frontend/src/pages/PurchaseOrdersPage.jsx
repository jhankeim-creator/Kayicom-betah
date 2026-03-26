import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Package, Clock, CheckCircle, XCircle, Loader2, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PurchaseOrdersPage = ({ user, logout, settings, cart }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const cartItemCount = cart?.length || 0;

  const loadOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const userId = user.user_id || user.id;
      const res = await axiosInstance.get(`/orders?user_id=${userId}`);
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const sortedOrders = useMemo(() =>
    [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [orders]
  );

  const filteredOrders = useMemo(() =>
    statusFilter === 'all' ? sortedOrders : sortedOrders.filter(o => o.order_status === statusFilter),
    [sortedOrders, statusFilter]
  );

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle size={16} className="text-green-400" />;
      case 'cancelled': return <XCircle size={16} className="text-red-400" />;
      case 'processing': return <Loader2 size={16} className="text-blue-400" />;
      default: return <Clock size={16} className="text-yellow-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-500/20 text-green-400';
      case 'cancelled': return 'bg-red-500/20 text-red-400';
      case 'processing': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-yellow-500/20 text-yellow-400';
    }
  };

  const getPaymentColor = (status) => {
    switch (status) {
      case 'paid': return 'bg-green-500/20 text-green-400';
      case 'cancelled': case 'failed': return 'bg-red-500/20 text-red-400';
      case 'pending_verification': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-yellow-500/20 text-yellow-400';
    }
  };

  const getMethodLabel = (method) => {
    const labels = {
      crypto_plisio: 'Cryptocurrency',
      binance_pay: 'Binance Pay (Auto)',
      binance_pay_manual: 'Binance Pay (Manual)',
      wallet: 'Wallet',
    };
    return labels[method] || method;
  };

  const parseDate = (d) => { try { return new Date(d); } catch { return null; } };

  const tabs = ['all', 'pending', 'processing', 'completed', 'cancelled'];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <ShoppingBag className="text-green-400" size={28} />
            <h1 className="text-white font-bold text-2xl">My Orders</h1>
            <span className="text-white/40 text-sm">({orders.length})</span>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {tabs.map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`text-xs px-4 py-2 rounded-full transition font-medium ${
                  statusFilter === status
                    ? 'bg-green-500 text-black font-semibold'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {status === 'all' ? `All (${orders.length})` : `${status.charAt(0).toUpperCase() + status.slice(1)} (${sortedOrders.filter(o => o.order_status === status).length})`}
              </button>
            ))}
          </div>

          {/* Orders List */}
          {loading ? (
            <div className="text-center py-16">
              <Loader2 className="mx-auto mb-3 text-green-400 animate-spin" size={32} />
              <p className="text-white/40 text-sm">Loading orders...</p>
            </div>
          ) : filteredOrders.length > 0 ? (
            <div className="space-y-3">
              {filteredOrders.map(order => {
                const date = parseDate(order.created_at);
                return (
                  <Link to={`/track/${order.id}`} key={order.id}>
                    <div className="p-4 rounded-xl bg-[#141414] border border-white/5 hover:border-green-500/20 transition">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(order.order_status)}
                          <span className="text-white font-semibold text-sm">Order #{order.id.slice(0, 8)}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${getStatusColor(order.order_status)}`}>
                            {order.order_status}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${getPaymentColor(order.payment_status)}`}>
                            {order.payment_status}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white/50 text-xs">
                            {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''} · {date ? date.toLocaleDateString() : ''}
                          </p>
                          <p className="text-white/70 text-xs mt-0.5 capitalize">{getMethodLabel(order.payment_method)}</p>
                        </div>
                        <p className="text-green-400 font-bold">${Number(order.total_amount).toFixed(2)}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <Package className="mx-auto mb-3 text-white/20" size={48} />
              <p className="text-white/40 text-sm mb-1">
                {statusFilter === 'all' ? 'No orders yet' : `No ${statusFilter} orders`}
              </p>
              <Link to="/products">
                <Button size="sm" className="mt-3 bg-green-500 hover:bg-green-600 text-black font-semibold rounded-full px-6">
                  Start Shopping
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default PurchaseOrdersPage;
