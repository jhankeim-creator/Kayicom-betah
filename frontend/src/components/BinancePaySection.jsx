import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, CheckCircle, Clock, Zap, DollarSign, ShieldCheck, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { axiosInstance } from '../App';

const BinancePaySection = ({ order, settings, onVerified }) => {
  const [copied, setCopied] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const binanceUid = settings?.payment_gateways?.binance_pay?.email || '';
  const instructions = settings?.payment_gateways?.binance_pay?.instructions || '';
  const reference = (order?.binance_reference || '').trim();

  const handleCopyUid = async () => {
    try {
      await navigator.clipboard.writeText(binanceUid);
    } catch {
      const el = document.createElement('textarea');
      el.value = binanceUid;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    toast.success('UID copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMemo = async () => {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
    } catch {
      const el = document.createElement('textarea');
      el.value = reference;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedMemo(true);
    toast.success('Memo copied!');
    setTimeout(() => setCopiedMemo(false), 2000);
  };

  const handleVerify = async () => {
    if (!reference) {
      toast.error('This order has no payment memo code. Contact support.');
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await axiosInstance.post('/payments/binance-pay/verify', {
        order_id: order.id,
      });
      const data = res.data;
      setVerifyResult(data);
      if (data.verified) {
        toast.success('Payment verified automatically!');
        if (onVerified) onVerified();
      } else {
        toast.error(data.message || 'Payment not found yet');
      }
    } catch (error) {
      const detail = error.response?.data?.detail || 'Verification failed';
      toast.error(detail);
      setVerifyResult({ status: 'error', message: detail, verified: false });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="binance-pay-section">
      {/* Header Badge */}
      <div className="flex justify-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 font-semibold text-sm">
          <Zap size={16} />
          Binance Pay · Auto Verify
        </span>
        <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-cyan-500/20 border border-green-500/40 text-green-300 font-semibold text-sm">
          <Zap size={16} />
          C2C / P2P · Auto Verify
        </span>
      </div>

      {/* UID Display */}
      <Card className="glass-effect border-white/20">
        <CardContent className="p-6">
          <p className="text-white/60 text-xs uppercase tracking-wider mb-3 font-semibold">
            Binance Pay UID
          </p>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
            <p className="text-white text-3xl md:text-4xl font-bold tracking-[0.15em] font-mono" data-testid="binance-uid">
              {binanceUid || '—'}
            </p>
          </div>
          <Button
            onClick={handleCopyUid}
            disabled={!binanceUid}
            className="w-full mt-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold"
            data-testid="copy-uid-btn"
          >
            {copied ? (
              <><CheckCircle size={16} className="mr-2 text-green-400" /> Copied!</>
            ) : (
              <><Copy size={16} className="mr-2" /> Copy UID</>
            )}
          </Button>
          {reference && (
            <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-white/60 text-[11px] uppercase tracking-wider mb-2 text-center">
                Payment Reference (Memo/Note)
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <p
                  className="text-yellow-300 font-mono text-lg font-bold text-center break-all"
                  data-testid="binance-memo"
                >
                  {reference}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopyMemo}
                  className="shrink-0 h-10 w-10 border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/20 hover:text-yellow-200"
                  aria-label="Copy memo code"
                  data-testid="copy-memo-btn"
                >
                  {copiedMemo ? (
                    <CheckCircle size={18} className="text-green-400" />
                  ) : (
                    <Copy size={18} />
                  )}
                </Button>
              </div>
              <p className="text-white/50 text-xs mt-2 text-center">
                Include this code in Binance Memo/Note when sending.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Badges */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center mb-1">
            <DollarSign size={14} className="text-white/50" />
          </div>
          <p className="text-white/50 text-[10px] uppercase tracking-wider">Min. Amount</p>
          <p className="text-green-300 font-bold text-lg">${order?.total_amount ? Number(order.total_amount).toFixed(2) : '1.00'}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center mb-1">
            <Clock size={14} className="text-white/50" />
          </div>
          <p className="text-white/50 text-[10px] uppercase tracking-wider">Verify Within</p>
          <p className="text-green-300 font-bold text-lg">20 min</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center mb-1">
            <Zap size={14} className="text-white/50" />
          </div>
          <p className="text-white/50 text-[10px] uppercase tracking-wider">Processing</p>
          <p className="text-green-300 font-bold text-lg">1-3 min</p>
        </div>
      </div>

      {/* Verify (memo-only — same idea as NatCash manual check) */}
      <Card className="glass-effect border-yellow-500/30">
        <CardContent className="p-6">
          <h3 className="text-yellow-300 font-bold text-lg mb-4 flex items-center gap-2">
            <ShieldCheck size={20} />
            Verify payment
          </h3>
          <p className="text-white/60 text-sm mb-4">
            After you send USDT with the <strong className="text-white">memo code</strong> above, tap verify. No Binance order ID is required—the system matches your payment using that memo and the amount.
          </p>

          <Button
            onClick={handleVerify}
            disabled={verifying || !reference}
            className="w-full mt-2 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-bold py-6 text-lg rounded-xl"
            data-testid="verify-payment-btn"
          >
            {verifying ? (
              <><Loader2 size={20} className="mr-2 animate-spin" /> Verifying...</>
            ) : (
              <><ShieldCheck size={20} className="mr-2" /> Verify Payment</>
            )}
          </Button>
          <p className="text-white/40 text-xs text-center mt-3">
            The system also checks automatically in the background about every minute.
          </p>

          {/* Verification Result */}
          {verifyResult && (
            <div className={`mt-4 p-4 rounded-xl border ${
              verifyResult.verified
                ? 'bg-green-500/10 border-green-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                {verifyResult.verified ? (
                  <CheckCircle size={20} className="text-green-400" />
                ) : (
                  <XCircle size={20} className="text-red-400" />
                )}
                <span className={`font-bold ${verifyResult.verified ? 'text-green-300' : 'text-red-300'}`}>
                  {verifyResult.verified ? 'Payment Verified!' : 'Not Found'}
                </span>
              </div>
              <p className={`text-sm ${verifyResult.verified ? 'text-green-200/80' : 'text-red-200/80'}`}>
                {verifyResult.message}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="glass-effect border-white/10">
        <CardContent className="p-6">
          <h3 className="text-yellow-300 font-bold text-lg mb-4">How it works</h3>
          <ol className="space-y-3 text-white/70 text-sm">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">1</span>
              <span>Send <strong className="text-white">USDT</strong> via <strong className="text-white">Binance Pay</strong> (to UID above) or <strong className="text-white">Binance C2C/P2P</strong> for the exact amount shown.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">2</span>
              <span>Put the <strong className="text-white">memo/reference code</strong> in Binance&apos;s <strong className="text-white">Memo / Note</strong> field when sending.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">3</span>
              <span>Tap <strong className="text-white">Verify Payment</strong> or wait for automatic confirmation.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 text-green-300 flex items-center justify-center text-xs font-bold">4</span>
              <span>Payment is <strong className="text-green-300">verified automatically</strong> when the memo and amount match.</span>
            </li>
          </ol>
          {instructions && (
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-yellow-200 text-sm">{instructions}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BinancePaySection;
