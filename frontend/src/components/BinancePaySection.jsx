import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, CheckCircle, Clock, Zap, DollarSign, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const BinancePaySection = ({ order, settings, onSubmitProof, submitting }) => {
  const [binanceOrderId, setBinanceOrderId] = useState('');
  const [copied, setCopied] = useState(false);

  const binanceUid = settings?.payment_gateways?.binance_pay?.email || '';
  const instructions = settings?.payment_gateways?.binance_pay?.instructions || '';

  const handleCopyUid = async () => {
    try {
      await navigator.clipboard.writeText(binanceUid);
      setCopied(true);
      toast.success('UID copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = binanceUid;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      toast.success('UID copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleVerify = () => {
    const trimmed = (binanceOrderId || '').trim();
    if (!trimmed) {
      toast.error('Please enter your Binance Pay Order ID');
      return;
    }
    onSubmitProof(trimmed);
  };

  return (
    <div className="space-y-5" data-testid="binance-pay-section">
      {/* Header Badge */}
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 font-semibold text-sm">
          <Zap size={16} />
          USDT · Binance Pay
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
        </CardContent>
      </Card>

      {/* Info Badges */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center mb-1">
            <DollarSign size={14} className="text-white/50" />
          </div>
          <p className="text-white/50 text-[10px] uppercase tracking-wider">Min. Amount</p>
          <p className="text-cyan-300 font-bold text-lg">${order?.total_amount ? order.total_amount.toFixed(2) : '1.00'}</p>
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

      {/* Order ID Input */}
      <Card className="glass-effect border-yellow-500/30">
        <CardContent className="p-6">
          <h3 className="text-yellow-300 font-bold text-lg mb-4 flex items-center gap-2">
            <ShieldCheck size={20} />
            Binance Pay Order ID
          </h3>
          <Input
            value={binanceOrderId}
            onChange={(e) => setBinanceOrderId(e.target.value)}
            className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-center text-lg py-6 font-mono"
            placeholder="Enter your Binance Pay Order ID"
            data-testid="binance-order-id-input"
          />
          <p className="text-white/40 text-xs mt-2">
            Found in your Binance app → Pay → Order History
          </p>

          <Button
            onClick={handleVerify}
            disabled={submitting || !binanceOrderId.trim()}
            className="w-full mt-4 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-bold py-6 text-lg rounded-xl"
            data-testid="verify-payment-btn"
          >
            {submitting ? (
              'Verifying...'
            ) : (
              <><ShieldCheck size={20} className="mr-2" /> Verify Payment</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="glass-effect border-white/10">
        <CardContent className="p-6">
          <h3 className="text-yellow-300 font-bold text-lg mb-4">How it works</h3>
          <ol className="space-y-3 text-white/70 text-sm">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">1</span>
              <span>Send <strong className="text-white">USDT</strong> to the UID above via <strong className="text-white">Binance Pay</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">2</span>
              <span>Open your <strong className="text-white">Binance app → Pay → Order History</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">3</span>
              <span>Copy the <strong className="text-white">Order ID</strong> from the transaction</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">4</span>
              <span>Paste the Order ID above and click <strong className="text-white">Verify Payment</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">5</span>
              <span>Your order will be confirmed within <strong className="text-white">1-3 minutes</strong></span>
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
