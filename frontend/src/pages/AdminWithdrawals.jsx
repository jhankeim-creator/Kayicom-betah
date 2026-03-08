import { useEffect, useState } from 'react';
import { axiosInstance } from '../App';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const AdminWithdrawals = () => {
  const [withdrawals, setWithdrawals] = useState([]);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadWithdrawals();
  }, []);

  const loadWithdrawals = async () => {
    try {
      const response = await axiosInstance.get('/withdrawals/all');
      setWithdrawals(response.data);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const updateStatus = async (withdrawalId, status) => {
    setLoading(true);
    try {
      await axiosInstance.put(
        `/withdrawals/${withdrawalId}/status?status=${status}${adminNotes ? `&admin_notes=${encodeURIComponent(adminNotes)}` : ''}`
      );
      toast.success(`Withdrawal ${status}`);
      setAdminNotes('');
      setSelectedWithdrawal(null);
      loadWithdrawals();
    } catch (error) {
      toast.error('Error updating status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Withdrawal Management</h2>
        <Button 
          onClick={() => window.location.href = '/admin'}
          className="bg-green-500 text-white px-6 py-3"
        >
          🏠 Admin Home
        </Button>
      </div>
      
      <div className="grid gap-4">
        {withdrawals.map((w) => (
          <Card key={w.id} className="glass-effect border-white/20">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-white font-bold">${w.amount.toFixed(2)}</p>
                  <p className="text-white/70 text-sm">{w.user_email}</p>
                  <p className="text-white/70 text-sm capitalize">{w.method.replace('_', ' ')}</p>
                  {w.wallet_address && <p className="text-white/60 text-xs">Wallet: {w.wallet_address}</p>}
                  {w.paypal_email && <p className="text-white/60 text-xs">PayPal: {w.paypal_email}</p>}
                  {w.moncash_phone && <p className="text-white/60 text-xs">MonCash: {w.moncash_phone}</p>}
                  {w.moncash_name && <p className="text-white/60 text-xs">Nom: {w.moncash_name}</p>}
                  <p className="text-white/60 text-xs mt-1">{new Date(w.created_at).toLocaleString()}</p>
                </div>
                
                <div className="flex flex-col gap-2">
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
                      <Button
                        size="sm"
                        onClick={() => updateStatus(w.id, 'approved')}
                        className="bg-green-500 hover:bg-green-600 text-white text-xs"
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => updateStatus(w.id, 'rejected')}
                        className="bg-red-500 hover:bg-red-600 text-white text-xs"
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                  
                  {w.status === 'approved' && (
                    <Button
                      size="sm"
                      onClick={() => updateStatus(w.id, 'completed')}
                      className="bg-blue-500 hover:bg-blue-600 text-white text-xs"
                    >
                      Mark Completed
                    </Button>
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
        ))}
      </div>
    </div>
  );
};

export default AdminWithdrawals;
