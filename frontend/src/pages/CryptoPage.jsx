import { useEffect, useMemo, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Copy, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

const CryptoPage = ({ user, logout, settings }) => {
  const [config, setConfig] = useState(null);
  const [chain, setChain] = useState('BEP20');
  const [amountUsd, setAmountUsd] = useState('');
  const [amountCrypto, setAmountCrypto] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('paypal');
  const [receivingInfo, setReceivingInfo] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [buyPaymentInfo, setBuyPaymentInfo] = useState(null);
  const [sellPaymentInfo, setSellPaymentInfo] = useState(null);

  useEffect(() => {
    loadConfig();
    if (user) {
      loadTransactions();
    }
  }, [user]);

  const paymentMethodMeta = {
    paypal: { label: 'PayPal', emoji: '💳' },
    airtm: { label: 'AirTM', emoji: '💸' },
    skrill: { label: 'Skrill', emoji: '💰' },
    moncash: { label: 'MonCash', emoji: '💵' },
    binance_pay: { label: 'Binance Pay', emoji: '🟡' },
    zelle: { label: 'Zelle', emoji: '🏦' },
    cashapp: { label: 'Cash App', emoji: '💲' },
  };

  const paymentMethods = useMemo(() => {
    const gateways = settings?.payment_gateways || {};
    const enabled = Object.entries(gateways)
      .filter(([, cfg]) => cfg?.enabled)
      .map(([value]) => value);
    const list = enabled.length ? enabled : ['paypal', 'airtm', 'skrill'];
    return list.map((value) => ({
      value,
      ...paymentMethodMeta[value],
      label: paymentMethodMeta[value]?.label || value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      emoji: paymentMethodMeta[value]?.emoji || '💳',
    }));
  }, [settings]);

  useEffect(() => {
    if (paymentMethods.length && !paymentMethods.some((m) => m.value === paymentMethod)) {
      setPaymentMethod(paymentMethods[0].value);
    }
  }, [paymentMethods, paymentMethod]);

  const loadConfig = async () => {
    try {
      const response = await axiosInstance.get('/crypto/config');
      setConfig(response.data);
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const loadTransactions = async () => {
    try {
      const response = await axiosInstance.get(`/crypto/transactions/user/${user.user_id}`);
      setTransactions(response.data);
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return null;
    
    setUploadingProof(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await axiosInstance.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUploadingProof(false);
      return response.data.url;
    } catch (error) {
      setUploadingProof(false);
      toast.error('Error uploading file');
      return null;
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const calculateBuy = (usd) => {
    if (!config) return 0;
    const rate = config.buy_rate_usdt || 1.02;
    const crypto = parseFloat(usd) / rate;
    const fee = parseFloat(usd) * ((config.transaction_fee_percent || 2) / 100);
    return { crypto, fee, total: parseFloat(usd) + fee };
  };

  const calculateSell = (crypto) => {
    if (!config) return 0;
    const rate = config.sell_rate_usdt || 0.98;
    const usd = parseFloat(crypto) * rate;
    const fee = usd * ((config.transaction_fee_percent || 2) / 100);
    return { usd, fee, total: usd - fee };
  };

  const handleBuy = async () => {
    if (!user) {
      toast.error('Please login to buy crypto');
      return;
    }

    if (!amountUsd || parseFloat(amountUsd) < (config?.min_transaction_usd || 10)) {
      toast.error(`Minimum buy is $${config?.min_transaction_usd || 10}`);
      return;
    }

    if (!walletAddress) {
      toast.error('Please enter your wallet address');
      return;
    }

    setLoading(true);

    try {
      const response = await axiosInstance.post(`/crypto/buy?user_id=${user.user_id || user.id}&user_email=${user.email}`, {
        chain,
        amount_usd: parseFloat(amountUsd),
        wallet_address: walletAddress,
        payment_method: paymentMethod,
        transaction_id: transactionId || '',
        payment_proof: ''
      });
      
      setBuyPaymentInfo(response.data);
      // For BUY, show success with payment instructions
      toast.success('✅ Order created! Use the payment instructions shown above.');
      
      // Clear form
      setAmountUsd('');
      setWalletAddress('');
      setTransactionId('');
      
      loadTransactions();
    } catch (error) {
      console.error('Buy error:', error.response?.data);
      const errorMsg = error.response?.data?.detail || 'Error submitting buy order';
      toast.error(typeof errorMsg === 'string' ? errorMsg : 'Error submitting buy order');
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    if (!user) {
      toast.error('Please login to sell crypto');
      return;
    }

    if (!amountCrypto || parseFloat(amountCrypto) <= 0) {
      toast.error('Please enter valid crypto amount');
      return;
    }

    if (!receivingInfo) {
      toast.error('Please enter your receiving payment info (PayPal email, etc)');
      return;
    }

    setLoading(true);

    try {
      const response = await axiosInstance.post(`/crypto/sell?user_id=${user.user_id || user.id}&user_email=${user.email}`, {
        chain,
        amount_crypto: parseFloat(amountCrypto),
        payment_method: paymentMethod,
        receiving_info: receivingInfo,
        transaction_id: '',
        payment_proof: ''
      });
      
      setSellPaymentInfo(response.data);
      // Clear form fields
      setAmountCrypto('');
      setReceivingInfo('');
      toast.success('Sell order created! Send USDT to the wallet below.');
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
      
      loadTransactions();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error submitting sell order');
    } finally {
      setLoading(false);
    }
  };

  const buyCalculation = amountUsd ? calculateBuy(amountUsd) : null;
  const sellCalculation = amountCrypto ? calculateSell(amountCrypto) : null;

  const getAdminWallet = () => {
    if (!config?.crypto_settings?.wallets) return null;
    return config.crypto_settings.wallets[chain];
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="w-full max-w-[1400px] mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-4">
            Buy & Sell USDT
          </h1>
          <p className="text-white/80 text-center mb-12">
            Trade USDT on BEP20, TRC20, and MATIC networks. No KYC required.
          </p>

          {/* BUY USDT - Internal invoice */}
          {buyPaymentInfo?.transaction_id && (
            <Card className="glass-effect border-cyan-500/40 mb-8">
              <CardContent className="p-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-cyan-400 mb-4">✅ Buy Invoice Created</h2>
                  <p className="text-white/80 mb-2 text-sm">Invoice ID: {buyPaymentInfo.invoice_id || buyPaymentInfo.transaction_id}</p>
                  <p className="text-white/90 mb-4 text-lg">
                    Pay <span className="text-cyan-300 font-bold">${Number(buyPaymentInfo.total_usd || 0).toFixed(2)}</span> to receive{' '}
                    <span className="text-cyan-300 font-bold">{Number(buyPaymentInfo.amount_crypto || 0).toFixed(2)} USDT</span>
                  </p>
                  {buyPaymentInfo.payment_info?.email && (
                    <div className="bg-cyan-500/10 border border-cyan-500/30 p-6 rounded-lg mb-4">
                      <p className="text-white/70 text-sm mb-2 font-semibold">Send payment to:</p>
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <code className="text-cyan-200 text-base break-all font-mono bg-black/30 px-3 py-2 rounded">
                          {buyPaymentInfo.payment_info.email}
                        </code>
                        <Button
                          size="sm"
                          className="bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30"
                          onClick={() => copyToClipboard(buyPaymentInfo.payment_info.email, 'Payment address')}
                        >
                          <Copy size={14} />
                        </Button>
                      </div>
                    </div>
                  )}
                  {buyPaymentInfo.payment_info?.instructions && (
                    <div className="text-white/80 text-sm bg-white/5 border border-white/10 p-4 rounded-lg mb-4">
                      {buyPaymentInfo.payment_info.instructions}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    className="border-cyan-400 text-cyan-200 hover:bg-cyan-400/10"
                    onClick={() => setBuyPaymentInfo(null)}
                  >
                    Create Another Buy Order
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* SELL USDT - Internal wallet */}
          {sellPaymentInfo?.wallet_address && (
            <Card className="glass-effect border-emerald-500/40 mb-8">
              <CardContent className="p-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-emerald-400 mb-4">✅ Send USDT to this wallet</h2>
                  <p className="text-white/80 mb-2 text-sm">Invoice ID: {sellPaymentInfo.invoice_id || sellPaymentInfo.transaction_id}</p>
                  <p className="text-white/90 mb-4 text-lg">
                    Send <span className="text-emerald-300 font-bold">{sellPaymentInfo.amount_crypto} USDT</span> on <span className="font-semibold">{chain}</span>
                  </p>
                  <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-lg mb-4">
                    <p className="text-white/70 text-sm mb-3 font-semibold">Wallet Address</p>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <code className="text-emerald-300 text-base break-all font-mono bg-black/30 px-3 py-2 rounded">
                        {sellPaymentInfo.wallet_address}
                      </code>
                      <Button
                        size="sm"
                        className="bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                        onClick={() => copyToClipboard(sellPaymentInfo.wallet_address, 'Wallet address')}
                      >
                        <Copy size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="text-white/80 text-sm bg-white/5 border border-white/10 p-4 rounded-lg mb-4">
                    <p className="font-semibold text-white mb-1">You will receive</p>
                    <p className="text-emerald-300 text-2xl font-bold">
                      ${Number(sellPaymentInfo.total_usd_to_receive || 0).toFixed(2)}
                    </p>
                    <p className="text-white/60 text-xs mt-1">
                      Payment to your {sellPaymentInfo.payment_method || 'selected method'}
                    </p>
                  </div>
                  {sellPaymentInfo.instructions && (
                    <div className="text-white/80 text-sm bg-white/5 border border-white/10 p-4 rounded-lg">
                      {sellPaymentInfo.instructions}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="glass-effect border-white/20 mb-8">
            <CardContent className="p-6">
              <Tabs defaultValue="buy" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="buy" className="flex items-center gap-2">
                    <TrendingUp size={18} />
                    Buy USDT
                  </TabsTrigger>
                  <TabsTrigger value="sell" className="flex items-center gap-2">
                    <TrendingDown size={18} />
                    Sell USDT
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="buy" className="space-y-4">
                  <div>
                    <Label className="text-white">Select Chain</Label>
                    <Select value={chain} onValueChange={setChain}>
                      <SelectTrigger className="bg-white/10 border-white/20 text-white mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BEP20">BEP20 (Binance Smart Chain)</SelectItem>
                        <SelectItem value="TRC20">TRC20 (Tron)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-white">Amount (USD)</Label>
                    <Input
                      type="number"
                      placeholder={`Min $${config?.min_transaction_usd || 10}`}
                      value={amountUsd}
                      onChange={(e) => setAmountUsd(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-1"
                    />
                  </div>

                  {buyCalculation && (
                    <div className="bg-white/5 p-4 rounded-lg space-y-2">
                      <div className="flex justify-between text-white/70">
                        <span>You will receive:</span>
                        <span className="text-white font-bold">{buyCalculation.crypto.toFixed(2)} USDT</span>
                      </div>
                      <div className="flex justify-between text-white/70">
                        <span>Fee ({config?.transaction_fee_percent || 2}%):</span>
                        <span>${buyCalculation.fee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-white font-bold border-t border-white/20 pt-2">
                        <span>Total to Pay:</span>
                        <span>${buyCalculation.total.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-white">Your {chain} Wallet Address (to receive USDT)</Label>
                    <Input
                      placeholder="Enter your wallet address to receive USDT"
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-1"
                    />
                    <p className="text-white/50 text-xs mt-1">⚠️ Make sure this is YOUR {chain} wallet address</p>
                  </div>

                  <div>
                    <Label className="text-white">Payment Method</Label>
                    <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="mt-2 space-y-2">
                      {paymentMethods.map((method) => (
                        <div key={method.value} className="flex items-center space-x-2 bg-white/5 p-3 rounded-lg">
                          <RadioGroupItem value={method.value} id={`buy-${method.value}`} />
                          <label htmlFor={`buy-${method.value}`} className="text-white cursor-pointer flex-1">
                            {method.emoji} {method.label}
                          </label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  <Button
                    onClick={handleBuy}
                    disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    {loading ? 'Processing...' : 'Continue to Payment'}
                  </Button>

                  <p className="text-white/60 text-sm text-center">
                    ℹ️ You'll receive payment instructions after clicking Continue
                  </p>
                </TabsContent>

                <TabsContent value="sell" className="space-y-4">
                  <div>
                    <Label className="text-white">Select Chain</Label>
                    <Select value={chain} onValueChange={setChain}>
                      <SelectTrigger className="bg-white/10 border-white/20 text-white mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BEP20">BEP20 (Binance Smart Chain)</SelectItem>
                        <SelectItem value="TRC20">TRC20 (Tron)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>


                  <div>
                    <Label className="text-white">Amount (USDT)</Label>
                    <Input
                      type="number"
                      placeholder="Enter USDT amount you're sending"
                      value={amountCrypto}
                      onChange={(e) => setAmountCrypto(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-1"
                    />
                  </div>

                  {sellCalculation && (
                    <div className="bg-white/5 p-4 rounded-lg space-y-2">
                      <div className="flex justify-between text-white/70">
                        <span>You will receive:</span>
                        <span className="text-white font-bold">${sellCalculation.usd.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-white/70">
                        <span>Fee ({config?.transaction_fee_percent || 2}%):</span>
                        <span>-${sellCalculation.fee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-white font-bold border-t border-white/20 pt-2">
                        <span>Total:</span>
                        <span>${sellCalculation.total.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-white">Payment Method (Where to receive money)</Label>
                    <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="mt-2 space-y-2">
                      {paymentMethods.map((method) => (
                        <div key={method.value} className="flex items-center space-x-2 bg-white/5 p-3 rounded-lg">
                          <RadioGroupItem value={method.value} id={`sell-${method.value}`} />
                          <label htmlFor={`sell-${method.value}`} className="text-white cursor-pointer flex-1">
                            {method.emoji} {method.label}
                          </label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  <div>
                    <Label className="text-white">Your Receiving Info (Email/Account)</Label>
                    <Input
                      placeholder="Enter your PayPal/AirTM/Skrill email or account"
                      value={receivingInfo}
                      onChange={(e) => setReceivingInfo(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-1"
                    />
                    <p className="text-white/60 text-xs mt-1">
                      💡 This is where you'll receive your payment after we process your USDT
                    </p>
                  </div>

                  <Button
                    onClick={handleSell}
                    disabled={loading || uploadingProof}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {loading || uploadingProof ? 'Processing...' : 'Submit Sell Order'}
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Transaction History */}
          {user && transactions.length > 0 && (
            <Card className="glass-effect border-white/20">
              <CardContent className="p-6">
                <h2 className="text-2xl font-bold text-white mb-4">Your Transactions</h2>
                <div className="space-y-3">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="bg-white/5 p-4 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-white font-semibold">
                            {tx.transaction_type === 'buy' ? '🟢 Buy' : '🔵 Sell'} {tx.chain}
                          </p>
                          <p className="text-white/70 text-sm">
                            ${tx.amount_usd} → {tx.amount_crypto} USDT
                          </p>
                          {tx.transaction_id && (
                            <p className="text-white/50 text-xs mt-1">TX: {tx.transaction_id}</p>
                          )}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          tx.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                          tx.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default CryptoPage;