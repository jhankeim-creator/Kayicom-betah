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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  const [payerInfo, setPayerInfo] = useState('');
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [buyStep, setBuyStep] = useState(1);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [buyPaymentInfo, setBuyPaymentInfo] = useState(null);
  const [sellPaymentInfo, setSellPaymentInfo] = useState(null);
  const [proofDialogOpen, setProofDialogOpen] = useState(false);
  const [selectedProofTx, setSelectedProofTx] = useState(null);
  const [proofTxId, setProofTxId] = useState('');
  const [proofTxHash, setProofTxHash] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [submittingProof, setSubmittingProof] = useState(false);

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
    const gateways = settings?.crypto_payment_gateways || {};
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

  useEffect(() => {
    if (!user || transactions.length === 0) return;
    const hasPending = transactions.some((tx) => ['pending', 'processing'].includes(tx.status));
    if (!hasPending) return;
    const intervalId = setInterval(() => {
      loadTransactions();
    }, 20000);
    return () => clearInterval(intervalId);
  }, [user, transactions]);

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

  const openProofDialog = (tx) => {
    setSelectedProofTx(tx);
    setProofTxId(tx?.transaction_id || '');
    setProofTxHash(tx?.tx_hash || tx?.transaction_hash || '');
    setProofFile(null);
    setProofDialogOpen(true);
  };

  const submitPaymentProof = async () => {
    if (!selectedProofTx?.id) return;
    if (!proofTxId && !proofFile && !proofTxHash) {
      toast.error('Provide a transaction ID, hash, or payment proof');
      return;
    }
    setSubmittingProof(true);
    try {
      let proofUrl = null;
      if (proofFile) {
        proofUrl = await handleFileUpload(proofFile);
      }
      await axiosInstance.post(`/crypto/transactions/${selectedProofTx.id}/proof`, {
        transaction_id: proofTxId || undefined,
        tx_hash: proofTxHash || undefined,
        payment_proof: proofUrl || undefined,
      });
      toast.success('Payment proof submitted');
      setProofDialogOpen(false);
      setSelectedProofTx(null);
      setProofTxId('');
      setProofTxHash('');
      setProofFile(null);
      loadTransactions();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit payment proof');
    } finally {
      setSubmittingProof(false);
    }
  };

  const formatSourceLabel = (source) => {
    if (source === 'settings') return 'Settings';
    if (source === 'config') return 'Config';
    if (source === 'default') return 'Default';
    return 'Default';
  };

  const getBuyRate = () => {
    if (!config) return 1.02;
    return config?.buy_rate_by_chain?.[chain] || config?.buy_rate_usdt || 1.02;
  };

  const getSellRate = () => {
    if (!config) return 0.98;
    return config?.sell_rate_by_chain?.[chain] || config?.sell_rate_usdt || 0.98;
  };

  const buyRateSource = config?.buy_rate_by_chain_source?.[chain] || config?.buy_rate_source;
  const sellRateSource = config?.sell_rate_by_chain_source?.[chain] || config?.sell_rate_source;
  const feeSource = config?.transaction_fee_source;

  const calculateBuy = (usd) => {
    if (!config) return 0;
    const rate = getBuyRate();
    const feePercent = config.transaction_fee_percent || 2;
    const crypto = parseFloat(usd) / rate;
    const fee = parseFloat(usd) * (feePercent / 100);
    return { crypto, fee, total: parseFloat(usd) + fee, rate, feePercent };
  };

  const calculateSell = (crypto) => {
    if (!config) return 0;
    const rate = getSellRate();
    const feePercent = config.transaction_fee_percent || 2;
    const usd = parseFloat(crypto) * rate;
    const fee = usd * (feePercent / 100);
    return { usd, fee, total: usd - fee, rate, feePercent };
  };

  const minBuyUsd = config?.min_transaction_usd || config?.min_buy_usd || 10;
  const maxBuyUsd = config?.max_buy_usd || 10000;
  const minSellUsdt = config?.min_sell_usdt || 10;
  const maxSellUsdt = config?.max_sell_usdt || 10000;

  const handleBuyContinue = () => {
    if (!user) {
      toast.error('Please login to buy crypto');
      return;
    }

    if (!amountUsd || parseFloat(amountUsd) < minBuyUsd) {
      toast.error(`Minimum buy is $${minBuyUsd}`);
      return;
    }
    if (parseFloat(amountUsd) > maxBuyUsd) {
      toast.error(`Maximum buy is $${maxBuyUsd}`);
      return;
    }

    if (!walletAddress) {
      toast.error('Please enter your wallet address');
      return;
    }

    setBuyStep(2);
  };

  const handleBuySubmit = async () => {
    if (!paymentProofFile) {
      toast.error('Please upload your payment proof');
      return;
    }
    if (!payerInfo.trim() && !transactionId.trim()) {
      toast.error('Please provide payer info or a payment reference');
      return;
    }
    setLoading(true);

    try {
      const proofUrl = await handleFileUpload(paymentProofFile);
      if (!proofUrl) {
        toast.error('Failed to upload payment proof');
        setLoading(false);
        return;
      }
      const response = await axiosInstance.post(`/crypto/buy?user_id=${user.user_id || user.id}&user_email=${user.email}`, {
        chain,
        amount_usd: parseFloat(amountUsd),
        wallet_address: walletAddress,
        payment_method: paymentMethod,
        payer_info: payerInfo.trim(),
        transaction_id: transactionId || '',
        payment_proof: proofUrl
      });
      
      setBuyPaymentInfo(response.data);
      // For BUY, show success summary
      toast.success('✅ Order submitted! We will verify your payment.');
      
      // Clear form
      setAmountUsd('');
      setWalletAddress('');
      setTransactionId('');
      setPayerInfo('');
      setPaymentProofFile(null);
      setBuyStep(1);
      
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
    if (parseFloat(amountCrypto) < minSellUsdt) {
      toast.error(`Minimum sell is ${minSellUsdt} USDT`);
      return;
    }
    if (parseFloat(amountCrypto) > maxSellUsdt) {
      toast.error(`Maximum sell is ${maxSellUsdt} USDT`);
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
      const mode = response.data?.processing_mode;
      if (mode === 'automatic') {
        toast.success('✅ Unique address generated! Send USDT to the wallet above.');
      } else {
        toast.success('Sell order created! Send USDT to the wallet above and submit proof.');
      }
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

  const selectedGateway = settings?.crypto_payment_gateways?.[paymentMethod];
  const buyPaymentDetails = selectedGateway?.enabled
    ? selectedGateway
    : null;

  const getAdminWallet = () => {
    if (!config?.crypto_settings?.wallets) return null;
    return config.crypto_settings.wallets[chain];
  };
  const adminWallet = getAdminWallet();
  const hasAdminWallet = Boolean(adminWallet && String(adminWallet).trim());

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="w-full max-w-[1400px] mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-4">
            Buy & Sell USDT
          </h1>
          <p className="text-white/80 text-center mb-12">
            Trade USDT on BEP20 and TRC20 networks. No KYC required.
          </p>

          {/* BUY USDT - Internal invoice */}
          {buyPaymentInfo?.transaction_id && (
            <Card className="glass-effect border-green-500/40 mb-8">
              <CardContent className="p-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-green-400 mb-4">✅ Buy Invoice Created</h2>
                  <p className="text-white/80 mb-2 text-sm">Invoice ID: {buyPaymentInfo.invoice_id || buyPaymentInfo.transaction_id}</p>
                  <p className="text-white/90 mb-4 text-lg">
                    Pay <span className="text-green-300 font-bold">${Number(buyPaymentInfo.total_usd || 0).toFixed(2)}</span> to receive{' '}
                    <span className="text-green-300 font-bold">{Number(buyPaymentInfo.amount_crypto || 0).toFixed(2)} USDT</span>
                  </p>
                  {buyPaymentInfo.payment_info?.email && (
                    <div className="bg-cyan-500/10 border border-green-500/30 p-6 rounded-lg mb-4">
                      <p className="text-white/70 text-sm mb-2 font-semibold">Send payment to:</p>
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <code className="text-cyan-200 text-base break-all font-mono bg-black/30 px-3 py-2 rounded">
                          {buyPaymentInfo.payment_info.email}
                        </code>
                        <Button
                          size="sm"
                          className="bg-cyan-500/20 text-cyan-200 hover:bg-green-500/30"
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
                  {!buyPaymentInfo.payment_info?.email && !buyPaymentInfo.payment_info?.instructions && (
                    <div className="text-amber-200 text-sm bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg mb-4">
                      Payment method details are not configured yet. Please contact support.
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      variant="outline"
                      className="border-cyan-400 text-cyan-200 hover:bg-cyan-400/10"
                      onClick={() => setBuyPaymentInfo(null)}
                    >
                      Create Another Buy Order
                    </Button>
                  </div>
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
                  {sellPaymentInfo.warning && (
                    <div className="mt-4 text-left bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg">
                      <p className="text-amber-200 text-sm">{sellPaymentInfo.warning}</p>
                    </div>
                  )}
                  {sellPaymentInfo.processing_mode === 'automatic' ? (
                    <div className="mt-4 text-left bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-lg">
                      <p className="text-emerald-200 text-sm">
                        ✅ <strong>Automatic processing:</strong> Your deposit will be confirmed automatically after it is received on-chain.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 text-left bg-blue-500/10 border border-blue-500/30 p-4 rounded-lg">
                      <p className="text-blue-200 text-sm">
                        📝 <strong>Manual review:</strong> After sending USDT, please submit your payment proof from your transaction history.
                      </p>
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
                  {buyStep === 1 ? (
                    <>
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
                          placeholder={`Min $${minBuyUsd}`}
                          value={amountUsd}
                          onChange={(e) => setAmountUsd(e.target.value)}
                          className="bg-white/10 border-white/20 text-white mt-1"
                        />
                      </div>

                      {buyCalculation && (
                        <div className="bg-white/5 p-4 rounded-lg space-y-2">
                          <div className="flex justify-between text-white/70">
                            <span>Rate ({chain}):</span>
                            <span>${buyCalculation.rate.toFixed(4)} / USDT</span>
                          </div>
                          <div className="flex justify-between text-white/70">
                            <span>You will receive:</span>
                            <span className="text-white font-bold">{buyCalculation.crypto.toFixed(2)} USDT</span>
                          </div>
                          <div className="flex justify-between text-white/70">
                            <span>Fee ({buyCalculation.feePercent}%):</span>
                            <span>${buyCalculation.fee.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-white font-bold border-t border-white/20 pt-2">
                            <span>Total to Pay:</span>
                            <span>${buyCalculation.total.toFixed(2)}</span>
                          </div>
                          <p className="text-white/50 text-xs">
                            Rate source: {formatSourceLabel(buyRateSource)} • Fee source: {formatSourceLabel(feeSource)}
                          </p>
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
                        onClick={handleBuyContinue}
                        disabled={loading}
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                      >
                        Continue
                      </Button>

                      <p className="text-white/60 text-sm text-center">
                        Step 1 of 2 — Continue to submit payment proof.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="bg-white/5 p-4 rounded-lg space-y-2">
                        <p className="text-white/80 text-sm">Payment Instructions</p>
                        {buyPaymentDetails?.email ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-cyan-200 text-sm break-all bg-black/30 px-3 py-2 rounded">
                              {buyPaymentDetails.email}
                            </code>
                            <Button
                              size="sm"
                              className="bg-cyan-500/20 text-cyan-200 hover:bg-green-500/30"
                              onClick={() => copyToClipboard(buyPaymentDetails.email, 'Payment address')}
                            >
                              <Copy size={14} />
                            </Button>
                          </div>
                        ) : (
                          <p className="text-amber-200 text-sm">Payment method details are not configured.</p>
                        )}
                        {buyPaymentDetails?.instructions && (
                          <p className="text-white/70 text-sm">{buyPaymentDetails.instructions}</p>
                        )}
                      </div>

                      <div>
                        <Label className="text-white">Payer Info (required)</Label>
                        <Input
                          placeholder="Enter payer email/username"
                          value={payerInfo}
                          onChange={(e) => setPayerInfo(e.target.value)}
                          className="bg-white/10 border-white/20 text-white mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-white">Payment Reference (optional)</Label>
                        <Input
                          placeholder="Enter transaction ID or reference"
                          value={transactionId}
                          onChange={(e) => setTransactionId(e.target.value)}
                          className="bg-white/10 border-white/20 text-white mt-1"
                        />
                      </div>

                      <div>
                        <Label className="text-white">Upload Payment Proof</Label>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setPaymentProofFile(e.target.files?.[0] || null)}
                          className="bg-white/10 border-white/20 text-white mt-1"
                        />
                        <p className="text-white/50 text-xs mt-1">Required before submitting your order.</p>
                      </div>

                      <div className="flex gap-3">
                        <Button
                          onClick={() => setBuyStep(1)}
                          variant="outline"
                          className="border-white/20 text-white"
                        >
                          Back
                        </Button>
                        <Button
                          onClick={handleBuySubmit}
                          disabled={loading || uploadingProof}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        >
                          {loading || uploadingProof ? 'Submitting...' : 'Submit Order'}
                        </Button>
                      </div>

                      <p className="text-white/60 text-sm text-center">
                        Step 2 of 2 — Submit payment proof to create your order.
                      </p>
                    </>
                  )}
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
                  {!hasAdminWallet && (
                    <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-lg">
                      <p className="text-red-200 text-sm">
                        Admin wallet not configured for {chain}. Please select another network or contact support.
                      </p>
                    </div>
                  )}


                  <div>
                    <Label className="text-white">Amount (USDT)</Label>
                    <Input
                      type="number"
                      placeholder={`Min ${minSellUsdt} USDT`}
                      value={amountCrypto}
                      onChange={(e) => setAmountCrypto(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-1"
                    />
                  </div>

                  {sellCalculation && (
                    <div className="bg-white/5 p-4 rounded-lg space-y-2">
                      <div className="flex justify-between text-white/70">
                        <span>Rate ({chain}):</span>
                        <span>${sellCalculation.rate.toFixed(4)} / USDT</span>
                      </div>
                      <div className="flex justify-between text-white/70">
                        <span>You will receive:</span>
                        <span className="text-white font-bold">${sellCalculation.usd.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-white/70">
                        <span>Fee ({sellCalculation.feePercent}%):</span>
                        <span>-${sellCalculation.fee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-white font-bold border-t border-white/20 pt-2">
                        <span>Total:</span>
                        <span>${sellCalculation.total.toFixed(2)}</span>
                      </div>
                      <p className="text-white/50 text-xs">
                        Rate source: {formatSourceLabel(sellRateSource)} • Fee source: {formatSourceLabel(feeSource)}
                      </p>
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
                    disabled={loading || uploadingProof || !hasAdminWallet}
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
                  {transactions.map((tx) => {
                    const requiresProof = tx.transaction_type === 'buy' || tx.processing_mode === 'manual' || !tx.processing_mode;
                    return (
                      <div key={tx.id} className="bg-white/5 p-4 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-white font-semibold">
                            {tx.transaction_type === 'buy' ? '🟢 Buy' : '🔵 Sell'} {tx.chain}
                          </p>
                          <p className="text-white/70 text-sm">
                            ${tx.amount_usd} → {tx.amount_crypto} USDT
                          </p>
                          {tx.invoice_id && (
                            <p className="text-white/60 text-xs mt-1">Invoice: {tx.invoice_id}</p>
                          )}
                          {tx.transaction_id && (
                            <p className="text-white/50 text-xs mt-1">Reference: {tx.transaction_id}</p>
                          )}
                          {(tx.tx_hash || tx.transaction_hash) && (
                            <p className="text-white/50 text-xs mt-1 break-all">
                              Hash: {tx.tx_hash || tx.transaction_hash}
                            </p>
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
                      {tx.status === 'pending' && requiresProof && (
                        <div className="mt-3">
                          <Button
                            variant="outline"
                            className="border-white/20 text-white hover:bg-white/10"
                            onClick={() => openProofDialog(tx)}
                          >
                            Submit Payment Proof
                          </Button>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Footer settings={settings} />

      <Dialog open={proofDialogOpen} onOpenChange={setProofDialogOpen}>
        <DialogContent className="bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-white">Submit Payment Proof</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-white/70 text-sm">
              Transaction: <span className="text-white">{selectedProofTx?.invoice_id || selectedProofTx?.id}</span>
            </div>
            <div>
              <Label className="text-white">Payment Reference (optional)</Label>
              <Input
                value={proofTxId}
                onChange={(e) => setProofTxId(e.target.value)}
                className="bg-white/10 border-white/20 text-white mt-1"
                placeholder="Enter payment reference or transaction ID"
              />
            </div>
            {selectedProofTx?.transaction_type === 'sell' && (
              <div>
                <Label className="text-white">Transaction Hash (optional)</Label>
                <Input
                  value={proofTxHash}
                  onChange={(e) => setProofTxHash(e.target.value)}
                  className="bg-white/10 border-white/20 text-white mt-1"
                  placeholder="Enter blockchain transaction hash"
                />
              </div>
            )}
            <div>
              <Label className="text-white">Upload Payment Proof</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                className="bg-white/10 border-white/20 text-white mt-1"
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={submitPaymentProof}
                disabled={submittingProof || uploadingProof}
                className="flex-1 gradient-button text-white"
              >
                {submittingProof || uploadingProof ? 'Submitting...' : 'Submit Proof'}
              </Button>
              <Button
                variant="outline"
                className="border-white/20 text-white"
                onClick={() => setProofDialogOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CryptoPage;