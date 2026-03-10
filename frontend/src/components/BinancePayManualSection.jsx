import { useState, useContext } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, CheckCircle, Clock, DollarSign, ShieldCheck, Loader2, ArrowRight, FileText, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { axiosInstance, LanguageContext } from '../App';

const texts = {
  en: {
    headerBadge: 'Binance Pay · Manual Verification',
    step1Title: 'Send Payment',
    binancePayId: 'Binance Pay ID',
    exactAmount: 'Exact Amount (USDT)',
    orderRef: 'Your Order Number (Memo)',
    orderRefHint: 'Include this number in the payment memo/note on Binance so the admin can match your payment.',
    currency: 'Currency',
    verification: 'Verification',
    adminReview: 'Admin Review',
    step2Title: 'Submit Transaction ID',
    step2Desc: 'After sending payment, open your',
    step2BinanceApp: 'Binance app',
    step2Pay: 'Pay',
    step2History: 'History',
    step2AndCopy: 'and copy the Transaction ID.',
    txIdPlaceholder: 'Paste your Binance Transaction ID',
    submitBtn: 'Submit for Verification',
    submitting: 'Submitting...',
    guideTitle: 'Step-by-Step Guide',
    guideStep1: 'Copy the **Binance Pay ID** shown above.',
    guideStep2: 'Copy your **Order Number** — you\'ll paste it as a memo in Binance.',
    guideStep3: 'Open the **Binance** app → tap **Pay** → **Send**.',
    guideStep4: 'Enter the **Binance Pay ID**, the exact **amount in USDT**, and paste your **Order Number** in the memo/note field.',
    guideStep5: 'Confirm and send the payment.',
    guideStep6: 'Go to **Pay** → **History**, find your payment, and copy the **Transaction ID**.',
    guideStep7: 'Come back here, paste the **Transaction ID** above and click **Submit for Verification**.',
    guideStep8: 'Done! The admin will verify your payment and process your order.',
    copiedUid: 'Binance Pay ID copied!',
    copiedAmount: 'Amount copied!',
    copiedOrder: 'Order number copied!',
    errorNoTxId: 'Please enter your Binance transaction ID',
    successSubmit: 'Transaction ID submitted! Awaiting admin verification.',
  },
  fr: {
    headerBadge: 'Binance Pay · Vérification Manuelle',
    step1Title: 'Envoyer le Paiement',
    binancePayId: 'ID Binance Pay',
    exactAmount: 'Montant Exact (USDT)',
    orderRef: 'Votre Numéro de Commande (Mémo)',
    orderRefHint: 'Incluez ce numéro dans le mémo/note du paiement sur Binance pour que l\'admin puisse identifier votre paiement.',
    currency: 'Devise',
    verification: 'Vérification',
    adminReview: 'Revue Admin',
    step2Title: 'Soumettre l\'ID de Transaction',
    step2Desc: 'Après avoir envoyé le paiement, ouvrez votre',
    step2BinanceApp: 'appli Binance',
    step2Pay: 'Pay',
    step2History: 'Historique',
    step2AndCopy: 'et copiez l\'ID de Transaction.',
    txIdPlaceholder: 'Collez votre ID de Transaction Binance',
    submitBtn: 'Soumettre pour Vérification',
    submitting: 'Envoi en cours...',
    guideTitle: 'Guide Étape par Étape',
    guideStep1: 'Copiez l\'**ID Binance Pay** affiché ci-dessus.',
    guideStep2: 'Copiez votre **Numéro de Commande** — vous le collerez comme mémo dans Binance.',
    guideStep3: 'Ouvrez l\'appli **Binance** → appuyez sur **Pay** → **Envoyer**.',
    guideStep4: 'Entrez l\'**ID Binance Pay**, le **montant exact en USDT**, et collez votre **Numéro de Commande** dans le champ mémo/note.',
    guideStep5: 'Confirmez et envoyez le paiement.',
    guideStep6: 'Allez dans **Pay** → **Historique**, trouvez votre paiement et copiez l\'**ID de Transaction**.',
    guideStep7: 'Revenez ici, collez l\'**ID de Transaction** ci-dessus et cliquez sur **Soumettre pour Vérification**.',
    guideStep8: 'C\'est fait ! L\'admin va vérifier votre paiement et traiter votre commande.',
    copiedUid: 'ID Binance Pay copié !',
    copiedAmount: 'Montant copié !',
    copiedOrder: 'Numéro de commande copié !',
    errorNoTxId: 'Veuillez entrer votre ID de transaction Binance',
    successSubmit: 'ID de transaction soumis ! En attente de vérification admin.',
  },
};

const renderBold = (text) => {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="text-white">{part}</strong> : part
  );
};

