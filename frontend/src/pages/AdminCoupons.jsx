import { useEffect, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const AdminCoupons = ({ user, logout, settings }) => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    code: '',
    discount_type: 'percent',
    discount_value: 10,
    max_discount_amount: '',
    min_order_amount: 0,
    usage_limit: 1,
    max_uses_per_user: 1,
    expires_at: ''
  });

  useEffect(() => {
    loadCoupons();
  }, []);

  const loadCoupons = async () => {
    try {
      const res = await axiosInstance.get('/coupons');
      setCoupons(res.data || []);
    } catch (e) {
      toast.error('Error loading coupons');
    } finally {
      setLoading(false);
    }
  };

  const createCoupon = async () => {
    if (!form.code) {
      toast.error('Code required');
      return;
    }
    try {
      const payload = {
        code: form.code,
        discount_type: form.discount_type,
        discount_value: parseFloat(form.discount_value),
        max_discount_amount: form.max_discount_amount ? parseFloat(form.max_discount_amount) : null,
        min_order_amount: parseFloat(form.min_order_amount || 0),
        usage_limit: form.usage_limit ? parseInt(form.usage_limit, 10) : 1,
        max_uses_per_user: form.max_uses_per_user ? parseInt(form.max_uses_per_user, 10) : 1,
        expires_at: form.expires_at || null,
      };
      await axiosInstance.post('/coupons', payload);
      toast.success('Coupon created');
      setForm({ code: '', discount_type: 'percent', discount_value: 10, max_discount_amount: '', min_order_amount: 0, usage_limit: 1, max_uses_per_user: 1, expires_at: '' });
      loadCoupons();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error creating coupon');
    }
  };

  const toggleActive = async (coupon) => {
    try {
      await axiosInstance.put(`/coupons/${coupon.id}`, { active: !coupon.active });
      toast.success(coupon.active ? 'Coupon deactivated' : 'Coupon activated');
      loadCoupons();
    } catch (e) {
      toast.error('Error updating coupon');
    }
  };

  const deleteCoupon = async (coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;
    try {
      await axiosInstance.delete(`/coupons/${coupon.id}`);
      toast.success('Coupon deleted');
      loadCoupons();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error deleting coupon');
    }
  };

  const isExpired = (c) => {
    if (!c.expires_at) return false;
    return new Date(c.expires_at) < new Date();
  };

  const isExhausted = (c) => {
    if (c.usage_limit == null) return false;
    return c.used_count >= c.usage_limit;
  };

  const getUsagePercent = (c) => {
    if (c.usage_limit == null || c.usage_limit === 0) return 0;
    return Math.min(100, Math.round((c.used_count / c.usage_limit) * 100));
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-4xl font-bold text-white">Coupons</h1>
            <Button onClick={() => (window.location.href = '/admin')} className="bg-gradient-to-r from-pink-500 to-blue-500 text-white">
              🏠 Admin Home
            </Button>
          </div>

          <Card className="glass-effect border-white/20">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-2xl font-bold text-white">Create Coupon</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-white">Code *</Label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm(prev => ({ ...prev, code: e.target.value }))}
                    className="bg-white/10 border-white/20 text-white mt-2"
                    placeholder="KAYI10"
                  />
                </div>
                <div>
                  <Label className="text-white">Type</Label>
                  <Select value={form.discount_type} onValueChange={(v) => setForm(prev => ({ ...prev, discount_type: v }))}>
                    <SelectTrigger className="bg-white/10 border-white/20 text-white mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percent (%)</SelectItem>
                      <SelectItem value="fixed">Fixed (USD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white">Value</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.discount_value}
                    onChange={(e) => setForm(prev => ({ ...prev, discount_value: e.target.value }))}
                    className="bg-white/10 border-white/20 text-white mt-2"
                  />
                </div>
                <div>
                  <Label className="text-white">Max discount (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.max_discount_amount}
                    onChange={(e) => setForm(prev => ({ ...prev, max_discount_amount: e.target.value }))}
                    className="bg-white/10 border-white/20 text-white mt-2"
                    placeholder="e.g. 50"
                  />
                  <p className="text-white/30 text-xs mt-1">Max $ discount (leave empty = no cap)</p>
                </div>
                <div>
                  <Label className="text-white">Min order (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.min_order_amount}
                    onChange={(e) => setForm(prev => ({ ...prev, min_order_amount: e.target.value }))}
                    className="bg-white/10 border-white/20 text-white mt-2"
                  />
                </div>
                <div>
                  <Label className="text-white">Total usage limit</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.usage_limit}
                    onChange={(e) => setForm(prev => ({ ...prev, usage_limit: e.target.value }))}
                    className="bg-white/10 border-white/20 text-white mt-2"
                    placeholder="1"
                  />
                  <p className="text-white/30 text-xs mt-1">Max total uses (default: 1 = single-use)</p>
                </div>
                <div>
                  <Label className="text-white">Max uses per user</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.max_uses_per_user}
                    onChange={(e) => setForm(prev => ({ ...prev, max_uses_per_user: e.target.value }))}
                    className="bg-white/10 border-white/20 text-white mt-2"
                    placeholder="1"
                  />
                  <p className="text-white/30 text-xs mt-1">Per user limit (default: 1)</p>
                </div>
                <div>
                  <Label className="text-white">Expiration date</Label>
                  <Input
                    type="datetime-local"
                    value={form.expires_at}
                    onChange={(e) => setForm(prev => ({ ...prev, expires_at: e.target.value }))}
                    className="bg-white/10 border-white/20 text-white mt-2"
                  />
                </div>
              </div>
              <Button onClick={createCoupon} className="w-full bg-white text-purple-600 hover:bg-gray-100">
                Create Coupon
              </Button>
            </CardContent>
          </Card>

          <Card className="glass-effect border-white/20">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold text-white mb-4">All Coupons ({coupons.length})</h2>
              {loading ? (
                <p className="text-white">Loading...</p>
              ) : (
                <div className="space-y-3">
                  {coupons.map(c => {
                    const expired = isExpired(c);
                    const exhausted = isExhausted(c);
                    const usagePct = getUsagePercent(c);
                    const statusOk = c.active && !expired && !exhausted;

                    return (
                      <div key={c.id} className={`p-4 border rounded-lg ${statusOk ? 'bg-white/5 border-white/10' : 'bg-white/[0.02] border-white/5'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <p className="text-white font-bold text-lg">{c.code}</p>
                            <Badge className={c.discount_type === 'percent' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-purple-500/20 text-purple-300'}>
                              {c.discount_type === 'percent' ? `${c.discount_value}%` : `$${c.discount_value}`}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {expired && <Badge className="bg-red-500/20 text-red-300">Expired</Badge>}
                            {exhausted && <Badge className="bg-orange-500/20 text-orange-300">Exhausted</Badge>}
                            {!expired && !exhausted && (
                              <Badge className={c.active ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}>
                                {c.active ? 'Active' : 'Inactive'}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs text-white/60 mb-3">
                          <span>Min order: ${c.min_order_amount || 0}</span>
                          <span>Max discount: {c.max_discount_amount != null ? `$${c.max_discount_amount}` : 'No cap'}</span>
                          <span>Total uses: {c.used_count}{c.usage_limit != null ? ` / ${c.usage_limit}` : ' (unlimited)'}</span>
                          <span>Per user: {c.max_uses_per_user != null ? `${c.max_uses_per_user} max` : 'unlimited'}</span>
                          <span>{c.expires_at ? `Expires: ${new Date(c.expires_at).toLocaleDateString()}` : 'No expiration'}</span>
                        </div>

                        {/* Usage progress bar */}
                        {c.usage_limit != null && (
                          <div className="mb-3">
                            <div className="w-full bg-white/10 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all ${usagePct >= 100 ? 'bg-red-500' : usagePct >= 75 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                style={{ width: `${usagePct}%` }}
                              />
                            </div>
                            <p className="text-white/40 text-xs mt-1">
                              {c.usage_limit - c.used_count} remaining of {c.usage_limit} total uses
                            </p>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => toggleActive(c)}
                            className={`text-xs ${c.active ? 'bg-yellow-600/80 hover:bg-yellow-600' : 'bg-green-600/80 hover:bg-green-600'} text-white`}>
                            {c.active ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => deleteCoupon(c)}
                            className="text-xs border-red-400/50 text-red-400 hover:bg-red-500/10">
                            Delete
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {coupons.length === 0 && <p className="text-white/60">No coupons yet.</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default AdminCoupons;
