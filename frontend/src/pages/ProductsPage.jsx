import { useEffect, useState, useContext } from 'react';
import { Link, useParams } from 'react-router-dom';
import { axiosInstance, LanguageContext } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Gift, Package, ShoppingCart, Heart, Star, Search } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeOrdersCount } from '../utils/ordersCount';

const DEFAULT_GIFTCARD_CATEGORIES = ['Shopping', 'Gaming', 'Entertainment', 'Food', 'Travel', 'Other'];
const DEFAULT_GIFTCARD_TAXONOMY = DEFAULT_GIFTCARD_CATEGORIES.map((name) => ({
  name,
  subcategories: []
}));

const ProductsPage = ({ user, logout, addToCart, cart, settings }) => {
  const { t } = useContext(LanguageContext);
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
    <Link to={`/product/${product.slug || product.id}`} key={product.id}>
      <div className="rounded-xl bg-[#141414] border border-white/5 overflow-hidden hover:border-green-500/30 transition group" data-testid={`product-card-${product.id}`}>
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
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-green-500/10 to-transparent" />
        <div className="relative container mx-auto px-4 py-10 lg:py-14">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-green-400 text-sm font-semibold mb-2">Unlimited Offer</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4" data-testid="products-title">
              {selectedCategory ? `${selectedCategoryLabel}` : 'All Products'}
            </h1>
            <p className="text-white/50 text-sm md:text-base mb-6">Find the best digital deals instantly.</p>
          </div>

          {/* Search */}
          <div className="max-w-xl mx-auto">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <Search size={18} className="text-white/40 ml-4" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    loadProducts();
                  }
                }}
                placeholder="Search products..."
                className="flex-1 bg-transparent px-3 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
              />
              <button
                type="button"
                onClick={loadProducts}
                className="bg-green-500 hover:bg-green-600 text-black font-semibold px-5 py-3 text-sm transition"
              >
                Search
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="container mx-auto px-4 pb-4">
        <div className="flex flex-wrap gap-2 justify-center">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                selectedCategory === cat.value
                  ? 'bg-green-500 text-black'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'
              }`}
              data-testid={`filter-${cat.value || 'all'}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Products */}
      {loading ? (
        <div className="text-center text-white/40 text-lg py-20">{t('loading')}</div>
      ) : selectedCategory === 'giftcard' && giftcardSections.length > 0 ? (
        <div data-testid="giftcard-sections">
          {giftcardSections.map((section) => (
            <div key={section.name} className="container mx-auto px-4 py-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-green-400 text-sm font-semibold mb-1">Unlimited Offer</p>
                  <h2 className="text-2xl md:text-3xl font-bold text-white">{section.name}</h2>
                </div>
                <span className="text-white/40 text-sm">{section.products.length} items</span>
              </div>
              {section.subSections.length > 0 ? (
                <div className="space-y-6">
                  {section.subSections.map((subSection) => (
                    <div key={`${section.name}-${subSection.name}`}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xl md:text-2xl font-semibold text-white">{subSection.name}</h3>
                        <span className="text-white/40 text-sm">{subSection.products.length} items</span>
                      </div>
                      {subSection.products.length ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="products-grid">
            {groupedProducts.map(renderProductCard)}
          </div>
        </div>
      ) : (
        <div className="text-center text-white/40 text-lg py-20" data-testid="no-products">
          No products available in this category
        </div>
      )}

      <Footer settings={settings} />
    </div>
  );
};

export default ProductsPage;
