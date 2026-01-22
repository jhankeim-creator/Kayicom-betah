import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';

const DEFAULT_REFUND_POLICY = [
  'Refund Policy',
  '',
  'Digital goods are non-refundable once delivered or redeemed.',
  'If you do not receive your order or receive the wrong item, contact support within 24 hours.',
  'Approved refunds are issued as wallet credit unless required otherwise by law.',
  'Chargebacks or fraudulent activity may result in account restrictions.'
].join('\n');

const RefundPolicy = ({ user, logout, cart, settings }) => {
  const cartItemCount = (cart || []).reduce((sum, item) => sum + item.quantity, 0);
  const policy = settings?.refund_policy || DEFAULT_REFUND_POLICY;

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">Refund Policy</h1>
          <Card className="glass-effect border-white/20">
            <CardContent className="p-6">
              <div className="text-white/80 whitespace-pre-wrap leading-relaxed">
                {policy}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default RefundPolicy;
