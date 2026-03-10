import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, CheckCircle, Clock, DollarSign, ShieldCheck, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { axiosInstance } from '../App';

const BinancePayManualSection = ({ order, settings, onSubmitted }) => {
  const [transactionId, setTransactionId] = useState('');
  const [copiedUid, setCopiedUid] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const binanceUid = settings?.payment_gateways?.binance_pay_manual?.email || '';
  const instructions = settings?.payment_gateways?.binance_pay_manual?.instructions || '';
  const amount = order?.total_amount ? Number(order.total_amount).toFixed(2) : '0.00';

  const handleCopy = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    if (type === 'uid') {
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    } else {
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 2000);
    }
    toast.success(`${type === 'uid' ? 'Binance Pay ID' : 'Amount'} copied!`);
  };

  const handleSubmit = async () => {
    const trimmed = (transactionId || '').trim();
    if (!trimmed) {
      toast.error('Please enter your Binance transaction ID');
      return;
    }
    setSubmitting(true);
    try {
      await axiosInstance.post('/payments/manual-proof', {
        order_id: order.id,
        transaction_id: trimmed,
        payment_proof_url: `binance-pay-manual:${trimmed}`,
      });
      toast.success('Transaction ID submitted! Awaiting admin verification.');
      if (onSubmitted) onSubmitted();
    } catch (error) {
      const detail = error.response?.data?.detail || 'Submission failed';
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="binance-pay-manual-section">
      {/* Header */}
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 font-semibold text-sm">
          <ShieldCheck size={16} />
          Binance Pay · Manual Verification
        </span>
      </div>

      {/* Step 1: Pay Info */}
      <Card className="glass-effect border-yellow-500/30">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">1</span>
            <h3 className="text-yellow-300 font-bold text-lg">Send Payment</h3>
          </div>

          {/* UID */}
          <p className="text-white/50 text-xs uppercase tracking-wider mb-2 font-semibold">Binance Pay ID</p>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
            <p className="text-white text-2xl md:text-3xl font-bold tracking-[0.1em] font-mono flex-1 text-center" data-testid="manual-binance-uid">
              {binanceUid || '—'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(binanceUid, 'uid')}
              disabled={!binanceUid}
              className="text-white/60 hover:text-white hover:bg-white/10 shrink-0"
              data-testid="copy-uid-btn"
            >
              {copiedUid ? <CheckCircle size={18} className="text-green-400" /> : <Copy size={18} />}
            </Button>
          </div>

          {/* Amount */}
          <p className="text-white/50 text-xs uppercase tracking-wider mb-2 mt-5 font-semibold">Exact Amount (USDT)</p>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
            <p className="text-green-300 text-3xl md:text-4xl font-bold font-mono flex-1 text-center" data-testid="manual-amount">
              ${amount}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(amount, 'amount')}
              className="text-white/60 hover:text-white hover:bg-white/10 shrink-0"
              data-testid="copy-amount-btn"
            >
              {copiedAmount ? <CheckCircle size={18} className="text-green-400" /> : <Copy size={18} />}
            </Button>
          </div>

          {/* Info badges */}
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
              <DollarSign size={14} className="text-white/50 mx-auto mb-1" />
              <p className="text-white/50 text-[10px] uppercase tracking-wider">Currency</p>
              <p className="text-green-300 font-bold text-sm">USDT</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
              <Clock size={14} className="text-white/50 mx-auto mb-1" />
              <p className="text-white/50 text-[10px] uppercase tracking-wider">Verification</p>
              <p className="text-green-300 font-bold text-sm">Admin Review</p>
            </div>
          </div>

          {instructions && (
            <div className="mt-5 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-yellow-200 text-sm">{instructions}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Submit Transaction ID */}
      <Card className="glass-effect border-white/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">2</span>
            <h3 className="text-yellow-300 font-bold text-lg">Submit Transaction ID</h3>
          </div>

          <p className="text-white/60 text-sm mb-4">
            After sending payment, open your <strong className="text-white">Binance app</strong> <ArrowRight size={12} className="inline" /> <strong className="text-white">Pay</strong> <ArrowRight size={12} className="inline" /> <strong className="text-white">History</strong> and copy the Transaction ID.
          </p>

          <Input
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-center text-lg py-6 font-mono"
            placeholder="Paste your Binance Transaction ID"
            data-testid="manual-txid-input"
          />

          <Button
            onClick={handleSubmit}
            disabled={submitting || !transactionId.trim()}
            className="w-full mt-4 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-bold py-6 text-lg rounded-xl"
            data-testid="submit-txid-btn"
          >
            {submitting ? (
              <><Loader2 size={20} className="mr-2 animate-spin" /> Submitting...</>
            ) : (
              <><ShieldCheck size={20} className="mr-2" /> Submit for Verification</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="glass-effect border-white/10">
        <CardContent className="p-6">
          <h3 className="text-white/80 font-bold text-sm uppercase tracking-wider mb-4">How it works</h3>
          <ol className="space-y-3 text-white/70 text-sm">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">1</span>
              <span>Copy the <strong className="text-white">Binance Pay ID</strong> above</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">2</span>
              <span>Open <strong className="text-white">Binance</strong> &rarr; <strong className="text-white">Pay</strong> &rarr; send <strong className="text-green-300">${amount} USDT</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">3</span>
              <span>Go to <strong className="text-white">Pay</strong> &rarr; <strong className="text-white">History</strong> and copy the <strong className="text-white">Transaction ID</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 text-green-300 flex items-center justify-center text-xs font-bold">4</span>
              <span>Paste it above &amp; submit — <strong className="text-green-300">admin will verify</strong> your payment</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};

export default BinancePayManualSection;
