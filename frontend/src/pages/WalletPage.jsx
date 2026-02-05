import { useCallback, useEffect, useMemo, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { buildPlisioInvoiceUrl, openPlisioInvoice } from '../utils/plisioInvoice';

const WalletPage = ({ user, logout, settings }) => {
  const [balance, setBalance] = useState(0);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [topups, setTopups] = useState([]);
  const [loading, setLoading] = useState(true);

  const [topupAmount, setTopupAmount] = useState('');
  const [topupMethod, setTopupMethod] = useState('crypto_plisio');
  const [creatingTopup, setCreatingTopup] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [proofTxId, setProofTxId] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [selectedTopupId, setSelectedTopupId] = useState(null);
  const [convertCredits, setConvertCredits] = useState('');
  const [converting, setConverting] = useState(false);

  const userId = user?.user_id || user?.id;

  const enabledPaymentMethods = useMemo(() => {
    const methods = [];
    // Wallet topup via crypto invoice
    methods.push({ value: 'crypto_plisio', label: 'Crypto (Automatic)' });
    const gateways = settings?.payment_gateways || {};
    for (const key of Object.keys(gateways)) {
      if (gateways[key]?.enabled && key !== 'crypto_usdt') {
        methods.push({ value: key, label: key.replaceAll('_', ' ').toUpperCase() });
      }
    }
    return methods;
  }, [settings]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes, creditsRes, txRes, topupRes] = await Promise.all([
        axiosInstance.get(`/wallet/balance?user_id=${userId}`),
        axiosInstance.get(`/credits/balance?user_id=${userId}`),
        axiosInstance.get(`/wallet/transactions?user_id=${userId}`),
        axiosInstance.get(`/wallet/topups/user/${userId}`)
      ]);
      setBalance(balRes.data?.wallet_balance || 0);
      setCreditsBalance(creditsRes.data?.credits_balance || 0);
      setTransactions(txRes.data || []);
      setTopups(topupRes.data || []);
    } catch (e) {
      console.error('Wallet load error:', e);
      toast.error('Error loading wallet');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const doConvertCredits = async () => {
    const credits = parseInt(convertCredits, 10);
    if (!Number.isFinite(credits) || credits <= 0) {
      toast.error('Enter credits to convert (multiple of 1000)');
      return;
    }
    if (credits % 1000 !== 0) {
      toast.error('Credits must be a multiple of 1000');
      return;
    }
    setConverting(true);
    try {
      const res = await axiosInstance.post(
        `/credits/convert?user_id=${userId}&user_email=${encodeURIComponent(user.email)}`,
        { credits }
      );
      toast.success(`Converted ${credits} credits → $${Number(res.data.usd_added).toFixed(2)}`);
      setConvertCredits('');
      await loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error converting credits');
    } finally {
      setConverting(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadAll();
    }
  }, [userId, loadAll]);

  const createTopup = async () => {
    const amt = parseFloat(topupAmount);
    if (!amt || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setCreatingTopup(true);
    try {
      const res = await axiosInstance.post(
        `/wallet/topups?user_id=${userId}&user_email=${user.email}`,
        { amount: amt, payment_method: topupMethod }
      );
      toast.success('Topup created');
      setTopupAmount('');
      setSelectedTopupId(res.data?.topup?.id || null);
      setProofTxId('');
      setProofUrl('');
      await loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error creating topup');
    } finally {
      setCreatingTopup(false);
    }
  };

  const uploadProofFile = async (file) => {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB');
      return null;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axiosInstance.post('/upload/image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data?.url || null;
    } catch (e) {
      toast.error('Upload failed');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const submitProof = async () => {
    if (!selectedTopupId) {
      toast.error('Select a topup first');
      return;
    }
    if (!proofTxId || !proofUrl) {
      toast.error('Transaction ID and proof required');
      return;
    }
    try {
      await axiosInstance.post('/wallet/topups/proof', {
        topup_id: selectedTopupId,
        transaction_id: proofTxId,
        payment_proof_url: proofUrl
      });
      toast.success('Proof submitted');
      setProofTxId('');
      setProofUrl('');
      await loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error submitting proof');
    }
  };

  const selectedTopup = topups.find(t => t.id === selectedTopupId) || null;
  const topupInvoiceUrl = selectedTopup
    ? buildPlisioInvoiceUrl(selectedTopup.plisio_invoice_url, selectedTopup.plisio_invoice_id)
    : null;

  useEffect(() => {
    if (!selectedTopup) return;
    if (
      selectedTopup.payment_method === 'crypto_plisio' &&
      ['pending', 'processing'].includes(selectedTopup.payment_status) &&
      topupInvoiceUrl
    ) {
      openPlisioInvoice(topupInvoiceUrl, selectedTopup.id);
    }
  }, [selectedTopup, topupInvoiceUrl]);

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-8">Wallet</h1>

          {loading ? (
            <div className="text-white">Loading...</div>
          ) : (
            <div className="space-y-6">
              <Card className="glass-effect border-white/20">
                <CardContent className="p-6">
                  <p className="text-white/70 mb-2">Wallet Balance</p>
                  <p className="text-4xl font-bold text-white">${Number(balance).toFixed(2)}</p>
                </CardContent>
              </Card>

              <Card className="glass-effect border-white/20">
                <CardContent className="p-6 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="text-white/70 mb-1">Credits</p>
                      <p className="text-3xl font-bold text-white">{Number(creditsBalance)}</p>
                      <p className="text-white/60 text-xs">1000 credits = $1. Each successful order earns 5 credits.</p>
                    </div>
                    <div className="w-full md:w-80">
                      <Label className="text-white">Convert credits (multiple of 1000)</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          value={convertCredits}
                          onChange={(e) => setConvertCredits(e.target.value)}
                          className="bg-white/10 border-white/20 text-white"
                          placeholder="e.g. 1000"
                        />
                        <Button
                          onClick={doConvertCredits}
                          disabled={converting}
                          className="bg-white text-purple-600 hover:bg-gray-100"
                        >
                          {converting ? '...' : 'Convert'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-effect border-white/20">
                <CardContent className="p-6 space-y-4">
                  <h2 className="text-2xl font-bold text-white">Top Up Wallet</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-white">Amount (USD)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={topupAmount}
                        onChange={(e) => setTopupAmount(e.target.value)}
                        className="bg-white/10 border-white/20 text-white mt-2"
                        placeholder="Enter amount"
                      />
                    </div>
                    <div>
                      <Label className="text-white">Payment Method</Label>
                      <Select value={topupMethod} onValueChange={setTopupMethod}>
                        <SelectTrigger className="bg-white/10 border-white/20 text-white mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {enabledPaymentMethods.map(m => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    onClick={createTopup}
                    disabled={creatingTopup}
                    className="w-full bg-white text-purple-600 hover:bg-gray-100"
                  >
                    {creatingTopup ? 'Creating...' : 'Create Topup'}
                  </Button>

                  {selectedTopup && (
                    <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded-lg">
                      <p className="text-white font-semibold">Selected Topup: {selectedTopup.id.slice(0, 8)}</p>
                      <p className="text-white/70 text-sm">Status: {selectedTopup.payment_status}</p>
                      {topupInvoiceUrl && (
                        <p className="text-white/70 text-sm mt-3">
                          Invoice opened automatically. If it did not open,{" "}
                          <a
                            href={topupInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-200 underline"
                          >
                            open it here
                          </a>
                          .
                        </p>
                      )}
                    </div>
                  )}

                  {/* Proof upload for manual methods */}
                  {selectedTopup && selectedTopup.payment_method !== 'crypto_plisio' && ['pending', 'failed'].includes(selectedTopup.payment_status) && (
                    <div className="mt-2 p-4 bg-yellow-400/10 border border-yellow-400/30 rounded-lg space-y-3">
                      <p className="text-yellow-200 text-sm">
                        Submit payment proof for this topup (screenshot + transaction ID).
                      </p>
                      <div>
                        <Label className="text-white">Transaction ID</Label>
                        <Input
                          value={proofTxId}
                          onChange={(e) => setProofTxId(e.target.value)}
                          className="bg-white/10 border-white/20 text-white mt-2"
                          placeholder="Enter transaction ID"
                        />
                      </div>
                      <div>
                        <Label className="text-white">Upload Screenshot</Label>
                        <Input
                          type="file"
                          accept="image/*"
                          disabled={uploading}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            const url = await uploadProofFile(file);
                            if (url) {
                              setProofUrl(url);
                              toast.success('Uploaded');
                            }
                          }}
                          className="bg-white/10 border-white/20 text-white mt-2 cursor-pointer"
                        />
                        {proofUrl && (
                          <img src={proofUrl} alt="Proof" className="mt-2 max-h-32 rounded border border-white/10" />
                        )}
                      </div>
                      <Button
                        onClick={submitProof}
                        className="w-full bg-yellow-400 text-gray-900 hover:bg-yellow-300"
                      >
                        Submit Proof
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass-effect border-white/20">
                <CardContent className="p-6">
                  <h2 className="text-2xl font-bold text-white mb-4">Topup History</h2>
                  <div className="space-y-3">
                    {topups.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTopupId(t.id)}
                        className={`w-full text-left p-4 rounded-lg border transition ${
                          selectedTopupId === t.id ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 bg-white/5 hover:border-white/30'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-white font-semibold">${Number(t.amount).toFixed(2)} via {t.payment_method}</p>
                            <p className="text-white/60 text-xs">{new Date(t.created_at).toLocaleString()}</p>
                          </div>
                          <span className="text-white/80 text-sm">{t.payment_status}</span>
                        </div>
                      </button>
                    ))}
                    {topups.length === 0 && <p className="text-white/60">No topups yet.</p>}
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-effect border-white/20">
                <CardContent className="p-6">
                  <h2 className="text-2xl font-bold text-white mb-4">Wallet Transactions</h2>
                  <div className="space-y-3">
                    {transactions.map(tx => (
                      <div key={tx.id} className="p-4 rounded bg-white/5 border border-white/10">
                        <div className="flex justify-between">
                          <p className="text-white font-semibold">{tx.type}</p>
                          <p className="text-white font-bold">{Number(tx.amount).toFixed(2)}</p>
                        </div>
                        <p className="text-white/60 text-xs">{tx.reason}</p>
                      </div>
                    ))}
                    {transactions.length === 0 && <p className="text-white/60">No transactions yet.</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default WalletPage;