const BinancePayManualSection = ({ order, settings, onSubmitted }) => {
  const { language } = useContext(LanguageContext);
  const t = texts[language] || texts.en;

  const [transactionId, setTransactionId] = useState('');
  const [copiedUid, setCopiedUid] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedOrder, setCopiedOrder] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const binanceUid = settings?.payment_gateways?.binance_pay_manual?.email || '';
  const instructions = settings?.payment_gateways?.binance_pay_manual?.instructions || '';
  const amount = order?.total_amount ? Number(order.total_amount).toFixed(2) : '0.00';
  const orderNumber = order?.id ? order.id.slice(0, 8).toUpperCase() : '';

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
    const setters = { uid: setCopiedUid, amount: setCopiedAmount, order: setCopiedOrder };
    const msgs = { uid: t.copiedUid, amount: t.copiedAmount, order: t.copiedOrder };
    setters[type]?.(true);
    setTimeout(() => setters[type]?.(false), 2000);
    toast.success(msgs[type]);
  };

  const handleSubmit = async () => {
    const trimmed = (transactionId || '').trim();
    if (!trimmed) {
      toast.error(t.errorNoTxId);
      return;
    }
    setSubmitting(true);
    try {
      await axiosInstance.post('/payments/manual-proof', {
        order_id: order.id,
        transaction_id: trimmed,
        payment_proof_url: `binance-pay-manual:${trimmed}`,
      });
      toast.success(t.successSubmit);
      if (onSubmitted) onSubmitted();
    } catch (error) {
      const detail = error.response?.data?.detail || 'Submission failed';
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const guideSteps = [
    t.guideStep1, t.guideStep2, t.guideStep3, t.guideStep4,
    t.guideStep5, t.guideStep6, t.guideStep7, t.guideStep8,
  ];

  return (
    <div className="space-y-5" data-testid="binance-pay-manual-section">
      {/* Header */}
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 font-semibold text-sm">
          <ShieldCheck size={16} />
          {t.headerBadge}
        </span>
      </div>

      {/* Step 1: Pay Info */}
      <Card className="glass-effect border-yellow-500/30">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center text-xs font-bold">1</span>
            <h3 className="text-yellow-300 font-bold text-lg">{t.step1Title}</h3>
          </div>

          {/* Binance Pay UID */}
          <p className="text-white/50 text-xs uppercase tracking-wider mb-2 font-semibold">{t.binancePayId}</p>
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
          <p className="text-white/50 text-xs uppercase tracking-wider mb-2 mt-5 font-semibold">{t.exactAmount}</p>
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

          {/* Order Number (memo) */}
          <p className="text-white/50 text-xs uppercase tracking-wider mb-2 mt-5 font-semibold flex items-center gap-1">
            <Hash size={12} />
            {t.orderRef}
          </p>
          <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex-1 text-center">
              <p className="text-cyan-300 text-2xl md:text-3xl font-bold font-mono tracking-[0.15em]" data-testid="manual-order-number">
                {orderNumber}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(orderNumber, 'order')}
              className="text-white/60 hover:text-white hover:bg-white/10 shrink-0"
              data-testid="copy-order-btn"
            >
              {copiedOrder ? <CheckCircle size={18} className="text-green-400" /> : <Copy size={18} />}
            </Button>
          </div>
          <p className="text-white/40 text-xs mt-2 flex items-start gap-1">
            <FileText size={12} className="shrink-0 mt-0.5" />
            {t.orderRefHint}
          </p>

          {/* Info badges */}
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
              <DollarSign size={14} className="text-white/50 mx-auto mb-1" />
              <p className="text-white/50 text-[10px] uppercase tracking-wider">{t.currency}</p>
              <p className="text-green-300 font-bold text-sm">USDT</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
              <Clock size={14} className="text-white/50 mx-auto mb-1" />
              <p className="text-white/50 text-[10px] uppercase tracking-wider">{t.verification}</p>
              <p className="text-green-300 font-bold text-sm">{t.adminReview}</p>
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
            <h3 className="text-yellow-300 font-bold text-lg">{t.step2Title}</h3>
          </div>

          <p className="text-white/60 text-sm mb-4">
            {t.step2Desc} <strong className="text-white">{t.step2BinanceApp}</strong> <ArrowRight size={12} className="inline" /> <strong className="text-white">{t.step2Pay}</strong> <ArrowRight size={12} className="inline" /> <strong className="text-white">{t.step2History}</strong> {t.step2AndCopy}
          </p>

          <Input
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-center text-lg py-6 font-mono"
            placeholder={t.txIdPlaceholder}
            data-testid="manual-txid-input"
          />

          <Button
            onClick={handleSubmit}
            disabled={submitting || !transactionId.trim()}
            className="w-full mt-4 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-bold py-6 text-lg rounded-xl"
            data-testid="submit-txid-btn"
          >
            {submitting ? (
              <><Loader2 size={20} className="mr-2 animate-spin" /> {t.submitting}</>
            ) : (
              <><ShieldCheck size={20} className="mr-2" /> {t.submitBtn}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Bilingual Guide */}
      <Card className="glass-effect border-white/10">
        <CardContent className="p-6">
          <h3 className="text-white/80 font-bold text-sm uppercase tracking-wider mb-4">{t.guideTitle}</h3>
          <ol className="space-y-3 text-white/70 text-sm">
            {guideSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={`flex-shrink-0 w-6 h-6 rounded-full ${
                  i === guideSteps.length - 1 ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'
                } flex items-center justify-center text-xs font-bold`}>
                  {i + 1}
                </span>
                <span>{renderBold(step)}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};

export default BinancePayManualSection;
