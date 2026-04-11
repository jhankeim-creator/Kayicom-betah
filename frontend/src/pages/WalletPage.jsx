import { useCallback, useEffect, useMemo, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// Only automatic payment methods supported (crypto, binance auto)
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { buildPlisioInvoiceUrl, openPlisioInvoice } from '../utils/plisioInvoice';
import { HelpCircle, Filter } from 'lucide-react';

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

  const [selectedTopupId, setSelectedTopupId] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [verifyingTopup, setVerifyingTopup] = useState(false);
  const [convertCredits, setConvertCredits] = useState('');
  const [converting, setConverting] = useState(false);

  const userId = user?.user_id || user?.id;

  const openGatewayInstructionsUrl = (method, paymentInfo = null) => {
    const directInstructions = paymentInfo?.instructions || '';
    const fallbackInstructions = settings?.payment_gateways?.[method]?.instructions || '';
    const source = String(directInstructions || fallbackInstructions);
    const match = source.match(/https?:\/\/[^\s)]+/i);
    if (!match?.[0]) return false;
    try {
      window.open(match[0], '_blank', 'noopener,noreferrer');
      return true;
    } catch {
      return false;
    }
  };

  const enabledPaymentMethods = useMemo(() => {
    const methods = [];
    methods.push({ value: 'crypto_plisio', label: 'Crypto (Automatic)' });
    const gateways = settings?.payment_gateways || {};
    if (gateways.natcash?.enabled) {
      methods.push({ value: 'natcash', label: 'NatCash (Auto)' });
    }
    if (gateways.binance_pay?.enabled) {
      methods.push({ value: 'binance_pay', label: 'Binance Pay (Auto)' });
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
      const paymentInfo = res.data?.payment_info;
      setTopupAmount('');
      setShowRecharge(false);

      if (topupMethod === 'crypto_plisio') {
        const invoiceUrl = buildPlisioInvoiceUrl(topupData?.plisio_invoice_url, topupData?.plisio_invoice_id);
        if (invoiceUrl) {
          toast.success('Redirecting to crypto payment...');
          openPlisioInvoice(invoiceUrl, topupData?.id);
        } else {
          toast.error('Crypto payment not available — Plisio API key not configured');
        }
      } else if (topupMethod === 'binance_pay' || topupMethod === 'natcash') {
        const opened = openGatewayInstructionsUrl(topupMethod, paymentInfo);
        toast.success(opened ? 'Payment instructions opened. Complete payment to auto-verify topup.' : 'Topup created — complete payment using the selected gateway.');
      } else {
        toast.success('Topup created — payment will be verified automatically');
      }

      setSelectedTopupId(topupData?.id || null);
      setActiveTab('topups');
      await loadAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error creating topup'); }
    finally { setCreatingTopup(false); }
  };

  const selectedTopup = topups.find(t => t.id === selectedTopupId) || null;
  const topupInvoiceUrl = selectedTopup ? buildPlisioInvoiceUrl(selectedTopup.plisio_invoice_url, selectedTopup.plisio_invoice_id) : null;

  const verifyBinanceTopup = async () => {
    if (!selectedTopup?.id) return;
    if (!selectedTopup.binance_reference) {
      toast.error('This topup has no memo reference. Create a new Binance topup or contact support.');
      return;
    }
    setVerifyingTopup(true);
    try {
      const res = await axiosInstance.post('/payments/binance-pay/verify-topup', {
        topup_id: selectedTopup.id,
      });
      if (res.data?.verified) {
        toast.success(res.data?.message || 'Topup verified');
      } else {
        toast.error(res.data?.message || 'Payment not found yet');
      }
      await loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Topup verification failed');
    } finally {
      setVerifyingTopup(false);
    }
  };

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
                  onClick={() => { setSelectedTopupId(t.id); setDetailsOpen(true); }}
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

              {selectedTopup && selectedTopup.payment_method === 'binance_pay' && selectedTopup.payment_status === 'pending' && (
                <div className="p-4 rounded-xl bg-[#141414] border border-yellow-500/20 space-y-3">
                  <p className="text-yellow-300 font-semibold text-sm">Binance Pay topup pending</p>
                  {selectedTopup.binance_reference && (
                    <div className="p-3 rounded bg-white/5 border border-white/10">
                      <p className="text-white/60 text-xs mb-1">Include this code in Binance Memo/Note:</p>
                      <div className="flex items-center gap-2">
                        <code className="text-yellow-300 font-mono text-base">{selectedTopup.binance_reference}</code>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-yellow-500/40 text-yellow-300"
                          onClick={() => { navigator.clipboard.writeText(selectedTopup.binance_reference || ''); }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  )}
                  <p className="text-white/60 text-xs">
                    Send the amount with the memo code above, then verify here (memo + amount match—no order ID needed).
                  </p>
                  <Button
                    onClick={verifyBinanceTopup}
                    disabled={verifyingTopup || !selectedTopup.binance_reference}
                    className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-full"
                  >
                    {verifyingTopup ? 'Verifying...' : 'Verify Binance Topup'}
                  </Button>
                </div>
              )}

            </div>
          )}

        </div>
      </div>

      {/* Topup Details Modal */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="bg-[#111] border border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Topup Details</DialogTitle>
          </DialogHeader>
          {selectedTopup ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-white/50">ID</div>
                <div className="text-white/80 text-right font-mono text-xs break-all">{selectedTopup.id}</div>
                <div className="text-white/50">Amount</div>
                <div className="text-white/80 text-right">${Number(selectedTopup.amount).toFixed(2)}</div>
                <div className="text-white/50">Method</div>
                <div className="text-white/80 text-right capitalize">{selectedTopup.payment_method?.replace('_', ' ')}</div>
                <div className="text-white/50">Status</div>
                <div className="text-white/80 text-right">{selectedTopup.payment_status}</div>
              </div>

              {selectedTopup.payment_method === 'crypto_plisio' && selectedTopup.payment_status === 'pending' && topupInvoiceUrl && (
                <div className="p-3 rounded bg-white/5 border border-white/10 text-sm">
                  <p>Your crypto invoice should open automatically.</p>
                  <Button
                    size="sm"
                    className="mt-2 bg-cyan-600 hover:bg-cyan-700 text-white"
                    onClick={() => openPlisioInvoice(topupInvoiceUrl, selectedTopup.id)}
                  >
                    Open Plisio Invoice
                  </Button>
                </div>
              )}

              {selectedTopup.payment_method === 'binance_pay' && selectedTopup.payment_status === 'pending' && (
                <div className="p-3 rounded bg-white/5 border border-yellow-500/20">
                  <p className="text-yellow-300 font-semibold text-sm mb-2">Binance Pay · Auto Verify</p>
                  <p className="text-white/60 text-xs mb-2">
                    Put the memo code on your topup in Binance when you send, then tap verify—no order ID required.
                  </p>
                  {selectedTopup.binance_reference && (
                    <p className="text-yellow-200/90 font-mono text-sm mb-2">Memo: {selectedTopup.binance_reference}</p>
                  )}
                  <Button
                    onClick={verifyBinanceTopup}
                    disabled={verifyingTopup || !selectedTopup.binance_reference}
                    className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
                  >
                    {verifyingTopup ? 'Verifying...' : 'Verify payment'}
                  </Button>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/20 text-white"
                      onClick={() => {
                        const opened = openGatewayInstructionsUrl('binance_pay');
                        if (!opened) toast.info('Ask admin to add a payment link in Binance instructions.');
                      }}
                    >
                      Open Payment Instructions
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-white/60 text-sm">Select a topup to see details.</div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-white/20 text-white" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer settings={settings} />
    </div>
  );
};

export default WalletPage;
