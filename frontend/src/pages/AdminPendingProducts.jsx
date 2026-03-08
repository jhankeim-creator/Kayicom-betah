import { useEffect, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Clock, Package } from 'lucide-react';
import { toast } from 'sonner';

const AdminPendingProducts = ({ user, logout, settings }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get('/admin/products/pending');
      setProducts(res.data || []);
    } catch { toast.error('Error loading pending products'); }
    finally { setLoading(false); }
  };

  const handleReview = async (productId, action) => {
    try {
      await axiosInstance.put(`/admin/products/${productId}/approve?action=${action}`);
      toast.success(action === 'approve' ? 'Product approved!' : 'Product rejected');
      setDetailOpen(false);
      loadProducts();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Clock className="text-yellow-400" /> Pending Products
          </h1>
          <Button onClick={() => window.location.href = '/admin'} className="bg-gradient-to-r from-pink-500 to-blue-500 text-white">
            Admin Home
          </Button>
        </div>

        {loading ? <p className="text-white/60">Loading...</p> : (
          <>
            {products.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="mx-auto text-green-400 mb-4" size={48} />
                <p className="text-white/60">No pending products — all caught up!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {products.map(p => (
                  <Card key={p.id} className="glass-effect border-yellow-500/20 hover:border-yellow-500/40 transition cursor-pointer"
                    onClick={() => { setSelectedProduct(p); setDetailOpen(true); }}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {p.image_url && <img src={p.image_url} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-white font-bold text-lg">{p.name}</h3>
                              <p className="text-white/50 text-sm truncate">{p.description}</p>
                            </div>
                            <Badge className="bg-yellow-500/20 text-yellow-300">Pending Review</Badge>
                          </div>
                          <div className="flex gap-3 mt-2 text-sm text-white/60">
                            <span>{p.category}</span>
                            <span>${Number(p.price).toFixed(2)}</span>
                            {p.seller_store_name && <span>by {p.seller_store_name}</span>}
                            {p.seller_email && <span>({p.seller_email})</span>}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Detail Dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-gray-900 border-white/20">
            <DialogHeader>
              <DialogTitle className="text-white">Review Product</DialogTitle>
            </DialogHeader>
            {selectedProduct && (
              <div className="space-y-4 py-2">
                {selectedProduct.image_url && (
                  <img src={selectedProduct.image_url} alt="" className="w-full h-48 rounded-lg object-cover" />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-white/50 text-xs">Name</p><p className="text-white font-bold">{selectedProduct.name}</p></div>
                  <div><p className="text-white/50 text-xs">Price</p><p className="text-white font-bold">${Number(selectedProduct.price).toFixed(2)}</p></div>
                  <div><p className="text-white/50 text-xs">Category</p><p className="text-white">{selectedProduct.category}</p></div>
                  <div><p className="text-white/50 text-xs">Delivery</p><p className="text-white">{selectedProduct.delivery_type}</p></div>
                  {selectedProduct.region && <div><p className="text-white/50 text-xs">Region</p><p className="text-white">{selectedProduct.region}</p></div>}
                  {selectedProduct.variant_name && <div><p className="text-white/50 text-xs">Variant</p><p className="text-white">{selectedProduct.variant_name}</p></div>}
                </div>
                {selectedProduct.description && (
                  <div><p className="text-white/50 text-xs">Description</p><p className="text-white text-sm">{selectedProduct.description}</p></div>
                )}
                {selectedProduct.seller_store_name && (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <p className="text-purple-300 text-sm">Submitted by: <strong>{selectedProduct.seller_store_name}</strong> ({selectedProduct.seller_email})</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button className="flex-1 bg-green-600 text-white" onClick={() => handleReview(selectedProduct.id, 'approve')}>
                    <CheckCircle size={18} className="mr-2" /> Approve
                  </Button>
                  <Button variant="outline" className="flex-1 border-red-400 text-red-400" onClick={() => handleReview(selectedProduct.id, 'reject')}>
                    <XCircle size={18} className="mr-2" /> Reject
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
      <Footer settings={settings} />
    </div>
  );
};

export default AdminPendingProducts;
