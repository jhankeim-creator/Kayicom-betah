import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, ShoppingCart, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const formatSubscriptionDurationLabel = (months) => {
  const value = Number(months);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value === 12) return '1 Year';
  return `${value} ${value === 1 ? 'Month' : 'Months'}`;
};

const ProductDetailPage = ({ user, logout, addToCart, cart, settings }) => {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProduct();
  }, [id]);

  const loadProduct = async () => {
    try {
      const response = await axiosInstance.get(`/products/${id}`);
      const p = response.data;
      setProduct(p);

      // Load variants for this group (if any)
      const groupId = p.parent_product_id || p.id;
      try {
        const variantsResp = await axiosInstance.get(`/products?parent_product_id=${groupId}`);
        const list = Array.isArray(variantsResp.data) ? variantsResp.data : [];
        // Sort by price asc for clean UX
        const sorted = [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
        setVariants(sorted);
        const current = sorted.find(v => v.id === p.id);
        setSelectedVariantId((current || sorted[0] || p).id);
      } catch (e) {
        // If variants endpoint fails, fall back to single product
        setVariants([]);
        setSelectedVariantId(p.id);
      }
    } catch (error) {
      console.error('Error loading product:', error);
      toast.error('Error loading product');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = () => {
    const chosen = variants.find(v => v.id === selectedVariantId) || product;
    addToCart(chosen, quantity);
  };

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg">
        <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />
        <div className="container mx-auto px-4 py-20 text-center text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen gradient-bg">
        <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />
        <div className="container mx-auto px-4 py-20 text-center text-white text-xl">Product not found</div>
      </div>
    );
  }

  const selectedProduct = variants.find(v => v.id === selectedVariantId) || product;
  const selectedDurationLabel = (() => {
    if (selectedProduct?.subscription_duration_months) {
      return formatSubscriptionDurationLabel(selectedProduct.subscription_duration_months);
    }
    if (selectedProduct?.category === 'subscription' && selectedProduct?.variant_name) {
      return selectedProduct.variant_name;
    }
    return '';
  })();
  const totalOrdersCount = (() => {
    if (variants.length > 0) {
      return variants.reduce((sum, item) => sum + (Number(item.orders_count) || 0), 0);
    }
    return Number(selectedProduct?.orders_count) || 0;
  })();
  const getVariantLabel = (variant) => {
    if (!variant) return '';
    if (variant.variant_name) return variant.variant_name;
    if (variant.subscription_duration_months) return formatSubscriptionDurationLabel(variant.subscription_duration_months);
    return variant.name || '';
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Product Image */}
          <div className="" data-testid="product-image">
            <Card className="overflow-hidden bg-white/10 backdrop-blur-lg border-white/20">
              <div className="aspect-square bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="text-white" size={128} />
                )}
              </div>
            </Card>
          </div>

          {/* Product Details */}
          <div className="text-white" data-testid="product-details">
            <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="product-name">{selectedProduct.name}</h1>
            
            <div className="flex items-center gap-4 mb-6">
              <span className="text-4xl font-bold" data-testid="product-price">${selectedProduct.price}</span>
              {selectedProduct.stock_available ? (
                <span className="flex items-center text-green-400 bg-green-400/20 px-3 py-1 rounded" data-testid="stock-status">
                  <CheckCircle size={16} className="mr-1" />
                  Available
                </span>
              ) : (
                <span className="text-red-400 bg-red-400/20 px-3 py-1 rounded" data-testid="stock-status">
                  Out of Stock
                </span>
              )}
            </div>
            <p className="text-white/70 text-sm mb-6" data-testid="product-orders-count">
              {Math.max(0, Math.floor(totalOrdersCount))} orders
            </p>

            <div className="mb-6">
              <span className="inline-block bg-white/10 px-3 py-1 rounded text-sm" data-testid="product-category">
                {selectedProduct.category === 'giftcard' && 'Gift Card'}
                {selectedProduct.category === 'topup' && 'Game Topup'}
                {selectedProduct.category === 'subscription' && 'Subscription'}
                {selectedProduct.category === 'service' && 'Service'}
              </span>
              {selectedProduct.category === 'giftcard' && selectedProduct.giftcard_category && (
                <span className="inline-block bg-white/10 px-3 py-1 rounded text-sm ml-2">
                  {selectedProduct.giftcard_category}
                </span>
              )}
              {selectedProduct.category === 'giftcard' && selectedProduct.giftcard_subcategory && (
                <span className="inline-block bg-white/10 px-3 py-1 rounded text-sm ml-2">
                  {selectedProduct.giftcard_subcategory}
                </span>
              )}
              {selectedProduct.category === 'subscription' && selectedDurationLabel && (
                <span className="inline-block bg-white/10 px-3 py-1 rounded text-sm ml-2">
                  Duration: {selectedDurationLabel}
                </span>
              )}
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-3">Description</h2>
              <p className="text-white/80 text-lg leading-relaxed" data-testid="product-description">{selectedProduct.description}</p>
            </div>

            {/* Variant selector */}
            {variants.length > 1 && (
              <div className="mb-6 glass-effect p-6 rounded-lg">
                <h3 className="text-xl font-bold mb-3">Choose an option</h3>
                <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                  <SelectTrigger className="bg-white/10 border-white/20 text-white">
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
            )}

            {/* Quantity & Add to Cart */}
            <div className="glass-effect p-6 rounded-lg">
              <div className="flex items-center gap-4 mb-6">
                <label className="text-lg font-semibold">Quantity:</label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white text-white hover:bg-white/10 w-10 h-10"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    data-testid="decrease-quantity"
                  >
                    -
                  </Button>
                  <span className="text-xl font-bold w-12 text-center" data-testid="quantity-display">{quantity}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white text-white hover:bg-white/10 w-10 h-10"
                    onClick={() => setQuantity(quantity + 1)}
                    data-testid="increase-quantity"
                  >
                    +
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-lg">
                  <span>Total:</span>
                  <span className="text-2xl font-bold" data-testid="total-price">${(selectedProduct.price * quantity).toFixed(2)}</span>
                </div>
                <Button
                  size="lg"
                  className="w-full bg-white text-purple-600 hover:bg-gray-100 text-lg py-6"
                  onClick={handleAddToCart}
                  disabled={!selectedProduct.stock_available}
                  data-testid="add-to-cart-btn"
                >
                  <ShoppingCart className="mr-2" size={24} />
                  Add to Cart
                </Button>
              </div>
            </div>

            {/* Delivery Info */}
            <div className="mt-6 glass-effect p-6 rounded-lg">
              <h3 className="text-xl font-bold mb-3">Delivery Information</h3>
              <ul className="space-y-2 text-white/80">
                {selectedProduct.delivery_type === 'automatic' ? (
                  <>
                    <li className="flex items-center">
                      <span className="mr-2">⚡</span>
                      Automatic delivery
                    </li>
                    <li className="flex items-center">
                      <span className="mr-2">📬</span>
                      Code sent by email
                    </li>
                  </>
                ) : (
                  <>
                    <li className="flex items-center">
                      <span className="mr-2">👤</span>
                      Manual delivery
                    </li>
                    <li className="flex items-center">
                      <span className="mr-2">⏱️</span>
                      Instant delivery
                    </li>
                  </>
                )}
                <li className="flex items-center">
                  <span className="mr-2">🔒</span>
                  Secure transaction
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default ProductDetailPage;
