import { useEffect, useState, useCallback } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, MessageSquare, CheckCircle, XCircle, Send } from 'lucide-react';
import { toast } from 'sonner';

const statusColors = {
  open: 'bg-red-500/20 text-red-300',
  in_review: 'bg-yellow-500/20 text-yellow-300',
  resolved_buyer_wins: 'bg-green-500/20 text-green-300',
  resolved_seller_wins: 'bg-blue-500/20 text-blue-300',
};

const DisputeCenterPage = ({ user, logout, settings }) => {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [resolveReason, setResolveReason] = useState('');

  const role = user?.role === 'admin' ? 'admin' : (user?.role === 'seller' ? 'seller' : 'buyer');

  const loadDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const params = user?.role === 'admin' ? '' : `?user_id=${user?.id}&role=${role}`;
      const res = await axiosInstance.get(`/disputes${params}`);
      setDisputes(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [user?.id, user?.role, role]);

  useEffect(() => { loadDisputes(); }, [loadDisputes]);

  const openDetail = async (dispute) => {
    try {
      const res = await axiosInstance.get(`/disputes/${dispute.id}`);
      setSelected(res.data);
      setDetailOpen(true);
    } catch { toast.error('Error loading dispute'); }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selected) return;
    try {
      await axiosInstance.post(`/disputes/${selected.id}/message?user_id=${user.id}`, { content: newMessage.trim() });
      setNewMessage('');
      const res = await axiosInstance.get(`/disputes/${selected.id}`);
      setSelected(res.data);
      toast.success('Message sent');
    } catch (err) { toast.error('Error sending message'); }
  };

  const handleResolve = async (resolution) => {
    if (!selected) return;
    try {
      await axiosInstance.put(`/disputes/${selected.id}/resolve`, { resolution, reason: resolveReason || null });
      toast.success(`Dispute resolved: ${resolution.replace('_', ' ')}`);
      setDetailOpen(false); setResolveReason(''); loadDisputes();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
          <AlertTriangle className="text-red-400" /> Dispute Center
        </h1>

        {loading ? <p className="text-white/60">Loading...</p> : disputes.length === 0 ? (
          <Card className="glass-effect border-white/20">
            <CardContent className="p-8 text-center">
              <p className="text-white/40">No disputes</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {disputes.map(d => (
              <Card key={d.id} className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer"
                onClick={() => openDetail(d)}>
                <CardContent className="p-4 flex justify-between items-start">
                  <div>
                    <p className="text-white font-bold text-sm">Order #{(d.order_id || '').slice(0, 8)}</p>
                    <p className="text-white/50 text-xs mt-1">{d.reason?.slice(0, 100)}</p>
                    <p className="text-white/30 text-xs mt-1">{d.messages?.length || 0} messages</p>
                  </div>
                  <Badge className={statusColors[d.status] || ''}>{(d.status || '').replace(/_/g, ' ')}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-gray-900 border-white/20">
            <DialogHeader>
              <DialogTitle className="text-white">Dispute — Order #{(selected?.order_id || '').slice(0, 8)}</DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-4">
                <div className="flex gap-4 text-sm">
                  <div><span className="text-white/50">Status:</span> <Badge className={statusColors[selected.status] || ''}>{(selected.status || '').replace(/_/g, ' ')}</Badge></div>
                  <div><span className="text-white/50">Buyer:</span> <span className="text-white">{selected.buyer_email}</span></div>
                  <div><span className="text-white/50">Seller:</span> <span className="text-white">{selected.seller_email || 'N/A'}</span></div>
                </div>

                {/* Messages */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto p-3 bg-black/30 rounded-lg">
                  {(selected.messages || []).map(msg => (
                    <div key={msg.id} className={`p-3 rounded-lg ${msg.sender_role === 'buyer' ? 'bg-blue-500/10 border-l-2 border-blue-500' : msg.sender_role === 'seller' ? 'bg-green-500/10 border-l-2 border-green-500' : 'bg-yellow-500/10 border-l-2 border-yellow-500'}`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-white/60 text-xs font-semibold">{msg.sender_name || msg.sender_role}</span>
                        <Badge className="text-xs" variant="outline">{msg.sender_role}</Badge>
                      </div>
                      <p className="text-white text-sm">{msg.content}</p>
                    </div>
                  ))}
                </div>

                {/* Add message */}
                {selected.status && !selected.status.startsWith('resolved') && (
                  <div className="flex gap-2">
                    <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type a message..." className="bg-white/10 border-white/20 text-white flex-1"
                      onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }} />
                    <Button onClick={sendMessage} className="bg-cyan-600 text-white"><Send size={16} /></Button>
                  </div>
                )}

                {/* Admin resolve */}
                {user?.role === 'admin' && !selected.status?.startsWith('resolved') && (
                  <div className="p-3 bg-white/5 rounded-lg space-y-3">
                    <p className="text-white font-bold text-sm">Admin Resolution</p>
                    <Textarea value={resolveReason} onChange={(e) => setResolveReason(e.target.value)}
                      placeholder="Reason..." className="bg-white/10 border-white/20 text-white" rows={2} />
                    <div className="flex gap-3">
                      <Button className="flex-1 bg-green-600 text-white" onClick={() => handleResolve('buyer_wins')}>
                        <CheckCircle size={16} className="mr-1" /> Refund Buyer
                      </Button>
                      <Button className="flex-1 bg-green-600 text-white" onClick={() => handleResolve('seller_wins')}>
                        <CheckCircle size={16} className="mr-1" /> Release to Seller
                      </Button>
                    </div>
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

export default DisputeCenterPage;
