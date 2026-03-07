import { useEffect, useState, useCallback } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, CheckCircle, XCircle, Eye, ShieldCheck, Tag } from 'lucide-react';
import { toast } from 'sonner';

const statusColors = {
  pending_kyc: 'bg-gray-500/20 text-gray-300',
  kyc_submitted: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-red-500/20 text-red-300',
};

const AdminSellers = ({ user, logout, settings }) => {
  const [sellers, setSellers] = useState([]);
  const [catRequests, setCatRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [commission, setCommission] = useState('');
  const [newCategories, setNewCategories] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const [sellersRes, reqsRes] = await Promise.all([
        axiosInstance.get(`/admin/sellers${params}`),
        axiosInstance.get('/admin/seller-category-requests'),
      ]);
      setSellers(sellersRes.data);
      setCatRequests(reqsRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { loadData(); }, [loadData]);

  const openDetail = async (seller) => {
    try {
      const res = await axiosInstance.get(`/admin/sellers/${seller.id}`);
      setSelectedSeller(res.data);
      setCommission(String(res.data.seller_commission_rate || 10));
      setDetailOpen(true);
    } catch { toast.error('Error loading seller'); }
  };

  const handleReview = async (action, reason) => {
    if (!selectedSeller) return;
    try {
      const payload = { action, reason: reason || null, commission_rate: action === 'approve' ? parseFloat(commission) || 10 : null };
      await axiosInstance.put(`/admin/sellers/${selectedSeller.id}/review`, payload);
      toast.success(action === 'approve' ? 'Seller approved!' : 'Seller rejected');
      setDetailOpen(false); loadData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleCategoryApproval = async (sellerId, categories, action) => {
    try {
      await axiosInstance.put(`/admin/sellers/${sellerId}/categories`, {
        user_id: sellerId, categories, action,
      });
      toast.success(`Categories ${action}d`);
      loadData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleAddCategories = async () => {
    if (!selectedSeller || !newCategories.trim()) return;
    const cats = newCategories.split(',').map(c => c.trim()).filter(Boolean);
    try {
      await axiosInstance.put(`/admin/sellers/${selectedSeller.id}/categories`, {
        user_id: selectedSeller.id, categories: cats, action: 'approve',
      });
      toast.success('Categories added');
      setNewCategories('');
      const res = await axiosInstance.get(`/admin/sellers/${selectedSeller.id}`);
      setSelectedSeller(res.data);
      loadData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const handleSetCommission = async () => {
    if (!selectedSeller) return;
    try {
      await axiosInstance.put(`/admin/sellers/${selectedSeller.id}/commission?rate=${parseFloat(commission)}`);
      toast.success('Commission updated');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const filters = ['all', 'kyc_submitted', 'approved', 'rejected', 'pending_kyc'];

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Users className="text-cyan-400" /> Manage Sellers
          </h1>
          <Button onClick={() => window.location.href = '/admin'} className="bg-gradient-to-r from-pink-500 to-blue-500 text-white">
            Admin Home
          </Button>
        </div>

        {/* Pending Category Requests */}
        {catRequests.length > 0 && (
          <Card className="glass-effect border-yellow-500/30 mb-6">
            <CardContent className="p-4">
              <h2 className="text-white font-bold mb-3 flex items-center gap-2"><Tag size={18} className="text-yellow-400" /> Pending Category Requests</h2>
              <div className="space-y-2">
                {catRequests.map(req => (
                  <div key={req.id} className="flex items-center justify-between gap-3 p-3 bg-white/5 rounded-lg">
                    <div>
                      <p className="text-white text-sm font-semibold">{req.store_name || req.user_email}</p>
                      <p className="text-white/50 text-xs">Requesting: {(req.requested_categories || []).join(', ')}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="bg-green-600 text-white text-xs"
                        onClick={() => handleCategoryApproval(req.user_id, req.requested_categories, 'approve')}>
                        <CheckCircle size={14} className="mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="border-red-400 text-red-400 text-xs"
                        onClick={() => handleCategoryApproval(req.user_id, req.requested_categories, 'reject')}>
                        <XCircle size={14} className="mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {filters.map(f => (
            <Button key={f} size="sm" onClick={() => setFilter(f)}
              className={`${filter === f ? 'bg-pink-500' : 'bg-white/10'} text-white text-xs whitespace-nowrap`}>
              {f === 'all' ? 'All' : f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              {f !== 'all' && ` (${sellers.filter(s => f === 'all' || s.seller_status === f).length})`}
            </Button>
          ))}
        </div>

        {/* Sellers List */}
        {loading ? <p className="text-white/60">Loading...</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sellers.map(seller => (
              <Card key={seller.id} className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer"
                onClick={() => openDetail(seller)}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-white font-bold">{seller.seller_store_name || 'Unnamed Store'}</h3>
                      <p className="text-white/50 text-xs">{seller.email}</p>
                    </div>
                    <Badge className={statusColors[seller.seller_status] || 'bg-gray-500/20 text-gray-300'}>
                      {(seller.seller_status || '').replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="flex gap-4 text-xs text-white/50">
                    <span>Products: {seller.product_count || 0}</span>
                    <span>Commission: {seller.seller_commission_rate || 10}%</span>
                  </div>
                  {seller.seller_approved_categories?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {seller.seller_approved_categories.map(c => (
                        <Badge key={c} className="bg-cyan-500/10 text-cyan-300 text-xs">{c}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {sellers.length === 0 && <p className="text-white/40 col-span-full text-center py-8">No sellers found</p>}
          </div>
        )}

        {/* Seller Detail Dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border-white/20">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <ShieldCheck className="text-cyan-400" /> Seller Review — {selectedSeller?.seller_store_name}
              </DialogTitle>
            </DialogHeader>
            {selectedSeller && (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-white/50 text-xs">Email</p><p className="text-white text-sm">{selectedSeller.email}</p></div>
                  <div><p className="text-white/50 text-xs">Name</p><p className="text-white text-sm">{selectedSeller.full_name}</p></div>
                  <div><p className="text-white/50 text-xs">Status</p>
                    <Badge className={statusColors[selectedSeller.seller_status] || ''}>
                      {(selectedSeller.seller_status || '').replace('_', ' ')}
                    </Badge>
                  </div>
                  <div><p className="text-white/50 text-xs">Products</p><p className="text-white text-sm">{selectedSeller.product_count}</p></div>
                </div>

                {selectedSeller.seller_bio && (
                  <div><p className="text-white/50 text-xs">Bio</p><p className="text-white text-sm">{selectedSeller.seller_bio}</p></div>
                )}

                {/* KYC Documents */}
                {(selectedSeller.seller_kyc_document_url || selectedSeller.seller_kyc_selfie_url) && (
                  <div>
                    <p className="text-white/50 text-xs mb-2">KYC Documents</p>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedSeller.seller_kyc_document_url && (
                        <div>
                          <p className="text-white/40 text-xs mb-1">ID Document</p>
                          <img src={selectedSeller.seller_kyc_document_url} alt="ID" className="w-full rounded-lg border border-white/20" />
                        </div>
                      )}
                      {selectedSeller.seller_kyc_selfie_url && (
                        <div>
                          <p className="text-white/40 text-xs mb-1">Selfie with ID</p>
                          <img src={selectedSeller.seller_kyc_selfie_url} alt="Selfie" className="w-full rounded-lg border border-white/20" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Commission */}
                <div>
                  <Label className="text-white text-sm">Commission Rate (%)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="number" value={commission} onChange={(e) => setCommission(e.target.value)}
                      className="bg-white/10 border-white/20 text-white w-24" />
                    <Button size="sm" onClick={handleSetCommission} className="bg-purple-600 text-white text-xs">Set</Button>
                  </div>
                </div>

                {/* Category Management */}
                <div>
                  <Label className="text-white text-sm">Approved Categories</Label>
                  <div className="flex flex-wrap gap-1 mt-1 mb-2">
                    {(selectedSeller.seller_approved_categories || []).map(c => (
                      <Badge key={c} className="bg-cyan-500/20 text-cyan-300">{c}</Badge>
                    ))}
                    {!(selectedSeller.seller_approved_categories || []).length && <span className="text-white/40 text-xs">None</span>}
                  </div>
                  <div className="flex gap-2">
                    <Input value={newCategories} onChange={(e) => setNewCategories(e.target.value)}
                      placeholder="giftcard, topup, subscription, service"
                      className="bg-white/10 border-white/20 text-white text-sm flex-1" />
                    <Button size="sm" onClick={handleAddCategories} className="bg-cyan-600 text-white text-xs">Add</Button>
                  </div>
                </div>

                {/* Approve / Reject */}
                {selectedSeller.seller_status !== 'approved' && (
                  <div className="flex gap-3 pt-2">
                    <Button className="flex-1 bg-green-600 text-white" onClick={() => handleReview('approve')}>
                      <CheckCircle size={18} className="mr-2" /> Approve Seller
                    </Button>
                    <Button variant="outline" className="flex-1 border-red-400 text-red-400" onClick={() => handleReview('reject', 'Application rejected by admin')}>
                      <XCircle size={18} className="mr-2" /> Reject
                    </Button>
                  </div>
                )}

                {selectedSeller.seller_status === 'approved' && (
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                    <p className="text-green-300 font-semibold">This seller is approved and active</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
      <Footer settings={settings} />
    </div>
  );
};

export default AdminSellers;
