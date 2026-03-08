import { useEffect, useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, DollarSign, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

const ReferralPage = ({ user, logout, settings }) => {
  const [referralInfo, setReferralInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReferralInfo();
  }, []);

  const loadReferralInfo = async () => {
    try {
      // Get from localStorage directly
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = storedUser.user_id || storedUser.id;
      
      if (!userId) {
        throw new Error('No user ID found');
      }
      
      const response = await axiosInstance.get(`/referral/info?user_id=${userId}`);
      setReferralInfo(response.data);
    } catch (error) {
      console.error('Error loading referral info:', error);
      toast.error('Error loading referral information');
    } finally {
      setLoading(false);
    }
  };

  const copyReferralLink = () => {
    if (referralInfo) {
      navigator.clipboard.writeText(referralInfo.referral_link);
      setCopied(true);
      toast.success('Referral link copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen gradient-bg">
        <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl text-white mb-4">Please login to access referral program</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-4">
          Referral Program
        </h1>
        <p className="text-white/80 text-center mb-12 max-w-2xl mx-auto">
          Earn $1 for every friend who subscribes through your referral link!
        </p>

        {loading ? (
          <div className="text-center text-white">Loading...</div>
        ) : referralInfo && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="glass-effect border-white/20">
                <CardContent className="p-6 text-center">
                  <DollarSign className="mx-auto mb-3 text-green-400" size={48} />
                  <p className="text-white/70 text-sm mb-2">Available Balance</p>
                  <p className="text-4xl font-bold text-white">
                    ${referralInfo.referral_balance.toFixed(2)}
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-effect border-white/20">
                <CardContent className="p-6 text-center">
                  <Users className="mx-auto mb-3 text-green-400" size={48} />
                  <p className="text-white/70 text-sm mb-2">Total Referrals</p>
                  <p className="text-4xl font-bold text-white">{referralInfo.total_referrals}</p>
                </CardContent>
              </Card>

              <Card className="glass-effect border-white/20">
                <CardContent className="p-6 text-center">
                  <DollarSign className="mx-auto mb-3 text-green-400" size={48} />
                  <p className="text-white/70 text-sm mb-2">Earned per Subscription</p>
                  <p className="text-4xl font-bold text-white">$1.00</p>
                </CardContent>
              </Card>
            </div>

            {/* Referral Link */}
            <Card className="glass-effect border-white/20">
              <CardContent className="p-6">
                <h2 className="text-2xl font-bold text-white mb-4">Your Referral Link</h2>
                <div className="flex gap-3">
                  <Input
                    value={referralInfo.referral_link}
                    readOnly
                    className="bg-white/10 border-white/20 text-white"
                  />
                  <Button
                    onClick={copyReferralLink}
                    className="bg-white text-green-600 hover:bg-gray-100 flex items-center gap-2"
                  >
                    {copied ? <Check size={20} /> : <Copy size={20} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <p className="text-white/70 text-sm mt-4">
                  Your referral code: <span className="text-white font-bold">{referralInfo.referral_code}</span>
                </p>
              </CardContent>
            </Card>

            {/* How it Works */}
            <Card className="glass-effect border-white/20">
              <CardContent className="p-6">
                <h2 className="text-2xl font-bold text-white mb-4">How It Works</h2>
                <div className="space-y-4 text-white/80">
                  <div className="flex items-start gap-3">
                    <span className="bg-cyan-500 text-white rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">1</span>
                    <div>
                      <p className="font-semibold text-white">Share Your Link</p>
                      <p className="text-sm">Send your referral link to friends and family</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">2</span>
                    <div>
                      <p className="font-semibold text-white">They Subscribe</p>
                      <p className="text-sm">When they purchase a subscription plan, you earn $1</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">3</span>
                    <div>
                      <p className="font-semibold text-white">Withdraw Earnings</p>
                      <p className="text-sm">Cash out your balance anytime (minimum $5)</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Withdraw Button */}
            {referralInfo.referral_balance >= 5 && (
              <Card className="glass-effect border-green-500/30 border-2">
                <CardContent className="p-6 text-center">
                  <p className="text-white mb-4">You have enough balance to withdraw!</p>
                  <Button
                    onClick={() => window.location.href = '/withdraw'}
                    className="bg-green-500 hover:bg-green-600 text-white"
                  >
                    Withdraw Now
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default ReferralPage;
