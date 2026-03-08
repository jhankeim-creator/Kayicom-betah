import { useEffect, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DollarSign, Clock, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const WithdrawPage = ({ user, logout, settings }) => {
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('moncash');
  const [walletAddress, setWalletAddress] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [moncashPhone, setMoncashPhone] = useState('');
  const [moncashName, setMoncashName] = useState('');
  const [loading, setLoading] = useState(false);
  const [withdrawals, setWithdrawals] = useState([]);

  useEffect(() => {
    if (user) {
      loadBalance();
      loadWithdrawals();
    }
  }, [user]);

  const loadBalance = async () => {
    try {
      const response = await axiosInstance.get(`/referral/info?user_id=${user.user_id}`);
      setBalance(response.data.referral_balance);
    } catch (error) {
      console.error('Error loading balance:', error);
    }
  };

  const loadWithdrawals = async () => {
    try {
      const response = await axiosInstance.get(`/withdrawals/user/${user.user_id}`);
      setWithdrawals(response.data);
    } catch (error) {
      console.error('Error loading withdrawals:', error);
    }
  };

  const handleWithdraw = async () => {
    if (!amount || parseFloat(amount) < 5) {
      toast.error('Minimum withdrawal is $5');
      return;
    }

    if (parseFloat(amount) > balance) {
      toast.error('Insufficient balance');
      return;
    }

    if ((method === 'usdt_bep20' || method === 'btc') && !walletAddress) {
      toast.error('Please enter wallet address');
      return;
    }

    if (method === 'paypal' && !paypalEmail) {
      toast.error('Please enter PayPal email');
      return;
    }

    if (method === 'moncash' && (!moncashPhone || !moncashName)) {
      toast.error('Please enter MonCash phone number and name');
      return;
    }

    setLoading(true);

    try {
      await axiosInstance.post(`/withdrawals/request?user_id=${user.user_id}&user_email=${user.email}`, {
        amount: parseFloat(amount),
        method: method,
        wallet_address: (method === 'usdt_bep20' || method === 'btc') ? walletAddress : null,
        paypal_email: method === 'paypal' ? paypalEmail : null,
        moncash_phone: method === 'moncash' ? moncashPhone : null,
        moncash_name: method === 'moncash' ? moncashName : null
      });

      toast.success('Withdrawal request submitted!');
      setAmount('');
      setWalletAddress('');
      setPaypalEmail('');
      setMoncashPhone('');
      setMoncashName('');
      loadBalance();
      loadWithdrawals();
    } catch (error) {
      console.error('Error submitting withdrawal:', error);
      toast.error(error.response?.data?.detail || 'Error submitting withdrawal');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'pending': return <Clock className="text-yellow-400" size={20} />;
      case 'approved':
      case 'completed': return <CheckCircle className="text-green-400" size={20} />;
      case 'rejected': return <XCircle className="text-red-400" size={20} />;
      default: return null;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen gradient-bg">
        <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl text-white mb-4">Please login to withdraw</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-12">
          Withdraw Balance
        </h1>

        <div className="max-w-4xl mx-auto space-y-6">
          {/* Balance */}
          <Card className="glass-effect border-white/20">
            <CardContent className="p-6 text-center">
              <DollarSign className="mx-auto mb-3 text-green-400" size={48} />
              <p className="text-white/70 text-sm mb-2">Available Balance</p>
              <p className="text-5xl font-bold text-white">${balance.toFixed(2)}</p>
              <p className="text-white/60 text-sm mt-3">Minimum withdrawal: $5.00</p>
            </CardContent>
          </Card>

          {/* Withdrawal Form */}
          <Card className="glass-effect border-white/20">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold text-white mb-6">Request Withdrawal</h2>
              
              <div className="space-y-6">
                {/* Amount */}
                <div>
                  <Label htmlFor="amount" className="text-white">Amount (USD)</Label>
                  <Input
                    id="amount"
                    type="number"
                    min="5"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Minimum $5.00"
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mt-2"
                  />
                </div>

                {/* Method */}
                <div>
                  <Label className="text-white mb-3 block">Withdrawal Method</Label>
                  <RadioGroup value={method} onValueChange={setMethod}>
                    <div className="space-y-3">
                      <label className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition ${
                        method === 'usdt_bep20' ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/20 hover:border-white/40'
                      }`}>
                        <RadioGroupItem value="usdt_bep20" className="mt-1" />
                        <div className="ml-4">
                          <span className="text-white font-semibold">USDT (BEP20)</span>
                          <p className="text-white/70 text-sm">Binance Smart Chain</p>
                        </div>
                      </label>

                      <label className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition ${
                        method === 'btc' ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/20 hover:border-white/40'
                      }`}>
                        <RadioGroupItem value="btc" className="mt-1" />
                        <div className="ml-4">
                          <span className="text-white font-semibold">Bitcoin (BTC)</span>
                          <p className="text-white/70 text-sm">Bitcoin Network</p>
                        </div>
                      </label>

                      <label className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition ${
                        method === 'paypal' ? 'border-pink-400 bg-pink-400/10' : 'border-white/20 hover:border-white/40'
                      }`}>
                        <RadioGroupItem value="paypal" className="mt-1" />
                        <div className="ml-4">
                          <span className="text-white font-semibold">PayPal</span>
                          <p className="text-white/70 text-sm">Send to PayPal account</p>
                        </div>
                      </label>

                      <label className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition ${
                        method === 'moncash' ? 'border-green-400 bg-green-400/10' : 'border-white/20 hover:border-white/40'
                      }`}>
                        <RadioGroupItem value="moncash" className="mt-1" />
                        <div className="ml-4">
                          <span className="text-white font-semibold">💵 MonCash</span>
                          <p className="text-white/70 text-sm">Mobile money transfer Haiti</p>
                        </div>
                      </label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Wallet/Email/MonCash Input */}
                {method === 'paypal' ? (
                  <div>
                    <Label htmlFor="paypal-email" className="text-white">PayPal Email</Label>
                    <Input
                      id="paypal-email"
                      type="email"
                      value={paypalEmail}
                      onChange={(e) => setPaypalEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mt-2"
                    />
                  </div>
                ) : method === 'moncash' ? (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="moncash-phone" className="text-white">MonCash Phone Number</Label>
                      <Input
                        id="moncash-phone"
                        type="tel"
                        value={moncashPhone}
                        onChange={(e) => setMoncashPhone(e.target.value)}
                        placeholder="+509 XXXX XXXX"
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="moncash-name" className="text-white">Name on MonCash Account</Label>
                      <Input
                        id="moncash-name"
                        type="text"
                        value={moncashName}
                        onChange={(e) => setMoncashName(e.target.value)}
                        placeholder="John Doe"
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mt-2"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="wallet" className="text-white">
                      {method === 'btc' ? 'Bitcoin' : 'BEP20'} Wallet Address
                    </Label>
                    <Input
                      id="wallet"
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      placeholder="Enter your wallet address"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mt-2"
                    />
                  </div>
                )}

                <Button
                  onClick={handleWithdraw}
                  disabled={loading || balance < 5}
                  className="w-full bg-white text-green-600 hover:bg-gray-100 py-6 text-lg"
                >
                  {loading ? 'Processing...' : 'Submit Withdrawal Request'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Withdrawal History */}
          <Card className="glass-effect border-white/20">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold text-white mb-6">Withdrawal History</h2>
              
              {withdrawals.length > 0 ? (
                <div className="space-y-3">
                  {withdrawals.map((withdrawal) => (
                    <div key={withdrawal.id} className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(withdrawal.status)}
                        <div>
                          <p className="text-white font-semibold">${withdrawal.amount.toFixed(2)}</p>
                          <p className="text-white/70 text-sm capitalize">{withdrawal.method.replace('_', ' ')}</p>
                          <p className="text-white/60 text-xs">{new Date(withdrawal.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded text-sm font-semibold capitalize ${
                        withdrawal.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        withdrawal.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {withdrawal.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-white/70 text-center py-8">No withdrawal history</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default WithdrawPage;
