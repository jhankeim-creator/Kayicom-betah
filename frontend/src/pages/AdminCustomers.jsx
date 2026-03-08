import { useEffect, useMemo, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Copy, Users } from 'lucide-react';

const AdminCustomers = ({ user, logout, settings }) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('Scam/Fraud');
  const [blocking, setBlocking] = useState(false);

  const [walletAction, setWalletAction] = useState('credit');
  const [walletAmount, setWalletAmount] = useState('');
  const [walletReason, setWalletReason] = useState('Admin adjustment');
  const [walletSubmitting, setWalletSubmitting] = useState(false);

  const [creditsAction, setCreditsAction] = useState('credit');
  const [creditsAmount, setCreditsAmount] = useState('');
  const [creditsReason, setCreditsReason] = useState('Admin adjustment');
  const [creditsSubmitting, setCreditsSubmitting] = useState(false);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      const res = await axiosInstance.get(`/admin/customers${query}`);
      setCustomers(res.data || []);
    } catch (e) {
      toast.error('Error loading customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // initial load
    (async () => {
      await loadCustomers();
    })();
    // eslint-disable-next-line
  }, []);

  const openCustomer = async (c) => {
    try {
      const res = await axiosInstance.get(`/admin/customers/${c.id}`);
      setSelected(res.data);
      setDetailOpen(true);
      setWalletAmount('');
      setCreditsAmount('');
      setBlockReason('Scam/Fraud');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error loading customer');
    }
  };

  const copyText = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(String(text));
      toast.success('Copied');
    } catch (e) {
      toast.error('Could not copy');
    }
  };

  const submitWalletAdjust = async () => {
    if (!selected) return;
    const amt = Number(walletAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Amount must be > 0');
      return;
    }
    setWalletSubmitting(true);
    try {
      const res = await axiosInstance.post('/wallet/admin-adjust', {
        identifier: selected.customer_id || selected.email || selected.id,
        amount: amt,
        action: walletAction,
        reason: walletReason
      });
      toast.success(`Wallet updated: $${Number(res.data.wallet_balance).toFixed(2)}`);
      const refreshed = await axiosInstance.get(`/admin/customers/${selected.id}`);
      setSelected(refreshed.data);
      await loadCustomers();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error adjusting wallet');
    } finally {
      setWalletSubmitting(false);
    }
  };

  const submitCreditsAdjust = async () => {
    if (!selected) return;
    const credits = parseInt(creditsAmount, 10);
    if (!Number.isFinite(credits) || credits <= 0) {
      toast.error('Credits must be > 0');
      return;
    }
    setCreditsSubmitting(true);
    try {
      const res = await axiosInstance.post('/credits/admin-adjust', {
        identifier: selected.customer_id || selected.email || selected.id,
        credits,
        action: creditsAction,
        reason: creditsReason
      });
      toast.success(`Credits updated: ${res.data.credits_balance}`);
      const refreshed = await axiosInstance.get(`/admin/customers/${selected.id}`);
      setSelected(refreshed.data);
      await loadCustomers();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error adjusting credits');
    } finally {
      setCreditsSubmitting(false);
    }
  };

  const blockCustomer = async () => {
    if (!selected) return;
    setBlocking(true);
    try {
      const res = await axiosInstance.post(`/admin/customers/${selected.id}/block`, { reason: blockReason });
      toast.success('Customer blocked');
      setSelected(res.data);
      await loadCustomers();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error blocking customer');
    } finally {
      setBlocking(false);
    }
  };

  const unblockCustomer = async () => {
    if (!selected) return;
    setBlocking(true);
    try {
      const res = await axiosInstance.post(`/admin/customers/${selected.id}/unblock`);
      toast.success('Customer unblocked');
      setSelected(res.data);
      await loadCustomers();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error unblocking customer');
    } finally {
      setBlocking(false);
    }
  };

  const cards = useMemo(() => customers, [customers]);

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <Users className="text-white" />
              <h1 className="text-4xl font-bold text-white">Manage Customers</h1>
            </div>
            <Button onClick={() => (window.location.href = '/admin')} className="bg-green-500 text-white">
              🏠 Admin Home
            </Button>
          </div>

          <Card className="glass-effect border-white/20 mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-3 md:items-center">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  placeholder="Search by email, name, or Customer ID..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadCustomers();
                  }}
                />
                <div className="flex gap-2">
                  <Button className="bg-white text-green-600 hover:bg-gray-100" onClick={loadCustomers}>
                    Search
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/20 text-white"
                    onClick={() => {
                      setQ('');
                      setTimeout(() => loadCustomers(), 0);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <p className="text-white/60 text-xs mt-3">
                Showing <strong>{customers.length}</strong>
              </p>
            </CardContent>
          </Card>

          {loading ? (
            <div className="text-white">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {cards.map((c) => (
                <Card key={c.id} className="glass-effect border-white/20">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white font-bold truncate">{c.full_name || c.username || 'Customer'}</p>
                        <p className="text-white/70 text-sm truncate">{c.email}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {c.is_blocked && (
                            <Badge variant="destructive">BLOCKED</Badge>
                          )}
                          {c.customer_id && (
                            <Badge variant="secondary" className="font-mono">
                              {c.customer_id}
                            </Badge>
                          )}
                          <Badge variant="secondary">wallet: ${Number(c.wallet_balance || 0).toFixed(2)}</Badge>
                          <Badge variant="secondary">credits: {Number(c.credits_balance || 0)}</Badge>
                        </div>
                      </div>
                      <Button variant="outline" className="border-white/20 text-white" onClick={() => openCustomer(c)}>
                        Open
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {customers.length === 0 && <p className="text-white/60">No customers found.</p>}
            </div>
          )}
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="bg-gray-900 border-white/20 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Customer Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-6">
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-bold">{selected.full_name || 'Customer'}</p>
                    <p className="text-white/70 text-sm">{selected.email}</p>
                    <p className="text-white/60 text-xs mt-1">User ID: {selected.id}</p>
                    {selected.is_blocked && (
                      <p className="text-red-300 text-sm mt-2">
                        Blocked{selected.blocked_reason ? `: ${selected.blocked_reason}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.customer_id && (
                      <Button variant="outline" className="border-white/20 text-white" onClick={() => copyText(selected.customer_id)}>
                        <Copy size={14} className="mr-2" /> Copy Customer ID
                      </Button>
                    )}
                    <Button variant="outline" className="border-white/20 text-white" onClick={() => copyText(selected.email)}>
                      <Copy size={14} className="mr-2" /> Copy Email
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="secondary">wallet: ${Number(selected.wallet_balance || 0).toFixed(2)}</Badge>
                  <Badge variant="secondary">credits: {Number(selected.credits_balance || 0)}</Badge>
                  <Badge variant="secondary">referral: ${Number(selected.referral_balance || 0).toFixed(2)}</Badge>
                </div>
              </div>

              <Card className="glass-effect border-white/20">
                <CardContent className="p-4 space-y-3">
                  <p className="text-white font-semibold">Account Status</p>
                  <div className="flex flex-col md:flex-row gap-3 md:items-end">
                    <div className="flex-1">
                      <Label className="text-white/70">Block reason</Label>
                      <Input
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                        className="bg-white/10 border-white/20 text-white mt-2"
                        placeholder="Reason (scam/fraud, chargeback, etc.)"
                      />
                    </div>
                    {selected.is_blocked ? (
                      <Button onClick={unblockCustomer} disabled={blocking} className="bg-green-600 hover:bg-green-700 text-white">
                        {blocking ? '...' : 'Unblock'}
                      </Button>
                    ) : (
                      <Button onClick={blockCustomer} disabled={blocking} variant="destructive">
                        {blocking ? '...' : 'Block'}
                      </Button>
                    )}
                  </div>
                  <p className="text-white/60 text-xs">
                    Blocked customers cannot login or create new orders/topups.
                  </p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="glass-effect border-white/20">
                  <CardContent className="p-4 space-y-3">
                    <p className="text-white font-semibold">Wallet adjust</p>
                    <div className="grid grid-cols-1 gap-2">
                      <Label className="text-white/70">Action</Label>
                      <Select value={walletAction} onValueChange={setWalletAction}>
                        <SelectTrigger className="bg-white/10 border-white/20 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="credit">credit</SelectItem>
                          <SelectItem value="debit">debit</SelectItem>
                        </SelectContent>
                      </Select>
                      <Label className="text-white/70 mt-2">Amount (USD)</Label>
                      <Input
                        value={walletAmount}
                        onChange={(e) => setWalletAmount(e.target.value)}
                        className="bg-white/10 border-white/20 text-white"
                        placeholder="e.g. 5"
                      />
                      <Label className="text-white/70 mt-2">Reason</Label>
                      <Input
                        value={walletReason}
                        onChange={(e) => setWalletReason(e.target.value)}
                        className="bg-white/10 border-white/20 text-white"
                      />
                      <Button onClick={submitWalletAdjust} disabled={walletSubmitting} className="bg-white text-green-600 hover:bg-gray-100 mt-2">
                        {walletSubmitting ? '...' : 'Apply'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-effect border-white/20">
                  <CardContent className="p-4 space-y-3">
                    <p className="text-white font-semibold">Credits adjust</p>
                    <div className="grid grid-cols-1 gap-2">
                      <Label className="text-white/70">Action</Label>
                      <Select value={creditsAction} onValueChange={setCreditsAction}>
                        <SelectTrigger className="bg-white/10 border-white/20 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="credit">credit</SelectItem>
                          <SelectItem value="debit">debit</SelectItem>
                        </SelectContent>
                      </Select>
                      <Label className="text-white/70 mt-2">Credits</Label>
                      <Input
                        value={creditsAmount}
                        onChange={(e) => setCreditsAmount(e.target.value)}
                        className="bg-white/10 border-white/20 text-white"
                        placeholder="e.g. 100"
                      />
                      <Label className="text-white/70 mt-2">Reason</Label>
                      <Input
                        value={creditsReason}
                        onChange={(e) => setCreditsReason(e.target.value)}
                        className="bg-white/10 border-white/20 text-white"
                      />
                      <Button onClick={submitCreditsAdjust} disabled={creditsSubmitting} className="bg-white text-green-600 hover:bg-gray-100 mt-2">
                        {creditsSubmitting ? '...' : 'Apply'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Footer settings={settings} />
    </div>
  );
};

export default AdminCustomers;

