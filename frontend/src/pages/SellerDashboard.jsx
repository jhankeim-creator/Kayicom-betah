import { useEffect, useState, useCallback } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProductCodesManager from '../components/ProductCodesManager';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Store, ShoppingCart, DollarSign, Send, Plus, Trash2, Key, Wallet, Edit2, Gift, Gamepad2, Tv, Wrench, Package, BarChart3, Star, Truck, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_META = {
  giftcard: { label: 'Gift Cards', icon: Gift, color: 'from-green-500/20 to-emerald-500/20 border-green-500/30', badge: 'bg-green-500/20 text-green-300' },
  topup: { label: 'Game Top-Up', icon: Gamepad2, color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30', badge: 'bg-blue-500/20 text-blue-300' },
  subscription: { label: 'Subscriptions', icon: Tv, color: 'from-purple-500/20 to-violet-500/20 border-green-500/30', badge: 'bg-green-500/20 text-purple-300' },
  service: { label: 'Services', icon: Wrench, color: 'from-green-500/20 to-emerald-500/20 border-green-500/30', badge: 'bg-green-500/20 text-green-300' },
};

const getCatMeta = (cat) => CATEGORY_META[cat] || { label: cat, icon: Tag, color: 'from-gray-500/20 to-gray-500/20 border-gray-500/30', badge: 'bg-gray-500/20 text-gray-300' };

const SellerDashboard = ({ user, logout, settings }) => {
  const [tab, setTab] = useState('products');
  const [orders, setOrders] = useState([]);
  const [earnings, setEarnings] = useState({ balance: 0, pending_balance: 0, total_earned: 0, total_orders: 0, commission_rate: 10 });
  const [withdrawalInfo, setWithdrawalInfo] = useState({ methods: [], fee_percent: 0, fee_fixed: 0, min_amount: 5 });
  const [loading, setLoading] = useState(true);
  const [myProducts, setMyProducts] = useState([]);
  const [codesProduct, setCodesProduct] = useState(null);
  const [codesOpen, setCodesOpen] = useState(false);
  const [catRequest, setCatRequest] = useState('');

  // Add/edit product dialog
  const [productDialog, setProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '', description: '', category: '', price: '', image_url: '',
    stock_available: true, delivery_type: 'automatic', delivery_time: 'instant',
  });

  // Analytics
  const [analytics, setAnalytics] = useState(null);

  // Delivery dialog
  const [deliveryDialog, setDeliveryDialog] = useState(false);
  const [deliveryOrder, setDeliveryOrder] = useState(null);
  const [deliveryCodes, setDeliveryCodes] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');

  // Withdrawal
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');

  const approvedCategories = (user?.seller_approved_categories || []).map(c => c.toLowerCase());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [earnRes, orderRes, wInfoRes, prodRes] = await Promise.all([
        axiosInstance.get(`/seller/earnings?user_id=${user.id}`),
        axiosInstance.get(`/seller/orders?user_id=${user.id}`),
        axiosInstance.get('/seller/withdrawal-info'),
        axiosInstance.get(`/seller/products?user_id=${user.id}`),
      ]);
      setEarnings(earnRes.data);
      setOrders(orderRes.data);
      setWithdrawalInfo(wInfoRes.data);
      setMyProducts(prodRes.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [user?.id]);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await axiosInstance.get(`/seller/analytics?user_id=${user.id}`);
      setAnalytics(res.data);
    } catch (err) { console.error(err); }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (tab === 'analytics') loadAnalytics(); }, [tab, loadAnalytics]);

  const handleCatRequest = async () => {
    if (!catRequest.trim()) { toast.error('Enter a category'); return; }
    try {
      await axiosInstance.post(`/seller/category-request?user_id=${user.id}`, {
        categories: catRequest.split(',').map(c => c.trim().toLowerCase()).filter(Boolean)
      });
      toast.success('Category request submitted'); setCatRequest('');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const resetProductForm = () => {
    setProductForm({ name: '', description: '', category: approvedCategories[0] || '', price: '', image_url: '', stock_available: true, delivery_type: 'automatic', delivery_time: 'instant' });
    setEditingProduct(null);
  };

  const handleProductSubmit = async () => {
    if (!productForm.name || !productForm.price || !productForm.category) {
      toast.error('Fill name, price and category'); return;
    }
    if (!productForm.image_url) {
      toast.error('Image is required'); return;
    }
    if ((productForm.description || '').trim().length < 50) {
      toast.error('Description must be at least 50 characters'); return;
    }
    try {
      const payload = { ...productForm, price: parseFloat(productForm.price) };
      if (editingProduct) {
        await axiosInstance.put(`/seller/products/${editingProduct.id}?user_id=${user.id}`, payload);
        toast.success('Product updated');
      } else {
        await axiosInstance.post(`/seller/products?user_id=${user.id}`, payload);
        toast.success('Product created and listed on marketplace!');
      }
      setProductDialog(false); resetProductForm(); loadData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error saving product'); }
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name, description: product.description || '', category: product.category,
      price: String(product.price), image_url: product.image_url || '',
      stock_available: product.stock_available ?? true, delivery_type: product.delivery_type || 'automatic',
      variant_name: product.variant_name || '', region: product.region || '',
    });
    setProductDialog(true);
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      await axiosInstance.delete(`/seller/products/${id}?user_id=${user.id}`);
      toast.success('Product deleted'); loadData();
    } catch (err) { toast.error('Error deleting'); }
  };

  const uploadImage = async (file) => {
    if (!file || file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return null; }
    try {
      const data = new FormData(); data.append('file', file);
      const res = await axiosInstance.post('/upload/image', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      return res.data?.url || null;
    } catch { toast.error('Upload failed'); return null; }
  };

  const calcFee = (amt) => {
    const a = parseFloat(amt) || 0;
    const selectedMethod = withdrawalInfo.methods.find(m => m.id === withdrawMethod);
    const pct = selectedMethod?.fee_percent ?? withdrawalInfo.fee_percent ?? 0;
    const fixed = selectedMethod?.fee_fixed ?? withdrawalInfo.fee_fixed ?? 0;
    return Math.round((a * (pct / 100) + fixed) * 100) / 100;
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) { toast.error('Enter valid amount'); return; }
    if (!withdrawMethod) { toast.error('Select a withdrawal method'); return; }
    if (!withdrawAddress.trim()) { toast.error('Enter wallet address / Binance Pay ID'); return; }
    try {
      await axiosInstance.post(`/seller/withdraw?user_id=${user.id}`, {
        amount: amt, method: withdrawMethod, wallet_address: withdrawAddress.trim(),
      });
      toast.success('Withdrawal request submitted');
      setWithdrawAmount(''); setWithdrawMethod(''); setWithdrawAddress('');
      loadData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleDeliver = async () => {
    if (!deliveryOrder || !deliveryCodes.trim()) { toast.error('Enter delivery codes'); return; }
    const codes = deliveryCodes.split('\n').map(c => c.trim()).filter(Boolean);
    if (codes.length === 0) { toast.error('Enter at least one delivery code'); return; }
    try {
      await axiosInstance.post(`/seller/orders/${deliveryOrder.id}/deliver?user_id=${user.id}`, {
        delivery_codes: codes, delivery_note: deliveryNote.trim() || null,
      });
      toast.success('Delivery submitted!');
      setDeliveryDialog(false); setDeliveryCodes(''); setDeliveryNote(''); loadData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error submitting delivery'); }
  };

  const tabs = [
    { id: 'products', label: 'My Products', icon: <Package size={16} /> },
    { id: 'orders', label: 'Orders', icon: <ShoppingCart size={16} /> },
    { id: 'earnings', label: 'Earnings', icon: <DollarSign size={16} /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-3 md:px-4 py-6 md:py-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <div>
            <h1 className="text-xl md:text-3xl font-bold text-white flex items-center gap-2">
              <Store className="text-green-400" size={22} /> Seller Dashboard
            </h1>
            <p className="text-white/60 text-sm mt-1">{user?.seller_store_name || 'My Store'}</p>
          </div>
          <Button onClick={() => window.location.href = '/'} variant="outline" className="border-white/20 text-white hover:bg-white/10 text-xs self-start">
            <ShoppingCart size={14} className="mr-1" /> View as Buyer
          </Button>
        </div>

        {/* Welcome guide for new sellers */}
        {myProducts.length === 0 && !loading && (
          <Card className="bg-[#141414] border border-green-500/20 mb-6">
            <CardContent className="p-6">
              <h3 className="text-white font-bold text-lg mb-2">🎉 Welcome to your Seller Dashboard!</h3>
              <p className="text-white/60 text-sm mb-4">Start earning by following these simple steps:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { step: '1', title: 'Request Categories', text: 'Use the form below to request access to categories like Gift Cards, Game Top-Up, Subscriptions, or Services.', color: 'text-green-300', bg: 'bg-cyan-500/10' },
                  { step: '2', title: 'Add Products', text: 'Click "Add Product" to create your products. Choose a category, set your price, and upload an image.', color: 'text-green-300', bg: 'bg-green-500/10' },
                  { step: '3', title: 'Add Delivery Codes', text: 'Upload your product codes (gift card keys, activation codes) so buyers get instant delivery.', color: 'text-purple-300', bg: 'bg-green-500/10' },
                  { step: '4', title: 'Earn & Withdraw', text: 'Track your earnings in real-time and withdraw via Binance Pay or USDT whenever you want.', color: 'text-green-300', bg: 'bg-green-500/10' },
                ].map(s => (
                  <div key={s.step} className={`p-4 ${s.bg} rounded-xl border border-white/10`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-7 h-7 rounded-full bg-white/10 ${s.color} flex items-center justify-center text-xs font-bold`}>{s.step}</span>
                      <h4 className={`${s.color} font-semibold text-sm`}>{s.title}</h4>
                    </div>
                    <p className="text-white/60 text-xs leading-relaxed">{s.text}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4 mb-6">
          {[
            { label: 'Products', value: myProducts.length, color: 'text-white' },
            { label: 'Orders', value: earnings.total_orders, color: 'text-white' },
            { label: 'Available', value: `$${earnings.balance.toFixed(2)}`, color: 'text-green-400' },
            { label: 'Pending', value: `$${(earnings.pending_balance || 0).toFixed(2)}`, color: 'text-yellow-400' },
            { label: 'Total Earned', value: `$${earnings.total_earned.toFixed(2)}`, color: 'text-orange-400' },
          ].map(s => (
            <div key={s.label} className="rounded-xl bg-[#141414] border border-white/5 p-3 md:p-4">
              <p className="text-white/50 text-[10px] md:text-xs">{s.label}</p>
              <p className={`${s.color} font-bold text-lg md:text-2xl`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Approved Categories */}
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-white/50 text-xs">Categories:</span>
            {approvedCategories.length > 0
              ? approvedCategories.map(c => {
                  const meta = getCatMeta(c);
                  const Icon = meta.icon;
                  return <Badge key={c} className={`${meta.badge} flex items-center gap-1 text-[10px]`}><Icon size={10} /> {meta.label}</Badge>;
                })
              : <span className="text-white/30 text-xs">None — request below</span>
            }
          </div>
          <div className="flex gap-2 items-center">
            <Input value={catRequest} onChange={(e) => setCatRequest(e.target.value)}
              placeholder="e.g. giftcard, topup" className="bg-white/5 border-white/10 text-white text-xs flex-1" />
            <Button size="sm" onClick={handleCatRequest} className="bg-green-600 text-white text-xs whitespace-nowrap">
              <Send size={12} className="mr-1" /> Request
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                tab === t.id ? 'bg-green-500 text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}>
              {t.icon} <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* ===== MY PRODUCTS TAB ===== */}
        {tab === 'products' && (
          <div>
            <Button className="bg-gradient-to-r from-green-500 to-green-600 text-white mb-4"
              onClick={() => { resetProductForm(); setProductDialog(true); }}>
              <Plus size={18} className="mr-2" /> Add Product
            </Button>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myProducts.map(p => {
                const meta = getCatMeta(p.category);
                const status = p.product_status || 'pending_review';
                return (
                  <Card key={p.id} className="bg-[#141414] border border-white/5">
                    <CardContent className="p-4">
                      <div className="flex gap-3 mb-3">
                        {p.image_url && <img src={p.image_url} alt="" className="w-14 h-14 rounded object-cover flex-shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <h3 className="text-white font-bold text-sm truncate">{p.name}</h3>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            <Badge className={`${meta.badge} text-xs`}>{meta.label}</Badge>
                            <Badge className={status === 'approved' ? 'bg-green-500/20 text-green-300' : status === 'rejected' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}>
                              {status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-green-300 font-bold mt-1">${Number(p.price).toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEditProduct(p)}
                          className="flex-1 border-white/20 text-white hover:bg-white/10 text-xs">
                          <Edit2 size={12} className="mr-1" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setCodesProduct(p); setCodesOpen(true); }}
                          className="border-cyan-400 text-green-300 hover:bg-cyan-400/10 px-2">
                          <Key size={12} />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteProduct(p.id)}
                          className="border-red-400 text-red-400 hover:bg-red-400/10 px-2">
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {myProducts.length === 0 && <p className="text-white/40 col-span-full text-center py-8">No products yet. Add your first product!</p>}
            </div>
          </div>
        )}

        {/* ===== ORDERS TAB ===== */}
        {tab === 'orders' && (
          <div className="space-y-3">
            {orders.length === 0 && <p className="text-white/40 text-center py-8">No orders yet</p>}
            {orders.map(o => {
              const hasDelivery = o.seller_deliveries && o.seller_deliveries.length > 0;
              const needsDelivery = o.order_status !== 'completed' && !hasDelivery && (o.seller_items || []).some(i => i.delivery_type === 'manual' || !i.delivery_type);
              return (
                <Card key={o.id} className="bg-[#141414] border border-white/5">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-white font-bold text-sm">Order #{o.id?.slice(0, 8)}</p>
                          <Badge className={o.order_status === 'completed' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}>{o.order_status}</Badge>
                          {hasDelivery && <Badge className="bg-blue-500/20 text-blue-300"><Truck size={10} className="mr-1" />Delivered</Badge>}
                        </div>
                        <p className="text-white/50 text-xs mb-2">{o.user_email} • {o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}</p>
                        <div className="space-y-1">
                          {(o.seller_items || []).map((item, i) => (
                            <p key={i} className="text-white/70 text-xs">{item.product_name} x{item.quantity} — ${Number(item.price).toFixed(2)}</p>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-2">
                          {needsDelivery && (
                            <Button size="sm" onClick={() => { setDeliveryOrder(o); setDeliveryDialog(true); }}
                              className="bg-blue-600 text-white text-xs">
                              <Truck size={12} className="mr-1" /> Deliver
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => window.location.href = `/messages?order=${o.id}`}
                            className="border-white/20 text-white text-xs hover:bg-white/10">
                            <MessageCircle size={12} className="mr-1" /> Message Buyer
                          </Button>
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-green-300 font-bold">${(o.seller_earnings || 0).toFixed(2)}</p>
                        <p className="text-white/40 text-[10px]">net earnings</p>
                        {o.seller_earnings_gross && o.seller_earnings_gross !== o.seller_earnings && (
                          <p className="text-white/30 text-[10px] line-through">${o.seller_earnings_gross.toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ===== EARNINGS TAB ===== */}
        {tab === 'earnings' && (
          <div className="space-y-4 max-w-lg mx-auto">
            {/* Earnings Summary - matches screenshot */}
            <div className="rounded-xl bg-[#141414] border border-white/5 p-5">
              <h2 className="text-white font-bold text-lg mb-4">Earnings Summary</h2>
              <div className="flex gap-6 flex-wrap mb-3">
                <div>
                  <p className="text-white/50 text-sm">Available</p>
                  <p className="text-green-400 font-bold text-2xl">${earnings.balance.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-white/50 text-sm">Pending</p>
                  <p className="text-yellow-400 font-bold text-2xl">${(earnings.pending_balance || 0).toFixed(2)}</p>
                  <p className="text-white/20 text-[10px]">In escrow</p>
                </div>
                <div>
                  <p className="text-white/50 text-sm">Total Earned</p>
                  <p className="text-white font-bold text-2xl">${earnings.total_earned.toFixed(2)}</p>
                </div>
              </div>
              <p className="text-white/30 text-xs">Platform commission: {earnings.commission_rate}%</p>
            </div>

            {/* Request Withdrawal - matches screenshot */}
            <div className="rounded-xl bg-[#141414] border border-white/5 p-5">
              <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                <Wallet size={18} className="text-green-400" /> Request Withdrawal
              </h2>
              <div className="space-y-4">
                <div>
                  <Label className="text-white/70 text-sm">Withdrawal Method *</Label>
                  <Select value={withdrawMethod} onValueChange={setWithdrawMethod}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1"><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      {withdrawalInfo.methods.map(m => (<SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                {withdrawMethod && (
                  <div>
                    <Label className="text-white/70 text-sm">{withdrawalInfo.methods.find(m => m.id === withdrawMethod)?.label} Address *</Label>
                    <Input value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)}
                      placeholder={withdrawalInfo.methods.find(m => m.id === withdrawMethod)?.placeholder || ''}
                      className="bg-white/5 border-white/10 text-white mt-1" />
                  </div>
                )}
                <div>
                  <Label className="text-white/70 text-sm">Amount (USD) *</Label>
                  <Input type="number" step="0.01" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder={`Min $${withdrawalInfo.min_amount}`} className="bg-white/5 border-white/10 text-white mt-1" />
                </div>
                {withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-white/50">Amount</span><span className="text-white">${parseFloat(withdrawAmount).toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-white/50">Fee</span><span className="text-red-400">-${calcFee(withdrawAmount).toFixed(2)}</span></div>
                    <div className="border-t border-white/10 pt-1 flex justify-between font-bold"><span className="text-white">You receive</span><span className="text-green-400">${(parseFloat(withdrawAmount) - calcFee(withdrawAmount)).toFixed(2)}</span></div>
                  </div>
                )}
                <Button onClick={handleWithdraw} disabled={!withdrawMethod || !withdrawAddress || !withdrawAmount}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full py-3">Submit Withdrawal</Button>
              </div>
            </div>
          </div>
        )}

        {/* ===== ANALYTICS TAB ===== */}
        {tab === 'analytics' && (
          <div className="space-y-4">
            {!analytics ? (
              <p className="text-white/60 text-center py-8">Loading analytics...</p>
            ) : (
              <>
                {/* Key Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Orders', value: analytics.total_orders, color: 'text-green-300' },
                    { label: 'Active Offers', value: analytics.offer_count, color: 'text-green-300' },
                    { label: 'Avg Rating', value: analytics.avg_rating > 0 ? `${analytics.avg_rating} ★` : 'N/A', color: 'text-yellow-300' },
                    { label: 'Reviews', value: analytics.review_count, color: 'text-purple-300' },
                  ].map(s => (
                    <Card key={s.label} className="bg-[#141414] border border-white/5">
                      <CardContent className="p-4">
                        <p className="text-white/60 text-xs">{s.label}</p>
                        <p className={`${s.color} font-bold text-2xl`}>{s.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Revenue Chart (simple bar chart) */}
                {analytics.daily_sales.length > 0 && (
                  <Card className="bg-[#141414] border border-white/5">
                    <CardContent className="p-6">
                      <h3 className="text-white font-bold mb-4 flex items-center gap-2"><BarChart3 size={18} className="text-green-400" /> Revenue (Last 30 days)</h3>
                      <div className="flex items-end gap-1 h-40">
                        {(() => {
                          const maxVal = Math.max(...analytics.daily_sales.map(d => d.revenue), 1);
                          return analytics.daily_sales.map((d, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                              <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                                {d.date}: ${d.revenue.toFixed(2)}
                              </div>
                              <div
                                className="w-full bg-gradient-to-t from-cyan-500 to-purple-500 rounded-t"
                                style={{ height: `${(d.revenue / maxVal) * 100}%`, minHeight: '2px' }}
                              />
                            </div>
                          ));
                        })()}
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className="text-white/30 text-[10px]">{analytics.daily_sales[0]?.date}</span>
                        <span className="text-white/30 text-[10px]">{analytics.daily_sales[analytics.daily_sales.length - 1]?.date}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Top Products */}
                {analytics.top_products.length > 0 && (
                  <Card className="bg-[#141414] border border-white/5">
                    <CardContent className="p-6">
                      <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Star size={18} className="text-yellow-400" /> Top Products</h3>
                      <div className="space-y-2">
                        {analytics.top_products.map((p, i) => (
                          <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                            <div className="flex items-center gap-3">
                              <span className="text-white/40 text-sm font-mono w-6">#{i + 1}</span>
                              <p className="text-white text-sm font-medium">{p.name}</p>
                            </div>
                            <div className="flex gap-4 text-sm">
                              <span className="text-white/60">{p.units} sold</span>
                              <span className="text-green-300 font-bold">${p.revenue.toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recent Withdrawals */}
                {analytics.recent_withdrawals.length > 0 && (
                  <Card className="bg-[#141414] border border-white/5">
                    <CardContent className="p-6">
                      <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Wallet size={18} className="text-green-400" /> Recent Withdrawals</h3>
                      <div className="space-y-2">
                        {analytics.recent_withdrawals.map(w => (
                          <div key={w.id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                            <div>
                              <p className="text-white text-sm">${w.amount?.toFixed(2)} via {w.method}</p>
                              <p className="text-white/40 text-xs">{w.created_at ? new Date(w.created_at).toLocaleDateString() : ''}</p>
                            </div>
                            <Badge className={w.status === 'approved' ? 'bg-green-500/20 text-green-300' : w.status === 'rejected' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}>
                              {w.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Delivery Dialog */}
      <Dialog open={deliveryDialog} onOpenChange={setDeliveryDialog}>
        <DialogContent className="max-w-md bg-gray-900 border-white/20">
          <DialogHeader><DialogTitle className="text-white flex items-center gap-2"><Truck size={20} className="text-blue-400" /> Submit Delivery</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-white/60 text-sm">Order #{deliveryOrder?.id?.slice(0, 8)} — Enter delivery codes for the buyer</p>
            <div>
              <Label className="text-white">Delivery Codes *</Label>
              <Textarea value={deliveryCodes} onChange={(e) => setDeliveryCodes(e.target.value)}
                className="bg-white/10 border-white/20 text-white mt-1 font-mono" rows={4}
                placeholder="Enter one code per line" />
            </div>
            <div>
              <Label className="text-white">Note to buyer</Label>
              <Input value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)}
                className="bg-white/10 border-white/20 text-white mt-1" placeholder="Optional delivery instructions" />
            </div>
            <Button onClick={handleDeliver} className="w-full bg-blue-600 text-white">Submit Delivery</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Product Dialog */}
      <Dialog open={productDialog} onOpenChange={(o) => { setProductDialog(o); if (!o) resetProductForm(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-gray-900 border-white/20">
          <DialogHeader><DialogTitle className="text-white">{editingProduct ? 'Edit Product' : 'New Marketplace Product'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-white text-sm">Product Name *</Label><Input value={productForm.name} onChange={(e) => setProductForm(p => ({ ...p, name: e.target.value }))} className="bg-white/10 border-white/20 text-white" placeholder="e.g. Netflix Premium 1 Month" /></div>
            <div>
              <Label className="text-white text-sm">Description * <span className="text-white/40">(min 50 chars)</span></Label>
              <Textarea value={productForm.description} onChange={(e) => setProductForm(p => ({ ...p, description: e.target.value }))} className="bg-white/10 border-white/20 text-white" rows={3} placeholder="Describe your product in detail — what the buyer gets, how delivery works, etc." />
              <p className={`text-xs mt-1 ${(productForm.description || '').length >= 50 ? 'text-green-400' : 'text-white/30'}`}>{(productForm.description || '').length}/50 characters</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white text-sm">Category *</Label>
                <Select value={productForm.category} onValueChange={(v) => setProductForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{approvedCategories.map(c => <SelectItem key={c} value={c}>{getCatMeta(c).label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-white text-sm">Price (USD) *</Label><Input type="number" step="0.01" value={productForm.price} onChange={(e) => setProductForm(p => ({ ...p, price: e.target.value }))} className="bg-white/10 border-white/20 text-white" placeholder="0.00" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white text-sm">Delivery Method</Label>
                <Select value={productForm.delivery_type} onValueChange={(v) => setProductForm(p => ({ ...p, delivery_type: v }))}>
                  <SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="automatic">Automatic</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white text-sm">Delivery Time</Label>
                <Select value={productForm.delivery_time} onValueChange={(v) => setProductForm(p => ({ ...p, delivery_time: v }))}>
                  <SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instant">Instant</SelectItem>
                    <SelectItem value="1h">Within 1 Hour</SelectItem>
                    <SelectItem value="24h">Within 24 Hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={productForm.stock_available} onCheckedChange={(v) => setProductForm(p => ({ ...p, stock_available: v }))} />
              <Label className="text-white text-sm">In Stock</Label>
            </div>
            <div>
              <Label className="text-white text-sm">Image * <span className="text-white/40">(required)</span></Label>
              {productForm.image_url && (
                <div className="w-full h-24 rounded-lg overflow-hidden bg-[#1c1c1c] mb-2">
                  <img src={productForm.image_url} alt="Preview" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                </div>
              )}
              <Input value={productForm.image_url} onChange={(e) => setProductForm(p => ({ ...p, image_url: e.target.value }))} className="bg-white/10 border-white/20 text-white" placeholder="Paste image URL" />
              <Input type="file" accept="image/*" className="bg-white/10 border-white/20 text-white mt-2 cursor-pointer"
                onChange={async (e) => { const url = await uploadImage(e.target.files?.[0]); if (url) setProductForm(p => ({ ...p, image_url: url })); }} />
            </div>
            <Button onClick={handleProductSubmit} className="w-full bg-green-500 hover:bg-green-600 text-black font-semibold py-3 rounded-lg">
              {editingProduct ? 'Update Product' : 'List on Marketplace'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ProductCodesManager product={codesProduct} open={codesOpen} onOpenChange={(o) => { setCodesOpen(o); if (!o) setCodesProduct(null); }} />
      <Footer settings={settings} />
    </div>
  );
};

export default SellerDashboard;
