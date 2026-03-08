import { useEffect, useMemo, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Package, Plus, Edit2, Trash2, Key } from 'lucide-react';
import { toast } from 'sonner';
import ProductCodesManager from '../components/ProductCodesManager';

const SUBSCRIPTION_DURATION_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const DEFAULT_CATEGORIES = ['topup', 'giftcard', 'subscription', 'service'];
const DEFAULT_GIFTCARD_CATEGORIES = ['Shopping', 'Gaming', 'Entertainment', 'Food', 'Travel', 'Other'];
const DEFAULT_GIFTCARD_TAXONOMY = DEFAULT_GIFTCARD_CATEGORIES.map((name) => ({
  name,
  subcategories: []
}));

const formatSubscriptionDurationLabel = (months) => {
  const value = Number(months);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value === 12) return '1 Year';
  return `${value} ${value === 1 ? 'Month' : 'Months'}`;
};

const normalizeSubscriptionDuration = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const normalizeCategoryValue = (value) => String(value || '').trim();
const normalizeGiftcardValue = (value) => String(value || '').trim();

const formatCategoryLabel = (value) => (
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
);

const AdminProducts = ({ user, logout, settings }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    seo_title: '',
    seo_description: '',
    category: 'topup',
    price: '',
    image_url: '',
    stock_available: true,
    delivery_type: 'manual',
    requires_player_id: false,
    requires_credentials: false,
    player_id_label: 'Player ID',
    credential_fields: ['email', 'password'],
    region: '',
    giftcard_category: '',
    giftcard_subcategory: '',
    is_subscription: false,
    subscription_duration_months: '',
    variant_name: '',
    parent_product_id: null,
    is_variant: false
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showVariantMode, setShowVariantMode] = useState(false);
  const [parentProduct, setParentProduct] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [codesProduct, setCodesProduct] = useState(null);
  const [codesDialogOpen, setCodesDialogOpen] = useState(false);

  const categoryOptions = (() => {
    const fromSettings = (settings?.product_categories || []).map(normalizeCategoryValue);
    const fromProducts = products.map((product) => normalizeCategoryValue(product.category));
    const combined = [...DEFAULT_CATEGORIES, ...fromSettings, ...fromProducts].filter(Boolean);
    const seen = new Set();
    return combined.reduce((acc, value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return acc;
      seen.add(key);
      acc.push({ value, label: formatCategoryLabel(value) });
      return acc;
    }, []);
  })();

  const hasGiftcardTaxonomy = settings && Object.prototype.hasOwnProperty.call(settings, 'giftcard_taxonomy');
  const settingsGiftcardTaxonomy = hasGiftcardTaxonomy
    ? (settings?.giftcard_taxonomy || [])
    : DEFAULT_GIFTCARD_TAXONOMY;

  const giftcardCategoryOptions = (() => {
    const fromSettings = Array.isArray(settingsGiftcardTaxonomy)
      ? settingsGiftcardTaxonomy.map((item) => normalizeGiftcardValue(item?.name)).filter(Boolean)
      : [];
    const fromProducts = products
      .map((product) => normalizeGiftcardValue(product.giftcard_category))
      .filter(Boolean);
    const combined = [...fromSettings, ...fromProducts].filter(Boolean);
    const seen = new Set();
    return combined.reduce((acc, value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return acc;
      seen.add(key);
      acc.push(value);
      return acc;
    }, []);
  })();

  const giftcardSubcategoryOptions = (() => {
    const selectedCategory = normalizeGiftcardValue(formData.giftcard_category).toLowerCase();
    const fromSettings = (() => {
      if (!Array.isArray(settingsGiftcardTaxonomy)) return [];
      if (!selectedCategory) {
        return settingsGiftcardTaxonomy.flatMap((item) => item?.subcategories || []);
      }
      const match = settingsGiftcardTaxonomy.find(
        (item) => normalizeGiftcardValue(item?.name).toLowerCase() === selectedCategory
      );
      return match?.subcategories || [];
    })();
    const fromProducts = products
      .filter((product) => {
        if (!selectedCategory) return true;
        return normalizeGiftcardValue(product.giftcard_category).toLowerCase() === selectedCategory;
      })
      .map((product) => normalizeGiftcardValue(product.giftcard_subcategory))
      .filter(Boolean);
    const seen = new Set();
    return [...fromSettings, ...fromProducts].filter(Boolean).reduce((acc, value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return acc;
      seen.add(key);
      acc.push(value);
      return acc;
    }, []);
  })();

  const categoryLabelMap = categoryOptions.reduce((map, option) => {
    map.set(option.value, option.label);
    return map;
  }, new Map());

  const getCategoryLabel = (value) => (
    categoryLabelMap.get(value) || formatCategoryLabel(value)
  );

  const defaultCategory = categoryFilter !== 'all'
    ? categoryFilter
    : (categoryOptions[0]?.value || 'topup');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await axiosInstance.get('/products');
      setProducts(response.data);
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Error loading products');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-detect requirements based on product name or category
      if (field === 'name' || field === 'category') {
        const { detectProductRequirements } = require('../utils/gameConfig');
        const requirements = detectProductRequirements(
          field === 'name' ? value : prev.name,
          field === 'category' ? value : prev.category
        );
        
        updated.requires_player_id = requirements.requiresPlayerId;
        updated.requires_credentials = requirements.requiresCredentials;
        updated.player_id_label = requirements.playerIdLabel || 'Player ID';
        updated.credential_fields = requirements.credentialFields || ['email', 'password'];
      }

      if (field === 'category' && value !== 'subscription' && !prev.is_subscription) {
        updated.subscription_duration_months = '';
      }

      if (field === 'category' && value !== 'giftcard') {
        updated.giftcard_category = '';
        updated.giftcard_subcategory = '';
      }

      if (field === 'giftcard_category') {
        if (!value || value !== prev.giftcard_category) {
          updated.giftcard_subcategory = '';
        }
      }

      if (field === 'is_subscription' && !value && updated.category !== 'subscription') {
        updated.subscription_duration_months = '';
      }

      if (field === 'subscription_duration_months') {
        const autoLabel = formatSubscriptionDurationLabel(value);
        const previousAutoLabel = formatSubscriptionDurationLabel(prev.subscription_duration_months);
        if (!prev.variant_name || prev.variant_name === previousAutoLabel) {
          updated.variant_name = autoLabel;
        }
      }
      
      return updated;
    });
  };

  const uploadImage = async (file) => {
    if (!file) return null;
    // 5MB limit (matches other pages)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB');
      return null;
    }

    setUploadingImage(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await axiosInstance.post('/upload/image', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data?.url || null;
    } catch (e) {
      console.error('Image upload failed:', e);
      toast.error('Error uploading image');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.price) {
      toast.error('Please fill required fields');
      return;
    }

    const durationMonths = normalizeSubscriptionDuration(formData.subscription_duration_months);
    const inferredVariantLabel = formData.variant_name || (durationMonths ? formatSubscriptionDurationLabel(durationMonths) : '');
    const parent = formData.is_variant
      ? (parentProduct || products.find((p) => p.id === formData.parent_product_id))
      : null;

    if (formData.is_variant && !formData.parent_product_id) {
      toast.error('Select a parent product for this variant');
      return;
    }
    if (formData.is_variant && !inferredVariantLabel) {
      toast.error('Variant name is required');
      return;
    }

    try {
      const payload = {
        ...formData,
        price: parseFloat(formData.price),
        subscription_duration_months: durationMonths,
        variant_name: inferredVariantLabel,
        seo_title: (formData.seo_title || '').trim(),
        seo_description: (formData.seo_description || '').trim()
      };

      if (parent) {
        payload.name = parent.name;
        payload.description = parent.description;
        payload.category = parent.category;
        payload.image_url = parent.image_url || '';
        payload.delivery_type = parent.delivery_type;
        payload.stock_available = parent.stock_available;
        payload.requires_player_id = parent.requires_player_id || false;
        payload.player_id_label = parent.player_id_label || 'Player ID';
        payload.requires_credentials = parent.requires_credentials || false;
        payload.credential_fields = parent.credential_fields && parent.credential_fields.length > 0
          ? parent.credential_fields
          : ['email', 'password'];
        payload.region = parent.region || '';
        payload.giftcard_category = parent.giftcard_category || '';
        payload.giftcard_subcategory = parent.giftcard_subcategory || '';
        payload.is_subscription = parent.is_subscription || false;
        payload.seo_title = (parent.seo_title || '').trim();
        payload.seo_description = (parent.seo_description || '').trim();
      }

      if (editingProduct) {
        await axiosInstance.put(`/products/${editingProduct.id}`, payload);
        toast.success('Product updated!');
      } else {
        await axiosInstance.post('/products', payload);
        toast.success('Product created!');
      }

      setDialogOpen(false);
      resetForm();
      loadProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('Error saving product');
    }
  };

  const handleEdit = (product) => {
    const parent = product.parent_product_id
      ? products.find((p) => p.id === product.parent_product_id)
      : null;
    setParentProduct(parent);
    setEditingProduct(product);
    setShowVariantMode(!!product.parent_product_id);
    setFormData({
      name: parent?.name || product.name,
      description: parent?.description || product.description,
      seo_title: parent?.seo_title || product.seo_title || '',
      seo_description: parent?.seo_description || product.seo_description || '',
      category: parent?.category || product.category,
      price: product.price?.toString?.() || '',
      image_url: parent?.image_url || product.image_url || '',
      stock_available: parent?.stock_available ?? product.stock_available ?? true,
      delivery_type: parent?.delivery_type || product.delivery_type,
      requires_player_id: parent?.requires_player_id ?? product.requires_player_id ?? false,
      player_id_label: parent?.player_id_label || product.player_id_label || 'Player ID',
      requires_credentials: parent?.requires_credentials ?? product.requires_credentials ?? false,
      credential_fields: parent?.credential_fields && parent?.credential_fields.length > 0
        ? parent.credential_fields
        : (product.credential_fields && product.credential_fields.length > 0 ? product.credential_fields : ['email', 'password']),
      region: parent?.region || product.region || '',
      giftcard_category: parent?.giftcard_category || product.giftcard_category || '',
      giftcard_subcategory: parent?.giftcard_subcategory || product.giftcard_subcategory || '',
      is_subscription: parent?.is_subscription ?? product.is_subscription ?? false,
      subscription_duration_months: product.subscription_duration_months ? String(product.subscription_duration_months) : '',
      variant_name: product.variant_name || '',
      parent_product_id: product.parent_product_id || null,
      is_variant: !!product.parent_product_id
    });
    setDialogOpen(true);
  };

  const handleDelete = async (productId) => {
    if (!window.confirm('Delete this product?')) return;

    try {
      await axiosInstance.delete(`/products/${productId}`);
      toast.success('Product deleted!');
      loadProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Error deleting product');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      seo_title: '',
      seo_description: '',
      category: defaultCategory,
      price: '',
      image_url: '',
      stock_available: true,
      delivery_type: 'manual',
      requires_player_id: false,
      requires_credentials: false,
      player_id_label: 'Player ID',
      credential_fields: ['email', 'password'],
      region: '',
      giftcard_category: '',
      giftcard_subcategory: '',
      is_subscription: false,
      subscription_duration_months: '',
      variant_name: '',
      parent_product_id: null,
      is_variant: false
    });
    setEditingProduct(null);
    setShowVariantMode(false);
    setParentProduct(null);
  };

  const showSubscriptionDuration = formData.category === 'subscription' || formData.is_subscription;
  const isVariantForm = formData.is_variant || showVariantMode;
  const productById = products.reduce((map, product) => {
    map.set(product.id, product);
    return map;
  }, new Map());

  const groupedProducts = useMemo(() => {
    const groups = new Map();
    for (const product of products) {
      const groupId = product.parent_product_id || product.id;
      const group = groups.get(groupId) || { groupId, parent: null, variants: [] };
      group.variants.push(product);
      if (!product.parent_product_id && !product.is_variant) {
        group.parent = product;
      }
      groups.set(groupId, group);
    }
    return Array.from(groups.values()).map((group) => {
      const sorted = [...group.variants].sort((a, b) => (a.price || 0) - (b.price || 0));
      const parent = group.parent || sorted[0];
      return {
        ...group,
        parent,
        variants: sorted
      };
    });
  }, [products]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupedProducts
      .filter((group) => {
        if (categoryFilter === 'all') return true;
        return group.parent?.category === categoryFilter;
      })
      .filter((group) => {
        if (!q) return true;
        const hay = group.variants
          .map((product) => [
            product.name,
            product.description,
            product.seo_title,
            product.seo_description,
            product.category,
            product.variant_name,
            product.region,
            product.giftcard_category,
            product.giftcard_subcategory
          ]
            .filter(Boolean)
            .join(' '))
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
  }, [groupedProducts, categoryFilter, search]);

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const getVariantLabel = (variant) => {
    if (!variant) return '';
    if (variant.variant_name) return variant.variant_name;
    if (variant.subscription_duration_months) {
      return formatSubscriptionDurationLabel(variant.subscription_duration_months);
    }
    return 'Variant';
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-12">
        {/* Header Section - Mobile Responsive */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white" data-testid="products-title">
              Manage Products
            </h1>
            <Button 
              onClick={() => window.location.href = '/admin'}
              className="bg-green-500 text-white px-4 py-2 sm:px-6 sm:py-3 text-sm sm:text-base w-full sm:w-auto"
            >
              🏠 Admin Home
            </Button>
          </div>
          
          {/* Action Buttons - Stack on Mobile */}
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <div className="flex flex-col sm:flex-row gap-2">
              <DialogTrigger asChild>
                <Button
                  className="bg-green-500 text-white w-full sm:w-auto text-sm sm:text-base"
                  data-testid="add-product-btn"
                  onClick={() => {
                    resetForm();
                  }}
                >
                  <Plus size={18} className="mr-2 sm:mr-2" />
                  <span className="hidden sm:inline">Add New Product</span>
                  <span className="sm:hidden">Add Product</span>
                </Button>
              </DialogTrigger>
              
              <DialogTrigger asChild>
                <Button 
                  className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white w-full sm:w-auto text-sm sm:text-base"
                  onClick={() => {
                    resetForm();
                    setShowVariantMode(true);
                  }}
                >
                  <Plus size={18} className="mr-2 sm:mr-2" />
                  <span className="hidden sm:inline">Add Product Variant</span>
                  <span className="sm:hidden">Add Variant</span>
                </Button>
              </DialogTrigger>
            </div>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border-white/20 w-[95vw] sm:w-full">
              <DialogHeader>
                <DialogTitle className="text-white text-lg sm:text-xl">
                  {editingProduct ? 'Edit Product' : (showVariantMode ? 'Add Product Variant' : 'Add New Product')}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4 px-1 sm:px-4">
                {/* Variant Mode: Select Parent Product */}
                {showVariantMode && !editingProduct && (
                  <div className="p-4 bg-cyan-500/10 border border-green-500/30 rounded-lg">
                    <Label className="text-white mb-2 block">Select Parent Product</Label>
                    <Select onValueChange={(value) => {
                      const parent = products.find(p => p.id === value);
                      setParentProduct(parent);
                      setFormData(prev => ({
                        ...prev,
                        parent_product_id: value,
                        is_variant: true,
                        name: parent?.name || '',
                        description: parent?.description || '',
                        seo_title: parent?.seo_title || '',
                        seo_description: parent?.seo_description || '',
                        category: parent?.category || defaultCategory,
                        image_url: parent?.image_url || '',
                        delivery_type: parent?.delivery_type || 'manual',
                        stock_available: parent?.stock_available ?? true,
                        requires_player_id: parent?.requires_player_id || false,
                        player_id_label: parent?.player_id_label || 'Player ID',
                        requires_credentials: parent?.requires_credentials || false,
                        credential_fields: parent?.credential_fields && parent.credential_fields.length > 0
                          ? parent.credential_fields
                          : ['email', 'password'],
                        region: parent?.region || '',
                        giftcard_category: parent?.giftcard_category || '',
                        giftcard_subcategory: parent?.giftcard_subcategory || '',
                        is_subscription: parent?.is_subscription || false,
                        subscription_duration_months: ''
                      }));
                    }}>
                      <SelectTrigger className="bg-white/10 border-white/20 text-white">
                        <SelectValue placeholder="Choose parent product..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(products.filter(p => !p.is_variant && !p.parent_product_id && (
                          categoryFilter === 'all' || p.category === categoryFilter
                        )).length
                          ? products.filter(p => !p.is_variant && !p.parent_product_id && (
                              categoryFilter === 'all' || p.category === categoryFilter
                            ))
                          : products.filter(p => !p.is_variant && !p.parent_product_id)
                        ).map(product => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} ({getCategoryLabel(product.category)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {parentProduct && (
                      <p className="text-green-300 text-sm mt-2">
                        Creating variant for: <strong>{parentProduct.name}</strong>
                      </p>
                    )}
                    <p className="text-white/60 text-xs mt-2">
                      Variants inherit name, category, and delivery settings from the parent. Only variant label and price change.
                    </p>
                  </div>
                )}
                
                <div>
                  <Label htmlFor="name" className="text-white">
                    {showVariantMode ? 'Product Name (inherited from parent)' : 'Name'}
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="bg-white/10 border-white/20 text-white"
                    data-testid="product-name"
                    disabled={isVariantForm}
                  />
                </div>

                <div>
                  <Label htmlFor="description" className="text-white">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    className="bg-white/10 border-white/20 text-white"
                    rows={3}
                    disabled={isVariantForm}
                  />
                </div>

                <div>
                  <Label htmlFor="seo_title" className="text-white">
                    SEO Title
                  </Label>
                  <Input
                    id="seo_title"
                    value={formData.seo_title}
                    onChange={(e) => handleChange('seo_title', e.target.value)}
                    className="bg-white/10 border-white/20 text-white"
                    placeholder="e.g., Buy Amazon Gift Card Online | KayiCom"
                    disabled={isVariantForm}
                  />
                  <p className="text-white/60 text-xs mt-1">
                    Recommended: around 50-60 characters.
                  </p>
                </div>

                <div>
                  <Label htmlFor="seo_description" className="text-white">
                    SEO Description
                  </Label>
                  <Textarea
                    id="seo_description"
                    value={formData.seo_description}
                    onChange={(e) => handleChange('seo_description', e.target.value)}
                    className="bg-white/10 border-white/20 text-white"
                    rows={3}
                    placeholder="Short product summary for Google results..."
                    disabled={isVariantForm}
                  />
                  <p className="text-white/60 text-xs mt-1">
                    Recommended: around 140-160 characters.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category" className="text-white">Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => handleChange('category', value)}
                      disabled={isVariantForm}
                    >
                      <SelectTrigger className="bg-white/10 border-white/20 text-white" data-testid="product-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="price" className="text-white">Price</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => handleChange('price', e.target.value)}
                      className="bg-white/10 border-white/20 text-white"
                      data-testid="product-price"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="variant_name" className="text-white">Variant Name (e.g., "100 Diamonds", "US $25")</Label>
                  <Input
                    id="variant_name"
                    value={formData.variant_name}
                    onChange={(e) => handleChange('variant_name', e.target.value)}
                    className="bg-white/10 border-white/20 text-white"
                    placeholder="Optional"
                  />
                </div>

                {showSubscriptionDuration && (
                  <div>
                    <Label htmlFor="subscription_duration_months" className="text-white">Subscription Duration</Label>
                    <Select
                      value={formData.subscription_duration_months || ''}
                      onValueChange={(value) => handleChange('subscription_duration_months', value)}
                    >
                      <SelectTrigger className="bg-white/10 border-white/20 text-white">
                        <SelectValue placeholder="Select duration..." />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBSCRIPTION_DURATION_OPTIONS.map((months) => (
                          <SelectItem key={months} value={String(months)}>
                            {formatSubscriptionDurationLabel(months)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-white/60 text-xs mt-2">Supports 1-12 months (12 months = 1 year).</p>
                  </div>
                )}

                <div>
                  <Label htmlFor="region" className="text-white">Region (for Gift Cards)</Label>
                  <Input
                    id="region"
                    value={formData.region}
                    onChange={(e) => handleChange('region', e.target.value)}
                    className="bg-white/10 border-white/20 text-white"
                    placeholder="e.g., US, EU, ASIA"
                    disabled={isVariantForm}
                  />
                </div>

                {formData.category === 'giftcard' && (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="giftcard_category" className="text-white">Gift Card Category</Label>
                      <Input
                        id="giftcard_category"
                        value={formData.giftcard_category}
                        onChange={(e) => handleChange('giftcard_category', e.target.value)}
                        className="bg-white/10 border-white/20 text-white mt-2"
                        placeholder="e.g., Shopping, Gaming"
                        list="giftcard-category-options"
                        disabled={isVariantForm}
                      />
                      <datalist id="giftcard-category-options">
                        {giftcardCategoryOptions.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                      <p className="text-white/60 text-xs mt-2">You can select or type a new category.</p>
                      {giftcardCategoryOptions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {giftcardCategoryOptions.map((option) => (
                            <Button
                              key={`giftcard-category-${option}`}
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-green-400 text-green-200 hover:bg-green-400/10 text-xs"
                              onClick={() => handleChange('giftcard_category', option)}
                              disabled={isVariantForm}
                            >
                              {option}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="giftcard_subcategory" className="text-white">Gift Card Subcategory (optional)</Label>
                      <Input
                        id="giftcard_subcategory"
                        value={formData.giftcard_subcategory}
                        onChange={(e) => handleChange('giftcard_subcategory', e.target.value)}
                        className="bg-white/10 border-white/20 text-white mt-2"
                        placeholder="e.g., Amazon, Steam, Netflix"
                        list="giftcard-subcategory-options"
                        disabled={isVariantForm}
                      />
                      <datalist id="giftcard-subcategory-options">
                        {giftcardSubcategoryOptions.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                      <p className="text-white/60 text-xs mt-2">Use this to create subcategories under a category.</p>
                      {giftcardSubcategoryOptions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {giftcardSubcategoryOptions.map((option) => (
                            <Button
                              key={`giftcard-subcategory-${option}`}
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-cyan-400 text-cyan-200 hover:bg-cyan-400/10 text-xs"
                              onClick={() => handleChange('giftcard_subcategory', option)}
                              disabled={isVariantForm}
                            >
                              {option}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="image_url" className="text-white">Image URL</Label>
                  <Input
                    id="image_url"
                    value={formData.image_url}
                    onChange={(e) => handleChange('image_url', e.target.value)}
                    className="bg-white/10 border-white/20 text-white"
                    placeholder="Or upload image below"
                    disabled={isVariantForm}
                  />
                </div>

                <div>
                  <Label htmlFor="image_file" className="text-white">Or Upload Image</Label>
                  <Input
                    id="image_file"
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      const url = await uploadImage(file);
                      if (url) {
                        handleChange('image_url', url);
                        toast.success('Image uploaded');
                      }
                    }}
                    className="bg-white/10 border-white/20 text-white cursor-pointer"
                    disabled={uploadingImage || isVariantForm}
                  />
                  {uploadingImage && (
                    <p className="text-white/60 text-sm mt-2">Uploading...</p>
                  )}
                  {formData.image_url && (
                    <div className="mt-2">
                      <img src={formData.image_url} alt="Preview" className="w-32 h-32 object-cover rounded" />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="delivery_type" className="text-white">Delivery Type</Label>
                    <Select
                      value={formData.delivery_type}
                      onValueChange={(value) => handleChange('delivery_type', value)}
                      disabled={isVariantForm}
                    >
                      <SelectTrigger data-testid="product-delivery-select" className="bg-white/10 border-white/20 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="automatic">Automatic</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2 sm:pt-8">
                    <Checkbox
                      id="stock"
                      checked={formData.stock_available}
                      onCheckedChange={(checked) => handleChange('stock_available', checked)}
                      disabled={isVariantForm}
                    />
                    <Label htmlFor="stock" className="text-white">In Stock</Label>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="requires_player_id"
                      checked={formData.requires_player_id}
                      onCheckedChange={(checked) => handleChange('requires_player_id', checked)}
                      disabled={isVariantForm}
                    />
                    <Label htmlFor="requires_player_id" className="text-white text-sm sm:text-base">Requires Player ID</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="requires_credentials"
                      checked={formData.requires_credentials}
                      onCheckedChange={(checked) => handleChange('requires_credentials', checked)}
                      disabled={isVariantForm}
                    />
                    <Label htmlFor="requires_credentials" className="text-white text-sm sm:text-base">Requires Credentials</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_subscription"
                      checked={formData.is_subscription}
                      onCheckedChange={(checked) => handleChange('is_subscription', checked)}
                      disabled={isVariantForm}
                    />
                    <Label htmlFor="is_subscription" className="text-white text-sm sm:text-base">Is Subscription (for referral)</Label>
                  </div>
                </div>

                {/* Credential Fields Configuration */}
                {formData.requires_credentials && (
                  <div className="p-4 bg-cyan-500/10 border border-green-500/30 rounded-lg">
                    <Label className="text-white mb-2 block">Credential Fields Required</Label>
                    <p className="text-white/70 text-xs mb-3">
                      Specify which credential fields customers need to provide (e.g., email, password, username)
                    </p>
                    <div className="space-y-2">
                      {formData.credential_fields && formData.credential_fields.length > 0 ? (
                        formData.credential_fields.map((field, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Input
                              value={field}
                              onChange={(e) => {
                                const newFields = [...formData.credential_fields];
                                newFields[idx] = e.target.value;
                                handleChange('credential_fields', newFields);
                              }}
                              className="bg-white/10 border-white/20 text-white text-sm"
                              placeholder="e.g., email, password"
                              disabled={isVariantForm}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-red-400 text-red-400 hover:bg-red-400/10"
                              onClick={() => {
                                const newFields = formData.credential_fields.filter((_, i) => i !== idx);
                                handleChange('credential_fields', newFields.length > 0 ? newFields : ['email', 'password']);
                              }}
                              disabled={isVariantForm}
                            >
                              Remove
                            </Button>
                          </div>
                        ))
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-cyan-400 text-green-400 hover:bg-cyan-400/10 w-full"
                        onClick={() => {
                          handleChange('credential_fields', [...(formData.credential_fields || []), '']);
                        }}
                        disabled={isVariantForm}
                      >
                        + Add Field
                      </Button>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleSubmit}
                  className="w-full bg-white text-green-600 hover:bg-gray-100"
                  data-testid="save-product-btn"
                >
                  {editingProduct ? 'Update Product' : 'Create Product'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Category Filter - Mobile Responsive */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="w-full">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50 w-full text-sm sm:text-base"
              placeholder="Search products..."
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 sm:flex-wrap">
            <Button
              onClick={() => setCategoryFilter('all')}
              className={`${categoryFilter === 'all' ? 'bg-green-500' : 'bg-white/10'} text-white whitespace-nowrap text-xs sm:text-sm px-3 py-2`}
            >
              All ({groupedProducts.length})
            </Button>
            {categoryOptions.map((option) => {
              const count = groupedProducts.filter((group) => group.parent?.category === option.value).length;
              return (
                <Button
                  key={option.value}
                  onClick={() => setCategoryFilter(option.value)}
                  className={`${categoryFilter === option.value ? 'bg-green-500' : 'bg-white/10'} text-white whitespace-nowrap text-xs sm:text-sm px-3 py-2`}
                >
                  {option.label} ({count})
                </Button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="text-center text-white text-lg sm:text-xl py-12">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" data-testid="products-list">
            {filteredGroups.map((group) => {
              const product = group.parent;
              const variantEntries = group.variants.filter((item) => item.parent_product_id || item.is_variant);
              const minPrice = group.variants[0]?.price ?? product.price ?? 0;
              const maxPrice = group.variants[group.variants.length - 1]?.price ?? product.price ?? 0;
              const priceLabel = group.variants.length > 1
                ? `$${Number(minPrice).toFixed(2)} - $${Number(maxPrice).toFixed(2)}`
                : `$${Number(product.price).toFixed(2)}`;
              const isExpanded = !!expandedGroups[group.groupId];
              return (
                <Card key={group.groupId} className="glass-effect border-white/20 hover:border-white/40 transition" data-testid={`product-${group.groupId}`}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base sm:text-lg font-bold text-white mb-2 break-words">{product.name}</h3>
                        <p className="text-white/70 text-xs sm:text-sm mb-2 line-clamp-2">{product.description}</p>
                        <div className="space-y-1 text-xs sm:text-sm">
                          <p className="text-white/60">Category: <span className="text-white font-medium">{getCategoryLabel(product.category)}</span></p>
                          <p className="text-white/60">Price: <span className="text-white font-bold text-base">{priceLabel}</span></p>
                          {product.category === 'giftcard' && product.giftcard_category && (
                            <p className="text-white/60 text-xs">
                              Gift Card Category: <span className="text-white">{product.giftcard_category}</span>
                            </p>
                          )}
                          {product.category === 'giftcard' && product.giftcard_subcategory && (
                            <p className="text-white/60 text-xs">
                              Gift Card Subcategory: <span className="text-white">{product.giftcard_subcategory}</span>
                            </p>
                          )}
                          {product.subscription_duration_months && (
                            <p className="text-green-300 text-xs">
                              Duration: {formatSubscriptionDurationLabel(product.subscription_duration_months)}
                            </p>
                          )}
                          {product.region && <p className="text-green-400 text-xs">Region: {product.region}</p>}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {product.requires_player_id && <span className="text-green-400 text-xs bg-green-400/10 px-2 py-0.5 rounded">✓ Player ID</span>}
                            {product.is_subscription && <span className="text-yellow-400 text-xs bg-yellow-400/10 px-2 py-0.5 rounded">✓ Subscription</span>}
                          </div>
                        </div>
                      </div>
                      {product.image_url && (
                        <img src={product.image_url} alt={product.name} className="w-20 h-20 sm:w-16 sm:h-16 object-cover rounded flex-shrink-0 mx-auto sm:mx-0 sm:ml-4" />
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(product)}
                          className="flex-1 border-white text-white hover:bg-white/10 text-xs sm:text-sm py-2 sm:py-1.5"
                          data-testid={`edit-${product.id}`}
                        >
                          <Edit2 size={14} className="mr-1 sm:mr-1" />
                          <span className="hidden sm:inline">Edit</span>
                          <span className="sm:hidden">Edit</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setCodesProduct(product); setCodesDialogOpen(true); }}
                          className="border-cyan-400 text-green-300 hover:bg-cyan-400/10 px-3 sm:px-2 py-2 sm:py-1.5"
                          title="Manage delivery codes"
                        >
                          <Key size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(product.id)}
                          className="border-red-400 text-red-400 hover:bg-red-400/10 px-3 sm:px-2 py-2 sm:py-1.5"
                          data-testid={`delete-${product.id}`}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>

                      {variantEntries.length > 0 && (
                        <div className="mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleGroup(group.groupId)}
                            className="w-full border-cyan-400 text-cyan-200 hover:bg-cyan-400/10 text-xs sm:text-sm"
                          >
                            {isExpanded ? 'Hide Variants' : `View Variants (${variantEntries.length})`}
                          </Button>
                        </div>
                      )}
                    </div>

                    {variantEntries.length > 0 && isExpanded && (
                      <div className="mt-4 space-y-2">
                        {variantEntries.map((variant) => (
                          <div key={variant.id} className="flex items-center justify-between gap-3 p-3 bg-white/5 border border-white/10 rounded-lg">
                            <div className="min-w-0">
                              <p className="text-white text-sm font-semibold truncate">{getVariantLabel(variant)}</p>
                              <p className="text-white/60 text-xs">${Number(variant.price).toFixed(2)}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(variant)}
                                className="border-white/20 text-white hover:bg-white/10 text-xs"
                              >
                                <Edit2 size={14} className="mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(variant.id)}
                                className="border-red-400 text-red-400 hover:bg-red-400/10 text-xs"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ProductCodesManager
        product={codesProduct}
        open={codesDialogOpen}
        onOpenChange={(open) => { setCodesDialogOpen(open); if (!open) setCodesProduct(null); }}
      />

      <Footer settings={settings} />
    </div>
  );
};

export default AdminProducts;
