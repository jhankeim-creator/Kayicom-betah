import { useState, useEffect } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, HelpCircle, ShoppingBag, Store, Shield, CreditCard, Truck, MessageCircle } from 'lucide-react';

const defaultBuyerFaq = [
  { q: 'How do I place an order?', a: 'Browse products, add to cart, proceed to checkout, choose your payment method, and complete your order.' },
  { q: 'What payment methods are accepted?', a: 'We accept cryptocurrency, Binance Pay, PayPal, Skrill, MonCash, Zelle, and Cash App.' },
  { q: 'How long does delivery take?', a: 'Automatic products are instant. Manual products are processed within 24 hours.' },
];

const defaultSellerFaq = [
  { q: 'How do I become a seller?', a: 'Go to Dashboard > Become a Seller > submit KYC application.' },
  { q: 'How do I deliver an order?', a: 'Seller Center > Orders > click Deliver > enter codes.' },
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
  const [buyerFaq, setBuyerFaq] = useState(defaultBuyerFaq);
  const [sellerFaq, setSellerFaq] = useState(defaultSellerFaq);
  const cartItemCount = cart?.length || 0;

  useEffect(() => {
    const loadFaq = async () => {
      try {
        const res = await axiosInstance.get('/settings');
        const data = res.data;
        if (data.faq_buyer?.length) setBuyerFaq(data.faq_buyer);
        if (data.faq_seller?.length) setSellerFaq(data.faq_seller);
      } catch {}
    };
    loadFaq();
  }, []);

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
            <ShoppingBag size={14} className="inline mr-1" /> Buyer FAQ ({buyerFaq.length})
          </button>
          <button onClick={() => setTab('seller')}
            className={`px-5 py-2 rounded-full text-sm font-medium transition ${tab === 'seller' ? 'bg-orange-500 text-black' : 'bg-white/5 text-white/50'}`}>
            <Store size={14} className="inline mr-1" /> Seller FAQ ({sellerFaq.length})
          </button>
        </div>

        <Card className="bg-[#141414] border border-white/5">
          <CardContent className="p-5">
            {(tab === 'buyer' ? buyerFaq : sellerFaq).map((item, i) => (
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
