import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Store, ShoppingCart, Gift, Gamepad2, Tv, Wrench, Tag } from 'lucide-react';

const CATEGORY_META = {
  giftcard: { label: 'Gift Cards', icon: Gift, badge: 'bg-pink-500/20 text-pink-300' },
  topup: { label: 'Game Top-Up', icon: Gamepad2, badge: 'bg-blue-500/20 text-blue-300' },
  subscription: { label: 'Subscriptions', icon: Tv, badge: 'bg-purple-500/20 text-purple-300' },
  service: { label: 'Services', icon: Wrench, badge: 'bg-green-500/20 text-green-300' },
};

const getCatMeta = (cat) => CATEGORY_META[cat] || { label: cat, icon: Tag, badge: 'bg-gray-500/20 text-gray-300' };

const SellerStorePage = ({ user, logout, settings, addToCart }) => {
  const { sellerId } = useParams();
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

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
  const filtered = filter === 'all' ? offers : offers.filter(o => o.product_category === filter);

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-4 py-8">
        {/* Store Header */}
        <div className="glass-effect rounded-xl p-8 mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-purple-500 rounded-full flex items-center justify-center">
              <Store className="text-white" size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{store.store_name}</h1>
              {store.bio && <p className="text-white/60 mt-1">{store.bio}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {store.categories.map(c => {
              const meta = getCatMeta(c);
              const Icon = meta.icon;
              return <Badge key={c} className={`${meta.badge} flex items-center gap-1`}><Icon size={12} /> {meta.label}</Badge>;
            })}
            <Badge className="bg-white/10 text-white/60">
              <ShoppingCart size={12} className="mr-1" /> {store.total_orders} orders
            </Badge>
          </div>
        </div>

        {/* Category Filters */}
        {categories.length > 1 && (
          <div className="flex gap-2 mb-6 overflow-x-auto">
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
        )}

        {/* Products */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(offer => {
            const meta = getCatMeta(offer.product_category || '');
            return (
              <Card key={offer.id} className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer"
                onClick={() => window.location.href = `/product/${offer.product_id}`}>
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
        {filtered.length === 0 && <p className="text-white/40 text-center py-12">No products in this store yet</p>}
      </div>
      <Footer settings={settings} />
    </div>
  );
};

export default SellerStorePage;
