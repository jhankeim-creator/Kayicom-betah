import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const PaymentSuccessPage = ({ user, logout, settings }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const type = (params.get('type') || 'order').toLowerCase();
  const id = params.get('id') || '';

  const action = useMemo(() => {
    switch (type) {
      case 'wallet_topup':
        return { label: 'Go to Wallet', href: '/wallet' };
      case 'minutes_transfer':
        return { label: 'View Mobile Topups', href: '/minutes' };
      case 'crypto_sell':
        return { label: 'View Crypto Transactions', href: '/crypto' };
      case 'order':
      default:
        return id ? { label: 'View Order', href: `/track/${id}` } : null;
    }
  }, [type, id]);

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          <Card className="glass-effect border-green-500/30">
            <CardContent className="p-8 text-center space-y-6">
              <div className="flex justify-center">
                <CheckCircle className="text-green-400" size={64} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Payment Successful</h1>
                <p className="text-white/70 mt-2">Your payment has been confirmed successfully.</p>
              </div>
              {id && (
                <p className="text-white/60 text-sm">
                  Reference: <span className="text-white font-semibold">{id}</span>
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {action && (
                  <Button
                    onClick={() => navigate(action.href)}
                    className="bg-green-500 hover:bg-green-600 text-white"
                  >
                    {action.label}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="border-white/20 text-white"
                  onClick={() => navigate('/')}
                >
                  Back to Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default PaymentSuccessPage;
