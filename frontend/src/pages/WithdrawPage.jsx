import { useEffect, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, Clock, CheckCircle, XCircle, Wallet } from 'lucide-react';
import { toast } from 'sonner';

const WithdrawPage = ({ user, logout, settings }) => {
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [moncashPhone, setMoncashPhone] = useState('');
  const [moncashName, setMoncashName] = useState('');
  const [loading, setLoading] = useState(false);
  const [withdrawals, setWithdrawals] = useState([]);

  useEffect(() => { if (user) { loadBalance(); loadWithdrawals(); } }, [user]);

  const loadBalance = async () => {
    try {
      const response = await axiosInstance.get(`/referral/info?user_id=${user.user_id}`);
      setBalance(response.data.referral_balance);
    } catch (error) { console.error('Error loading balance:', error); }
  };

  const loadWithdrawals = async () => {
    try {
      const response = await axiosInstance.get(`/withdrawals/user/${user.user_id}`);
      setWithdrawals(response.data);
    } catch (error) { console.error('Error loading withdrawals:', error); }
  };

  const handleWithdraw = async () => {
    if (!amount || parseFloat(amount) < 5) { toast.error('Minimum withdrawal is $5'); return; }
    if (parseFloat(amount) > balance) { toast.error('Insufficient balance'); return; }
    if ((method === 'usdt_bep20' || method === 'btc') && !walletAddress) { toast.error('Please enter wallet address'); return; }
    if (method === 'paypal' && !paypalEmail) { toast.error('Please enter PayPal email'); return; }
    if (method === 'moncash' && (!moncashPhone || !moncashName)) { toast.error('Please enter MonCash details'); return; }

    setLoading(true);
    try {
      await axiosInstance.post(`/withdrawals/request?user_id=${user.user_id}&user_email=${user.email}`, {
        amount: parseFloat(amount), method,
        wallet_address: (method === 'usdt_bep20' || method === 'btc') ? walletAddress : null,
        paypal_email: method === 'paypal' ? paypalEmail : null,
        moncash_phone: method === 'moncash' ? moncashPhone : null,
        moncash_name: method === 'moncash' ? moncashName : null
      });
      toast.success('Withdrawal request submitted!');
      setAmount(''); setWalletAddress(''); setPaypalEmail(''); setMoncashPhone(''); setMoncashName('');
      loadBalance(); loadWithdrawals();
    } catch (error) { toast.error(error.response?.data?.detail || 'Error submitting withdrawal'); }
    finally { setLoading(false); }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'pending': return <Clock className="text-yellow-400" size={18} />;
      case 'approved': case 'completed': return <CheckCircle className="text-green-400" size={18} />;
      case 'rejected': return <XCircle className="text-red-400" size={18} />;
      default: return null;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl text-white mb-4">Please login to withdraw</h2>
        </div>
      </div>
    );
  }

  const methods = [
    { id: 'usdt_bep20', label: 'USDT (BEP20)' },
    { id: 'btc', label: 'Bitcoin (BTC)' },
    { id: 'paypal', label: 'PayPal' },
    { id: 'moncash', label: 'MonCash' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-lg mx-auto">

          {/* Earnings Summary */}
          <div className="rounded-xl bg-[#141414] border border-white/5 p-5 mb-6">
            <h2 className="text-white font-bold text-lg mb-4">Earnings Summary</h2>
            <div className="flex gap-8 mb-3">
              <div>
                <p className="text-white/50 text-sm">Available Balance</p>
                <p className="text-green-400 font-bold text-2xl">${balance.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-white/50 text-sm">Total Earned</p>
                <p className="text-white font-bold text-2xl">${balance.toFixed(2)}</p>
              </div>
            </div>
            <p className="text-white/30 text-xs">Platform commission: 10%</p>
          </div>

          {/* Request Withdrawal */}
          <div className="rounded-xl bg-[#141414] border border-white/5 p-5 mb-6">
            <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
              <Wallet size={18} className="text-green-400" /> Request Withdrawal
            </h2>

            <div className="space-y-4">
              <div>
                <Label className="text-white/70 text-sm">Withdrawal Method *</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {methods.map(m => (<SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              {method === 'paypal' && (
                <div>
                  <Label className="text-white/70 text-sm">PayPal Email</Label>
                  <Input type="email" value={paypalEmail} onChange={(e) => setPaypalEmail(e.target.value)}
                    placeholder="your@email.com" className="bg-white/5 border-white/10 text-white mt-1" />
                </div>
              )}

              {method === 'moncash' && (
                <>
                  <div>
                    <Label className="text-white/70 text-sm">MonCash Phone</Label>
                    <Input type="tel" value={moncashPhone} onChange={(e) => setMoncashPhone(e.target.value)}
                      placeholder="+509 XXXX XXXX" className="bg-white/5 border-white/10 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Name on Account</Label>
                    <Input value={moncashName} onChange={(e) => setMoncashName(e.target.value)}
                      placeholder="John Doe" className="bg-white/5 border-white/10 text-white mt-1" />
                  </div>
                </>
              )}

              {(method === 'usdt_bep20' || method === 'btc') && (
                <div>
                  <Label className="text-white/70 text-sm">{method === 'btc' ? 'Bitcoin' : 'BEP20'} Address</Label>
                  <Input value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)}
                    placeholder="Enter wallet address" className="bg-white/5 border-white/10 text-white mt-1" />
                </div>
              )}

              <div>
                <Label className="text-white/70 text-sm">Amount (USD) *</Label>
                <Input type="number" min="5" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder="Min $5" className="bg-white/5 border-white/10 text-white mt-1" />
              </div>

              <Button onClick={handleWithdraw} disabled={loading || balance < 5}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full py-3">
                {loading ? 'Processing...' : 'Submit Withdrawal'}
              </Button>
            </div>
          </div>

          {/* Withdrawal History */}
          {withdrawals.length > 0 && (
            <div className="rounded-xl bg-[#141414] border border-white/5 p-5">
              <h2 className="text-white font-bold text-lg mb-4">Withdrawal History</h2>
              <div className="space-y-3">
                {withdrawals.map((w) => (
                  <div key={w.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(w.status)}
                      <div>
                        <p className="text-white font-semibold text-sm">${w.amount.toFixed(2)}</p>
                        <p className="text-white/50 text-xs capitalize">{w.method.replace('_', ' ')}</p>
                        <p className="text-white/30 text-xs">{new Date(w.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded font-semibold capitalize ${
                      w.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      w.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>{w.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default WithdrawPage;
