import { useEffect, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  canPreviewInlineImage,
  formatBytes,
  getInlineImageBytes,
  isInlineImage,
  openPaymentProof
} from '../utils/paymentProof';

const AdminCryptoTransactions = ({ user, logout, settings }) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [txHash, setTxHash] = useState('');

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    try {
      const response = await axiosInstance.get('/crypto/transactions/all');
      setTransactions(response.data);
    } catch (error) {
      console.error('Error loading transactions:', error);
      toast.error('Error loading transactions');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (txId, newStatus) => {
    try {
      await axiosInstance.put(`/crypto/transactions/${txId}/status`, {
        status: newStatus,
        admin_notes: adminNotes,
        tx_hash: txHash
      });
      toast.success(`Transaction ${newStatus}`);
      loadTransactions();
      setSelectedTx(null);
      setAdminNotes('');
      setTxHash('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error updating status');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg">
        <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
        <div className="container mx-auto px-4 py-20 text-center">
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-white mb-8">Crypto Transactions</h1>

        <div className="grid gap-4">
          {transactions.map((tx) => {
            const proofUrl = tx.payment_proof || tx.payment_proof_url;
            const receivingInfo = tx.receiving_info || tx.metadata?.receiving_info;
            const walletLabel = tx.transaction_type === 'buy' ? 'Customer Wallet' : 'Deposit Wallet';
            const proofIsInline = isInlineImage(proofUrl);
            const canPreviewProof = proofIsInline && canPreviewInlineImage(proofUrl);
            const proofSizeLabel = proofIsInline ? formatBytes(getInlineImageBytes(proofUrl)) : null;
            return (
              <Card key={tx.id} className="glass-effect border-white/20">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-white font-bold text-lg">
                        {tx.transaction_type === 'buy' ? '🟢 BUY' : '🔵 SELL'} - {tx.chain}
                      </p>
                      <p className="text-white/70">
                        User: {tx.user_email || tx.user_id}
                      </p>
                      <p className="text-white/70 text-sm">
                        {new Date(tx.created_at).toLocaleString()}
                      </p>
                      {tx.transaction_id && (
                        <p className="text-white/60 text-xs mt-1 break-all">
                          Reference: {tx.transaction_id}
                        </p>
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      tx.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      tx.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      tx.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {tx.status}
                    </span>
                  </div>

                <div className="bg-white/5 p-4 rounded-lg mb-4 space-y-2">
                  <div className="flex justify-between text-white/70">
                    <span>Amount USD:</span>
                    <span className="text-white font-bold">${tx.amount_usd}</span>
                  </div>
                  <div className="flex justify-between text-white/70">
                    <span>Amount USDT:</span>
                    <span className="text-white font-bold">{tx.amount_crypto} USDT</span>
                  </div>
                  <div className="flex justify-between text-white/70">
                    <span>Payment Method:</span>
                    <span className="text-white">{tx.payment_method}</span>
                  </div>
                  {tx.invoice_id && (
                    <div className="flex justify-between text-white/70">
                      <span>Invoice:</span>
                      <span className="text-white">{tx.invoice_id}</span>
                    </div>
                  )}
                  {tx.plisio_invoice_id && (
                    <div className="flex justify-between text-white/70">
                      <span>Plisio Invoice:</span>
                      <span className="text-white">{tx.plisio_invoice_id}</span>
                    </div>
                  )}
                  {tx.plisio_invoice_url && (
                    <div className="flex justify-between text-white/70">
                      <span>Plisio Link:</span>
                      <a
                        href={tx.plisio_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-300 text-sm underline"
                      >
                        View invoice
                      </a>
                    </div>
                  )}
                  {tx.payer_info && (
                    <div className="flex justify-between text-white/70">
                      <span>Payer Info:</span>
                      <span className="text-white text-sm break-all">{tx.payer_info}</span>
                    </div>
                  )}
                  {tx.wallet_address && (
                    <div className="flex justify-between text-white/70">
                      <span>{walletLabel}:</span>
                      <span className="text-white text-xs break-all">{tx.wallet_address}</span>
                    </div>
                  )}
                  {receivingInfo && (
                    <div className="flex justify-between text-white/70">
                      <span>Payout Info:</span>
                      <span className="text-white text-sm">{receivingInfo}</span>
                    </div>
                  )}
                </div>

                {tx.transaction_id && (
                  <div className="bg-blue-500/10 p-3 rounded mb-3">
                    <p className="text-blue-300 text-sm font-semibold">Payment Reference:</p>
                    <p className="text-white text-xs break-all">{tx.transaction_id}</p>
                  </div>
                )}

                {proofUrl && (
                  <div className="bg-green-500/10 p-3 rounded mb-3">
                    <p className="text-green-300 text-sm font-semibold">Payment Proof:</p>
                    <a
                      href={proofUrl}
                      {...(proofIsInline && !canPreviewProof
                        ? { download: 'payment-proof.png' }
                        : { target: '_blank', rel: 'noopener noreferrer' })}
                      className="text-white text-xs break-all underline"
                    >
                      {proofIsInline && !canPreviewProof ? 'Download proof' : 'View proof'}
                    </a>
                    {canPreviewProof && (
                      <div className="mt-2">
                        <img
                          src={proofUrl}
                          alt="Payment proof"
                          className="h-24 w-auto rounded border border-green-500/30 cursor-zoom-in"
                          onClick={() => {
                            openPaymentProof(proofUrl, { filename: 'payment-proof.png', action: 'open' });
                          }}
                          title="Click to enlarge"
                        />
                      </div>
                    )}
                    {proofIsInline && !canPreviewProof && (
                      <p className="text-white/60 text-xs mt-2">
                        Large inline proof ({proofSizeLabel}). Download to view.
                      </p>
                    )}
                  </div>
                )}

                {tx.admin_notes && (
                  <div className="bg-purple-500/10 p-3 rounded mb-3">
                    <p className="text-purple-300 text-sm font-semibold">Admin Notes:</p>
                    <p className="text-white text-sm">{tx.admin_notes}</p>
                  </div>
                )}

                {tx.tx_hash && (
                  <div className="bg-cyan-500/10 p-3 rounded mb-3">
                    <p className="text-cyan-300 text-sm font-semibold">Blockchain TX Hash:</p>
                    <p className="text-white text-xs break-all">{tx.tx_hash}</p>
                  </div>
                )}

                {tx.status === 'pending' && (
                  <div className="mt-4 space-y-3">
                    {selectedTx === tx.id ? (
                      <>
                        <div>
                          <Label className="text-white/70 text-sm">Transaction Hash (Optional)</Label>
                          <Input
                            placeholder="Enter blockchain transaction hash"
                            value={txHash}
                            onChange={(e) => setTxHash(e.target.value)}
                            className="bg-white/10 border-white/20 text-white mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-white/70 text-sm">Admin Notes</Label>
                          <Textarea
                            placeholder="Add notes about this transaction"
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                            className="bg-white/10 border-white/20 text-white mt-1"
                            rows={2}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => updateStatus(tx.id, 'completed')}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            ✓ Complete
                          </Button>
                          <Button
                            onClick={() => updateStatus(tx.id, 'rejected')}
                            variant="destructive"
                          >
                            ✗ Reject
                          </Button>
                          <Button
                            onClick={() => {
                              setSelectedTx(null);
                              setAdminNotes('');
                              setTxHash('');
                            }}
                            variant="ghost"
                            className="text-white"
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button
                        onClick={() => setSelectedTx(tx.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Process Transaction
                      </Button>
                    )}
                  </div>
                )}
                </CardContent>
              </Card>
            );
          })}

          {transactions.length === 0 && (
            <Card className="glass-effect border-white/20">
              <CardContent className="p-12 text-center">
                <p className="text-white/70">No transactions yet</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default AdminCryptoTransactions;
