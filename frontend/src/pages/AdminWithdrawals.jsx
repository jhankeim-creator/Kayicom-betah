import { useEffect, useState } from 'react';
import { axiosInstance } from '../App';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const METHOD_LABELS = {
  binance_pay: 'Binance Pay',
  usdt_bep20: 'USDT (BEP20)',
  usdt_trc20: 'USDT (TRC20)',
  usdt_bsc: 'USDT (BSC)',
  btc: 'Bitcoin',
  paypal: 'PayPal',
  moncash: 'MonCash',
};

const AdminWithdrawals = () => {
  const [withdrawals, setWithdrawals] = useState([]);
  const [adminNotes, setAdminNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadWithdrawals(); }, []);

  const loadWithdrawals = async () => {
    try {
      const response = await axiosInstance.get('/withdrawals/all');
      setWithdrawals(response.data);
    } catch (error) { console.error('Error:', error); }
  };

  const updateStatus = async (withdrawalId, status) => {
    setLoading(true);
    try {
      await axiosInstance.put(
        `/withdrawals/${withdrawalId}/status?status=${status}${adminNotes ? `&admin_notes=${encodeURIComponent(adminNotes)}` : ''}`
      );
      toast.success(`Withdrawal ${status}`);
      setAdminNotes('');
      loadWithdrawals();
    } catch (error) { toast.error('Error updating status'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Withdrawal Management</h2>
        <Button onClick={() => window.location.href = '/admin'}
          className="bg-gradient-to-r from-pink-500 to-blue-500 text-white px-6 py-3">
          🏠 Admin Home
        </Button>
      </div>

      <div className="grid gap-4">
        {withdrawals.map((w) => {
          const isSeller = w.type === 'seller_withdrawal';
          const methodLabel = w.method ? (METHOD_LABELS[w.method] || w.method.replace('_', ' ')) : (isSeller ? 'Not specified' : 'N/A');

          return (
            <Card key={w.id} className="glass-effect border-white/20">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-bold text-lg">${Number(w.amount).toFixed(2)}</p>
                      {isSeller && <Badge className="bg-purple-500/20 text-purple-300 text-xs">Seller</Badge>}
                      {!isSeller && <Badge className="bg-blue-500/20 text-blue-300 text-xs">Referral</Badge>}
                    </div>

                    <p className="text-white/70 text-sm">{w.user_email}</p>
                    {w.store_name && <p className="text-white/50 text-xs">Store: {w.store_name}</p>}

                    {/* Payment method & address */}
                    <div className="mt-1 p-2 bg-white/5 rounded">
                      <p className="text-white/80 text-sm font-medium">{methodLabel}</p>
                      {w.wallet_address && (
                        <p className="text-cyan-300 text-xs font-mono break-all">{w.wallet_address}</p>
                      )}
                      {w.paypal_email && <p className="text-white/60 text-xs">PayPal: {w.paypal_email}</p>}
                      {w.moncash_phone && <p className="text-white/60 text-xs">MonCash: {w.moncash_phone} {w.moncash_name && `(${w.moncash_name})`}</p>}
                    </div>

                    {/* Fee breakdown for seller withdrawals */}
                    {isSeller && w.fee != null && (
                      <div className="text-xs text-white/50 space-x-3">
                        <span>Fee: ${Number(w.fee).toFixed(2)}</span>
                        <span>Net: ${Number(w.net_amount).toFixed(2)}</span>
                      </div>
                    )}

                    <p className="text-white/40 text-xs mt-1">{new Date(w.created_at).toLocaleString()}</p>
                  </div>

                  <div className="flex flex-col gap-2 items-end">
                    <span className={`px-3 py-1 rounded text-sm ${
                      w.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      w.status === 'approved' ? 'bg-blue-500/20 text-blue-400' :
                      w.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {w.status}
                    </span>

                    {w.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => updateStatus(w.id, 'approved')} disabled={loading}
                          className="bg-green-500 hover:bg-green-600 text-white text-xs">Approve</Button>
                        <Button size="sm" onClick={() => updateStatus(w.id, 'rejected')} disabled={loading}
                          className="bg-red-500 hover:bg-red-600 text-white text-xs">Reject</Button>
                      </div>
                    )}

                    {w.status === 'approved' && (
                      <Button size="sm" onClick={() => updateStatus(w.id, 'completed')} disabled={loading}
                        className="bg-blue-500 hover:bg-blue-600 text-white text-xs">Mark Completed</Button>
                    )}
                  </div>
                </div>

                {w.admin_notes && (
                  <div className="mt-3 p-2 bg-white/5 rounded">
                    <p className="text-white/70 text-xs">Notes: {w.admin_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {withdrawals.length === 0 && <p className="text-white/40 text-center py-8">No withdrawals yet</p>}
      </div>
    </div>
  );
};

export default AdminWithdrawals;
