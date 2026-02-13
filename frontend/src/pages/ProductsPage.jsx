import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Package, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeOrdersCount } from '../utils/ordersCount';

const DEFAULT_GIFTCARD_CATEGORIES = ['Shopping', 'Gaming', 'Entertainment', 'Food', 'Travel', 'Other'];
const DEFAULT_GIFTCARD_TAXONOMY = DEFAULT_GIFTCARD_CATEGORIES.map((name) => ({
  name,
  subcategories: []
}));

const ProductsPage = ({ user, logout, addToCart, cart, settings }) => {
  const { category } = useParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const normalizeCategory = (value = '') => String(value || '').trim().toLowerCase();
  const normalizeGiftcardValue = (value = '') => String(value || '').trim();
  const normalizeGiftcardKey = (value = '') => normalizeGiftcardValue(value).toLowerCase();
  const [selectedCategory, setSelectedCategory] = useState(normalizeCategory(category));
  const [search, setSearch] = useState('');
  const hasGiftcardTaxonomy = settings && Object.prototype.hasOwnProperty.call(settings, 'giftcard_taxonomy');
  const settingsGiftcardTaxonomy = hasGiftcardTaxonomy
    ? (settings?.giftcard_taxonomy || [])
    : DEFAULT_GIFTCARD_TAXONOMY;

  useEffect(() => {
    setSelectedCategory(normalizeCategory(category));
  }, [category]);

  useEffect(() => {
    loadProducts();
  }, [selectedCategory]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const q = search.trim();
      const url = selectedCategory
        ? `/products?category=${selectedCategory}${q ? `&q=${encodeURIComponent(q)}` : ''}`
        : `/products${q ? `?q=${encodeURIComponent(q)}` : ''}`;
      const response = await axiosInstance.get(url);
      setProducts(response.data);
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Error loading products');
    } finally {
      setLoading(false);
    }
  };

  const categoryLabels = {
    giftcard: 'Gift Cards',
    topup: 'Game Top-Up',
    subscription: 'Subscriptions',
    service: 'Services',
    crypto: 'Crypto',
  };

  const categories = (() => {
    const baseCategories = ['giftcard', 'topup', 'subscription', 'service'];
    const fromSettings = (settings?.product_categories || []).map(normalizeCategory);
    const fromProducts = products.map((p) => normalizeCategory(p.category));
    const unique = Array.from(new Set([...baseCategories, ...fromSettings, ...fromProducts].filter(Boolean)));
    if (selectedCategory && !unique.includes(selectedCategory)) {
      unique.push(selectedCategory);
    }
    const formatted = unique.map((value) => ({
      value,
      label: categoryLabels[value] || value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
    return [{ value: '', label: 'All' }, ...formatted];
  })();

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Group variants by parent_product_id so giftcards/topups show cleanly
  const groupedProducts = (() => {
    const groups = new Map();
    for (const p of products) {
      const groupId = p.parent_product_id || p.id;
      const group = groups.get(groupId) || { groupId, variants: [] };
      group.variants.push(p);
      groups.set(groupId, group);
    }

    // Representative: cheapest variant in group
    return Array.from(groups.values()).map(g => {
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
        _group_id: g.groupId
      };
    });
  })();

  const inferGiftcardCategory = (p) => {
    const name = (p?.name || '').toLowerCase();
    const category = normalizeGiftcardValue(p?.giftcard_category);
    if (category) return category;
    if (name.includes('amazon')) return 'Shopping';
    if (name.includes('itunes') || name.includes('app store') || name.includes('netflix') || name.includes('spotify') || name.includes('disney')) return 'Entertainment';
    if (name.includes('google play') || name.includes('steam') || name.includes('playstation') || name.includes('xbox')) return 'Gaming';
    return 'Other';
  };

  const giftcardSections = (() => {
    if (selectedCategory !== 'giftcard') return [];
    const catalogEntries = Array.isArray(settingsGiftcardTaxonomy)
      ? settingsGiftcardTaxonomy
          .map((item) => ({
            name: String(item?.name || '').trim(),
            subcategories: Array.isArray(item?.subcategories) ? item.subcategories.filter(Boolean) : []
          }))
          .filter((item) => item.name)
      : [];
    const catalogMap = new Map();
    const catalogOrder = [];
    for (const entry of catalogEntries) {
      const key = normalizeGiftcardKey(entry.name);
      if (!key || catalogMap.has(key)) continue;
      catalogMap.set(key, entry);
      catalogOrder.push(key);
    }

    const sectionMap = new Map();
    for (const [key, entry] of catalogMap.entries()) {
      sectionMap.set(key, {
        name: entry.name,
        products: [],
        subcategoryMap: new Map(),
        subcategoryLabels: new Map(),
        expectedSubcategories: entry.subcategories || []
      });
    }

    for (const p of groupedProducts) {
      const categoryName = normalizeGiftcardValue(p?.giftcard_category) || inferGiftcardCategory(p);
      const sectionKey = normalizeGiftcardKey(categoryName || 'Other');
      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, {
          name: categoryName || 'Other',
          products: [],
          subcategoryMap: new Map(),
          subcategoryLabels: new Map(),
          expectedSubcategories: []
        });
      }
      const entry = sectionMap.get(sectionKey);
      entry.products.push(p);
      const subcategory = normalizeGiftcardValue(p?.giftcard_subcategory);
      if (subcategory) {
        const subKey = normalizeGiftcardKey(subcategory);
        if (!entry.subcategoryMap.has(subKey)) {
          entry.subcategoryMap.set(subKey, []);
          entry.subcategoryLabels.set(subKey, subcategory);
        }
        entry.subcategoryMap.get(subKey).push(p);
      }
    }

    for (const entry of sectionMap.values()) {
      (entry.expectedSubcategories || []).forEach((sub) => {
        const subKey = normalizeGiftcardKey(sub);
        if (!subKey) return;
        if (!entry.subcategoryMap.has(subKey)) {
          entry.subcategoryMap.set(subKey, []);
        }
        if (!entry.subcategoryLabels.has(subKey)) {
          entry.subcategoryLabels.set(subKey, sub);
        }
      });

      const hasSubcategories = entry.subcategoryMap.size > 0;
      if (hasSubcategories) {
        const uncategorized = entry.products.filter((p) => !normalizeGiftcardValue(p?.giftcard_subcategory));
        if (uncategorized.length) {
          const otherKey = normalizeGiftcardKey('Other');
          const existing = entry.subcategoryMap.get(otherKey) || [];
          entry.subcategoryMap.set(otherKey, [...existing, ...uncategorized]);
          if (!entry.subcategoryLabels.has(otherKey)) {
            entry.subcategoryLabels.set(otherKey, 'Other');
          }
        }
      }
    }

    const buildSubSections = (entry) => {
      if (entry.subcategoryMap.size === 0) {
        return { ...entry, subSections: [] };
      }
      const orderedKeys = [];
      const expectedKeys = (entry.expectedSubcategories || []).map((sub) => normalizeGiftcardKey(sub));
      expectedKeys.forEach((key) => {
        if (entry.subcategoryMap.has(key) && !orderedKeys.includes(key)) {
          orderedKeys.push(key);
        }
      });
      const otherKey = normalizeGiftcardKey('Other');
      const extras = Array.from(entry.subcategoryMap.keys()).filter((key) => !orderedKeys.includes(key));
      extras.sort((a, b) => {
        if (a === otherKey) return 1;
        if (b === otherKey) return -1;
        const nameA = entry.subcategoryLabels.get(a) || a;
        const nameB = entry.subcategoryLabels.get(b) || b;
        return nameA.localeCompare(nameB);
      });
      const subSections = [...orderedKeys, ...extras].map((key) => ({
        name: entry.subcategoryLabels.get(key) || key,
        products: entry.subcategoryMap.get(key) || []
      }));
      return { ...entry, subSections };
    };

    const defaultOrderKeys = DEFAULT_GIFTCARD_CATEGORIES.map(normalizeGiftcardKey);
    const baseOrder = catalogOrder.length ? catalogOrder : defaultOrderKeys;
    const orderedSections = baseOrder.filter((key) => sectionMap.has(key));
    const remainingKeys = Array.from(sectionMap.keys()).filter((key) => !orderedSections.includes(key));
    const otherKey = normalizeGiftcardKey('Other');
    remainingKeys.sort((a, b) => {
      if (a === otherKey) return 1;
      if (b === otherKey) return -1;
      const nameA = sectionMap.get(a)?.name || a;
      const nameB = sectionMap.get(b)?.name || b;
      return nameA.localeCompare(nameB);
    });
    return [...orderedSections, ...remainingKeys].map((key) => buildSubSections(sectionMap.get(key)));
  })();

  const selectedCategoryLabel = categories.find((cat) => cat.value === selectedCategory)?.label || 'All';

  const renderProductCard = (product) => (
    <Card key={product.id} className="product-card overflow-hidden bg-white/10 backdrop-blur-lg border-white/20 hover:border-white/40" data-testid={`product-card-${product.id}`}>
      <div className="h-48 bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <Package className="text-white" size={64} />
        )}
      </div>
      <CardContent className="p-4">
        <h3 className="text-lg font-bold text-white mb-2">{product.name}</h3>
        <p className="text-white/70 text-sm mb-2 line-clamp-2">{product.description}</p>
        {product.category === 'giftcard' && product.giftcard_subcategory && (
          <p className="text-white/60 text-xs mb-2">{product.giftcard_subcategory}</p>
        )}
        <div className="flex items-center justify-between mb-3">
          <span className="text-2xl font-bold text-white">
            {product._variant_count > 1 ? `From $${Number(product._min_price).toFixed(2)}` : `$${Number(product.price).toFixed(2)}`}
          </span>
          {product.stock_available ? (
            <span className="text-xs text-green-400 bg-green-400/20 px-2 py-1 rounded">Available</span>
          ) : (
            <span className="text-xs text-red-400 bg-red-400/20 px-2 py-1 rounded">Out of Stock</span>
          )}
        </div>
        <div className="flex items-center justify-between text-white/60 text-xs mb-3">
          <span>{Math.max(0, Math.floor(Number(product._orders_count) || 0))} orders</span>
          {product._variant_count > 1 && <span>{product._variant_count} options available</span>}
        </div>
        <div className="flex gap-2">
          <Link to={`/product/${product.id}`} className="flex-1">
            <Button size="sm" variant="outline" className="w-full border-white text-white hover:bg-white/10" data-testid={`view-btn-${product.id}`}>
              Details
            </Button>
          </Link>
          <Button 
            size="sm" 
            className="bg-white text-purple-600 hover:bg-gray-100"
            onClick={() => {
              addToCart(product);
              toast.success('Product added to cart');
            }}
            data-testid={`add-to-cart-${product.id}`}
          >
            <ShoppingCart size={16} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-3" data-testid="products-title">
          {selectedCategory ? `${selectedCategoryLabel} Products` : 'All Products'}
        </h1>
        <p className="text-center text-white/70 mb-8">Find the best digital deals instantly.</p>

        {/* Search */}
        <div className="max-w-xl mx-auto mb-6">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                loadProducts();
              }
            }}
            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
            placeholder="Search products..."
          />
          <div className="flex gap-2 justify-center mt-3">
            <Button type="button" className="bg-white text-purple-600 hover:bg-gray-100" onClick={loadProducts}>
              Search
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/20 text-white"
              onClick={() => {
                setSearch('');
                setTimeout(() => loadProducts(), 0);
              }}
            >
              Clear
            </Button>
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-3 justify-center mb-12">
          {categories.map((cat) => (
            <Button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              variant={selectedCategory === cat.value ? 'default' : 'outline'}
              className={selectedCategory === cat.value 
                ? 'bg-white text-purple-600 hover:bg-gray-100' 
                : 'border-white text-white hover:bg-white/10'
              }
              data-testid={`filter-${cat.value || 'all'}`}
            >
              {cat.label}
            </Button>
          ))}
        </div>

        {/* Products */}
        {loading ? (
          <div className="text-center text-white text-xl">Loading products...</div>
        ) : selectedCategory === 'giftcard' && giftcardSections.length > 0 ? (
          <div className="space-y-10" data-testid="giftcard-sections">
            {giftcardSections.map((section) => (
              <div key={section.name}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl md:text-3xl font-bold text-white">{section.name}</h2>
                  <span className="text-white/60 text-sm">{section.products.length} items</span>
                </div>
                {section.subSections.length > 0 ? (
                  <div className="space-y-6">
                    {section.subSections.map((subSection) => (
                      <div key={`${section.name}-${subSection.name}`}>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-xl md:text-2xl font-semibold text-white">{subSection.name}</h3>
                          <span className="text-white/60 text-sm">{subSection.products.length} items</span>
                        </div>
                        {subSection.products.length ? (
                          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                            {subSection.products.map(renderProductCard)}
                          </div>
                        ) : (
                          <p className="text-white/50 text-sm">No products yet.</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  section.products.length ? (
                    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                      {section.products.map(renderProductCard)}
                    </div>
                  ) : (
                    <p className="text-white/50 text-sm">No products yet.</p>
                  )
                )}
              </div>
            ))}
          </div>
        ) : groupedProducts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6" data-testid="products-grid">
            {groupedProducts.map(renderProductCard)}
          </div>
        ) : (
          <div className="text-center text-white/70 py-12" data-testid="no-products">
            <Package className="mx-auto mb-4" size={64} />
            <p>No products available in this category</p>
          </div>
        )}
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default ProductsPage;
