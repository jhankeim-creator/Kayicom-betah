import { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { axiosInstance, LanguageContext } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '@/components/ui/button';
import { Gift, Gamepad2, Tv, Wrench, ArrowRight, Star, TrendingUp, Package, Heart, Search, Store } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeOrdersCount } from '../utils/ordersCount';

const CORE_CATEGORIES = ['giftcard', 'topup', 'subscription', 'service'];

const MarketplacePage = ({ user, logout, cart, addToCart, settings }) => {
  const { t } = useContext(LanguageContext);
  const [allProducts, setAllProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [allProducts, searchQuery, activeCategory]);

  const groupProducts = (items) => {
    const groups = new Map();
    for (const p of items) {
      const groupId = p.parent_product_id || p.id;
      const group = groups.get(groupId) || { groupId, variants: [] };
      group.variants.push(p);
      groups.set(groupId, group);
    }
    return Array.from(groups.values()).map((g) => {
      const sorted = [...g.variants].sort((a, b) => (a.price || 0) - (b.price || 0));
      const rep = sorted[0];
      const minPrice = sorted[0]?.price ?? rep.price;
      const maxPrice = sorted[sorted.length - 1]?.price ?? rep.price;
      const ordersCount = g.variants.reduce((sum, item) => sum + normalizeOrdersCount(item), 0);
      return {
        ...rep,
        _variant_count: g.variants.length,
        _min_price: minPrice,
        _max_price: maxPrice,
        _orders_count: ordersCount,
        _group_id: g.groupId,
      };
    });
  };

  const loadProducts = async () => {
    try {
      const response = await axiosInstance.get('/products');
      const grouped = groupProducts(response.data || []);
      setAllProducts(grouped);
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Error loading products');
    } finally {
      setLoading(false);
    }
  };

  const filterProducts = () => {
    let result = [...allProducts];

    if (activeCategory !== 'all') {
      result = result.filter(
        (p) => normalizeCategory(p.category) === activeCategory
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
      );
    }

    setFilteredProducts(result);
  };

  const categoryMeta = {
    giftcard: { name: t('giftCards'), icon: Gift, emoji: '🎁' },
    topup: { name: t('gameTopup'), icon: Gamepad2, emoji: '🎮' },
    subscription: { name: t('subscriptions'), icon: Tv, emoji: '📺' },
    service: { name: t('services'), icon: Wrench, emoji: '⚡' },
    crypto: { name: t('crypto'), icon: TrendingUp, emoji: '💰' },
  };

  const normalizeCategory = (value = '') => String(value || '').trim().toLowerCase();

  const categories = (() => {
    const raw = [...CORE_CATEGORIES, ...(settings?.product_categories || [])]
      .map(normalizeCategory)
      .filter((value) => Boolean(value) && value !== 'crypto');
    const unique = Array.from(new Set(raw.length ? raw : CORE_CATEGORIES));
    return unique.map((key) => {
      const meta = categoryMeta[key];
      if (meta) return { ...meta, key };
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return { name: label, icon: Package, emoji: '📦', key };
    });
  })();

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const productsByCategory = categories.reduce((acc, cat) => {
    acc[cat.key] = allProducts.filter(
      (p) => normalizeCategory(p.category) === cat.key
    );
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-green-500/10 to-transparent" />
        <div className="relative container mx-auto px-4 py-10 lg:py-14">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-green-400 text-sm font-semibold mb-2">Marketplace</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
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
                placeholder="Search products..."
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

      {/* Products display */}
      {loading ? (
        <div className="text-center text-white/40 text-lg py-20">{t('loading')}</div>
      ) : activeCategory === 'all' ? (
        /* Show all products grouped by category, with seller products section */
        <>
          {/* Seller Products Section */}
          {(() => {
            const sellerProducts = allProducts.filter((p) => p.seller_id);
            if (sellerProducts.length === 0) return null;
            const filtered = searchQuery.trim()
              ? sellerProducts.filter((p) => {
                  const q = searchQuery.trim().toLowerCase();
                  return (p.name || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
                })
              : sellerProducts;
            if (filtered.length === 0) return null;
            return (
              <div className="container mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-green-400 text-sm font-semibold mb-1 flex items-center gap-1">
                      <Store size={14} /> Seller Products
                    </p>
                    <h2 className="text-2xl md:text-3xl font-bold text-white">Marketplace</h2>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filtered.map((product) => (
                    <Link to={`/product/${product.slug || product.id}`} key={product.id}>
                      <div className="rounded-xl bg-[#141414] border border-white/5 overflow-hidden hover:border-green-500/30 transition group">
                        <div className="relative h-36 md:h-44 bg-[#1c1c1c] overflow-hidden">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Gift className="text-white/15" size={40} />
                            </div>
                          )}
                          <button className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                            <Heart size={14} className="text-white/60" />
                          </button>
                          <span className="absolute top-2 right-2 bg-green-500/90 text-black text-[10px] font-semibold px-2 py-0.5 rounded-full">
                            Seller
                          </span>
                        </div>
                        <div className="p-3">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-green-400 font-bold">
                              ${Number(product._variant_count > 1 ? product._min_price : product.price).toFixed(2)}
                            </span>
                            {product.original_price && product.original_price > product.price && (
                              <span className="text-white/30 text-xs line-through">${Number(product.original_price).toFixed(2)}</span>
                            )}
                          </div>
                          <h3 className="text-white font-medium text-sm truncate">{product.name}</h3>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-white/40 text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10">
                              {Math.max(0, Math.floor(Number(product._orders_count) || 0))} Sale
                            </span>
                            <div className="flex items-center gap-1">
                              <Star size={12} className="text-yellow-500" fill="currentColor" />
                              <span className="text-white/50 text-xs">0</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })()}

          {categories.map((cat) => {
            const catProducts = (productsByCategory[cat.key] || []).filter((p) => {
              if (!searchQuery.trim()) return true;
              const q = searchQuery.trim().toLowerCase();
              return (
                (p.name || '').toLowerCase().includes(q) ||
                (p.description || '').toLowerCase().includes(q)
              );
            });
            if (catProducts.length === 0) return null;
            return (
              <div key={cat.key} className="container mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-green-400 text-sm font-semibold mb-1">Unlimited Offer</p>
                    <h2 className="text-2xl md:text-3xl font-bold text-white">{cat.name}</h2>
                  </div>
                  <Link to={`/products/${cat.key}`}>
                    <Button className="bg-green-500 hover:bg-green-600 text-black font-semibold rounded-lg px-5">
                      View All <ArrowRight size={16} className="ml-1" />
                    </Button>
                  </Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {catProducts.map((product) => (
                    <Link to={`/product/${product.slug || product.id}`} key={product.id}>
                      <div className="rounded-xl bg-[#141414] border border-white/5 overflow-hidden hover:border-green-500/30 transition group">
                        <div className="relative h-36 md:h-44 bg-[#1c1c1c] overflow-hidden">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Gift className="text-white/15" size={40} />
                            </div>
                          )}
                          <button className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                            <Heart size={14} className="text-white/60" />
                          </button>
                        </div>
                        <div className="p-3">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-green-400 font-bold">
                              ${Number(product._variant_count > 1 ? product._min_price : product.price).toFixed(2)}
                            </span>
                            {product.original_price && product.original_price > product.price && (
                              <span className="text-white/30 text-xs line-through">${Number(product.original_price).toFixed(2)}</span>
                            )}
                          </div>
                          <h3 className="text-white font-medium text-sm truncate">{product.name}</h3>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-white/40 text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10">
                              {Math.max(0, Math.floor(Number(product._orders_count) || 0))} Sale
                            </span>
                            <div className="flex items-center gap-1">
                              <Star size={12} className="text-yellow-500" fill="currentColor" />
                              <span className="text-white/50 text-xs">0</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}

          {allProducts.length === 0 && (
            <div className="text-center text-white/40 text-lg py-20">No products available</div>
          )}
        </>
      ) : (
        /* Show filtered products in a flat grid */
        <div className="container mx-auto px-4 py-6">
          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProducts.map((product) => (
                <Link to={`/product/${product.slug || product.id}`} key={product.id}>
                  <div className="rounded-xl bg-[#141414] border border-white/5 overflow-hidden hover:border-green-500/30 transition group">
                    <div className="relative h-36 md:h-44 bg-[#1c1c1c] overflow-hidden">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Gift className="text-white/15" size={40} />
                        </div>
                      )}
                      <button className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                        <Heart size={14} className="text-white/60" />
                      </button>
                    </div>
                    <div className="p-3">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-green-400 font-bold">
                          ${Number(product._variant_count > 1 ? product._min_price : product.price).toFixed(2)}
                        </span>
                        {product.original_price && product.original_price > product.price && (
                          <span className="text-white/30 text-xs line-through">${Number(product.original_price).toFixed(2)}</span>
                        )}
                      </div>
                      <h3 className="text-white font-medium text-sm truncate">{product.name}</h3>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-white/40 text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10">
                          {Math.max(0, Math.floor(Number(product._orders_count) || 0))} Sale
                        </span>
                        <div className="flex items-center gap-1">
                          <Star size={12} className="text-yellow-500" fill="currentColor" />
                          <span className="text-white/50 text-xs">0</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center text-white/40 text-lg py-20">No products found</div>
          )}
        </div>
      )}

      <Footer settings={settings} />
    </div>
  );
};

export default MarketplacePage;
