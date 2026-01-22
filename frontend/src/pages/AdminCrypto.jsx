import { useEffect, useState } from 'react';
import { axiosInstance } from '../App';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const AdminCrypto = () => {
  const [config, setConfig] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
    loadTransactions();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await axiosInstance.get('/crypto/config');
      setConfig(response.data);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const loadTransactions = async () => {
    try {
      const response = await axiosInstance.get('/crypto/transactions/all');
      setTransactions(response.data || []);
    } catch (error) {
      console.error('Error loading transactions:', error);
      setTransactions([]); // Set empty array on error
    }
  };

  const updateConfig = async () => {
    setLoading(true);
    try {
      await axiosInstance.put('/crypto/config', config);
      toast.success('Config updated');
    } catch (error) {
      toast.error('Error updating config');
    } finally {
      setLoading(false);
    }
  };

  const updateTransactionStatus = async (txId, status) => {
    try {
      await axiosInstance.put(`/crypto/transactions/${txId}/status`, {
        status
      });
      toast.success('Status updated');
      loadTransactions();
    } catch (error) {
      toast.error('Error');
    }
  };

  if (!config) return <div className="text-white">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Crypto Management</h2>
        <Button 
          onClick={() => window.location.href = '/admin'}
          className="bg-gradient-to-r from-pink-500 to-blue-500 text-white"
        >
          🏠 Admin Home
        </Button>
      </div>

      <Tabs defaultValue="config" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <Card className="glass-effect border-white/20">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-xl font-bold text-white mb-4">Exchange Rates & Fees</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">BEP20 Buy Rate</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.buy_rate_bep20}
                    onChange={(e) => setConfig({...config, buy_rate_bep20: parseFloat(e.target.value)})}
                    className="bg-white/10 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-white">BEP20 Sell Rate</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.sell_rate_bep20}
                    onChange={(e) => setConfig({...config, sell_rate_bep20: parseFloat(e.target.value)})}
                    className="bg-white/10 text-white mt-1"
                  />
                </div>
                
                <div>
                  <Label className="text-white">Buy Fee %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config.buy_fee_percent}
                    onChange={(e) => setConfig({...config, buy_fee_percent: parseFloat(e.target.value)})}
                    className="bg-white/10 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-white">Sell Fee %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config.sell_fee_percent}
                    onChange={(e) => setConfig({...config, sell_fee_percent: parseFloat(e.target.value)})}
                    className="bg-white/10 text-white mt-1"
                  />
                </div>
              </div>

              <div className="p-4 bg-blue-400/10 border border-blue-400/30 rounded-lg mt-6">
                <p className="text-blue-200 text-sm">
                  <strong>Note:</strong> Sell USDT uses Plisio automatic wallet generation. Buy USDT is manual payment verification.
                </p>
              </div>

              <Button
                onClick={updateConfig}
                disabled={loading}
                className="w-full bg-white text-purple-600 hover:bg-gray-100 mt-6"
              >
                {loading ? 'Saving...' : 'Save Configuration'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <div className="space-y-4">
            {transactions.map((tx) => {
              const receivingInfo = tx.receiving_info || tx.metadata?.receiving_info;
              const walletLabel = tx.transaction_type === 'buy' ? 'Customer Wallet' : 'Deposit Wallet';
              const proofUrl = tx.payment_proof || tx.payment_proof_url;
              return (
                <Card key={tx.id} className="glass-effect border-white/20">
                  <CardContent className="p-4">
                    <div className="flex justify-between">
                      <div>
                        <p className="text-white font-bold">
                          {tx.transaction_type.toUpperCase()} {tx.amount_crypto.toFixed(2)} USDT
                        </p>
                        <p className="text-white/70 text-sm">{tx.user_email}</p>
                        <p className="text-white/70 text-sm">
                          {tx.chain} - ${Number(tx.total_usd || 0).toFixed(2)}
                        </p>
                        <p className="text-white/60 text-xs">{new Date(tx.created_at).toLocaleString()}</p>
                        <div className="mt-2 space-y-1 text-white/70 text-xs">
                          {tx.payment_method && (
                            <p>
                              Payment Method: <span className="text-white">{tx.payment_method}</span>
                            </p>
                          )}
                          {tx.payer_info && (
                            <p className="break-all">
                              Payer Info: <span className="text-white">{tx.payer_info}</span>
                            </p>
                          )}
                          {receivingInfo && (
                            <p className="break-all">
                              Payout Info: <span className="text-white">{receivingInfo}</span>
                            </p>
                          )}
                          {tx.wallet_address && (
                            <p className="break-all">
                              {walletLabel}: <span className="text-white">{tx.wallet_address}</span>
                            </p>
                          )}
                          {tx.transaction_id && (
                            <p className="break-all">
                              Reference: <span className="text-white">{tx.transaction_id}</span>
                            </p>
                          )}
                        </div>
                        {proofUrl && (
                          <div className="mt-2">
                            <a
                              href={proofUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cyan-300 text-xs underline"
                            >
                              View payment proof
                            </a>
                            {proofUrl.startsWith('data:image') && (
                              <p className="text-white/60 text-xs mt-1">
                                Inline preview disabled for inline images.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    
                    <div className="flex flex-col gap-2 items-end">
                      <span className={`px-3 py-1 rounded text-sm ${
                        tx.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                        tx.status === 'processing' ? 'bg-blue-500/20 text-blue-400' :
                        tx.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {tx.status}
                      </span>
                      
                      {tx.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => updateTransactionStatus(tx.id, 'processing')}
                            className="bg-blue-500 text-white text-xs"
                          >
                            Process
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => updateTransactionStatus(tx.id, 'failed')}
                            className="bg-red-500 text-white text-xs"
                          >
                            Fail
                          </Button>
                        </div>
                      )}
                      
                      {tx.status === 'processing' && (
                        <Button
                          size="sm"
                          onClick={() => updateTransactionStatus(tx.id, 'completed')}
                          className="bg-green-500 text-white text-xs"
                        >
                          Complete
                        </Button>
                      )}
                    </div>
                  </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminCrypto;
