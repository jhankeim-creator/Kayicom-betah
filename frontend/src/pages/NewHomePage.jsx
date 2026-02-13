import { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { axiosInstance, LanguageContext } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Gift, Gamepad2, Tv, Wrench, ArrowRight, Zap, Shield, MessageCircle, DollarSign, Star, TrendingUp, Package, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeOrdersCount } from '../utils/ordersCount';

const CORE_CATEGORIES = ['giftcard', 'topup', 'subscription', 'service'];
const NewHomePage = ({ user, logout, cart, settings }) => {
  const { t } = useContext(LanguageContext);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [latestBlogPosts, setLatestBlogPosts] = useState([]);
  const [blogLoading, setBlogLoading] = useState(true);

  useEffect(() => {
    loadFeaturedProducts();
    loadLatestBlogPosts();
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
      const response = await axiosInstance.get('/blog/posts?published_only=true&limit=3');
      setLatestBlogPosts(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error loading latest blog posts:', error);
      setLatestBlogPosts([]);
    } finally {
      setBlogLoading(false);
    }
  };

  const categoryMeta = {
    giftcard: { 
      name: t('giftCards'), 
      icon: Gift, 
      path: '/products/giftcard', 
      gradient: 'from-pink-500 to-rose-500',
      bgImage: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400'
    },
    topup: { 
      name: t('gameTopup'), 
      icon: Gamepad2, 
      path: '/products/topup', 
      gradient: 'from-cyan-500 to-blue-500',
      bgImage: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400'
    },
    subscription: { 
      name: t('subscriptions'), 
      icon: Tv, 
      path: '/products/subscription', 
      gradient: 'from-purple-500 to-indigo-500',
      bgImage: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=400'
    },
    service: { 
      name: t('services'), 
      icon: Wrench, 
      path: '/products/service', 
      gradient: 'from-green-500 to-emerald-500',
      bgImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400'
    },
    crypto: {
      name: t('crypto'),
      icon: TrendingUp,
      path: '/crypto',
      gradient: 'from-amber-500 to-orange-500',
      bgImage: 'https://images.unsplash.com/photo-1518544889280-59fefb46e1a8?w=400'
    }
  };

  const normalizeCategory = (value = '') => String(value || '').trim().toLowerCase();
  const categoryImages = settings?.category_images || {};
  const categories = (() => {
    const raw = [...CORE_CATEGORIES, ...(settings?.product_categories || [])]
      .map(normalizeCategory)
      .filter((value) => Boolean(value) && value !== 'crypto');
    const unique = Array.from(new Set(raw.length ? raw : CORE_CATEGORIES));
    return unique.map((key) => {
      const meta = categoryMeta[key];
      const coverImage = categoryImages[key];
      if (meta) {
        return {
          ...meta,
          bgImage: coverImage || meta.bgImage
        };
      }
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        name: label,
        icon: Package,
        path: `/products/${key}`,
        gradient: 'from-slate-500 to-slate-700',
        bgImage: coverImage || 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?w=400'
      };
    });
  })();

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      {/* Hero Section with Background */}
      <div className="relative overflow-hidden" data-testid="hero-section">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-purple-500/10" />
        {/* Gaming Hero Background - Responsive */}
        <div className="absolute inset-0 flex items-center justify-center opacity-50">
          <img 
            src="/assets/gaming-hero.png" 
            alt="Gaming Banner" 
            className="w-full h-full object-cover object-center md:object-cover"
            style={{filter: 'blur(1px)'}}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/85 via-gray-900/50 to-gray-900/20" />
        
        <div className="relative container mx-auto px-4 py-20 lg:py-32">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-500/20 to-blue-500/20 border border-pink-500/30 rounded-full px-6 py-2 mb-6">
              <Star className="text-yellow-400" size={20} fill="currentColor" />
              <span className="text-pink-400 font-semibold">Trusted by 100,000+ Gamers</span>
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-7xl font-bold text-white mb-6 leading-tight">
              World's Leading <span className="gradient-text">Digital</span><br />Marketplace
            </h1>
            <p className="text-lg md:text-xl text-gray-400 mb-8 max-w-3xl mx-auto">
              {t('heroSubtitle')}
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link to="/products">
                <Button size="lg" className="gradient-button text-white px-8 py-6 text-lg" data-testid="browse-products-btn">
                  {t('exploreProducts')} <ArrowRight className="ml-2" size={20} />
                </Button>
              </Link>
              {!user && (
                <Link to="/register">
                  <Button size="lg" className="bg-gray-800 border border-pink-500/30 text-pink-400 hover:bg-gray-800/80 px-8 py-6 text-lg" data-testid="register-btn">
                    {t('getStarted')}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Trust Badges */}
      <div className="container mx-auto px-4 py-8">
        <div className="glass-effect rounded-2xl p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold gradient-text mb-1">24/7</div>
              <div className="text-gray-400 text-sm">Support</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold gradient-text mb-1">100K+</div>
              <div className="text-gray-400 text-sm">Happy Customers</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold gradient-text mb-1">&lt;5min</div>
              <div className="text-gray-400 text-sm">Avg Delivery</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold gradient-text mb-1">99.9%</div>
              <div className="text-gray-400 text-sm">Success Rate</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Categories */}
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">Browse by Category</h2>
          <p className="text-gray-400">Find exactly what you need</p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <Link to={category.path} key={category.name}>
                <Card className="category-card bg-gray-900/50 backdrop-blur-lg overflow-hidden group relative h-32" data-testid={`category-${category.name.toLowerCase().replace(' ', '-')}`}>
                  <div className="absolute inset-0" style={{
                    backgroundImage: `url(${category.bgImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    opacity: '0.1'
                  }} />
                  <div className={`absolute inset-0 bg-gradient-to-br ${category.gradient} opacity-20 group-hover:opacity-30 transition-opacity`} />
                  <CardContent className="relative p-6 h-full flex flex-col items-center justify-center text-center">
                    <Icon size={32} className="text-white mb-2" />
                    <h3 className="text-base md:text-lg font-bold text-white">{category.name}</h3>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Featured Products */}
      <div className="container mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">{t('featuredProducts')}</h2>
            <p className="text-gray-400">Hot deals and instant delivery</p>
          </div>
          <Link to="/products">
            <Button variant="outline" className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10">
              View All <ArrowRight size={16} className="ml-2" />
            </Button>
          </Link>
        </div>
        
        {loading ? (
          <div className="text-center text-gray-400 text-xl py-12">{t('loading')}</div>
        ) : featuredProducts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {featuredProducts.map((product) => (
              <Link to={`/product/${product.id}`} key={product.id}>
                <Card className="product-card overflow-hidden" data-testid={`product-card-${product.id}`}>
                  <div className="h-40 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center relative overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <Gift className="text-gray-600" size={48} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
                    {product.stock_available && (
                      <div className="absolute top-2 right-2">
                        <div className="bg-green-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                          ✓ In Stock
                        </div>
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4 bg-gray-900/50">
                    <h3 className="text-sm md:text-base font-bold text-white mb-2 line-clamp-2">{product.name}</h3>
                    <p className="text-gray-400 text-xs mb-2">
                      {Math.max(0, Math.floor(Number(product._orders_count) || 0))} orders
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-bold gradient-text">
                        {product._variant_count > 1
                          ? `From $${Number(product._min_price).toFixed(2)}`
                          : `$${Number(product.price).toFixed(2)}`}
                      </span>
                      <Button size="sm" className="gradient-button text-white text-xs" data-testid={`buy-btn-${product.id}`}>
                        Buy Now
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400 text-xl py-12">No products available</div>
        )}
      </div>

      {/* Latest Blog Posts */}
      <div className="container mx-auto px-4 py-4 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">Latest Blog Posts</h2>
            <p className="text-gray-400">News, tips, and updates from KayiCom</p>
          </div>
          <Link to="/blog">
            <Button variant="outline" className="border-pink-500/30 text-pink-400 hover:bg-pink-500/10">
              Visit Blog <ArrowRight size={16} className="ml-2" />
            </Button>
          </Link>
        </div>

        {blogLoading ? (
          <div className="text-center text-gray-400 text-xl py-8">{t('loading')}</div>
        ) : latestBlogPosts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {latestBlogPosts.map((post) => (
              <Link to={`/blog/${post.slug || post.id}`} key={post.id}>
                <Card className="overflow-hidden bg-gray-900/50 border-white/10 hover:border-white/30 transition">
                  {post.cover_image_url ? (
                    <div className="h-40 bg-gray-900">
                      <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" />
                    </div>
                  ) : null}
                  <CardContent className="p-4">
                    <h3 className="text-white font-bold text-lg mb-2 line-clamp-2">{post.title}</h3>
                    <p className="text-white/60 text-xs mb-2 flex items-center gap-2">
                      <Calendar size={14} />
                      {new Date(post.published_at || post.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-white/75 text-sm line-clamp-3">
                      {post.excerpt || String(post.content || '').slice(0, 140)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-8">No blog posts available yet.</div>
        )}
      </div>

      {/* What We Offer Section - Moved Down */}
      <div className="bg-gray-900/30 py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">{t('whatWeOffer')}</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">{t('offerSubtitle')}</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            <Card className="bg-gray-900/50 backdrop-blur-lg border-white/5 overflow-hidden group">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center flex-shrink-0">
                    <Gift size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('internationalGiftCards')}</h3>
                    <p className="text-gray-400 text-sm">{t('giftCardsDesc')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gray-900/50 backdrop-blur-lg border-white/5 overflow-hidden group">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                    <Gamepad2 size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('automaticGameTopup')}</h3>
                    <p className="text-gray-400 text-sm">{t('gameTopupDesc')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gray-900/50 backdrop-blur-lg border-white/5 overflow-hidden group">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center flex-shrink-0">
                    <Tv size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('premiumSubscriptions')}</h3>
                    <p className="text-gray-400 text-sm">{t('subscriptionsDesc')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gray-900/50 backdrop-blur-lg border-white/5 overflow-hidden group">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center flex-shrink-0">
                    <Wrench size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('digitalServices')}</h3>
                    <p className="text-gray-400 text-sm">{t('servicesDesc')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-12 mb-12">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-blue-500/20 to-purple-500/20" />
          <CardContent className="relative p-12 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">{t('readyToStart')}</h2>
            <Link to="/products">
              <Button size="lg" className="gradient-button text-white px-12 py-6 text-lg">
                {t('exploreProducts')} <ArrowRight className="ml-2" size={20} />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default NewHomePage;
