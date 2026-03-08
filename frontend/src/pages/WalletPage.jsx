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
import { HelpCircle, Filter, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

const WalletPage = ({ user, logout, settings }) => {
  const [balance, setBalance] = useState(0);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [topups, setTopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('transactions');

  const [topupAmount, setTopupAmount] = useState('');
  const [topupMethod, setTopupMethod] = useState('crypto_plisio');
  const [creatingTopup, setCreatingTopup] = useState(false);
  const [showRecharge, setShowRecharge] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [proofTxId, setProofTxId] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [selectedTopupId, setSelectedTopupId] = useState(null);
  const [convertCredits, setConvertCredits] = useState('');
  const [converting, setConverting] = useState(false);

  const userId = user?.user_id || user?.id;

  const enabledPaymentMethods = useMemo(() => {
    const methods = [];
    methods.push({ value: 'crypto_plisio', label: 'Crypto (Automatic)' });
    methods.push({ value: 'payerurl', label: 'Crypto (PayerURL)' });
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
    if (!Number.isFinite(credits) || credits <= 0) { toast.error('Enter credits to convert (multiple of 1000)'); return; }
    if (credits % 1000 !== 0) { toast.error('Credits must be a multiple of 1000'); return; }
    setConverting(true);
    try {
      const res = await axiosInstance.post(`/credits/convert?user_id=${userId}&user_email=${encodeURIComponent(user.email)}`, { credits });
      toast.success(`Converted ${credits} credits → $${Number(res.data.usd_added).toFixed(2)}`);
      setConvertCredits('');
      await loadAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error converting credits'); }
    finally { setConverting(false); }
  };

  useEffect(() => { if (userId) loadAll(); }, [userId, loadAll]);

  const createTopup = async () => {
    const amt = parseFloat(topupAmount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setCreatingTopup(true);
    try {
      const res = await axiosInstance.post(`/wallet/topups?user_id=${userId}&user_email=${user.email}`, { amount: amt, payment_method: topupMethod });
      const topupData = res.data?.topup;
      if (topupMethod === 'payerurl' && topupData?.payerurl_payment_url) {
        toast.success('Redirecting to crypto payment...');
        window.location.href = topupData.payerurl_payment_url;
        return;
      }
      toast.success('Topup created');
      setTopupAmount('');
      setSelectedTopupId(topupData?.id || null);
      setShowRecharge(false);
      await loadAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error creating topup'); }
    finally { setCreatingTopup(false); }
  };

  const uploadProofFile = async (file) => {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) { toast.error('File too large. Max 5MB'); return null; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await axiosInstance.post('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      return res.data?.url || null;
    } catch (e) { toast.error('Upload failed'); return null; }
    finally { setUploading(false); }
  };

  const submitProof = async () => {
    if (!selectedTopupId) { toast.error('Select a topup first'); return; }
    if (!proofTxId || !proofUrl) { toast.error('Transaction ID and proof required'); return; }
    try {
      await axiosInstance.post('/wallet/topups/proof', { topup_id: selectedTopupId, transaction_id: proofTxId, payment_proof_url: proofUrl });
      toast.success('Proof submitted');
      setProofTxId(''); setProofUrl('');
      await loadAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error submitting proof'); }
  };

  const selectedTopup = topups.find(t => t.id === selectedTopupId) || null;
  const topupInvoiceUrl = selectedTopup ? buildPlisioInvoiceUrl(selectedTopup.plisio_invoice_url, selectedTopup.plisio_invoice_id) : null;

  useEffect(() => {
    if (!selectedTopup) return;
    if (selectedTopup.payment_method === 'crypto_plisio' && ['pending', 'processing'].includes(selectedTopup.payment_status) && topupInvoiceUrl) {
      openPlisioInvoice(topupInvoiceUrl, selectedTopup.id);
    }
  }, [selectedTopup, topupInvoiceUrl]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">

          {/* Balance Card */}
          <div className="relative rounded-2xl overflow-hidden mb-6">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-600 via-red-600 to-orange-700 opacity-80" />
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjEwMCIgY3k9IjEwMCIgcj0iODAiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-30" />
            <div className="relative p-6">
              <div className="flex items-center justify-between mb-1">
                <p className="text-white/80 text-sm">Withdraw Balance</p>
                <HelpCircle size={18} className="text-white/50" />
              </div>
              <p className="text-3xl font-bold text-white mb-6">{Number(balance).toFixed(2)} USD</p>

              <div className="flex gap-8">
                <div>
                  <p className="text-white/60 text-xs">Pending Balance</p>
                  <p className="text-white font-semibold text-sm">0.00 USD</p>
                </div>
                <div>
                  <p className="text-white/60 text-xs">Consumable Balance</p>
                  <p className="text-white font-semibold text-sm">0.00 USD</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 mb-8 justify-center">
            <a href="/withdraw">
              <Button className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-3 rounded-full">
                Withdraw
              </Button>
            </a>
            <Button
              onClick={() => setShowRecharge(!showRecharge)}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-3 rounded-full"
            >
              Recharge
            </Button>
          </div>

          {/* Recharge Panel */}
          {showRecharge && (
            <div className="mb-8 p-5 rounded-xl bg-[#141414] border border-white/5">
              <h3 className="text-white font-semibold mb-4">Top Up Wallet</h3>
              <div className="space-y-4">
                <div>
                  <Label className="text-white/70 text-sm">Amount (USD)</Label>
                  <Input type="number" step="0.01" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)}
                    className="bg-white/5 border-white/10 text-white mt-1" placeholder="Enter amount" />
                </div>
                <div>
                  <Label className="text-white/70 text-sm">Payment Method</Label>
                  <Select value={topupMethod} onValueChange={setTopupMethod}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{enabledPaymentMethods.map(m => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <Button onClick={createTopup} disabled={creatingTopup} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full py-3">
                  {creatingTopup ? 'Processing...' : 'Confirm'}
                </Button>
              </div>
            </div>
          )}

          {/* Credits Card */}
          <div className="mb-6 p-4 rounded-xl bg-[#141414] border border-white/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-xs">Credits Balance</p>
                <p className="text-xl font-bold text-white">{Number(creditsBalance)}</p>
                <p className="text-white/40 text-xs mt-1">1000 credits = $1</p>
              </div>
              <div className="flex gap-2 items-end">
                <Input value={convertCredits} onChange={(e) => setConvertCredits(e.target.value)}
                  className="bg-white/5 border-white/10 text-white w-28 text-sm" placeholder="1000" />
                <Button onClick={doConvertCredits} disabled={converting} size="sm"
                  className="bg-green-500 hover:bg-green-600 text-black font-semibold">
                  {converting ? '...' : 'Convert'}
                </Button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
            <div className="flex gap-6">
              <button
                onClick={() => setActiveTab('transactions')}
                className={`text-sm font-semibold pb-1 transition ${activeTab === 'transactions' ? 'text-white border-b-2 border-orange-500' : 'text-white/50'}`}
              >
                Transaction Record
              </button>
              <button
                onClick={() => setActiveTab('topups')}
                className={`text-sm font-semibold pb-1 transition ${activeTab === 'topups' ? 'text-white border-b-2 border-orange-500' : 'text-white/50'}`}
              >
                Topup Record
              </button>
            </div>
            <button className="flex items-center gap-1 text-orange-400 text-sm">
              <Filter size={14} />
              Filter(0)
            </button>
          </div>

          {/* Transaction Records */}
          {activeTab === 'transactions' && (
            <div className="space-y-3">
              {transactions.length > 0 ? transactions.map(tx => (
                <div key={tx.id} className="p-4 rounded-xl bg-[#141414] border border-white/5">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-white/50">ID</div>
                    <div className="text-white/80 text-right font-mono text-xs truncate">{tx.id}</div>
                    <div className="text-white/50">Date</div>
                    <div className="text-white/80 text-right">{new Date(tx.created_at).toLocaleString()}</div>
                    <div className="text-white/50">Status</div>
                    <div className="text-white/80 text-right">{tx.type === 'topup' ? 'income' : tx.type}</div>
                    <div className="text-white/50">Type</div>
                    <div className="text-white/80 text-right">{tx.type}</div>
                    <div className="text-white/50">Amount</div>
                    <div className={`text-right font-semibold ${Number(tx.amount) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {Number(tx.amount) >= 0 ? '+' : ''}{Number(tx.amount).toFixed(2)}
                    </div>
                    {tx.reason && (
                      <>
                        <div className="text-white/50">Note</div>
                        <div className="text-white/60 text-right text-xs">{tx.reason}</div>
                      </>
                    )}
                  </div>
                </div>
              )) : (
                <p className="text-white/40 text-center py-8">No transactions yet.</p>
              )}
            </div>
          )}

          {/* Topup Records */}
          {activeTab === 'topups' && (
            <div className="space-y-3">
              {topups.length > 0 ? topups.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTopupId(t.id)}
                  className={`w-full text-left p-4 rounded-xl border transition ${
                    selectedTopupId === t.id ? 'border-orange-400 bg-orange-400/5' : 'border-white/5 bg-[#141414] hover:border-white/10'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-white font-semibold">${Number(t.amount).toFixed(2)} via {t.payment_method}</p>
                      <p className="text-white/40 text-xs">{new Date(t.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${
                      t.payment_status === 'paid' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>{t.payment_status}</span>
                  </div>
                </button>
              )) : (
                <p className="text-white/40 text-center py-8">No topups yet.</p>
              )}

              {/* Proof form for selected topup */}
              {selectedTopup && selectedTopup.payment_method !== 'crypto_plisio' && ['pending', 'failed'].includes(selectedTopup.payment_status) && (
                <div className="mt-4 p-4 rounded-xl bg-[#1a1a1a] border border-orange-500/20 space-y-3">
                  <p className="text-orange-300 text-sm font-semibold">Submit payment proof</p>
                  <div>
                    <Label className="text-white/70 text-sm">Transaction ID</Label>
                    <Input value={proofTxId} onChange={(e) => setProofTxId(e.target.value)}
                      className="bg-white/5 border-white/10 text-white mt-1" placeholder="Enter transaction ID" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Upload Screenshot</Label>
                    <Input type="file" accept="image/*" disabled={uploading}
                      onChange={async (e) => { const url = await uploadProofFile(e.target.files?.[0]); if (url) { setProofUrl(url); toast.success('Uploaded'); } }}
                      className="bg-white/5 border-white/10 text-white mt-1 cursor-pointer" />
                    {proofUrl && <img src={proofUrl} alt="Proof" className="mt-2 max-h-24 rounded" />}
                  </div>
                  <Button onClick={submitProof} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full">
                    Submit Proof
                  </Button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default WalletPage;
