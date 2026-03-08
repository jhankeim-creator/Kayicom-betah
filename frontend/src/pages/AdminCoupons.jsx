import { useEffect, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const AdminCoupons = ({ user, logout, settings }) => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    code: '',
    discount_type: 'percent',
    discount_value: 10,
    min_order_amount: 0,
    usage_limit: ''
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
      await axiosInstance.post('/coupons', {
        code: form.code,
        discount_type: form.discount_type,
        discount_value: parseFloat(form.discount_value),
        min_order_amount: parseFloat(form.min_order_amount || 0),
        usage_limit: form.usage_limit ? parseInt(form.usage_limit, 10) : null
      });
      toast.success('Coupon created');
      setForm({ code: '', discount_type: 'percent', discount_value: 10, min_order_amount: 0, usage_limit: '' });
      loadCoupons();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error creating coupon');
    }
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-4xl font-bold text-white">Coupons</h1>
            <Button onClick={() => (window.location.href = '/admin')} className="bg-green-500 text-white">
              🏠 Admin Home
            </Button>
          </div>

          <Card className="glass-effect border-white/20">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-2xl font-bold text-white">Create Coupon</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Code</Label>
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
                  <Label className="text-white">Usage limit (optional)</Label>
                  <Input
                    type="number"
                    value={form.usage_limit}
                    onChange={(e) => setForm(prev => ({ ...prev, usage_limit: e.target.value }))}
                    className="bg-white/10 border-white/20 text-white mt-2"
                    placeholder="100"
                  />
                </div>
              </div>
              <Button onClick={createCoupon} className="w-full bg-white text-green-600 hover:bg-gray-100">
                Create Coupon
              </Button>
            </CardContent>
          </Card>

          <Card className="glass-effect border-white/20">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold text-white mb-4">All Coupons</h2>
              {loading ? (
                <p className="text-white">Loading...</p>
              ) : (
                <div className="space-y-3">
                  {coupons.map(c => (
                    <div key={c.id} className="p-4 bg-white/5 border border-white/10 rounded-lg">
                      <div className="flex justify-between">
                        <p className="text-white font-semibold">{c.code}</p>
                        <p className="text-white/80 text-sm">{c.active ? 'active' : 'inactive'}</p>
                      </div>
                      <p className="text-white/70 text-sm">
                        {c.discount_type === 'percent' ? `${c.discount_value}%` : `$${c.discount_value}`} off • min ${c.min_order_amount} • used {c.used_count}{c.usage_limit ? `/${c.usage_limit}` : ''}
                      </p>
                    </div>
                  ))}
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

