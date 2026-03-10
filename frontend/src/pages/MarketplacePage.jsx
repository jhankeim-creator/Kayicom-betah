import { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { axiosInstance, LanguageContext } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '@/components/ui/button';
import { Gift, Gamepad2, Tv, Wrench, ArrowRight, Star, TrendingUp, Package, Heart, Search, Store, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const CORE_CATEGORIES = ['giftcard', 'topup', 'subscription', 'service'];

const categoryMeta = {
  giftcard: { name: 'Gift Cards', emoji: '🎁' },
  topup: { name: 'Game Top-Up', emoji: '🎮' },
  subscription: { name: 'Subscriptions', emoji: '📺' },
  service: { name: 'Services', emoji: '⚡' },
};

const MarketplacePage = ({ user, logout, cart, addToCart, settings }) => {
  const { t } = useContext(LanguageContext);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    loadMarketplace();
  }, []);

  const loadMarketplace = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get('/marketplace/products');
      setItems(response.data || []);
    } catch (error) {
      console.error('Error loading marketplace:', error);
      toast.error('Error loading marketplace');
    } finally {
      setLoading(false);
    }
  };

  const normalizeCategory = (value = '') => String(value || '').trim().toLowerCase();

  const categories = (() => {
    const fromSettings = (settings?.product_categories || []).map(normalizeCategory);
    const fromItems = items.map((p) => normalizeCategory(p.category));
    const raw = [...CORE_CATEGORIES, ...fromSettings, ...fromItems].filter(Boolean);
    const unique = Array.from(new Set(raw));
    return unique.map((key) => {
      const meta = categoryMeta[key];
      if (meta) return { ...meta, key };
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return { name: label, emoji: '📦', key };
    });
  })();

  const filtered = (() => {
    let result = [...items];
    if (activeCategory !== 'all') {
      result = result.filter((p) => normalizeCategory(p.category) === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.seller_name || '').toLowerCase().includes(q)
      );
    }
    return result;
  })();

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const itemsByCategory = categories.reduce((acc, cat) => {
    acc[cat.key] = filtered.filter((p) => normalizeCategory(p.category) === cat.key);
    return acc;
  }, {});

  const renderCard = (item) => (
    <Link to={`/product/${item.slug || item.product_id || item.id}`} key={item.offer_id || item.id}>
      <div className="rounded-xl bg-[#141414] border border-white/5 overflow-hidden hover:border-green-500/30 transition group">
        <div className="relative h-36 md:h-44 bg-[#1c1c1c] overflow-hidden">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Gift className="text-white/15" size={40} />
            </div>
          )}
          <button className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
            <Heart size={14} className="text-white/60" />
          </button>
          {item.seller_name && (
            <span className="absolute top-2 right-2 bg-green-500/90 text-black text-[10px] font-semibold px-2 py-0.5 rounded-full truncate max-w-[100px]">
              {item.seller_name}
            </span>
          )}
        </div>
        <div className="p-3">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-green-400 font-bold">
              ${Number(item.price).toFixed(2)}
            </span>
          </div>
          <h3 className="text-white font-medium text-sm truncate">{item.name}</h3>
          <div className="flex items-center justify-between mt-2">
            <span className="text-white/40 text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10">
              {item.delivery_type === 'automatic' ? 'Instant' : 'Manual'}
            </span>
            <div className="flex items-center gap-1">
              <Star size={12} className="text-yellow-500" fill="currentColor" />
              <span className="text-white/50 text-xs">{item.seller_rating || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-green-500/10 to-transparent" />
        <div className="relative container mx-auto px-4 py-10 lg:py-14">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-green-400 text-sm font-semibold mb-2 flex items-center justify-center gap-1">
              <Store size={14} /> Marketplace
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
              {t('featuredProducts')}
            </h1>
            <p className="text-white/50 text-sm md:text-base mb-6">
              {t('offerSubtitle')}
            </p>
          </div>

          {/* Search */}
          <div className="max-w-xl mx-auto">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <Search size={18} className="text-white/40 ml-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search marketplace..."
                className="flex-1 bg-transparent px-3 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Category filters */}
      <div className="container mx-auto px-4 pb-4">
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeCategory === 'all'
                ? 'bg-green-500 text-black'
                : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                activeCategory === cat.key
                  ? 'bg-green-500 text-black'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'
              }`}
            >
              <span>{cat.emoji}</span>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center text-white/40 text-lg py-20">{t('loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="container mx-auto px-4 py-20 text-center">
          <Store className="mx-auto mb-4 text-white/20" size={56} />
          <h2 className="text-xl font-bold text-white mb-2">No seller products yet</h2>
          <p className="text-white/40 text-sm mb-6">Become a seller and start listing your products!</p>
          <Link to="/seller/apply">
            <Button className="bg-green-500 hover:bg-green-600 text-black font-semibold rounded-lg px-6">
              Become a Seller <ArrowRight size={16} className="ml-1" />
            </Button>
          </Link>
        </div>
      ) : activeCategory === 'all' ? (
        <>
          {categories.map((cat) => {
            const catItems = itemsByCategory[cat.key] || [];
            if (catItems.length === 0) return null;
            return (
              <div key={cat.key} className="container mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-green-400 text-sm font-semibold mb-1 flex items-center gap-1">
                      <Store size={14} /> Marketplace
                    </p>
                    <h2 className="text-2xl md:text-3xl font-bold text-white">{cat.name}</h2>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {catItems.map(renderCard)}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center text-white/40 text-lg py-20">No products available</div>
          )}
        </>
      ) : (
        <div className="container mx-auto px-4 py-6">
          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map(renderCard)}
            </div>
          ) : (
            <div className="text-center text-white/40 text-lg py-20">No products found</div>
          )}
        </div>
      )}

      {/* Become a Seller CTA */}
      {filtered.length > 0 && (
        <div className="container mx-auto px-4 py-10">
          <div className="rounded-xl bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/20 p-6 md:p-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <ShieldCheck size={20} className="text-green-400" />
              <span className="text-green-400 text-sm font-semibold">Seller Program</span>
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-white mb-2">Want to sell on KayiCom?</h3>
            <p className="text-white/50 text-sm mb-5">Join our marketplace and reach thousands of buyers.</p>
            <Link to="/seller/apply">
              <Button className="bg-green-500 hover:bg-green-600 text-black font-semibold rounded-lg px-6">
                Apply Now <ArrowRight size={16} className="ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      <Footer settings={settings} />
    </div>
  );
};

export default MarketplacePage;
