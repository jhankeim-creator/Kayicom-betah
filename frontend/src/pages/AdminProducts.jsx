import { useEffect, useState } from 'react';
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
import { Package, Plus, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const AdminProducts = ({ user, logout, settings }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
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

    try {
      const payload = {
        ...formData,
        price: parseFloat(formData.price),
        subscription_duration_months: formData.subscription_duration_months
          ? parseInt(formData.subscription_duration_months, 10)
          : null
      };

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
    setEditingProduct(product);
    setShowVariantMode(!!product.parent_product_id);
    setFormData({
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price?.toString?.() || '',
      image_url: product.image_url || '',
      stock_available: product.stock_available,
      delivery_type: product.delivery_type,
      requires_player_id: product.requires_player_id || false,
      requires_credentials: product.requires_credentials || false,
      player_id_label: product.player_id_label || 'Player ID',
      credential_fields: product.credential_fields && product.credential_fields.length > 0
        ? product.credential_fields
        : ['email', 'password'],
      region: product.region || '',
      giftcard_category: product.giftcard_category || '',
      is_subscription: product.is_subscription || false,
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
              className="bg-gradient-to-r from-pink-500 to-blue-500 text-white px-4 py-2 sm:px-6 sm:py-3 text-sm sm:text-base w-full sm:w-auto"
            >
              🏠 Admin Home
            </Button>
          </div>
          
          {/* Action Buttons - Stack on Mobile */}
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <div className="flex flex-col sm:flex-row gap-2">
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-pink-500 to-blue-500 text-white w-full sm:w-auto text-sm sm:text-base" data-testid="add-product-btn">
                  <Plus size={18} className="mr-2 sm:mr-2" />
                  <span className="hidden sm:inline">Add New Product</span>
                  <span className="sm:hidden">Add Product</span>
                </Button>
              </DialogTrigger>
              
              <DialogTrigger asChild>
                <Button 
                  className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white w-full sm:w-auto text-sm sm:text-base"
                  onClick={() => setShowVariantMode(true)}
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
                  <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                    <Label className="text-white mb-2 block">Select Parent Product</Label>
                    <Select onValueChange={(value) => {
                      const parent = products.find(p => p.id === value);
                      setParentProduct(parent);
                      setFormData(prev => ({
                        ...prev,
                        parent_product_id: value,
                        is_variant: true,
                        name: parent?.name || '',
                        category: parent?.category || 'topup',
                        image_url: parent?.image_url || '',
                        requires_player_id: parent?.requires_player_id || false,
                        requires_credentials: parent?.requires_credentials || false
                      }));
                    }}>
                      <SelectTrigger className="bg-white/10 border-white/20 text-white">
                        <SelectValue placeholder="Choose parent product..." />
                      </SelectTrigger>
                      <SelectContent>
                        {products.filter(p => !p.is_variant && !p.parent_product_id).map(product => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} ({product.category})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {parentProduct && (
                      <p className="text-cyan-300 text-sm mt-2">
                        Creating variant for: <strong>{parentProduct.name}</strong>
                      </p>
                    )}
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
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category" className="text-white">Category</Label>
                    <Select value={formData.category} onValueChange={(value) => handleChange('category', value)}>
                      <SelectTrigger className="bg-white/10 border-white/20 text-white" data-testid="product-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="topup">Top-Up</SelectItem>
                        <SelectItem value="giftcard">Gift Card</SelectItem>
                        <SelectItem value="subscription">Subscription</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
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

                <div>
                  <Label htmlFor="region" className="text-white">Region (for Gift Cards)</Label>
                  <Input
                    id="region"
                    value={formData.region}
                    onChange={(e) => handleChange('region', e.target.value)}
                    className="bg-white/10 border-white/20 text-white"
                    placeholder="e.g., US, EU, ASIA"
                  />
                </div>

                {formData.category === 'giftcard' && (
                  <div>
                    <Label htmlFor="giftcard_category" className="text-white">Gift Card Category (Bitrefill style)</Label>
                    <Select value={formData.giftcard_category || ''} onValueChange={(value) => handleChange('giftcard_category', value)}>
                      <SelectTrigger className="bg-white/10 border-white/20 text-white mt-2">
                        <SelectValue placeholder="Select category..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Shopping">Shopping</SelectItem>
                        <SelectItem value="Gaming">Gaming</SelectItem>
                        <SelectItem value="Entertainment">Entertainment</SelectItem>
                        <SelectItem value="Food">Food</SelectItem>
                        <SelectItem value="Travel">Travel</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
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
                    disabled={uploadingImage}
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
                    <Select value={formData.delivery_type} onValueChange={(value) => handleChange('delivery_type', value)}>
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
                    />
                    <Label htmlFor="requires_player_id" className="text-white text-sm sm:text-base">Requires Player ID</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="requires_credentials"
                      checked={formData.requires_credentials}
                      onCheckedChange={(checked) => handleChange('requires_credentials', checked)}
                    />
                    <Label htmlFor="requires_credentials" className="text-white text-sm sm:text-base">Requires Credentials</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_subscription"
                      checked={formData.is_subscription}
                      onCheckedChange={(checked) => handleChange('is_subscription', checked)}
                    />
                    <Label htmlFor="is_subscription" className="text-white text-sm sm:text-base">Is Subscription (for referral)</Label>
                  </div>
                </div>

                {/* Credential Fields Configuration */}
                {formData.requires_credentials && (
                  <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
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
                        className="border-cyan-400 text-cyan-400 hover:bg-cyan-400/10 w-full"
                        onClick={() => {
                          handleChange('credential_fields', [...(formData.credential_fields || []), '']);
                        }}
                      >
                        + Add Field
                      </Button>
                    </div>
                  </div>
                )}

                {(formData.is_subscription || formData.category === 'subscription') && (
                  <div className="p-4 bg-yellow-400/10 border border-yellow-400/30 rounded-lg">
                    <Label htmlFor="subscription_duration_months" className="text-white">
                      Subscription Duration (Months)
                    </Label>
                    <Input
                      id="subscription_duration_months"
                      type="number"
                      min="1"
                      step="1"
                      value={formData.subscription_duration_months}
                      onChange={(e) => handleChange('subscription_duration_months', e.target.value)}
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mt-2"
                      placeholder="e.g., 1, 2, 6, 12, 24"
                    />
                    <p className="text-white/60 text-xs mt-2">
                      This is used to set <strong>subscription_end_date</strong> when the order is completed.
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleSubmit}
                  className="w-full bg-white text-purple-600 hover:bg-gray-100"
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
              className={`${categoryFilter === 'all' ? 'bg-pink-500' : 'bg-white/10'} text-white whitespace-nowrap text-xs sm:text-sm px-3 py-2`}
            >
              All ({products.length})
            </Button>
            {['giftcard', 'topup', 'subscription', 'service'].map(cat => {
              const count = products.filter(p => p.category === cat).length;
              return (
                <Button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`${categoryFilter === cat ? 'bg-pink-500' : 'bg-white/10'} text-white whitespace-nowrap text-xs sm:text-sm px-3 py-2`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)} ({count})
                </Button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="text-center text-white text-lg sm:text-xl py-12">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" data-testid="products-list">
            {products
              .filter(product => categoryFilter === 'all' || product.category === categoryFilter)
              .filter(product => {
                const q = search.trim().toLowerCase();
                if (!q) return true;
                const hay = [
                  product.name,
                  product.description,
                  product.category,
                  product.variant_name,
                  product.region,
                  product.giftcard_category
                ]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();
                return hay.includes(q);
              })
              .map((product) => (
              <Card key={product.id} className="glass-effect border-white/20 hover:border-white/40 transition" data-testid={`product-${product.id}`}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-lg font-bold text-white mb-2 break-words">{product.name}</h3>
                      <p className="text-white/70 text-xs sm:text-sm mb-2 line-clamp-2">{product.description}</p>
                      <div className="space-y-1 text-xs sm:text-sm">
                        <p className="text-white/60">Category: <span className="text-white font-medium">{product.category}</span></p>
                        <p className="text-white/60">Price: <span className="text-white font-bold text-base">${Number(product.price).toFixed(2)}</span></p>
                        {product.variant_name && <p className="text-cyan-400 text-xs">Variant: {product.variant_name}</p>}
                        {product.region && <p className="text-pink-400 text-xs">Region: {product.region}</p>}
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

                  <div className="flex gap-2 mt-4">
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
                      onClick={() => handleDelete(product.id)}
                      className="border-red-400 text-red-400 hover:bg-red-400/10 px-3 sm:px-2 py-2 sm:py-1.5"
                      data-testid={`delete-${product.id}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default AdminProducts;
