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
import { AlertTriangle, CheckCircle, Send, Clock, Upload, Image } from 'lucide-react';
import { toast } from 'sonner';

const statusColors = {
  open: 'bg-red-500/20 text-red-300',
  in_review: 'bg-yellow-500/20 text-yellow-300',
  escalated: 'bg-orange-500/20 text-orange-300',
  resolved_buyer_wins: 'bg-green-500/20 text-green-300',
  resolved_seller_wins: 'bg-blue-500/20 text-blue-300',
};

const CountdownTimer = ({ deadline }) => {
  const [remaining, setRemaining] = useState('');
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (!deadline) return;
    const update = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Expired'); setUrgent(true); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}h ${m}m ${s}s`);
      setUrgent(h < 4);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;
  return (
    <span className={`font-mono text-sm font-bold ${urgent ? 'text-red-400' : 'text-yellow-300'}`}>
      <Clock size={12} className="inline mr-1" />{remaining}
    </span>
  );
};

const DisputeCenterPage = ({ user, logout, settings }) => {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [resolveReason, setResolveReason] = useState('');
  const [resolveEvidence, setResolveEvidence] = useState('');

  const userId = user?.user_id || user?.id;
  const role = user?.role === 'admin' ? 'admin' : (user?.seller_status === 'approved' ? 'seller' : 'buyer');

  const loadDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const params = user?.role === 'admin' ? '' : `?user_id=${userId}&role=${role}`;
      const res = await axiosInstance.get(`/disputes${params}`);
      setDisputes(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [userId, user?.role, role]);

  useEffect(() => { loadDisputes(); }, [loadDisputes]);

  const openDetail = async (dispute) => {
    try {
      const res = await axiosInstance.get(`/disputes/${dispute.id}`);
      setSelected(res.data);
      setDetailOpen(true);
      setNewMessage('');
      setEvidenceUrl('');
    } catch { toast.error('Error loading dispute'); }
  };

  const handleFileUpload = async (e, setter) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = () => { setter(reader.result); setUploading(false); };
      reader.readAsDataURL(file);
    } catch { setUploading(false); toast.error('Upload failed'); }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selected) return;
    try {
      await axiosInstance.post(`/disputes/${selected.id}/message?user_id=${userId}`, {
        content: newMessage.trim(),
        evidence_url: evidenceUrl || null,
      });
      setNewMessage('');
      setEvidenceUrl('');
      const res = await axiosInstance.get(`/disputes/${selected.id}`);
      setSelected(res.data);
      toast.success('Message sent');
    } catch (err) { toast.error('Error sending message'); }
  };

  const handleResolve = async (resolution) => {
    if (!selected) return;
    try {
      await axiosInstance.put(`/disputes/${selected.id}/resolve`, {
        resolution,
        reason: resolveReason || null,
        evidence_url: resolveEvidence || null,
      });
      toast.success(`Dispute resolved: ${resolution.replace('_', ' ')}`);
      setDetailOpen(false);
      setResolveReason('');
      setResolveEvidence('');
      loadDisputes();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const isOpen = (s) => s && !s.startsWith('resolved') && s !== 'closed';

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <AlertTriangle className="text-red-400" /> Dispute Center
        </h1>

        {loading ? <p className="text-white/60">Loading...</p> : disputes.length === 0 ? (
          <Card className="bg-[#141414] border border-white/5">
            <CardContent className="p-8 text-center">
              <p className="text-white/40">No disputes</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {disputes.map(d => (
              <Card key={d.id} className="bg-[#141414] border border-white/5 hover:border-white/20 transition cursor-pointer"
                onClick={() => openDetail(d)}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-white font-bold text-sm">Order #{(d.order_id || '').slice(0, 8)}</p>
                      <p className="text-white/50 text-xs mt-1 line-clamp-1">{d.reason?.slice(0, 100)}</p>
                      <p className="text-white/30 text-xs mt-1">{d.messages?.length || 0} messages</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge className={statusColors[d.status] || 'bg-white/10 text-white/50'}>{(d.status || '').replace(/_/g, ' ')}</Badge>
                      {isOpen(d.status) && d.response_deadline && (
                        <div className="text-right">
                          <p className="text-white/30 text-[10px]">Waiting for {d.waiting_for}</p>
                          <CountdownTimer deadline={d.response_deadline} />
                        </div>
                      )}
                      {d.auto_resolved && (
                        <span className="text-[10px] text-red-300/60">Auto-resolved</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-[#141414] border-white/10">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center justify-between">
                <span>Dispute — Order #{(selected?.order_id || '').slice(0, 8)}</span>
                <Badge className={statusColors[selected?.status] || ''}>{(selected?.status || '').replace(/_/g, ' ')}</Badge>
              </DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3 text-xs text-white/50">
                  <span>Buyer: <strong className="text-white">{selected.buyer_email}</strong></span>
                  <span>Seller: <strong className="text-white">{selected.seller_email || 'N/A'}</strong></span>
                </div>

                {/* 24h Timer */}
                {isOpen(selected.status) && selected.response_deadline && (
                  <div className={`p-3 rounded-lg border ${selected.waiting_for === role ? 'bg-red-500/10 border-red-500/20' : 'bg-yellow-500/10 border-yellow-500/20'}`}>
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-semibold ${selected.waiting_for === role ? 'text-red-300' : 'text-yellow-300'}`}>
                        {selected.waiting_for === role
                          ? '⚠️ Your turn to respond!'
                          : `Waiting for ${selected.waiting_for} to respond`}
                      </p>
                      <CountdownTimer deadline={selected.response_deadline} />
                    </div>
                    <p className="text-white/40 text-xs mt-1">
                      If {selected.waiting_for} doesn't respond within 24h, the dispute auto-resolves in favor of the other party.
                    </p>
                  </div>
                )}

                {/* Messages */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto p-3 bg-black/30 rounded-lg">
                  {(selected.messages || []).map(msg => (
                    <div key={msg.id} className={`p-3 rounded-lg ${
                      msg.sender_role === 'buyer' ? 'bg-blue-500/10 border-l-2 border-blue-500' :
                      msg.sender_role === 'seller' ? 'bg-green-500/10 border-l-2 border-green-500' :
                      'bg-yellow-500/10 border-l-2 border-yellow-500'
                    }`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-white/60 text-xs font-semibold">{msg.sender_name || msg.sender_role}</span>
                        <div className="flex items-center gap-2">
                          <Badge className="text-[10px]" variant="outline">{msg.sender_role}</Badge>
                          <span className="text-white/30 text-[10px]">{new Date(msg.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <p className="text-white text-sm">{msg.content}</p>
                      {msg.evidence_url && (
                        <div className="mt-2">
                          <a href={msg.evidence_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-cyan-400 text-xs hover:underline">
                            <Image size={12} /> View Evidence
                          </a>
                          {msg.evidence_url.startsWith('data:image') && (
                            <img src={msg.evidence_url} alt="Evidence" className="mt-1 max-h-32 rounded border border-white/10" />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add message + evidence */}
                {isOpen(selected.status) && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type your response..." className="bg-white/5 border-white/10 text-white flex-1"
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
                      <Button onClick={sendMessage} disabled={!newMessage.trim()} className="bg-cyan-600 text-white">
                        <Send size={16} />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer">
                        <div className="flex items-center gap-1 text-white/40 hover:text-white/60 text-xs transition px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                          <Upload size={12} /> {uploading ? 'Uploading...' : 'Attach evidence'}
                        </div>
                        <input type="file" accept="image/*" className="hidden" disabled={uploading}
                          onChange={(e) => handleFileUpload(e, setEvidenceUrl)} />
                      </label>
                      {evidenceUrl && (
                        <div className="flex items-center gap-1">
                          <img src={evidenceUrl} alt="Evidence" className="h-8 w-8 object-cover rounded border border-white/10" />
                          <button onClick={() => setEvidenceUrl('')} className="text-red-400 text-xs hover:text-red-300">✕</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Self-resolution (buyer + seller) */}
                {isOpen(selected.status) && user?.role !== 'admin' && (
                  <div className="p-4 bg-yellow-500/5 rounded-lg border border-yellow-500/20 space-y-3">
                    <p className="text-yellow-300 font-bold text-sm">💡 Resolve it yourselves — faster than admin!</p>
                    <p className="text-white/40 text-xs">Admin resolution can take up to 3 days. If you and the other party agree, resolve it now.</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      {userId === selected.seller_id && (
                        <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs" onClick={async () => {
                          if (!window.confirm('Accept the dispute and refund the buyer? This cannot be undone.')) return;
                          try {
                            await axiosInstance.post(`/disputes/${selected.id}/seller-accept?user_id=${userId}`);
                            toast.success('Dispute resolved — buyer refunded');
                            setDetailOpen(false); loadDisputes();
                          } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
                        }}>
                          <CheckCircle size={14} className="mr-1" /> Accept & Refund Buyer
                        </Button>
                      )}
                      {userId === selected.buyer_id && (
                        <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs" onClick={async () => {
                          if (!window.confirm('Cancel the dispute? The seller will be paid after 3 days.')) return;
                          try {
                            await axiosInstance.post(`/disputes/${selected.id}/buyer-cancel?user_id=${userId}`);
                            toast.success('Dispute cancelled — issue resolved');
                            setDetailOpen(false); loadDisputes();
                          } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
                        }}>
                          <CheckCircle size={14} className="mr-1" /> Cancel Dispute (Resolved)
                        </Button>
                      )}
                      <Button variant="outline" className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs" onClick={async () => {
                        if (!window.confirm('Escalate to admin? This may take up to 3 days to resolve.')) return;
                        try {
                          await axiosInstance.post(`/disputes/${selected.id}/escalate?user_id=${userId}`);
                          toast.success('Dispute escalated to admin');
                          const res = await axiosInstance.get(`/disputes/${selected.id}`);
                          setSelected(res.data);
                        } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
                      }}>
                        <AlertTriangle size={14} className="mr-1" /> Escalate to Admin
                      </Button>
                    </div>
                  </div>
                )}

                {/* Admin resolve */}
                {user?.role === 'admin' && isOpen(selected.status) && (
                  <div className="p-4 bg-white/5 rounded-lg space-y-3 border border-white/10">
                    <p className="text-white font-bold text-sm">Admin Resolution</p>
                    <Textarea value={resolveReason} onChange={(e) => setResolveReason(e.target.value)}
                      placeholder="Reason for resolution..." className="bg-white/5 border-white/10 text-white" rows={2} />
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer">
                        <div className="flex items-center gap-1 text-white/40 hover:text-white/60 text-xs transition px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                          <Upload size={12} /> Attach evidence
                        </div>
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => handleFileUpload(e, setResolveEvidence)} />
                      </label>
                      {resolveEvidence && (
                        <div className="flex items-center gap-1">
                          <img src={resolveEvidence} alt="" className="h-8 w-8 object-cover rounded border border-white/10" />
                          <button onClick={() => setResolveEvidence('')} className="text-red-400 text-xs">✕</button>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleResolve('buyer_wins')}>
                        <CheckCircle size={16} className="mr-1" /> Refund Buyer
                      </Button>
                      <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => handleResolve('seller_wins')}>
                        <CheckCircle size={16} className="mr-1" /> Release to Seller
                      </Button>
                    </div>
                  </div>
                )}

                {/* Resolution result */}
                {selected.status?.startsWith('resolved') && (
                  <div className={`p-4 rounded-lg border ${selected.resolution === 'buyer_wins' ? 'bg-green-500/10 border-green-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                    <p className={`font-bold text-sm ${selected.resolution === 'buyer_wins' ? 'text-green-300' : 'text-blue-300'}`}>
                      {selected.resolution === 'buyer_wins' ? '✅ Buyer wins — Refund issued' : '✅ Seller wins — Payment released'}
                    </p>
                    {selected.resolution_reason && <p className="text-white/60 text-sm mt-1">{selected.resolution_reason}</p>}
                    {selected.auto_resolved && <p className="text-red-300/60 text-xs mt-1">Auto-resolved (24h deadline expired)</p>}
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
