import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, CheckCircle, Clock, Zap, DollarSign, ShieldCheck, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { axiosInstance } from '../App';

const BinancePaySection = ({ order, settings, onVerified }) => {
  const [binanceOrderId, setBinanceOrderId] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const binanceUid = settings?.payment_gateways?.binance_pay?.email || '';
  const instructions = settings?.payment_gateways?.binance_pay?.instructions || '';
  const exactAmount = order?.total_amount ? Number(order.total_amount).toFixed(2) : '0.00';

  const handleCopy = async (text, setter) => {
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
    setter(true);
    toast.success('Copied!');
    setTimeout(() => setter(false), 2000);
  };

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const body = { order_id: order.id };
      if (binanceOrderId.trim()) {
        body.binance_order_id = binanceOrderId.trim();
      }
      const res = await axiosInstance.post('/payments/binance-pay/verify', body);
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
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 font-semibold text-sm">
          <Zap size={16} />
          USDT · Instant Auto Verify
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
            onClick={() => handleCopy(binanceUid, setCopied)}
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
        </CardContent>
      </Card>

      {/* Exact Amount to Send */}
      <Card className="glass-effect border-green-500/30 border-2">
        <CardContent className="p-6">
          <p className="text-green-300/80 text-xs uppercase tracking-wider mb-2 font-semibold text-center">
            Send exactly this amount
          </p>
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
            <p className="text-green-300 text-4xl md:text-5xl font-bold font-mono" data-testid="exact-amount">
              {exactAmount} <span className="text-2xl">USDT</span>
            </p>
          </div>
          <Button
            onClick={() => handleCopy(exactAmount, setCopiedAmount)}
            className="w-full mt-3 bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/30 font-semibold"
          >
            {copiedAmount ? (
              <><CheckCircle size={16} className="mr-2" /> Copied!</>
            ) : (
              <><Copy size={16} className="mr-2" /> Copy Amount</>
            )}
          </Button>
          <p className="text-yellow-300/80 text-xs mt-2 text-center font-semibold">
            The exact amount is required for automatic verification
          </p>
        </CardContent>
      </Card>

      {/* Info Badges */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center mb-1">
            <DollarSign size={14} className="text-white/50" />
          </div>
          <p className="text-white/50 text-[10px] uppercase tracking-wider">Amount</p>
          <p className="text-cyan-300 font-bold text-lg">${exactAmount}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center mb-1">
            <Clock size={14} className="text-white/50" />
          </div>
          <p className="text-white/50 text-[10px] uppercase tracking-wider">Verify Within</p>
          <p className="text-cyan-300 font-bold text-lg">20 min</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center mb-1">
            <Zap size={14} className="text-white/50" />
          </div>
          <p className="text-white/50 text-[10px] uppercase tracking-wider">Processing</p>
          <p className="text-cyan-300 font-bold text-lg">1-3 min</p>
        </div>
      </div>

      {/* Verify Button + Optional Order ID */}
      <Card className="glass-effect border-yellow-500/30">
        <CardContent className="p-6">
          <Button
            onClick={handleVerify}
            disabled={verifying}
            className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-bold py-6 text-lg rounded-xl"
            data-testid="verify-payment-btn"
          >
            {verifying ? (
              <><Loader2 size={20} className="mr-2 animate-spin" /> Verifying...</>
            ) : (
              <><ShieldCheck size={20} className="mr-2" /> Verify Payment</>
            )}
          </Button>

          {/* Optional Order ID */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-white/40 text-xs mb-2">Optional: Binance Pay Order ID (for faster matching)</p>
            <Input
              value={binanceOrderId}
              onChange={(e) => setBinanceOrderId(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-center text-sm py-2 font-mono"
              placeholder="Found in Binance app → Pay → Order History"
              data-testid="binance-order-id-input"
            />
          </div>

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
              <span>Copy the <strong className="text-white">UID</strong> and <strong className="text-green-300">exact amount</strong> above</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">2</span>
              <span>Open <strong className="text-white">Binance app &rarr; Pay &rarr; Send</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">3</span>
              <span>Send exactly <strong className="text-green-300">{exactAmount} USDT</strong> to the UID</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">4</span>
              <span>Come back here and click <strong className="text-yellow-300">Verify Payment</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 text-green-300 flex items-center justify-center text-xs font-bold">5</span>
              <span>Payment is <strong className="text-green-300">verified automatically</strong> in seconds!</span>
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
