import { useCallback, useEffect, useMemo, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { buildPlisioInvoiceUrl, openPlisioInvoice } from '../utils/plisioInvoice';

const MinutesTransferPage = ({ user, logout, settings }) => {
  const userId = user?.user_id || user?.id;

  const [country, setCountry] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');

  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [walletBalance, setWalletBalance] = useState(0);

  const [creating, setCreating] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);

  const [transfers, setTransfers] = useState([]);
  const [loadingTransfers, setLoadingTransfers] = useState(true);
  const [selectedTransferId, setSelectedTransferId] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [proofTxId, setProofTxId] = useState('');
  const [proofUrl, setProofUrl] = useState('');

  const enabledPaymentMethods = useMemo(() => {
    const methods = [{ value: 'wallet', label: 'Wallet Balance' }];
    methods.push({ value: 'crypto_plisio', label: 'Crypto (Automatic)' });
    const gateways = settings?.payment_gateways || {};
    for (const key of Object.keys(gateways)) {
      if (gateways[key]?.enabled && key !== 'crypto_usdt') {
        methods.push({ value: key, label: key.replaceAll('_', ' ').toUpperCase() });
      }
    }
    return methods;
  }, [settings]);

  const loadTransfers = useCallback(async () => {
    setLoadingTransfers(true);
    try {
      const res = await axiosInstance.get(`/mobile-topup/requests/user/${userId}`);
      setTransfers(res.data || []);
    } catch (e) {
      toast.error('Error loading minutes transfers');
    } finally {
      setLoadingTransfers(false);
    }
  }, [userId]);

  const loadWallet = useCallback(async () => {
    try {
      const res = await axiosInstance.get(`/wallet/balance?user_id=${userId}`);
      setWalletBalance(res.data?.wallet_balance || 0);
    } catch (e) {
      // ignore
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadTransfers();
      loadWallet();
    }
  }, [userId, loadTransfers, loadWallet]);

  useEffect(() => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || isNaN(amt)) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setQuoting(true);
      try {
        // Build URL with optional country parameter
        let url = `/mobile-topup/quote?amount=${encodeURIComponent(amt)}`;
        if (country && country.trim()) {
          url += `&country=${encodeURIComponent(country.trim())}`;
        }
        const res = await axiosInstance.get(url);
        if (!cancelled && res.data) {
          setQuote(res.data);
        }
      } catch (e) {
        if (!cancelled) {
          setQuote(null);
          // Only show error if amount is valid (user is actively entering)
          if (amt > 0 && amount.trim()) {
            console.error('Quote error:', e.response?.data?.detail || e.message);
          }
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    };
    // Debounce quote requests
    const timeoutId = setTimeout(run, 500);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [amount, country]);

  const createTransfer = async () => {
    const amt = parseFloat(amount);
    if (!country || !country.trim()) {
      toast.error('Please enter a country');
      return;
    }
    if (!phone || !phone.trim()) {
      toast.error('Please enter a phone number');
      return;
    }
    if (!amt || amt <= 0 || isNaN(amt)) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    // Check if quote is available
    if (!quote) {
      toast.error('Please wait for quote calculation');
      return;
    }
    
    setCreating(true);
    // Store form values before submission to check if transfer was created
    const formData = {
      country: country.trim(),
      phone: phone.trim(),
      amount: amt
    };
    
    try {
      const res = await axiosInstance.post(
        `/mobile-topup/requests?user_id=${userId}&user_email=${encodeURIComponent(user.email || '')}`,
        { 
          country: formData.country, 
          phone_number: formData.phone, 
          amount: formData.amount, 
          payment_method: paymentMethod 
        }
      );
      
      // Check if we got a valid response
      if (res && res.data) {
        toast.success('Mobile topup request created successfully!');
        setPaymentInfo(res.data?.payment_info || null);
        const id = res.data?.transfer?.id;
        setSelectedTransferId(id || null);
        setProofTxId('');
        setProofUrl('');
        // Reset form
        setCountry('');
        setPhone('');
        setAmount('');
        setQuote(null);
        await loadTransfers();
        await loadWallet();
      } else {
        // Response received but no data - still consider it success if admin can see it
        toast.success('Request submitted. Please check your topup history.');
        await loadTransfers();
        await loadWallet();
      }
    } catch (e) {
      console.error('Transfer creation error:', e);
      
      // More detailed error handling
      let errorMsg = 'Error creating transfer';
      let transferWasCreated = false;
      
      if (e.response) {
        // Server responded with error status
        errorMsg = e.response.data?.detail || e.response.data?.message || `Server error: ${e.response.status}`;
        // Don't check for created transfer on actual server errors (400, 500, etc.)
      } else if (e.request) {
        // Request made but no response received - might have succeeded anyway
        // Check if transfer was actually created by reloading and checking
        try {
          // Wait a moment for backend to finish processing
          await new Promise(resolve => setTimeout(resolve, 500));
          const updatedTransfersRes = await axiosInstance.get(`/mobile-topup/requests/user/${userId}`);
          const updatedTransfers = updatedTransfersRes.data || [];
          
          // Look for a transfer matching our form data created in the last 15 seconds
          const recentTransfer = updatedTransfers.find(t => {
            const matchesCountry = t.country?.toLowerCase() === formData.country.toLowerCase();
            const matchesPhone = t.phone_number === formData.phone;
            const matchesAmount = Math.abs(parseFloat(t.amount) - formData.amount) < 0.01;
            const isRecent = new Date(t.created_at) > new Date(Date.now() - 15000);
            return matchesCountry && matchesPhone && matchesAmount && isRecent;
          });
          
          if (recentTransfer) {
            // Transfer was created successfully despite network error
            transferWasCreated = true;
            toast.success('Mobile topup request created successfully!');
            setSelectedTransferId(recentTransfer.id || null);
            setProofTxId('');
            setProofUrl('');
            // Reset form
            setCountry('');
            setPhone('');
            setAmount('');
            setQuote(null);
            // Update the transfers list in state
            await loadTransfers();
            await loadWallet();
          }
        } catch (checkError) {
          console.error('Error checking if transfer was created:', checkError);
        }
        
        if (!transferWasCreated) {
          errorMsg = 'Network error: No response from server. Please check if your request was created in the history.';
          // Still reload to update UI
          await loadTransfers();
          await loadWallet();
        }
      } else {
        // Error setting up the request
        errorMsg = e.message || 'Error creating transfer';
      }
      
      if (!transferWasCreated) {
        toast.error(errorMsg);
      }
    } finally {
      setCreating(false);
    }
  };

  const uploadProofFile = async (file) => {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB');
      return null;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axiosInstance.post('/upload/image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data?.url || null;
    } catch (e) {
      toast.error('Upload failed');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const submitProof = async () => {
    if (!selectedTransferId) {
      toast.error('Select a transfer first');
      return;
    }
    if (!proofTxId || !proofUrl) {
      toast.error('Transaction ID and proof required');
      return;
    }
    try {
      await axiosInstance.post('/mobile-topup/requests/proof', {
        transfer_id: selectedTransferId,
        transaction_id: proofTxId,
        payment_proof_url: proofUrl
      });
      toast.success('Proof submitted');
      setProofTxId('');
      setProofUrl('');
      await loadTransfers();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error submitting proof');
    }
  };

  const selectedTransfer = transfers.find(t => t.id === selectedTransferId) || null;
  const transferInvoiceUrl = selectedTransfer
    ? buildPlisioInvoiceUrl(selectedTransfer.plisio_invoice_url, selectedTransfer.plisio_invoice_id)
    : null;
  const enabled = settings?.minutes_transfer_enabled ?? true;

  useEffect(() => {
    if (!selectedTransfer) return;
    if (
      selectedTransfer.payment_method === 'crypto_plisio' &&
      ['pending', 'processing'].includes(selectedTransfer.payment_status) &&
      transferInvoiceUrl
    ) {
      openPlisioInvoice(transferInvoiceUrl, selectedTransfer.id);
    }
  }, [selectedTransfer, transferInvoiceUrl]);

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto space-y-6">
          <h1 className="text-4xl font-bold text-white">Topup Mobile</h1>

          {!enabled && (
            <Card className="glass-effect border-white/20">
              <CardContent className="p-6">
                <p className="text-white/80">This service is currently disabled.</p>
              </CardContent>
            </Card>
          )}

          <Card className="glass-effect border-white/20">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-2xl font-bold text-white">Create a Mobile Topup</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-white">Country</Label>
                  <Input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="bg-white/10 border-white/20 text-white mt-2"
                    placeholder="e.g., Haiti, USA, France"
                  />
                </div>
                <div>
                  <Label className="text-white">Phone Number</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bg-white/10 border-white/20 text-white mt-2"
                    placeholder="+509..."
                  />
                </div>
                <div>
                  <Label className="text-white">Amount (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-white/10 border-white/20 text-white mt-2"
                    placeholder="Enter amount"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="bg-white/10 border-white/20 text-white mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {enabledPaymentMethods.map(m => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {paymentMethod === 'wallet' && (
                    <p className="text-white/60 text-xs mt-2">
                      Wallet balance: <span className="text-white font-semibold">${Number(walletBalance).toFixed(2)}</span>
                    </p>
                  )}
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <p className="text-white/70 text-sm">Fee</p>
                  <p className="text-white text-2xl font-bold">
                    {quoting ? '...' : quote ? `$${Number(quote.fee_amount).toFixed(2)}` : '$0.00'}
                  </p>
                  <p className="text-white/70 text-sm mt-2">Total</p>
                  <p className="text-white text-2xl font-bold">
                    {quoting ? '...' : quote ? `$${Number(quote.total_amount).toFixed(2)}` : '$0.00'}
                  </p>
                </div>
              </div>

              <Button
                onClick={createTransfer}
                disabled={!enabled || creating}
                className="w-full bg-white text-purple-600 hover:bg-gray-100"
              >
                {creating ? 'Creating...' : 'Submit'}
              </Button>

              {paymentInfo?.service_instructions && (
                <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
                  <p className="text-white/80 text-sm">{paymentInfo.service_instructions}</p>
                </div>
              )}

              {paymentInfo?.instructions && (
                <div className="p-4 bg-yellow-400/10 border border-yellow-400/30 rounded-lg">
                  <p className="text-yellow-200 text-sm">
                    <strong>Payment instructions:</strong> {paymentInfo.instructions}
                  </p>
                  {paymentInfo.email && (
                    <p className="text-yellow-200 text-sm mt-1">
                      <strong>Account:</strong> {paymentInfo.email}
                    </p>
                  )}
                </div>
              )}

              {transferInvoiceUrl && (
                <p className="text-white/70 text-sm">
                  Invoice opened automatically. If it did not open,{" "}
                  <a
                    href={transferInvoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-200 underline"
                  >
                    open it here
                  </a>
                  .
                </p>
              )}

              {/* Proof upload for manual methods */}
              {selectedTransfer && selectedTransfer.payment_method !== 'crypto_plisio' && selectedTransfer.payment_method !== 'wallet' &&
                ['pending', 'failed'].includes(selectedTransfer.payment_status) && (
                <div className="mt-2 p-4 bg-yellow-400/10 border border-yellow-400/30 rounded-lg space-y-3">
                  <p className="text-yellow-200 text-sm">
                    Submit payment proof (screenshot + transaction ID).
                  </p>
                  <div>
                    <Label className="text-white">Transaction ID</Label>
                    <Input
                      value={proofTxId}
                      onChange={(e) => setProofTxId(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-2"
                      placeholder="Enter transaction ID"
                    />
                  </div>
                  <div>
                    <Label className="text-white">Upload Screenshot</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      disabled={uploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        const url = await uploadProofFile(file);
                        if (url) {
                          setProofUrl(url);
                          toast.success('Uploaded');
                        }
                      }}
                      className="bg-white/10 border-white/20 text-white mt-2 cursor-pointer"
                    />
                    {proofUrl && (
                      <img src={proofUrl} alt="Proof" className="mt-2 max-h-32 rounded border border-white/10" />
                    )}
                  </div>
                  <Button onClick={submitProof} className="w-full bg-yellow-400 text-gray-900 hover:bg-yellow-300">
                    Submit Proof
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-effect border-white/20">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold text-white mb-4">Topup History</h2>
              {loadingTransfers ? (
                <p className="text-white/70">Loading...</p>
              ) : (
                <div className="space-y-3">
                  {transfers.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTransferId(t.id)}
                      className={`w-full text-left p-4 rounded-lg border transition ${
                        selectedTransferId === t.id ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 bg-white/5 hover:border-white/30'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div>
                          <p className="text-white font-semibold">
                            {t.country} • {t.phone_number} • ${Number(t.total_amount).toFixed(2)}
                          </p>
                          <p className="text-white/60 text-xs">
                            {new Date(t.created_at).toLocaleString()} • {t.payment_method}
                          </p>
                        </div>
                        <div className="text-white/80 text-sm">
                          {t.payment_status} / {t.transfer_status}
                        </div>
                      </div>
                    </button>
                  ))}
                  {transfers.length === 0 && <p className="text-white/60">No transfers yet.</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default MinutesTransferPage;

