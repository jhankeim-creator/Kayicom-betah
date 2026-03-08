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
import { Package, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const AdminProductRequests = ({ user, logout, settings }) => {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [detailReq, setDetailReq] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => { loadRequests(); }, [filter]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(`/admin/product-requests?status=${filter}`);
      setRequests(res.data);
    } catch { toast.error('Error loading requests'); }
    finally { setLoading(false); }
  };

  const handleReview = async (requestId, action) => {
    try {
      const params = new URLSearchParams({ action });
      if (action === 'reject' && rejectReason) params.append('reason', rejectReason);
      if (action === 'approve') params.append('auto_create', 'true');
      await axiosInstance.put(`/admin/product-requests/${requestId}?${params}`);
      toast.success(action === 'approve' ? 'Approved! Product auto-created in catalog.' : 'Request rejected');
      setDetailOpen(false);
      setRejectReason('');
      loadRequests();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const filters = ['pending', 'approved', 'rejected'];

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Package className="text-green-400" /> Product Requests
          </h1>
          <Button onClick={() => window.location.href = '/admin'} className="bg-gradient-to-r from-green-500 to-green-600 text-white">
            Admin Home
          </Button>
        </div>

        <div className="flex gap-2 mb-6">
          {filters.map(f => (
            <Button key={f} size="sm" onClick={() => setFilter(f)}
              className={`${filter === f ? 'bg-green-500' : 'bg-white/10'} text-white text-xs capitalize`}>
              {f} {filter === f && `(${requests.length})`}
            </Button>
          ))}
        </div>

        {loading ? <p className="text-white/60">Loading...</p> : (
          <div className="space-y-3">
            {requests.map(r => (
              <Card key={r.id} className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer"
                onClick={() => { setDetailReq(r); setDetailOpen(true); }}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-white font-bold">{r.product_name}</h3>
                      <p className="text-white/50 text-sm">{r.description?.slice(0, 100)}</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <Badge className="bg-cyan-500/20 text-green-300">{r.category}</Badge>
                        {r.giftcard_category && <Badge className="bg-green-500/20 text-purple-300">{r.giftcard_category}</Badge>}
                        {r.giftcard_subcategory && <Badge className="bg-green-500/20 text-green-300">{r.giftcard_subcategory}</Badge>}
                        {r.suggested_price && <Badge className="bg-green-500/20 text-green-300">${r.suggested_price}</Badge>}
                      </div>
                      <p className="text-white/40 text-xs mt-2">
                        From: {r.store_name || r.user_email} • {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className={r.status === 'approved' ? 'bg-green-500/20 text-green-300' : r.status === 'rejected' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}>
                      {r.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
            {requests.length === 0 && <p className="text-white/40 text-center py-8">No {filter} requests</p>}
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-lg bg-gray-900 border-white/20">
            <DialogHeader>
              <DialogTitle className="text-white">Product Request</DialogTitle>
            </DialogHeader>
            {detailReq && (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-white/50 text-xs">Product Name</p><p className="text-white font-bold">{detailReq.product_name}</p></div>
                  <div><p className="text-white/50 text-xs">Category</p><p className="text-white">{detailReq.category}</p></div>
                  {detailReq.giftcard_category && <div><p className="text-white/50 text-xs">Gift Card Category</p><p className="text-white">{detailReq.giftcard_category}</p></div>}
                  {detailReq.giftcard_subcategory && <div><p className="text-white/50 text-xs">Subcategory</p><p className="text-white">{detailReq.giftcard_subcategory}</p></div>}
                  <div><p className="text-white/50 text-xs">Suggested Price</p><p className="text-white">{detailReq.suggested_price ? `$${detailReq.suggested_price}` : 'Not specified'}</p></div>
                  <div><p className="text-white/50 text-xs">Seller</p><p className="text-white">{detailReq.store_name || detailReq.user_email}</p></div>
                </div>
                <div><p className="text-white/50 text-xs">Description</p><p className="text-white text-sm">{detailReq.description}</p></div>
                {detailReq.notes && <div><p className="text-white/50 text-xs">Notes</p><p className="text-white text-sm">{detailReq.notes}</p></div>}

                {detailReq.status === 'pending' && (
                  <>
                    <div>
                      <Label className="text-white text-sm">Rejection reason (optional)</Label>
                      <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                        className="bg-white/10 border-white/20 text-white mt-1" placeholder="Reason..." />
                    </div>
                    <div className="flex gap-3">
                      <Button className="flex-1 bg-green-600 text-white" onClick={() => handleReview(detailReq.id, 'approve')}>
                        <CheckCircle size={18} className="mr-2" /> Approve & Create Product
                      </Button>
                      <Button variant="outline" className="flex-1 border-red-400 text-red-400" onClick={() => handleReview(detailReq.id, 'reject')}>
                        <XCircle size={18} className="mr-2" /> Reject
                      </Button>
                    </div>
                  </>
                )}

                {detailReq.status === 'approved' && (
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                    <p className="text-green-300 font-semibold">Approved — product created in catalog</p>
                  </div>
                )}
                {detailReq.status === 'rejected' && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                    <p className="text-red-300 font-semibold">Rejected {detailReq.rejection_reason ? `— ${detailReq.rejection_reason}` : ''}</p>
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

export default AdminProductRequests;
