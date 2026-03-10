import { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, HelpCircle, ShoppingBag, Store, Shield, CreditCard, Truck, MessageCircle } from 'lucide-react';

const faqBuyer = [
  { q: 'How do I place an order?', a: 'Browse products, add to cart, proceed to checkout, choose your payment method, and complete your order. You\'ll receive a tracking link to monitor your order status.' },
  { q: 'What payment methods are accepted?', a: 'We accept cryptocurrency (BTC, ETH, USDT via Plisio), Binance Pay (auto-verified and manual), PayPal, Skrill, MonCash, Zelle, and Cash App. Crypto payments are verified automatically; manual methods require proof submission.' },
  { q: 'How long does delivery take?', a: 'Automatic delivery products are delivered instantly after payment confirmation. Manual delivery products are processed within 24 hours by the seller or admin.' },
  { q: 'What is escrow and how does it protect me?', a: 'When you buy from a marketplace seller, your payment is held in escrow until you confirm delivery. You have the option to confirm the delivery or open a dispute if something is wrong. This protects both buyers and sellers.' },
  { q: 'How do I open a dispute?', a: 'Go to your order tracking page. If the order has escrow, you\'ll see "Confirm Delivery" and "Open Dispute" buttons. Click "Open Dispute" and describe the issue. Each party has 24 hours to respond. If the other party doesn\'t respond within 24h, you win automatically.' },
  { q: 'How do refunds work?', a: 'If you win a dispute, the refund is credited to your wallet balance. You can use it for future purchases. For payment method-specific refunds, contact support.' },
  { q: 'Where do I find my delivery codes?', a: 'Go to Dashboard → Purchased Orders → click on the order. Your codes and credentials will be displayed in the "Order Delivered" section with a copy button.' },
  { q: 'How do I contact the seller?', a: 'On the order tracking page, click "Contact the seller about this order" to send a direct message. You\'ll receive notifications when they reply.' },
];

const faqSeller = [
  { q: 'How do I become a seller?', a: 'Go to Dashboard → "Become a Seller" → submit your KYC application. Once approved by admin, you can start listing products and receiving orders.' },
  { q: 'How do I deliver an order?', a: 'Go to Seller Center → Orders tab. Find the order and click "Deliver". Enter the codes/credentials and an optional note. The buyer will be notified by email and in-app notification.' },
  { q: 'How does the escrow system work for sellers?', a: 'When a buyer purchases your product, payment is held in escrow. After you deliver, the buyer has time to confirm. Once confirmed, payment releases to your balance after 3 days. If no dispute is opened, you receive your earnings.' },
  { q: 'What is the pending balance?', a: 'Pending balance shows earnings from orders still in escrow (held or buyer confirmed but not yet released). Once escrow is released, the amount moves to your available balance for withdrawal.' },
  { q: 'How do I withdraw my earnings?', a: 'Go to Seller Center → Earn & Withdraw tab. Choose a withdrawal method (Binance Pay, USDT BEP20, USDT TRC20, PayPal, MonCash), enter your address and amount. Fees vary by method and are shown before you confirm.' },
  { q: 'What are the withdrawal fees?', a: 'Each withdrawal method has its own fee structure (percentage + flat fee). You can see the exact fees in the withdrawal form before submitting. Fees are set by the platform admin.' },
  { q: 'What happens during a dispute?', a: 'If a buyer opens a dispute, you have 24 hours to respond with your side and evidence. If you don\'t respond within 24h, the dispute auto-resolves in the buyer\'s favor. Provide evidence (screenshots, codes) to support your case.' },
  { q: 'What commission does the platform take?', a: 'The platform takes a commission on each sale (typically 10%, shown in your Seller Center). The rest is credited to your seller balance after escrow release.' },
];

const FaqItem = ({ item }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/5 last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-4 text-left">
        <span className="text-white text-sm font-medium pr-4">{item.q}</span>
        <ChevronDown size={16} className={`text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="text-white/60 text-sm pb-4 leading-relaxed">{item.a}</p>}
    </div>
  );
};

const HelpCenterPage = ({ user, logout, settings, cart }) => {
  const [tab, setTab] = useState('buyer');
  const cartItemCount = cart?.length || 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <HelpCircle className="text-green-400" size={28} />
          <h1 className="text-white font-bold text-2xl">Help Center</h1>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          {[
            { icon: ShoppingBag, label: 'My Orders', href: '/orders' },
            { icon: MessageCircle, label: 'Messages', href: '/messages' },
            { icon: Shield, label: 'Disputes', href: '/disputes' },
            { icon: CreditCard, label: 'Wallet', href: '/wallet' },
            { icon: Store, label: 'Seller Center', href: '/seller' },
            { icon: Truck, label: 'Refund Policy', href: '/refund-policy' },
          ].map(link => (
            <a key={link.label} href={link.href}
              className="flex items-center gap-2 p-3 rounded-xl bg-[#141414] border border-white/5 hover:border-green-500/20 transition text-white/70 text-sm">
              <link.icon size={16} className="text-green-400" /> {link.label}
            </a>
          ))}
        </div>

        {/* FAQ Tabs */}
        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('buyer')}
            className={`px-5 py-2 rounded-full text-sm font-medium transition ${tab === 'buyer' ? 'bg-green-500 text-black' : 'bg-white/5 text-white/50'}`}>
            <ShoppingBag size={14} className="inline mr-1" /> Buyer FAQ
          </button>
          <button onClick={() => setTab('seller')}
            className={`px-5 py-2 rounded-full text-sm font-medium transition ${tab === 'seller' ? 'bg-orange-500 text-black' : 'bg-white/5 text-white/50'}`}>
            <Store size={14} className="inline mr-1" /> Seller FAQ
          </button>
        </div>

        <Card className="bg-[#141414] border border-white/5">
          <CardContent className="p-5">
            {(tab === 'buyer' ? faqBuyer : faqSeller).map((item, i) => (
              <FaqItem key={i} item={item} />
            ))}
          </CardContent>
        </Card>

        {/* Contact */}
        <div className="mt-8 text-center">
          <p className="text-white/40 text-sm">Still need help?</p>
          <p className="text-white/60 text-sm mt-1">Contact us at <a href={`mailto:${settings?.support_email || 'support@kayicom.com'}`} className="text-green-400 hover:underline">{settings?.support_email || 'support@kayicom.com'}</a></p>
        </div>
      </div>
      <Footer settings={settings} />
    </div>
  );
};

export default HelpCenterPage;
