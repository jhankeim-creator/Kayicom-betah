import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Shield } from 'lucide-react';

const TermsPage = ({ user, logout, settings, cart }) => {
  const cartItemCount = cart?.length || 0;
  const siteName = settings?.site_name || 'KayiCom';

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="text-green-400" size={28} />
          <h1 className="text-white font-bold text-2xl">Terms & Conditions</h1>
        </div>

        <div className="prose prose-invert max-w-none space-y-6 text-white/70 text-sm leading-relaxed">
          <p className="text-white/40 text-xs">Last updated: {new Date().toLocaleDateString()}</p>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">1. Acceptance of Terms</h2>
            <p>By accessing and using {siteName}, you agree to be bound by these Terms and Conditions. If you do not agree, please do not use our platform.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">2. Products & Services</h2>
            <p>{siteName} is a digital marketplace for gift cards, game top-ups, subscriptions, and digital services. All products are digital and delivered electronically.</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Products are non-refundable once delivered unless defective.</li>
              <li>Delivery times vary: automatic products are instant; manual products may take up to 24 hours.</li>
              <li>Product availability and pricing may change without notice.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">3. Buyer Terms</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>You must provide accurate payment information and proof when required.</li>
              <li>You are responsible for verifying delivery of your digital products.</li>
              <li>Disputes must be opened within the escrow period. Evidence must be provided.</li>
              <li>Abuse of the dispute system may result in account suspension.</li>
              <li>Wallet balance refunds are final and cannot be converted back to the original payment method.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">4. Seller Terms</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Sellers must complete KYC verification before listing products.</li>
              <li>All products must be legitimate and as described. Fraudulent listings will result in permanent ban.</li>
              <li>Sellers must deliver orders within 24 hours of payment confirmation.</li>
              <li>Earnings are held in escrow until buyer confirms delivery or the escrow period expires.</li>
              <li>The platform charges a commission on each sale (visible in Seller Center).</li>
              <li>Withdrawal fees vary by method and are shown before confirmation.</li>
              <li>Sellers must respond to disputes within 24 hours or forfeit the dispute.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">5. Escrow & Disputes</h2>
            <p>For marketplace orders, payments are held in escrow to protect both parties.</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>After delivery, the buyer can confirm (escrow releases after 3 days) or open a dispute.</li>
              <li>Each party has 24 hours to respond to a dispute. Failure to respond results in automatic loss.</li>
              <li>Admin decisions on disputes are final.</li>
              <li>Evidence (screenshots, transaction IDs) strengthens your case in disputes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">6. Payments</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>We accept cryptocurrency, Binance Pay, PayPal, Skrill, MonCash, Zelle, and Cash App.</li>
              <li>Manual payment methods require proof of payment for verification.</li>
              <li>Payment processing times vary by method.</li>
              <li>All prices are in USD unless otherwise stated.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">7. Account Responsibility</h2>
            <p>You are responsible for maintaining the security of your account. Do not share your credentials. Report unauthorized access immediately.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">8. Privacy</h2>
            <p>We collect and process personal data necessary for providing our services. Your data is stored securely and not shared with third parties except as required for payment processing and order fulfillment.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">9. Limitation of Liability</h2>
            <p>{siteName} is not liable for losses resulting from third-party products, payment processing delays, or circumstances beyond our control. Our liability is limited to the transaction amount.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">10. Contact</h2>
            <p>For questions about these terms, contact us at <a href={`mailto:${settings?.support_email || 'support@kayicom.com'}`} className="text-green-400 hover:underline">{settings?.support_email || 'support@kayicom.com'}</a>.</p>
          </section>
        </div>
      </div>
      <Footer settings={settings} />
    </div>
  );
};

export default TermsPage;
