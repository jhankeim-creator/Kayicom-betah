import { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { axiosInstance, LanguageContext } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '@/components/ui/button';
import { Gift, Gamepad2, Tv, Wrench, ArrowRight, Star, Package, Heart, Search, Store, ShieldCheck, ShoppingCart, CheckCircle, XCircle, Truck, Clock, ArrowUpDown, SlidersHorizontal, Award, Zap, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

const CORE_CATEGORIES = ['giftcard', 'topup', 'subscription', 'service'];
const categoryMeta = {
  giftcard: { name: 'Gift Cards', emoji: '🎁' },
  topup: { name: 'Game Top-Up', emoji: '🎮' },
  subscription: { name: 'Subscriptions', emoji: '📺' },
  service: { name: 'Services', emoji: '⚡' },
};

const DELIVERY_TIME_LABELS = { instant: 'Instant', '1h': '< 1 Hour', '24h': '< 24 Hours' };
const SELLER_LEVEL_CONFIG = {
  new: { label: 'New Seller', color: 'bg-white/10 text-white/60 border-white/10', icon: Store },
  verified: { label: 'Verified', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: CheckCircle },
  top_seller: { label: 'Top Seller', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Award },
};

const MarketplacePage = ({ user, logout, cart, addToCart, settings }) => {
  const { t } = useContext(LanguageContext);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [sortBy, setSortBy] = useState('popular');
  const [deliveryFilter, setDeliveryFilter] = useState('all');

  useEffect(() => { loadMarketplace(); }, []);

  const loadMarketplace = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get('/marketplace/products');
      setItems(response.data || []);
    } catch (error) {
      console.error('Error loading marketplace:', error);
    } finally { setLoading(false); }
  };

  const normalizeCategory = (value = '') => String(value || '').trim().toLowerCase();

  const categories = (() => {
    const fromItems = items.map((p) => normalizeCategory(p.category));
    const raw = [...CORE_CATEGORIES, ...fromItems].filter(Boolean);
    return Array.from(new Set(raw)).map((key) => {
      const meta = categoryMeta[key];
      return meta ? { ...meta, key } : { name: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), emoji: '📦', key };
    });
  })();

  const filtered = (() => {
    let result = [...items];
    if (activeCategory !== 'all') result = result.filter((p) => normalizeCategory(p.category) === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || (p.seller_name || '').toLowerCase().includes(q));
    }
    if (deliveryFilter !== 'all') {
      if (deliveryFilter === 'instant') result = result.filter((p) => p.delivery_type === 'automatic' || p.delivery_time === 'instant');
      else if (deliveryFilter === 'manual') result = result.filter((p) => p.delivery_type === 'manual');
    }
    if (sortBy === 'price_low') result.sort((a, b) => a.price - b.price);
    else if (sortBy === 'price_high') result.sort((a, b) => b.price - a.price);
    else if (sortBy === 'rating') result.sort((a, b) => (b.seller_rating || 0) - (a.seller_rating || 0));
    else if (sortBy === 'newest') result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else result.sort((a, b) => (b.seller_total_orders || 0) - (a.seller_total_orders || 0));
    return result;
  })();

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleAddToCart = (item) => {
    addToCart({
      id: item.offer_id || item.id, product_id: item.product_id || item.id,
      name: item.name, price: item.price, image_url: item.image_url, quantity: 1,
      seller_id: item.seller_id, _seller_id: item.seller_id, _seller_name: item.seller_name,
      _offer_id: item.offer_id, delivery_type: item.delivery_type,
    }, 1);
    toast.success('Added to cart!');
  };

  const sendInquiry = async (item) => {
    if (!user) { toast.error('Please login to contact seller'); return; }
    const msg = prompt('Ask the seller a question about this product:');
    if (!msg || !msg.trim()) return;
    try {
      await axiosInstance.post(`/messages/inquiry?user_id=${user.id}`, {
        seller_id: item.seller_id, product_id: item.product_id || item.id, content: msg.trim(),
      });
      toast.success('Message sent to seller!');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error sending message'); }
  };

  const levelCfg = (level) => SELLER_LEVEL_CONFIG[level] || SELLER_LEVEL_CONFIG.new;

  const renderCard = (item) => {
    const lvl = levelCfg(item.seller_level);
    const LvlIcon = lvl.icon;
    const dtLabel = DELIVERY_TIME_LABELS[item.delivery_time] || (item.delivery_type === 'automatic' ? 'Instant' : 'Manual');
    return (
      <div key={item.offer_id || item.id} className="rounded-xl bg-[#141414] border border-white/5 overflow-hidden hover:border-green-500/30 transition group flex flex-col">
        <Link to={`/product/${item.slug || item.product_id || item.id}`}>
          <div className="relative h-32 md:h-36 bg-[#1c1c1c] overflow-hidden">
            {item.image_url ? (
              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Gift className="text-white/15" size={40} /></div>
            )}
            <span className={`absolute top-2 right-2 text-[9px] font-semibold px-2 py-0.5 rounded-full border ${lvl.color} flex items-center gap-1`}>
              <LvlIcon size={10} /> {item.seller_name}
            </span>
          </div>
        </Link>
        <div className="p-3 flex-1 flex flex-col">
          <h3 className="text-white font-medium text-sm truncate">{item.name}</h3>
          {item.description && <p className="text-white/30 text-[11px] line-clamp-2 mt-0.5">{item.description.replace(/<[^>]+>/g, '').slice(0, 80)}</p>}
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-green-400 font-bold text-lg">${Number(item.price).toFixed(2)}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/40 flex items-center gap-0.5"><Clock size={9} /> {dtLabel}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5 ${item.stock_available !== false ? 'text-green-400/80 bg-green-500/10 border border-green-500/20' : 'text-red-400/80 bg-red-500/10 border border-red-500/20'}`}>
              {item.stock_available !== false ? <><CheckCircle size={9} /> In Stock</> : <><XCircle size={9} /> Out</>}
            </span>
            {(item.seller_total_orders || 0) > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/40">{item.seller_total_orders} sales</span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <ShieldCheck size={11} className="text-green-400" />
            <span className="text-green-400/70 text-[9px]">Buyer Protection</span>
          </div>
          <div className="mt-auto pt-2 flex gap-1.5">
            <Button size="sm" className="flex-1 bg-green-500 hover:bg-green-600 text-black font-semibold text-xs py-2 rounded-lg"
              disabled={item.stock_available === false} onClick={() => handleAddToCart(item)}>
              <ShoppingCart size={13} className="mr-1" /> Add to Cart
            </Button>
            <Button size="sm" variant="outline" className="border-white/10 text-white/50 hover:text-white hover:bg-white/5 px-2 rounded-lg"
              onClick={() => sendInquiry(item)} title="Ask seller a question">
              <MessageCircle size={14} />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-green-500/10 to-transparent" />
        <div className="relative container mx-auto px-4 py-8 lg:py-12">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-green-400 text-sm font-semibold mb-2 flex items-center justify-center gap-1"><Store size={14} /> Marketplace</p>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">{t('featuredProducts')}</h1>
            <p className="text-white/50 text-xs md:text-sm mb-4">{t('offerSubtitle')}</p>
          </div>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <Search size={16} className="text-white/40 ml-3" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search marketplace..." className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Buyer Protection Banner */}
      <div className="container mx-auto px-4 pb-3">
        <div className="flex items-center justify-center gap-4 py-2 px-4 rounded-lg bg-green-500/5 border border-green-500/10">
          <div className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-green-400" /><span className="text-green-400/80 text-xs font-medium">Buyer Protection</span></div>
          <span className="text-white/20">|</span>
          <div className="flex items-center gap-1.5"><Zap size={14} className="text-yellow-400" /><span className="text-white/40 text-xs">Escrow Payment</span></div>
          <span className="text-white/20 hidden sm:inline">|</span>
          <div className="hidden sm:flex items-center gap-1.5"><Clock size={14} className="text-blue-400" /><span className="text-white/40 text-xs">3-Day Money Back</span></div>
        </div>
      </div>

      {/* Category filters */}
      <div className="container mx-auto px-4 pb-2">
        <div className="flex flex-wrap gap-1.5 justify-center">
          <button onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${activeCategory === 'all' ? 'bg-green-500 text-black' : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'}`}>All</button>
          {categories.map((cat) => (
            <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1 ${activeCategory === cat.key ? 'bg-green-500 text-black' : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'}`}>
              <span>{cat.emoji}</span> {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Sort + Filter bar */}
      <div className="container mx-auto px-4 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-white/30 text-xs flex items-center gap-1"><ArrowUpDown size={12} /> Sort:</span>
            {[{ v: 'popular', l: 'Popular' }, { v: 'price_low', l: 'Price ↑' }, { v: 'price_high', l: 'Price ↓' }, { v: 'rating', l: 'Rating' }, { v: 'newest', l: 'Newest' }].map(s => (
              <button key={s.v} onClick={() => setSortBy(s.v)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition ${sortBy === s.v ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/5 text-white/40 hover:text-white/60 border border-white/5'}`}>{s.l}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-white/30 text-xs flex items-center gap-1"><SlidersHorizontal size={12} /></span>
            {[{ v: 'all', l: 'All' }, { v: 'instant', l: '⚡ Instant' }, { v: 'manual', l: 'Manual' }].map(f => (
              <button key={f.v} onClick={() => setDeliveryFilter(f.v)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition ${deliveryFilter === f.v ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/5 text-white/40 hover:text-white/60 border border-white/5'}`}>{f.l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="container mx-auto px-4 pb-2">
        <p className="text-white/30 text-xs">{filtered.length} product{filtered.length !== 1 ? 's' : ''} found</p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center text-white/40 text-lg py-20">{t('loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="container mx-auto px-4 py-16 text-center">
          <Store className="mx-auto mb-4 text-white/20" size={48} />
          <h2 className="text-lg font-bold text-white mb-2">No products found</h2>
          <p className="text-white/40 text-sm mb-6">Try a different search or become a seller!</p>
          <Link to="/seller/apply"><Button className="bg-green-500 hover:bg-green-600 text-black font-semibold rounded-lg px-6">Become a Seller <ArrowRight size={16} className="ml-1" /></Button></Link>
        </div>
      ) : (
        <div className="container mx-auto px-4 py-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {filtered.map(renderCard)}
          </div>
        </div>
      )}

      {/* Become a Seller CTA */}
      {filtered.length > 0 && (
        <div className="container mx-auto px-4 py-8">
          <div className="rounded-xl bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/20 p-5 md:p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <ShieldCheck size={18} className="text-green-400" />
              <span className="text-green-400 text-sm font-semibold">Seller Program</span>
            </div>
            <h3 className="text-lg md:text-xl font-bold text-white mb-1">Want to sell on KayiCom?</h3>
            <p className="text-white/50 text-xs mb-4">Join our marketplace and reach thousands of buyers.</p>
            <Link to="/seller/apply"><Button className="bg-green-500 hover:bg-green-600 text-black font-semibold rounded-lg px-6">Apply Now <ArrowRight size={16} className="ml-1" /></Button></Link>
          </div>
        </div>
      )}

      <Footer settings={settings} />
    </div>
  );
};

export default MarketplacePage;
