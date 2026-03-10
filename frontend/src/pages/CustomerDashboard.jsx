import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, Eye, Clock, Copy, ChevronRight, Wallet, ShoppingBag, Gift, Users, HelpCircle, Bell, Settings, MessageCircle, Store, ShieldAlert } from 'lucide-react';
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
  const [walletBalance, setWalletBalance] = useState(0);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const userId = user?.user_id || user?.id;

  useEffect(() => { if (user) { loadOrders(); loadWallet(); loadUnread(); } }, [user]);

  const loadUnread = async () => {
    try {
      const res = await axiosInstance.get(`/messages/unread-count?user_id=${userId}`);
      setUnreadMessages(res.data?.unread || 0);
    } catch {}
  };

  useEffect(() => {
    const hasSubscriptions = orders.some((order) => order.subscription_end_date);
    if (!hasSubscriptions) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [orders]);

  const loadOrders = async () => {
    try {
      const response = await axiosInstance.get(`/orders?user_id=${userId}`);
      setOrders(response.data);
    } catch (error) { console.error('Error loading orders:', error); }
    finally { setLoading(false); }
  };

  const loadWallet = async () => {
    try {
      const [balRes, creditsRes] = await Promise.all([
        axiosInstance.get(`/wallet/balance?user_id=${userId}`),
        axiosInstance.get(`/credits/balance?user_id=${userId}`)
      ]);
      setWalletBalance(balRes.data?.wallet_balance || 0);
      setCreditsBalance(creditsRes.data?.credits_balance || 0);
    } catch (e) { console.error('Wallet load error:', e); }
  };

  const getPaymentBadgeClass = (status) => {
    const variants = { pending: 'bg-yellow-500/20 text-yellow-400', pending_verification: 'bg-blue-500/20 text-blue-400', paid: 'bg-green-500/20 text-green-400', failed: 'bg-red-500/20 text-red-400' };
    return variants[status] || 'bg-gray-500/20 text-gray-400';
  };

  const parseDate = (value) => { if (!value) return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; };

  const sortedOrders = useMemo(() => [...orders].sort((a, b) => (parseDate(b.created_at)?.getTime() || 0) - (parseDate(a.created_at)?.getTime() || 0)), [orders]);
  const filteredOrders = useMemo(() => statusFilter === 'all' ? sortedOrders : sortedOrders.filter((o) => o.order_status === statusFilter), [sortedOrders, statusFilter]);

  const copyCustomerId = async () => {
    const cid = user?.customer_id;
    if (!cid) return;
    try { await navigator.clipboard.writeText(cid); toast.success('Customer ID copied'); }
    catch (e) { toast.error('Could not copy'); }
  };

  const cartItemCount = (cart || []).reduce((sum, item) => sum + item.quantity, 0);
  const displayName = user?.full_name || user?.username || user?.email || 'Customer';

  const isSeller = user?.seller_status === 'approved' || user?.role === 'seller';
  const isSellerPending = user?.seller_status && ['pending_kyc', 'kyc_submitted'].includes(user.seller_status);

  const menuItems = [
    ...(isSeller ? [
      { icon: Store, label: 'Seller Center', href: '/seller', color: 'text-orange-400' },
    ] : isSellerPending ? [
      { icon: Store, label: 'Seller Application', href: '/seller/apply', color: 'text-yellow-400', badge: 'Pending' },
    ] : [
      { icon: Store, label: 'Become a Seller', href: '/seller/apply', color: 'text-green-400' },
    ]),
    { icon: ShoppingBag, label: 'Purchased Orders', href: '/orders', color: 'text-white/70' },
    { icon: Gift, label: 'Coupon', href: '/products', color: 'text-orange-400' },
    { icon: Users, label: 'Referral', href: '/referral', color: 'text-white/70' },
    { icon: MessageCircle, label: 'Messages', href: '/messages', color: 'text-white/70', badge: unreadMessages > 0 ? `${unreadMessages} new` : null },
    { icon: ShieldAlert, label: 'Disputes', href: '/disputes', color: 'text-red-400' },
    { icon: HelpCircle, label: 'Help Center', href: '/help', color: 'text-white/70' },
    { icon: Bell, label: 'Notification', href: '/notifications', color: 'text-white/70' },
    { icon: Settings, label: 'Terms & Conditions', href: '/terms', color: 'text-white/70' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">

          {/* Profile Card */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-full bg-[#1c1c1c] border border-white/10 flex items-center justify-center text-2xl">
              👤
            </div>
            <div>
              <h2 className="text-white font-bold text-lg" data-testid="dashboard-title">{displayName}</h2>
              {user?.customer_id && (
                <button onClick={copyCustomerId} className="text-white/40 text-xs flex items-center gap-1 hover:text-white/60" data-testid="copy-customer-id">
                  ID: {user.customer_id} <Copy size={10} />
                </button>
              )}
            </div>
          </div>

          {/* Balance & Points */}
          <div className="flex items-center justify-center gap-8 mb-8 py-4">
            <div className="text-center">
              <p className="text-orange-400 font-bold text-xl">$ {Number(walletBalance).toFixed(2)} <span className="text-white/40 text-sm font-normal">USD</span></p>
              <p className="text-white/40 text-xs flex items-center justify-center gap-1 mt-1">
                <Wallet size={12} /> Balance
              </p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <p className="text-white font-bold text-xl">{Number(creditsBalance)}</p>
              <p className="text-white/40 text-xs flex items-center justify-center gap-1 mt-1">
                ⭐ Points
              </p>
            </div>
          </div>

          {/* Menu Items */}
          <div className="rounded-xl bg-[#141414] border border-white/5 overflow-hidden mb-8">
            {menuItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  className={`flex items-center justify-between px-5 py-4 hover:bg-white/5 transition ${i < menuItems.length - 1 ? 'border-b border-white/5' : ''}`}
                >
                  <span className="flex items-center gap-3">
                    <Icon size={20} className={item.color} />
                    <span className="text-white text-sm">{item.label}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {item.badge && (
                      <span className="bg-yellow-500/20 text-yellow-400 text-[10px] font-semibold rounded px-2 py-0.5">{item.badge}</span>
                    )}
                    <ChevronRight size={16} className="text-white/30" />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Recent Orders */}
          <div className="mb-6" id="orders">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-lg">My Orders</h2>
              <div className="flex gap-2 flex-wrap">
                {['all', 'pending', 'processing', 'completed', 'cancelled'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`text-xs px-3 py-1 rounded-full transition ${
                      statusFilter === status ? 'bg-green-500 text-black font-semibold' : 'bg-white/5 text-white/50'
                    }`}
                  >
                    {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="text-white/40 text-center py-8">Loading...</div>
            ) : filteredOrders.length > 0 ? (
              <div className="space-y-3" data-testid="orders-list">
                {filteredOrders.map((order) => {
                  const date = parseDate(order.created_at);
                  return (
                    <Link to={`/track/${order.id}`} key={order.id}>
                      <div className="p-4 rounded-xl bg-[#141414] border border-white/5 hover:border-green-500/20 transition" data-testid={`order-${order.id}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white font-semibold text-sm">Order #{order.id.slice(0, 8)}</span>
                          <div className="flex gap-1.5">
                            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                              order.order_status === 'completed' ? 'bg-green-500/20 text-green-400' :
                              order.order_status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                              order.order_status === 'processing' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-yellow-500/20 text-yellow-400'
                            }`}>{order.order_status}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${getPaymentBadgeClass(order.payment_status)}`}>{order.payment_status}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white/50 text-xs">{order.items.length} items - {date ? date.toLocaleDateString() : ''}</p>
                            <p className="text-white/70 text-xs mt-0.5 capitalize">{
                              order.payment_method === 'crypto_plisio' ? 'Cryptocurrency' :
                              order.payment_method === 'payerurl' ? 'Crypto (PayerURL)' :
                              order.payment_method === 'binance_pay' ? 'Binance Pay (Auto)' :
                              order.payment_method === 'binance_pay_manual' ? 'Binance Pay (Manual)' :
                              order.payment_method
                            }</p>
                          </div>
                          <p className="text-green-400 font-bold">${order.total_amount.toFixed(2)}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12" data-testid="no-orders">
                <Package className="mx-auto mb-3 text-white/20" size={40} />
                <p className="text-white/40 text-sm">No orders yet</p>
                <Link to="/products" className="inline-block mt-3">
                  <Button size="sm" className="bg-green-500 hover:bg-green-600 text-black font-semibold rounded-full px-6">
                    Start Shopping
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default CustomerDashboard;
