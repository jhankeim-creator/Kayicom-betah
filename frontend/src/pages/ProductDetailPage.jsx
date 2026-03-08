import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, ShoppingCart, CheckCircle, Globe, Monitor, Truck, Clock, Star, MessageCircle, ThumbsUp, User } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeOrdersCount } from '../utils/ordersCount';

const formatSubscriptionDurationLabel = (months) => {
  const value = Number(months);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value === 12) return '1 Year';
  return `${value} ${value === 1 ? 'Month' : 'Months'}`;
};

const stripHtml = (value = '') => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const truncateText = (value = '', limit = 160) => { const c = stripHtml(value); return c.length <= limit ? c : `${c.slice(0, limit - 3).trim()}...`; };
const deriveProductSeoTitle = (item) => String(item?.seo_title || '').trim() || String(item?.name || '').trim() || 'Product';
const deriveProductSeoDescription = (item) => { const r = String(item?.seo_description || '').trim() || String(item?.description || '').trim(); return r ? truncateText(r, 160) : truncateText(`Buy ${String(item?.name || 'digital product').trim()} securely on KayiCom.`, 160); };

const ProductDetailPage = ({ user, logout, addToCart, cart, settings }) => {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [sellerOffers, setSellerOffers] = useState([]);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProduct(); }, [slug]);

  const loadProduct = async () => {
    try {
      const response = await axiosInstance.get(`/products/${slug}`);
      const p = response.data;
      setProduct(p);
      try { const r = await axiosInstance.get(`/products/${slug}/offers`); setSellerOffers(Array.isArray(r.data) ? r.data : []); } catch { setSellerOffers([]); }
      const groupId = p.parent_product_id || p.id;
      try {
        const vr = await axiosInstance.get(`/products?parent_product_id=${groupId}`);
        const sorted = [...(Array.isArray(vr.data) ? vr.data : [])].sort((a, b) => (a.price || 0) - (b.price || 0));
        setVariants(sorted);
        setSelectedVariantId((sorted.find(v => v.id === p.id) || sorted[0] || p).id);
      } catch { setVariants([]); setSelectedVariantId(p.id); }
    } catch { toast.error('Error loading product'); }
    finally { setLoading(false); }
  };

  const handleAddToCart = () => { addToCart(variants.find(v => v.id === selectedVariantId) || product, quantity); };
  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);
  const selectedProduct = variants.find(v => v.id === selectedVariantId) || product;

  useEffect(() => {
    if (!selectedProduct) return;
    const prev = document.title;
    document.title = `${deriveProductSeoTitle(selectedProduct)} | KayiCom`;
    let dm = document.querySelector('meta[name="description"]'); const cd = !dm;
    if (!dm) { dm = document.createElement('meta'); dm.setAttribute('name', 'description'); document.head.appendChild(dm); }
    const pd = dm.getAttribute('content') || '';
    dm.setAttribute('content', deriveProductSeoDescription(selectedProduct));
    const js = document.createElement('script'); js.type = 'application/ld+json'; js.id = 'product-seo-jsonld';
    js.text = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: selectedProduct.name, description: deriveProductSeoDescription(selectedProduct), image: selectedProduct.image_url ? [selectedProduct.image_url] : undefined, offers: { '@type': 'Offer', priceCurrency: 'USD', price: Number(selectedProduct.price || 0).toFixed(2), availability: selectedProduct.stock_available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' } });
    document.head.appendChild(js);
    return () => { document.title = prev; if (cd && dm) dm.remove(); else if (dm) dm.setAttribute('content', pd); js.remove(); };
  }, [selectedProduct]);

  if (loading) return (<div className="min-h-screen bg-[#0a0a0a]"><Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} /><div className="container mx-auto px-4 py-20 text-center text-white/40">Loading...</div></div>);
  if (!product) return (<div className="min-h-screen bg-[#0a0a0a]"><Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} /><div className="container mx-auto px-4 py-20 text-center text-white/40">Product not found</div></div>);

  const totalOrdersCount = variants.length > 0 ? variants.reduce((s, i) => s + normalizeOrdersCount(i), 0) : normalizeOrdersCount(selectedProduct);
  const getVariantLabel = (v) => v?.variant_name || (v?.subscription_duration_months ? formatSubscriptionDurationLabel(v.subscription_duration_months) : v?.name || '');
  const catLabel = { giftcard: 'Gift Card', topup: 'Game Topup', subscription: 'Subscription', service: 'Service' }[selectedProduct.category] || selectedProduct.category;
  const bestOffer = sellerOffers.length > 0 ? sellerOffers[0] : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-20">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      {/* Breadcrumb */}
      <div className="container mx-auto px-4 py-3">
        <p className="text-white/40 text-xs">
          <Link to="/" className="hover:text-white/60">Home</Link>
          {' > '}
          <Link to="/products" className="hover:text-white/60">Products</Link>
          {selectedProduct.category && <>{' > '}<Link to={`/products/${selectedProduct.category}`} className="hover:text-white/60">{catLabel}</Link></>}
        </p>
      </div>

      <div className="container mx-auto px-4">
        {/* Product Info Card */}
        <div className="rounded-xl bg-[#141414] border border-white/5 overflow-hidden mb-6">
          {/* Image */}
          <div className="w-full aspect-[16/9] md:aspect-[21/9] bg-[#1c1c1c] flex items-center justify-center overflow-hidden" data-testid="product-image">
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
            ) : (
              <Package className="text-white/20" size={80} />
            )}
          </div>

          {/* Product Details */}
          <div className="p-5" data-testid="product-details">
            <h1 className="text-xl md:text-2xl font-bold text-white mb-4" data-testid="product-name">{selectedProduct.name}</h1>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-white/50"><Globe size={16} /> Region</span>
                <span className="text-white font-semibold">{selectedProduct.region || 'Global'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-white/50"><Monitor size={16} /> Platform</span>
                <span className="text-white font-semibold">{catLabel}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-white/50"><Truck size={16} /> Delivery Method</span>
                <span className="text-white font-semibold">{selectedProduct.delivery_type === 'automatic' ? 'Automatic' : 'Manual'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-white/50"><Clock size={16} /> Estimated Delivery time</span>
                <span className="text-white font-semibold">{selectedProduct.delivery_type === 'automatic' ? '1 Min' : '10 Mins'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Variant Selector */}
        {variants.length > 1 && (
          <div className="mb-6">
            <p className="text-green-400 text-sm font-semibold mb-2">Select Region</p>
            <div className="rounded-xl bg-[#141414] border border-white/5 p-4">
              <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {variants.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {getVariantLabel(v) ? `${getVariantLabel(v)} - $${Number(v.price).toFixed(2)}` : `${v.name} - $${Number(v.price).toFixed(2)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Description */}
        {selectedProduct.description && (
          <div className="mb-6">
            <p className="text-white/50 text-xs mb-2">Description</p>
            <div className="rounded-xl bg-[#141414] border border-white/5 p-4">
              <p className="text-white/70 text-sm leading-relaxed" data-testid="product-description">{selectedProduct.description}</p>
            </div>
          </div>
        )}

        {/* Best Seller Card (if offers exist) */}
        {bestOffer && (
          <div className="rounded-xl bg-[#141414] border border-white/5 p-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-[#1c1c1c] border-2 border-green-500/30 flex items-center justify-center flex-shrink-0">
                <User size={24} className="text-white/40" />
              </div>
              <div className="flex-1 min-w-0">
                <Link to={`/store/${bestOffer.seller_id}`} className="text-white font-semibold text-sm hover:text-green-400">{bestOffer.seller_name || 'Seller'}</Link>
                <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
                  <span>Total Orders</span>
                  {bestOffer.seller_rating > 0 && (
                    <span className="flex items-center gap-1 text-green-400">
                      <ThumbsUp size={12} /> {(bestOffer.seller_rating * 20).toFixed(0)}%
                    </span>
                  )}
                  <span>|</span>
                  <span>{bestOffer.codes_available || 0} Sold</span>
                </div>
              </div>
              <Link to={`/messages?seller=${bestOffer.seller_id}`}>
                <Button size="sm" variant="outline" className="border-white/20 text-white text-xs hover:bg-white/10">
                  <MessageCircle size={14} className="mr-1" /> Chat
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* ALL Seller Offers - sorted by price (low to high) */}
        {sellerOffers.length > 0 && (
          <div className="mb-6">
            <p className="text-white/50 text-xs mb-3">ALL ({sellerOffers.length})</p>
            <div className="space-y-3">
              {sellerOffers.map(offer => (
                <div key={offer.id} className="rounded-xl bg-[#141414] border border-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#1c1c1c] flex items-center justify-center flex-shrink-0">
                      <User size={16} className="text-white/30" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link to={`/store/${offer.seller_id}`} className="text-white font-semibold text-sm hover:text-green-400">
                        {offer.seller_name || 'Seller'}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        {offer.seller_rating > 0 && (
                          <span className="flex items-center gap-1 text-green-400 text-xs">
                            <ThumbsUp size={10} /> {(offer.seller_rating * 20).toFixed(0)}%
                          </span>
                        )}
                        <span className="text-white/30 text-xs">
                          ⏱ {offer.delivery_type === 'automatic' ? '1min' : '10min/2min'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-white font-bold">{Number(offer.price).toFixed(2)} <span className="text-white/40 text-xs">USD</span></p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const sp = { ...product, price: offer.price, _seller_id: offer.seller_id, _seller_name: offer.seller_name || 'Seller', _offer_id: offer.id };
                            addToCart(sp, 1);
                          }}
                          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition"
                        >
                          <ShoppingCart size={16} className="text-white/60" />
                        </button>
                        <button
                          onClick={() => {
                            const sp = { ...product, price: offer.price, _seller_id: offer.seller_id, _seller_name: offer.seller_name || 'Seller', _offer_id: offer.id };
                            addToCart(sp, 1);
                            toast.success('Added to cart!');
                          }}
                          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition"
                        >
                          Buy
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KayiCom direct purchase (no seller offers or as fallback) */}
        {sellerOffers.length === 0 && (
          <div className="mb-6">
            <p className="text-white/50 text-xs mb-3">Official</p>
            <div className="rounded-xl bg-[#141414] border border-white/5 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle size={18} className="text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm">KayiCom Official</p>
                  <p className="text-green-400 text-xs">✓ Verified · {Math.max(0, Math.floor(totalOrdersCount))} sold</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">{Number(selectedProduct.price).toFixed(2)} <span className="text-white/40 text-xs">USD</span></p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#1a1a1a] border-t border-white/10 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-xl" data-testid="product-price">{Number(selectedProduct.price).toFixed(2)} <span className="text-white/40 text-sm font-normal">USD</span></p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddToCart}
              disabled={!selectedProduct.stock_available}
              className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition"
            >
              <ShoppingCart size={20} className="text-white/70" />
            </button>
            <Button
              onClick={() => { handleAddToCart(); toast.success('Added to cart!'); }}
              disabled={!selectedProduct.stock_available}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-3 rounded-full text-sm"
              data-testid="add-to-cart-btn"
            >
              Buy Now
            </Button>
          </div>
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default ProductDetailPage;
