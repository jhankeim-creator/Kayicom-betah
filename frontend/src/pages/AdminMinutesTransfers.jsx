import { useEffect, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const AdminMinutesTransfers = ({ user, logout, settings }) => {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get('/mobile-topup/requests/all');
      setTransfers(res.data || []);
    } catch (e) {
      toast.error('Error loading minutes transfers');
    } finally {
      setLoading(false);
    }
  };

  const badgeVariant = (status) => {
    if (status === 'paid' || status === 'completed') return 'default';
    if (status === 'pending_verification' || status === 'processing') return 'default';
    if (status === 'failed' || status === 'rejected' || status === 'cancelled') return 'destructive';
    return 'secondary';
  };

  const updateStatus = async (id, updates) => {
    try {
      await axiosInstance.put(`/mobile-topup/requests/${id}/status`, updates);
      toast.success('Updated');
      await loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error updating transfer');
    }
  };

  const filtered = transfers.filter(t => {
    if (paymentFilter !== 'all' && t.payment_status !== paymentFilter) return false;
    if (statusFilter !== 'all' && t.transfer_status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay = [
      t.user_email,
      t.country,
      t.phone_number,
      t.payment_method,
      t.payment_status,
      t.transfer_status,
      t.id
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-white">Mobile Topups</h1>
            <Button onClick={() => (window.location.href = '/admin')} className="bg-green-500 text-white">
              🏠 Admin Home
            </Button>
          </div>

          {loading ? (
            <div className="text-white">Loading...</div>
          ) : (
            <div className="space-y-4">
              <Card className="glass-effect border-white/20">
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                      placeholder="Search (email, country, phone, id...)"
                    />
                    <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                      <SelectTrigger className="bg-white/10 border-white/20 text-white">
                        <SelectValue placeholder="Payment status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All payment statuses</SelectItem>
                        <SelectItem value="pending">pending</SelectItem>
                        <SelectItem value="pending_verification">pending_verification</SelectItem>
                        <SelectItem value="paid">paid</SelectItem>
                        <SelectItem value="rejected">rejected</SelectItem>
                        <SelectItem value="failed">failed</SelectItem>
                        <SelectItem value="cancelled">cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="bg-white/10 border-white/20 text-white">
                        <SelectValue placeholder="Transfer status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All transfer statuses</SelectItem>
                        <SelectItem value="pending">pending</SelectItem>
                        <SelectItem value="processing">processing</SelectItem>
                        <SelectItem value="completed">completed</SelectItem>
                        <SelectItem value="cancelled">cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-white/60 text-xs mt-3">
                    Showing <strong>{filtered.length}</strong> of <strong>{transfers.length}</strong>
                  </p>
                </CardContent>
              </Card>

              {filtered.map(t => (
                <Card key={t.id} className="glass-effect border-white/20">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          <p className="text-white font-bold">Transfer #{t.id.slice(0, 8)}</p>
                          <Badge variant={badgeVariant(t.payment_status)} className="capitalize">
                            {t.payment_status}
                          </Badge>
                          <Badge variant={badgeVariant(t.transfer_status)} className="capitalize">
                            {t.transfer_status}
                          </Badge>
                        </div>
                        <p className="text-white/80 text-sm">
                          {t.user_email} • {t.country} • {t.phone_number}
                        </p>
                        <p className="text-white/80 text-sm mt-1">
                          Amount: ${Number(t.amount).toFixed(2)} • Fee: ${Number(t.fee_amount).toFixed(2)} • Total: <strong>${Number(t.total_amount).toFixed(2)}</strong> • {t.payment_method}
                        </p>
                        {t.transaction_id && <p className="text-white/60 text-xs mt-1">TX: {t.transaction_id}</p>}
                        {t.payment_proof_url && (
                          <a href={t.payment_proof_url} target="_blank" rel="noopener noreferrer" className="text-green-400 text-sm hover:underline">
                            View proof
                          </a>
                        )}
                        {t.plisio_invoice_url && (
                          <a href={t.plisio_invoice_url} target="_blank" rel="noopener noreferrer" className="text-green-300 text-sm hover:underline ml-3">
                            View invoice
                          </a>
                        )}
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        {(t.payment_status === 'pending' || t.payment_status === 'pending_verification') && (
                          <>
                            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => updateStatus(t.id, { payment_status: 'paid', transfer_status: 'processing' })}>
                              Approve Payment
                            </Button>
                            <Button variant="destructive" onClick={() => updateStatus(t.id, { payment_status: 'rejected' })}>
                              Reject
                            </Button>
                          </>
                        )}
                        {(t.payment_status === 'paid' && t.transfer_status !== 'completed') && (
                          <Button className="bg-cyan-600 hover:bg-cyan-700 text-white" onClick={() => updateStatus(t.id, { transfer_status: 'completed' })}>
                            Mark Completed
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {transfers.length === 0 && <p className="text-white/60">No mobile topups yet.</p>}
              {transfers.length > 0 && filtered.length === 0 && (
                <p className="text-white/60">No results match your filters.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default AdminMinutesTransfers;

