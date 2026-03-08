import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Store, ShoppingCart, Gift, Gamepad2, Tv, Wrench, Tag, Star, Search, Calendar } from 'lucide-react';

const CATEGORY_META = {
  giftcard: { label: 'Gift Cards', icon: Gift, badge: 'bg-pink-500/20 text-pink-300' },
  topup: { label: 'Game Top-Up', icon: Gamepad2, badge: 'bg-blue-500/20 text-blue-300' },
  subscription: { label: 'Subscriptions', icon: Tv, badge: 'bg-purple-500/20 text-purple-300' },
  service: { label: 'Services', icon: Wrench, badge: 'bg-green-500/20 text-green-300' },
};

const getCatMeta = (cat) => CATEGORY_META[cat] || { label: cat, icon: Tag, badge: 'bg-gray-500/20 text-gray-300' };

const StarRating = ({ rating }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map(i => (
      <Star key={i} size={14} className={i <= Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-white/20'} />
    ))}
  </div>
);

const SellerStorePage = ({ user, logout, settings, addToCart }) => {
  const { sellerId } = useParams();
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await axiosInstance.get(`/store/${sellerId}`);
        setStore(res.data);
      } catch { setStore(null); }
      finally { setLoading(false); }
    })();
  }, [sellerId]);

  if (loading) return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-4 py-20 text-center"><p className="text-white/60">Loading store...</p></div>
      <Footer settings={settings} />
    </div>
  );

  if (!store) return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-4 py-20 text-center"><p className="text-white/60">Store not found</p></div>
      <Footer settings={settings} />
    </div>
  );

  const offers = store.offers || [];
  const categories = [...new Set(offers.map(o => o.product_category).filter(Boolean))];
  const reviews = store.reviews || [];
  let filtered = filter === 'all' ? offers : offers.filter(o => o.product_category === filter);
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(o => (o.product_name || '').toLowerCase().includes(q));
  }

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-4 py-8">
        {/* Store Header */}
        <div className="glass-effect rounded-xl p-8 mb-8">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-purple-500 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Store className="text-white" size={40} />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white">{store.store_name}</h1>
              {store.bio && <p className="text-white/60 mt-1 max-w-2xl">{store.bio}</p>}
              <div className="flex flex-wrap items-center gap-4 mt-3">
                {store.rating > 0 && (
                  <div className="flex items-center gap-2">
                    <StarRating rating={store.rating} />
                    <span className="text-yellow-400 font-bold text-sm">{store.rating.toFixed(1)}</span>
                    <span className="text-white/40 text-sm">({store.review_count} reviews)</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-white/50 text-sm">
                  <ShoppingCart size={14} /> {store.total_orders} orders completed
                </div>
                {store.member_since && (
                  <div className="flex items-center gap-1 text-white/50 text-sm">
                    <Calendar size={14} /> Member since {store.member_since}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {store.categories.map(c => {
                  const meta = getCatMeta(c);
                  const Icon = meta.icon;
                  return <Badge key={c} className={`${meta.badge} flex items-center gap-1`}><Icon size={12} /> {meta.label}</Badge>;
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <Input
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="bg-white/10 border-white/20 text-white pl-9"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            <Button size="sm" onClick={() => setFilter('all')}
              className={`${filter === 'all' ? 'bg-white text-purple-600' : 'bg-white/10 text-white'} text-xs`}>
              All ({offers.length})
            </Button>
            {categories.map(c => {
              const meta = getCatMeta(c);
              const Icon = meta.icon;
              return (
                <Button key={c} size="sm" onClick={() => setFilter(c)}
                  className={`${filter === c ? 'bg-white text-purple-600' : 'bg-white/10 text-white'} text-xs flex items-center gap-1`}>
                  <Icon size={12} /> {meta.label} ({offers.filter(o => o.product_category === c).length})
                </Button>
              );
            })}
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(offer => {
            const meta = getCatMeta(offer.product_category || '');
            return (
              <Card key={offer.id} className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer"
                onClick={() => window.location.href = `/product/${offer.product_slug || offer.product_id}`}>
                <CardContent className="p-4">
                  {offer.product_image && (
                    <img src={offer.product_image} alt="" className="w-full h-40 rounded-lg object-cover mb-3" />
                  )}
                  <h3 className="text-white font-bold text-sm truncate">{offer.product_name}</h3>
                  <Badge className={`${meta.badge} text-xs mt-1`}>{meta.label}</Badge>
                  <div className="flex justify-between items-center mt-3">
                    <p className="text-cyan-300 font-bold text-lg">${Number(offer.price).toFixed(2)}</p>
                    <Badge className={offer.stock_available ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}>
                      {offer.stock_available ? 'In Stock' : 'Out'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {filtered.length === 0 && <p className="text-white/40 text-center py-12">No products found</p>}

        {/* Reviews Section */}
        {reviews.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Star className="text-yellow-400" /> Customer Reviews ({store.review_count})
            </h2>
            <div className="space-y-3">
              {reviews.map(review => (
                <Card key={review.id} className="glass-effect border-white/10">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-white font-semibold text-sm">{review.reviewer_name}</p>
                          <StarRating rating={review.rating} />
                        </div>
                        {review.comment && <p className="text-white/70 text-sm mt-1">{review.comment}</p>}
                      </div>
                      <p className="text-white/40 text-xs">{review.created_at ? new Date(review.created_at).toLocaleDateString() : ''}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
      <Footer settings={settings} />
    </div>
  );
};

export default SellerStorePage;
