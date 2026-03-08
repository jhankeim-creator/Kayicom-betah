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
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Store, Package, ShoppingCart, DollarSign, ShoppingBag, Send, Tag, Plus, Trash2, Key, Wallet } from 'lucide-react';
import { toast } from 'sonner';

const SellerDashboard = ({ user, logout, settings }) => {
  const [tab, setTab] = useState('marketplace');
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [myOffers, setMyOffers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [earnings, setEarnings] = useState({ balance: 0, total_earned: 0, total_orders: 0, commission_rate: 10 });
  const [withdrawalInfo, setWithdrawalInfo] = useState({ methods: [], fee_percent: 0, fee_fixed: 0, min_amount: 5 });
  const [productRequests, setProductRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [codesProduct, setCodesProduct] = useState(null);
  const [codesOpen, setCodesOpen] = useState(false);
  const [catRequest, setCatRequest] = useState('');

  // Offer dialog
  const [offerDialog, setOfferDialog] = useState(false);
  const [offerProduct, setOfferProduct] = useState(null);
  const [offerPrice, setOfferPrice] = useState('');
  const [offerDelivery, setOfferDelivery] = useState('automatic');
  const [offerStock, setOfferStock] = useState(true);

  // Product request dialog
  const [reqDialog, setReqDialog] = useState(false);
  const [reqForm, setReqForm] = useState({ product_name: '', description: '', category: '', suggested_price: '', notes: '' });

  // Withdrawal
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');

  const approvedCategories = user?.seller_approved_categories || [];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [earnRes, offersRes, orderRes, wInfoRes, reqRes] = await Promise.all([
        axiosInstance.get(`/seller/earnings?user_id=${user.id}`),
        axiosInstance.get(`/seller/offers?user_id=${user.id}`),
        axiosInstance.get(`/seller/orders?user_id=${user.id}`),
        axiosInstance.get('/seller/withdrawal-info'),
        axiosInstance.get(`/seller/product-requests?user_id=${user.id}`),
      ]);
      setEarnings(earnRes.data);
      setMyOffers(offersRes.data);
      setOrders(orderRes.data);
      setWithdrawalInfo(wInfoRes.data);
      setProductRequests(reqRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [user?.id]);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await axiosInstance.get(`/seller/catalog?user_id=${user.id}`);
      setCatalogProducts(res.data);
    } catch (err) { console.error(err); }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (tab === 'marketplace') loadCatalog(); }, [tab, loadCatalog]);

  const handleCatRequest = async () => {
    if (!catRequest.trim()) { toast.error('Enter a category'); return; }
    try {
      await axiosInstance.post(`/seller/category-request?user_id=${user.id}`, {
        categories: catRequest.split(',').map(c => c.trim()).filter(Boolean)
      });
      toast.success('Category request submitted'); setCatRequest('');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const openOfferDialog = (product) => {
    setOfferProduct(product);
    setOfferPrice(String(product.price));
    setOfferDelivery('automatic');
    setOfferStock(true);
    setOfferDialog(true);
  };

  const handleCreateOffer = async () => {
    if (!offerProduct || !offerPrice) { toast.error('Enter a price'); return; }
    try {
      await axiosInstance.post(`/seller/offers?user_id=${user.id}`, {
        product_id: offerProduct.id,
        price: parseFloat(offerPrice),
        delivery_type: offerDelivery,
        stock_available: offerStock,
      });
      toast.success('Offer created!');
      setOfferDialog(false);
      loadCatalog();
      loadData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error creating offer'); }
  };

  const handleDeleteOffer = async (offerId) => {
    if (!window.confirm('Remove this offer?')) return;
    try {
      await axiosInstance.delete(`/seller/offers/${offerId}?user_id=${user.id}`);
      toast.success('Offer removed');
      loadData();
    } catch (err) { toast.error('Error removing offer'); }
  };

  const handleProductRequest = async () => {
    if (!reqForm.product_name || !reqForm.description || !reqForm.category) {
      toast.error('Fill in product name, description and category'); return;
    }
    try {
      await axiosInstance.post(`/seller/product-requests?user_id=${user.id}`, {
        ...reqForm,
        suggested_price: reqForm.suggested_price ? parseFloat(reqForm.suggested_price) : null,
      });
      toast.success('Product request submitted!');
      setReqDialog(false);
      setReqForm({ product_name: '', description: '', category: '', suggested_price: '', notes: '' });
      loadData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const calcFee = (amt) => {
    const a = parseFloat(amt) || 0;
    return Math.round((a * (withdrawalInfo.fee_percent / 100) + withdrawalInfo.fee_fixed) * 100) / 100;
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) { toast.error('Enter valid amount'); return; }
    if (!withdrawMethod) { toast.error('Select a withdrawal method'); return; }
    if (!withdrawAddress.trim()) { toast.error('Enter wallet address / Binance Pay ID'); return; }
    try {
      await axiosInstance.post(`/seller/withdraw?user_id=${user.id}`, {
        amount: amt,
        method: withdrawMethod,
        wallet_address: withdrawAddress.trim(),
      });
      toast.success('Withdrawal request submitted');
      setWithdrawAmount(''); setWithdrawMethod(''); setWithdrawAddress('');
      loadData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const tabs = [
    { id: 'marketplace', label: 'Marketplace', icon: <ShoppingBag size={16} /> },
    { id: 'offers', label: 'My Offers', icon: <Tag size={16} /> },
    { id: 'orders', label: 'Orders', icon: <ShoppingCart size={16} /> },
    { id: 'earnings', label: 'Earnings', icon: <DollarSign size={16} /> },
  ];

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Store className="text-cyan-400" /> Seller Dashboard
            </h1>
            <p className="text-white/60 mt-1">{user?.seller_store_name || 'My Store'}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-cyan-500/30">
            <CardContent className="p-4">
              <p className="text-white/60 text-xs">My Offers</p>
              <p className="text-white font-bold text-2xl">{myOffers.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/30">
            <CardContent className="p-4">
              <p className="text-white/60 text-xs">Orders</p>
              <p className="text-white font-bold text-2xl">{earnings.total_orders}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/30">
            <CardContent className="p-4">
              <p className="text-white/60 text-xs">Balance</p>
              <p className="text-green-300 font-bold text-2xl">${earnings.balance.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-500/20 to-yellow-500/20 border-orange-500/30">
            <CardContent className="p-4">
              <p className="text-white/60 text-xs">Total Earned</p>
              <p className="text-orange-300 font-bold text-2xl">${earnings.total_earned.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Approved Categories */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-white/60 text-sm">Approved categories:</span>
          {approvedCategories.length > 0
            ? approvedCategories.map(c => <Badge key={c} className="bg-cyan-500/20 text-cyan-300">{c}</Badge>)
            : <span className="text-white/40 text-sm">None yet — request below</span>
          }
          <div className="flex gap-2 ml-auto">
            <Input value={catRequest} onChange={(e) => setCatRequest(e.target.value)}
              placeholder="e.g. giftcard, topup" className="bg-white/10 border-white/20 text-white text-sm w-48" />
            <Button size="sm" onClick={handleCatRequest} className="bg-cyan-600 text-white text-xs">
              <Send size={14} className="mr-1" /> Request
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map(t => (
            <Button key={t.id} size="sm" onClick={() => setTab(t.id)}
              className={`${tab === t.id ? 'bg-pink-500' : 'bg-white/10'} text-white text-sm whitespace-nowrap`}>
              {t.icon} <span className="ml-1">{t.label}</span>
            </Button>
          ))}
        </div>

        {/* ===== MARKETPLACE TAB ===== */}
        {tab === 'marketplace' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-white/60 text-sm">Browse catalog products and create your offers</p>
              <Button size="sm" onClick={() => setReqDialog(true)} className="bg-purple-600 text-white text-xs">
                <Plus size={14} className="mr-1" /> Request New Product
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {catalogProducts.map(p => (
                <Card key={p.id} className="glass-effect border-white/20">
                  <CardContent className="p-4">
                    <div className="flex gap-3 mb-3">
                      {p.image_url && <img src={p.image_url} alt="" className="w-16 h-16 rounded object-cover flex-shrink-0" />}
                      <div className="min-w-0">
                        <h3 className="text-white font-bold text-sm truncate">{p.name}</h3>
                        <p className="text-white/50 text-xs">{p.category} {p.region && `• ${p.region}`}</p>
                        <p className="text-cyan-300 font-bold mt-1">${Number(p.price).toFixed(2)}</p>
                      </div>
                    </div>
                    {p.already_offering ? (
                      <Badge className="bg-green-500/20 text-green-300 w-full justify-center">Already offering</Badge>
                    ) : (
                      <Button size="sm" onClick={() => openOfferDialog(p)}
                        className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white text-xs">
                        <Tag size={14} className="mr-1" /> Sell This Product
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
              {catalogProducts.length === 0 && (
                <p className="text-white/40 col-span-full text-center py-8">
                  {approvedCategories.length === 0 ? 'Request category access first' : 'No catalog products found'}
                </p>
              )}
            </div>

            {/* Product Requests */}
            {productRequests.length > 0 && (
              <div className="mt-8">
                <h3 className="text-white font-bold mb-3">My Product Requests</h3>
                <div className="space-y-2">
                  {productRequests.map(r => (
                    <div key={r.id} className="p-3 bg-white/5 border border-white/10 rounded-lg flex justify-between items-center">
                      <div>
                        <p className="text-white text-sm font-semibold">{r.product_name}</p>
                        <p className="text-white/50 text-xs">{r.category} {r.suggested_price ? `• $${r.suggested_price}` : ''}</p>
                      </div>
                      <Badge className={r.status === 'approved' ? 'bg-green-500/20 text-green-300' : r.status === 'rejected' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}>
                        {r.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== MY OFFERS TAB ===== */}
        {tab === 'offers' && (
          <div>
            {loading ? <p className="text-white/60">Loading...</p> : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myOffers.map(o => (
                  <Card key={o.id} className="glass-effect border-white/20">
                    <CardContent className="p-4">
                      <div className="flex gap-3 mb-3">
                        {o.product_image && <img src={o.product_image} alt="" className="w-14 h-14 rounded object-cover flex-shrink-0" />}
                        <div className="min-w-0">
                          <h3 className="text-white font-bold text-sm truncate">{o.product_name}</h3>
                          <p className="text-cyan-300 font-bold">${Number(o.price).toFixed(2)}</p>
                          <div className="flex gap-2 mt-1">
                            <Badge className={o.stock_available ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}>
                              {o.stock_available ? 'In Stock' : 'Out of Stock'}
                            </Badge>
                            <Badge className="bg-white/10 text-white/60">{o.delivery_type}</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setCodesProduct({ id: o.product_id, name: o.product_name }); setCodesOpen(true); }}
                          className="flex-1 border-cyan-400 text-cyan-300 hover:bg-cyan-400/10 text-xs">
                          <Key size={12} className="mr-1" /> Codes
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteOffer(o.id)}
                          className="border-red-400 text-red-400 hover:bg-red-400/10 px-3">
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {myOffers.length === 0 && <p className="text-white/40 col-span-full text-center py-8">No offers yet. Go to Marketplace to start selling!</p>}
              </div>
            )}
          </div>
        )}

        {/* ===== ORDERS TAB ===== */}
        {tab === 'orders' && (
          <div className="space-y-3">
            {orders.length === 0 && <p className="text-white/40 text-center py-8">No orders yet</p>}
            {orders.map(o => (
              <Card key={o.id} className="glass-effect border-white/20">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-white font-bold text-sm">Order #{o.id?.slice(0, 8)}</p>
                      <p className="text-white/50 text-xs">{o.user_email}</p>
                      <Badge className={o.order_status === 'completed' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}>
                        {o.order_status}
                      </Badge>
                      <div className="mt-2">
                        {(o.seller_items || []).map((item, i) => (
                          <p key={i} className="text-white/70 text-xs">{item.product_name} x{item.quantity} — ${Number(item.price).toFixed(2)}</p>
                        ))}
                      </div>
                    </div>
                    <p className="text-green-300 font-bold">${(o.seller_earnings || 0).toFixed(2)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ===== EARNINGS TAB ===== */}
        {tab === 'earnings' && (
          <div className="space-y-4">
            <Card className="glass-effect border-white/20">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold text-white mb-4">Earnings Summary</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-white/60 text-sm">Available Balance</p>
                    <p className="text-green-300 font-bold text-3xl">${earnings.balance.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-white/60 text-sm">Total Earned</p>
                    <p className="text-white font-bold text-3xl">${earnings.total_earned.toFixed(2)}</p>
                  </div>
                </div>
                <p className="text-white/40 text-xs">Platform commission: {earnings.commission_rate}%</p>
              </CardContent>
            </Card>

            <Card className="glass-effect border-white/20">
              <CardContent className="p-6">
                <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                  <Wallet size={20} className="text-green-400" /> Request Withdrawal
                </h2>

                <div className="space-y-4">
                  <div>
                    <Label className="text-white">Withdrawal Method *</Label>
                    <Select value={withdrawMethod} onValueChange={setWithdrawMethod}>
                      <SelectTrigger className="bg-white/10 border-white/20 text-white mt-1">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        {withdrawalInfo.methods.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {withdrawMethod && (
                    <div>
                      <Label className="text-white">
                        {withdrawalInfo.methods.find(m => m.id === withdrawMethod)?.label} Address *
                      </Label>
                      <Input value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)}
                        placeholder={withdrawalInfo.methods.find(m => m.id === withdrawMethod)?.placeholder || 'Enter address'}
                        className="bg-white/10 border-white/20 text-white mt-1" />
                    </div>
                  )}

                  <div>
                    <Label className="text-white">Amount (USD) *</Label>
                    <Input type="number" step="0.01" value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder={`Min $${withdrawalInfo.min_amount}`}
                      className="bg-white/10 border-white/20 text-white mt-1" />
                  </div>

                  {/* Fee breakdown */}
                  {withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                    <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">Amount</span>
                        <span className="text-white">${parseFloat(withdrawAmount).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">
                          Fee ({withdrawalInfo.fee_percent > 0 ? `${withdrawalInfo.fee_percent}%` : ''}
                          {withdrawalInfo.fee_percent > 0 && withdrawalInfo.fee_fixed > 0 ? ' + ' : ''}
                          {withdrawalInfo.fee_fixed > 0 ? `$${withdrawalInfo.fee_fixed}` : ''}
                          {withdrawalInfo.fee_percent === 0 && withdrawalInfo.fee_fixed === 0 ? 'None' : ''})
                        </span>
                        <span className="text-red-300">-${calcFee(withdrawAmount).toFixed(2)}</span>
                      </div>
                      <div className="border-t border-white/10 pt-1 flex justify-between text-sm font-bold">
                        <span className="text-white">You receive</span>
                        <span className="text-green-300">${(parseFloat(withdrawAmount) - calcFee(withdrawAmount)).toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  <Button onClick={handleWithdraw} disabled={!withdrawMethod || !withdrawAddress || !withdrawAmount}
                    className="w-full bg-green-600 text-white">
                    Submit Withdrawal
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Create Offer Dialog */}
      <Dialog open={offerDialog} onOpenChange={setOfferDialog}>
        <DialogContent className="max-w-md bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-white">Sell: {offerProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-3 items-center">
              {offerProduct?.image_url && <img src={offerProduct.image_url} alt="" className="w-16 h-16 rounded object-cover" />}
              <div>
                <p className="text-white/60 text-xs">Catalog price: ${Number(offerProduct?.price || 0).toFixed(2)}</p>
                <p className="text-white/40 text-xs">{offerProduct?.category}</p>
              </div>
            </div>
            <div>
              <Label className="text-white">Your Price (USD) *</Label>
              <Input type="number" step="0.01" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)}
                className="bg-white/10 border-white/20 text-white mt-1" />
            </div>
            <div>
              <Label className="text-white">Delivery Type</Label>
              <Select value={offerDelivery} onValueChange={setOfferDelivery}>
                <SelectTrigger className="bg-white/10 border-white/20 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automatic</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreateOffer} className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white">
              Create Offer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Request Dialog */}
      <Dialog open={reqDialog} onOpenChange={setReqDialog}>
        <DialogContent className="max-w-md bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-white">Request New Product</DialogTitle>
          </DialogHeader>
          <p className="text-white/60 text-xs">If the product you want to sell is not in the catalog, request it here. An admin will review and add it.</p>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-white">Product Name *</Label>
              <Input value={reqForm.product_name} onChange={(e) => setReqForm(p => ({ ...p, product_name: e.target.value }))}
                className="bg-white/10 border-white/20 text-white" placeholder="e.g. PlayStation Gift Card $50" />
            </div>
            <div>
              <Label className="text-white">Description *</Label>
              <Textarea value={reqForm.description} onChange={(e) => setReqForm(p => ({ ...p, description: e.target.value }))}
                className="bg-white/10 border-white/20 text-white" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white">Category *</Label>
                <Select value={reqForm.category} onValueChange={(v) => setReqForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {approvedCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white">Suggested Price</Label>
                <Input type="number" step="0.01" value={reqForm.suggested_price}
                  onChange={(e) => setReqForm(p => ({ ...p, suggested_price: e.target.value }))}
                  className="bg-white/10 border-white/20 text-white" />
              </div>
            </div>
            <div>
              <Label className="text-white">Notes</Label>
              <Textarea value={reqForm.notes} onChange={(e) => setReqForm(p => ({ ...p, notes: e.target.value }))}
                className="bg-white/10 border-white/20 text-white" rows={2} placeholder="Any additional info..." />
            </div>
            <Button onClick={handleProductRequest} className="w-full bg-purple-600 text-white">
              Submit Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ProductCodesManager product={codesProduct} open={codesOpen}
        onOpenChange={(o) => { setCodesOpen(o); if (!o) setCodesProduct(null); }} />

      <Footer settings={settings} />
    </div>
  );
};

export default SellerDashboard;
