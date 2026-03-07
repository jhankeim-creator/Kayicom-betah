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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Store, Package, ShoppingCart, DollarSign, Plus, Edit2, Trash2, Key, Send } from 'lucide-react';
import { toast } from 'sonner';

const SellerDashboard = ({ user, logout, settings }) => {
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [earnings, setEarnings] = useState({ balance: 0, total_earned: 0, total_orders: 0, commission_rate: 10 });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [codesProduct, setCodesProduct] = useState(null);
  const [codesOpen, setCodesOpen] = useState(false);
  const [catRequest, setCatRequest] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [formData, setFormData] = useState({
    name: '', description: '', category: '', price: '', image_url: '',
    stock_available: true, delivery_type: 'automatic', variant_name: '', region: '',
  });

  const approvedCategories = user?.seller_approved_categories || [];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, orderRes, earnRes] = await Promise.all([
        axiosInstance.get(`/seller/products?user_id=${user.id}`),
        axiosInstance.get(`/seller/orders?user_id=${user.id}`),
        axiosInstance.get(`/seller/earnings?user_id=${user.id}`),
      ]);
      setProducts(prodRes.data);
      setOrders(orderRes.data);
      setEarnings(earnRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const resetForm = () => {
    setFormData({ name: '', description: '', category: approvedCategories[0] || '', price: '', image_url: '',
      stock_available: true, delivery_type: 'automatic', variant_name: '', region: '' });
    setEditingProduct(null);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.price || !formData.category) {
      toast.error('Fill required fields'); return;
    }
    try {
      const payload = { ...formData, price: parseFloat(formData.price) };
      if (editingProduct) {
        await axiosInstance.put(`/seller/products/${editingProduct.id}?user_id=${user.id}`, payload);
        toast.success('Product updated');
      } else {
        await axiosInstance.post(`/seller/products?user_id=${user.id}`, payload);
        toast.success('Product created');
      }
      setDialogOpen(false); resetForm(); loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error saving product');
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name, description: product.description, category: product.category,
      price: String(product.price), image_url: product.image_url || '',
      stock_available: product.stock_available ?? true, delivery_type: product.delivery_type || 'automatic',
      variant_name: product.variant_name || '', region: product.region || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      await axiosInstance.delete(`/seller/products/${id}?user_id=${user.id}`);
      toast.success('Deleted'); loadData();
    } catch (err) { toast.error('Error deleting'); }
  };

  const handleCatRequest = async () => {
    if (!catRequest.trim()) { toast.error('Enter a category'); return; }
    try {
      await axiosInstance.post(`/seller/category-request?user_id=${user.id}`, {
        categories: catRequest.split(',').map(c => c.trim()).filter(Boolean)
      });
      toast.success('Category request submitted'); setCatRequest('');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) { toast.error('Enter valid amount'); return; }
    try {
      await axiosInstance.post(`/seller/withdraw?user_id=${user.id}&amount=${amt}`);
      toast.success('Withdrawal request submitted'); setWithdrawAmount(''); loadData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const uploadImage = async (file) => {
    if (!file || file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return null; }
    try {
      const data = new FormData(); data.append('file', file);
      const res = await axiosInstance.post('/upload/image', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      return res.data?.url || null;
    } catch { toast.error('Upload failed'); return null; }
  };

  const tabs = [
    { id: 'products', label: 'Products', icon: <Package size={16} /> },
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
              <p className="text-white/60 text-xs">Products</p>
              <p className="text-white font-bold text-2xl">{products.length}</p>
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
        <div className="flex gap-2 mb-6">
          {tabs.map(t => (
            <Button key={t.id} size="sm" onClick={() => setTab(t.id)}
              className={`${tab === t.id ? 'bg-pink-500' : 'bg-white/10'} text-white text-sm`}>
              {t.icon} <span className="ml-1">{t.label}</span>
            </Button>
          ))}
        </div>

        {/* Products Tab */}
        {tab === 'products' && (
          <div>
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-pink-500 to-blue-500 text-white mb-4" onClick={resetForm}>
                  <Plus size={18} className="mr-2" /> Add Product
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-gray-900 border-white/20">
                <DialogHeader>
                  <DialogTitle className="text-white">{editingProduct ? 'Edit Product' : 'New Product'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <Label className="text-white">Name *</Label>
                    <Input value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white" />
                  </div>
                  <div>
                    <Label className="text-white">Description</Label>
                    <Textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white" rows={2} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-white">Category *</Label>
                      <Select value={formData.category} onValueChange={(v) => setFormData(p => ({ ...p, category: v }))}>
                        <SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {approvedCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-white">Price *</Label>
                      <Input type="number" step="0.01" value={formData.price}
                        onChange={(e) => setFormData(p => ({ ...p, price: e.target.value }))}
                        className="bg-white/10 border-white/20 text-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-white">Delivery</Label>
                      <Select value={formData.delivery_type} onValueChange={(v) => setFormData(p => ({ ...p, delivery_type: v }))}>
                        <SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="automatic">Automatic</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <Checkbox checked={formData.stock_available}
                        onCheckedChange={(v) => setFormData(p => ({ ...p, stock_available: v }))} />
                      <Label className="text-white text-sm">In Stock</Label>
                    </div>
                  </div>
                  <div>
                    <Label className="text-white">Variant Name</Label>
                    <Input value={formData.variant_name} onChange={(e) => setFormData(p => ({ ...p, variant_name: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white" placeholder="e.g. US - $25" />
                  </div>
                  <div>
                    <Label className="text-white">Region</Label>
                    <Input value={formData.region} onChange={(e) => setFormData(p => ({ ...p, region: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white" placeholder="US, EU, etc." />
                  </div>
                  <div>
                    <Label className="text-white">Image</Label>
                    <Input value={formData.image_url} onChange={(e) => setFormData(p => ({ ...p, image_url: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white" placeholder="URL or upload below" />
                    <Input type="file" accept="image/*" className="bg-white/10 border-white/20 text-white mt-2 cursor-pointer"
                      onChange={async (e) => {
                        const url = await uploadImage(e.target.files?.[0]);
                        if (url) setFormData(p => ({ ...p, image_url: url }));
                      }} />
                  </div>
                  <Button onClick={handleSubmit} className="w-full bg-white text-purple-600 hover:bg-gray-100">
                    {editingProduct ? 'Update' : 'Create Product'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {loading ? <p className="text-white/60">Loading...</p> : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map(p => (
                  <Card key={p.id} className="glass-effect border-white/20">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-white font-bold text-sm truncate">{p.name}</h3>
                          <p className="text-white/50 text-xs">{p.category} {p.region && `• ${p.region}`}</p>
                          <p className="text-white font-bold mt-1">${Number(p.price).toFixed(2)}</p>
                        </div>
                        {p.image_url && <img src={p.image_url} alt="" className="w-14 h-14 rounded object-cover" />}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(p)}
                          className="flex-1 border-white/20 text-white hover:bg-white/10 text-xs">
                          <Edit2 size={12} className="mr-1" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setCodesProduct(p); setCodesOpen(true); }}
                          className="border-cyan-400 text-cyan-300 hover:bg-cyan-400/10 px-2">
                          <Key size={12} />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(p.id)}
                          className="border-red-400 text-red-400 hover:bg-red-400/10 px-2">
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {products.length === 0 && <p className="text-white/40 col-span-full text-center py-8">No products yet. Add your first product!</p>}
              </div>
            )}
          </div>
        )}

        {/* Orders Tab */}
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
                      <div className="flex gap-2 mt-1">
                        <Badge className={o.order_status === 'completed' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}>
                          {o.order_status}
                        </Badge>
                      </div>
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

        {/* Earnings Tab */}
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
                <h2 className="text-lg font-bold text-white mb-3">Request Withdrawal</h2>
                <div className="flex gap-2">
                  <Input type="number" step="0.01" value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Amount in USD" className="bg-white/10 border-white/20 text-white" />
                  <Button onClick={handleWithdraw} className="bg-green-600 text-white">Withdraw</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <ProductCodesManager product={codesProduct} open={codesOpen}
        onOpenChange={(o) => { setCodesOpen(o); if (!o) setCodesProduct(null); }} />

      <Footer settings={settings} />
    </div>
  );
};

export default SellerDashboard;
