import { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { axiosInstance, LanguageContext } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Gift, Gamepad2, Tv, Wrench, ArrowRight, Star, TrendingUp, Package, Calendar, Heart, Wallet, MonitorPlay, Headphones } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeOrdersCount } from '../utils/ordersCount';
import { listBlogPosts } from '../utils/blogApi';

const CORE_CATEGORIES = ['giftcard', 'topup', 'subscription', 'service'];
const NewHomePage = ({ user, logout, cart, settings }) => {
  const { t } = useContext(LanguageContext);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [latestBlogPosts, setLatestBlogPosts] = useState([]);
  const [blogLoading, setBlogLoading] = useState(true);
  const [heroSlide, setHeroSlide] = useState(0);

  useEffect(() => {
    loadFeaturedProducts();
    loadLatestBlogPosts();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setHeroSlide((s) => (s + 1) % 3), 5000);
    return () => clearInterval(timer);
  }, []);

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

  const loadFeaturedProducts = async () => {
    try {
      const response = await axiosInstance.get('/products');
      const grouped = groupProducts(response.data || []);
      setFeaturedProducts(grouped.slice(0, 8));
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Error loading products');
    } finally {
      setLoading(false);
    }
  };

  const loadLatestBlogPosts = async () => {
    try {
      const result = await listBlogPosts({ publishedOnly: true, limit: 3 });
      setLatestBlogPosts(result.posts || []);
    } catch (error) {
      console.error('Error loading latest blog posts:', error);
      setLatestBlogPosts([]);
    } finally {
      setBlogLoading(false);
    }
  };

  const categoryMeta = {
    giftcard: { name: t('giftCards'), icon: Gift, emoji: '🎁', path: '/products/giftcard' },
    topup: { name: t('gameTopup'), icon: Gamepad2, emoji: '🎮', path: '/products/topup' },
    subscription: { name: t('subscriptions'), icon: Tv, emoji: '📺', path: '/products/subscription' },
    service: { name: t('services'), icon: Wrench, emoji: '⚡', path: '/products/service' },
    crypto: { name: t('crypto'), icon: TrendingUp, emoji: '💰', path: '/crypto' },
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
      return { name: label, icon: Package, emoji: '📦', path: `/products/${key}`, key };
    });
  })();

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const heroSlides = [
    { title: "World's Leading Digital Marketplace", subtitle: 'Buy gift cards, game top-ups, subscriptions and digital services with instant delivery' },
    { title: 'Instant Digital Delivery', subtitle: 'Get your codes delivered instantly after payment' },
    { title: 'Best Prices Guaranteed', subtitle: 'We offer the most competitive prices for all digital products' },
  ];

  const productsByCategory = categories.reduce((acc, cat) => {
    acc[cat.key] = featuredProducts.filter(
      (p) => normalizeCategory(p.category) === cat.key
    );
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      {/* Hero Slider */}
      <div className="relative overflow-hidden" data-testid="hero-section">
        <div className="absolute inset-0">
          <img
            src="/assets/gaming-hero.png"
            alt="Gaming Banner"
            className="w-full h-full object-cover opacity-40"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />

        <div className="relative container mx-auto px-4 py-16 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-green-400 text-sm font-medium mb-2">
              {heroSlides[heroSlide].subtitle.split(' ').slice(0, 5).join(' ')}
            </p>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
              {heroSlides[heroSlide].title}
            </h1>
            <Link to="/products">
              <Button size="lg" className="bg-green-500 hover:bg-green-600 text-black font-bold px-8 py-5 text-base rounded-lg">
                Grab The Offer <ArrowRight className="ml-2" size={18} />
              </Button>
            </Link>
          </div>

          <div className="flex gap-2 mt-8">
            {heroSlides.map((_, i) => (
              <button
                key={i}
                onClick={() => setHeroSlide(i)}
                className={`w-3 h-3 rounded-full transition ${i === heroSlide ? 'bg-white' : 'bg-white/30'}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Category Grid */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-4 gap-3 md:gap-4">
          {categories.map((category) => (
            <Link to={category.path} key={category.key}>
              <div className="flex flex-col items-center p-3 md:p-5 rounded-xl bg-[#141414] border border-white/5 hover:border-green-500/30 transition group">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-[#1c1c1c] flex items-center justify-center mb-2 group-hover:bg-green-500/10 transition">
                  <span className="text-2xl md:text-3xl">{category.emoji}</span>
                </div>
                <span className="text-white/80 text-xs md:text-sm font-medium text-center">{category.name}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Best Selling Products */}
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <p className="text-green-400 text-sm font-semibold mb-1">Top Much</p>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Best Selling Products</h2>
        </div>

        {loading ? (
          <div className="text-center text-white/40 text-lg py-12">{t('loading')}</div>
        ) : featuredProducts.length > 0 ? (
          <div className="space-y-4">
            {featuredProducts.slice(0, 6).map((product) => (
              <Link to={`/product/${product.id}`} key={product.id}>
                <div className="flex items-center gap-4 p-3 rounded-xl bg-[#141414] border border-white/5 hover:border-green-500/30 transition" data-testid={`product-card-${product.id}`}>
                  <div className="relative w-28 h-24 md:w-36 md:h-28 rounded-lg overflow-hidden flex-shrink-0 bg-[#1c1c1c]">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Gift className="text-white/20" size={32} />
                      </div>
                    )}
                    <button className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                      <Heart size={14} className="text-white/60" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-green-400 font-bold text-lg">
                        {product._variant_count > 1
                          ? `$${Number(product._min_price).toFixed(2)}`
                          : `$${Number(product.price).toFixed(2)}`}
                      </span>
                      {product.original_price && product.original_price > product.price && (
                        <span className="text-white/30 text-sm line-through">${Number(product.original_price).toFixed(2)}</span>
                      )}
                    </div>
                    <h3 className="text-white font-semibold text-sm md:text-base truncate">{product.name}</h3>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-white/40 text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10">
                        {Math.max(0, Math.floor(Number(product._orders_count) || 0))} Sale
                      </span>
                      <div className="flex items-center gap-1">
                        <Star size={14} className="text-yellow-500" fill="currentColor" />
                        <span className="text-white/50 text-xs">0</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center text-white/40 text-lg py-12">No products available</div>
        )}
      </div>

      {/* Category Sections */}
      {categories.map((cat) => {
        const catProducts = productsByCategory[cat.key] || [];
        if (catProducts.length === 0) return null;
        return (
          <div key={cat.key} className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-green-400 text-sm font-semibold mb-1">Unlimited Offer</p>
                <h2 className="text-2xl md:text-3xl font-bold text-white">{cat.name}</h2>
              </div>
              <Link to={cat.path}>
                <Button className="bg-green-500 hover:bg-green-600 text-black font-semibold rounded-lg px-5">
                  View All <ArrowRight size={16} className="ml-1" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {catProducts.slice(0, 4).map((product) => (
                <Link to={`/product/${product.id}`} key={product.id}>
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

      {/* Stats Bar */}
      <div className="bg-green-500 mt-8">
        <div className="container mx-auto px-4 py-5">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl md:text-3xl font-bold text-black">1252k</div>
              <div className="text-black/70 text-xs md:text-sm">Total Items</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold text-black">9892+</div>
              <div className="text-black/70 text-xs md:text-sm">Total Sale</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold text-black">15k+</div>
              <div className="text-black/70 text-xs md:text-sm">Total Clients</div>
            </div>
          </div>
        </div>
      </div>

      {/* Latest Blog Posts */}
      {latestBlogPosts.length > 0 && (
        <div className="container mx-auto px-4 py-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-white">Latest Blog Posts</h2>
            <Link to="/blog">
              <Button className="bg-green-500 hover:bg-green-600 text-black font-semibold rounded-lg px-5">
                Visit Blog <ArrowRight size={16} className="ml-1" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {latestBlogPosts.map((post) => (
              <Link to={`/blog/${post.slug || post.id}`} key={post.id}>
                <div className="rounded-xl bg-[#141414] border border-white/5 overflow-hidden hover:border-green-500/30 transition">
                  {post.cover_image_url && (
                    <div className="h-40 bg-[#1c1c1c]">
                      <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="text-white font-semibold text-base mb-2 line-clamp-2">{post.title}</h3>
                    <p className="text-white/40 text-xs flex items-center gap-1.5">
                      <Calendar size={12} />
                      {new Date(post.published_at || post.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <Footer settings={settings} />
    </div>
  );
};

export default NewHomePage;
