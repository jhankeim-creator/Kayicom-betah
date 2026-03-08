import { useEffect, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  canPreviewInlineImage,
  formatBytes,
  getInlineImageBytes,
  isInlineImage,
  openPaymentProof
} from '../utils/paymentProof';

const AdminWalletTopups = ({ user, logout, settings }) => {
  const [topups, setTopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [manualIdentifier, setManualIdentifier] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [proofViewerOpen, setProofViewerOpen] = useState(false);
  const [selectedProofUrl, setSelectedProofUrl] = useState('');
  const selectedProofIsInline = isInlineImage(selectedProofUrl);
  const selectedProofSize = selectedProofIsInline ? getInlineImageBytes(selectedProofUrl) : 0;
  const canPreviewSelectedProof = selectedProofIsInline && canPreviewInlineImage(selectedProofUrl);
  const selectedProofSizeLabel = selectedProofIsInline ? formatBytes(selectedProofSize) : null;
  const [proofZoom, setProofZoom] = useState(1);
  const [proofLoadError, setProofLoadError] = useState(false);
  const canRenderSelectedProof = selectedProofUrl && (!selectedProofIsInline || canPreviewSelectedProof) && !proofLoadError;

  useEffect(() => {
    loadTopups();
  }, []);

  const loadTopups = async () => {
    try {
      const res = await axiosInstance.get('/wallet/topups/all');
      setTopups(res.data || []);
    } catch (e) {
      console.error('Load topups error:', e);
      toast.error('Error loading wallet topups');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await axiosInstance.put(`/wallet/topups/${id}/status?payment_status=${status}`);
      toast.success('Updated');
      loadTopups();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error updating topup');
    }
  };

  const badgeVariant = (status) => {
    if (status === 'paid') return 'default';
    if (status === 'pending_verification') return 'default';
    if (status === 'failed' || status === 'rejected') return 'destructive';
    return 'secondary';
  };

  const manualTopup = async () => {
    const identifier = manualIdentifier.trim();
    const amount = Number(manualAmount);
    if (!identifier) {
      toast.error('Please enter user_id, customer_id, or email');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }
    setManualSubmitting(true);
    try {
      const res = await axiosInstance.post('/wallet/admin-adjust', {
        identifier,
        amount,
        reason: manualReason?.trim() || 'Manual wallet topup',
        action: 'credit'
      });
      toast.success(`Wallet updated: $${Number(res.data.wallet_balance).toFixed(2)}`);
      setManualAmount('');
      setManualReason('');
      setManualIdentifier('');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error adjusting wallet');
    } finally {
      setManualSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-white">Wallet Topups</h1>
            <Button onClick={() => (window.location.href = '/admin')} className="bg-green-500 text-white">
              🏠 Admin Home
            </Button>
          </div>

          <Card className="glass-effect border-white/20 mb-6">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">Manual Wallet Topup</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input
                  value={manualIdentifier}
                  onChange={(e) => setManualIdentifier(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  placeholder="user_id or customer_id or email"
                />
                <Input
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  placeholder="Amount (USD)"
                  type="number"
                  step="0.01"
                />
                <Input
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  placeholder="Reason (optional)"
                />
              </div>
              <div className="mt-4">
                <Button
                  onClick={manualTopup}
                  disabled={manualSubmitting}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {manualSubmitting ? 'Submitting...' : 'Credit Wallet'}
                </Button>
              </div>
              <p className="text-white/60 text-xs mt-3">
                Tip: use the customer’s <strong>Customer ID</strong> like <strong>KC-12345678</strong> if you don’t have their user_id.
              </p>
            </CardContent>
          </Card>

          {loading ? (
            <div className="text-white">Loading...</div>
          ) : (
            <div className="space-y-4">
              {topups.map((t) => {
                const proofUrl = t.payment_proof_url;
                const proofIsInline = isInlineImage(proofUrl);
                const canPreviewProof = proofIsInline && canPreviewInlineImage(proofUrl);
                const proofSizeLabel = proofIsInline ? formatBytes(getInlineImageBytes(proofUrl)) : null;
                return (
                <Card key={t.id} className="glass-effect border-white/20">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <p className="text-white font-bold">Topup #{t.id.slice(0, 8)}</p>
                          <Badge variant={badgeVariant(t.payment_status)} className="capitalize">
                            {t.payment_status}
                          </Badge>
                          {t.credited && (
                            <span className="text-green-400 text-xs">credited</span>
                          )}
                        </div>
                        <p className="text-white/80 text-sm">
                          {t.user_email} • ${Number(t.amount).toFixed(2)} • {t.payment_method}
                        </p>
                        {t.transaction_id && (
                          <p className="text-white/60 text-xs mt-1">TX: {t.transaction_id}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-2">
                          {t.payment_proof_url && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-green-400 text-green-400 hover:bg-green-400/10"
                                onClick={() => {
                                  setSelectedProofUrl(t.payment_proof_url);
                                  setProofZoom(1);
                                  setProofLoadError(false);
                                  setProofViewerOpen(true);
                                }}
                              >
                                📸 View Payment Proof
                              </Button>
                              {canPreviewProof && (
                                <img 
                                  src={t.payment_proof_url} 
                                  alt="Payment proof thumbnail" 
                                  className="h-12 w-12 object-cover rounded border border-green-400/30 cursor-pointer hover:border-green-400/60 transition"
                                  onClick={() => {
                                    setSelectedProofUrl(t.payment_proof_url);
                                    setProofZoom(1);
                                    setProofLoadError(false);
                                    setProofViewerOpen(true);
                                  }}
                                  title="Click to view full size"
                                />
                              )}
                              {proofIsInline && !canPreviewProof && (
                                <span className="text-xs text-white/50">
                                  Large inline proof ({proofSizeLabel}). Use View Payment Proof to download.
                                </span>
                              )}
                            </div>
                          )}
                          {t.plisio_invoice_url && (
                            <a 
                              href={t.plisio_invoice_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-green-300 text-sm hover:underline"
                            >
                              🔗 View Invoice
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {(t.payment_status === 'pending' || t.payment_status === 'pending_verification') && (
                          <>
                            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => updateStatus(t.id, 'paid')}>
                              Approve
                            </Button>
                            <Button variant="destructive" onClick={() => updateStatus(t.id, 'rejected')}>
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
              {topups.length === 0 && <p className="text-white/60">No wallet topups yet.</p>}
            </div>
          )}
        </div>
      </div>

      {/* Payment Proof Viewer Modal */}
      <Dialog open={proofViewerOpen} onOpenChange={setProofViewerOpen}>
        <DialogContent className="bg-gray-900 border-white/20 max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Payment Proof</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {selectedProofUrl && (
              <div className="flex flex-col items-center gap-4">
                {canRenderSelectedProof ? (
                  <div className="w-full max-h-[70vh] overflow-auto rounded border border-white/20">
                    <img 
                      src={selectedProofUrl} 
                      alt="Payment proof" 
                      className="block h-auto max-w-full origin-top-left transition-transform"
                      style={{ transform: `scale(${proofZoom})` }}
                      onError={() => setProofLoadError(true)}
                    />
                  </div>
                ) : selectedProofIsInline ? (
                  <div className="text-center text-white/70 text-sm">
                    {proofLoadError
                      ? 'Preview failed to load. Use Download below.'
                      : `Large inline proof (${selectedProofSizeLabel}). Use Download below.`}
                  </div>
                ) : (
                  <a 
                    href={selectedProofUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-green-400 hover:underline"
                  >
                    Open proof in new tab
                  </a>
                )}
                {canRenderSelectedProof && (
                  <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-white/70">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/20 text-white"
                      onClick={() => setProofZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
                    >
                      Zoom -
                    </Button>
                    <span>{Math.round(proofZoom * 100)}%</span>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/20 text-white"
                      onClick={() => setProofZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                    >
                      Zoom +
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/20 text-white"
                      onClick={() => setProofZoom(1)}
                    >
                      Reset
                    </Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="border-white/20 text-white"
                    onClick={() => setProofViewerOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    variant="outline"
                    className="border-green-400 text-green-400 hover:bg-green-400/10"
                    onClick={() => {
                      openPaymentProof(selectedProofUrl, { filename: 'payment-proof.png', action: 'open' });
                    }}
                  >
                    Download / Open
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Footer settings={settings} />
    </div>
  );
};

export default AdminWalletTopups;

