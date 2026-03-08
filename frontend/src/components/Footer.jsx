import { useContext } from 'react';
import { Mail, MessageCircle, Facebook, Instagram, Youtube, Twitter } from 'lucide-react';
import { LanguageContext } from '../App';

const Footer = ({ settings }) => {
  const { t } = useContext(LanguageContext);

  const links = settings?.social_links || {};
  const socialItems = [
    { key: 'facebook', label: 'Facebook', href: links.facebook, Icon: Facebook },
    { key: 'instagram', label: 'Instagram', href: links.instagram, Icon: Instagram },
    { key: 'tiktok', label: 'TikTok', href: links.tiktok, Icon: null },
    { key: 'youtube', label: 'YouTube', href: links.youtube, Icon: Youtube },
    { key: 'twitter', label: 'Twitter', href: links.twitter, Icon: Twitter },
    { key: 'telegram', label: 'Telegram', href: links.telegram, Icon: null },
    { key: 'whatsapp', label: 'WhatsApp', href: links.whatsapp, Icon: MessageCircle },
  ].filter(i => i.href && String(i.href).trim());

  return (
    <footer className="mt-16 border-t border-white/5 bg-[#0a0a0a]">
      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Logo & Description */}
          <div>
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="h-10 w-auto mb-4" />
            ) : (
              <img src="/images/kayeecomlogo.png" alt="KayiCom" className="h-10 w-auto mb-4" />
            )}
            <p className="text-sm text-white/50 leading-relaxed">
              Platform for purchasing gift cards, game top-ups, subscriptions and digital services.
            </p>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-white font-semibold mb-4">Company</h3>
            <ul className="space-y-2.5 text-sm">
              <li><a href="/" className="text-white/60 hover:text-green-400 transition">About Us</a></li>
              <li><a href="/products" className="text-white/60 hover:text-green-400 transition">{t('products')}</a></li>
              <li><a href="/" className="text-white/60 hover:text-green-400 transition">Contact us</a></li>
              <li><a href="/blog" className="text-white/60 hover:text-green-400 transition">Blogs</a></li>
              <li><a href="/refund-policy" className="text-white/60 hover:text-green-400 transition">{t('refundPolicy')}</a></li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-white font-semibold mb-4">Categories</h3>
            <ul className="space-y-2.5 text-sm">
              <li><a href="/products/gift-cards" className="text-white/60 hover:text-green-400 transition">Gift Cards</a></li>
              <li><a href="/products/game-top-up" className="text-white/60 hover:text-green-400 transition">Game Top-Up</a></li>
              <li><a href="/products/subscriptions" className="text-white/60 hover:text-green-400 transition">Subscriptions</a></li>
              <li><a href="/products/services" className="text-white/60 hover:text-green-400 transition">Services</a></li>
            </ul>
          </div>

          {/* Contact & Social */}
          <div>
            <h3 className="text-white font-semibold mb-4">Social</h3>
            <ul className="space-y-2.5 text-sm">
              {socialItems.map(({ key, label, href }) => (
                <li key={key}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/60 hover:text-green-400 transition"
                  >
                    {label}
                  </a>
                </li>
              ))}
              {socialItems.length === 0 && (
                <>
                  <li><span className="text-white/60">Facebook</span></li>
                  <li><span className="text-white/60">Twitter</span></li>
                  <li><span className="text-white/60">Instagram</span></li>
                </>
              )}
            </ul>
          </div>
        </div>

        {/* Trustpilot Link */}
        {settings?.trustpilot_enabled && settings?.trustpilot_business_id && (
          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <a
              href={`https://fr.trustpilot.com/review/${settings.trustpilot_business_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-500 text-black font-semibold rounded-lg hover:bg-green-600 transition"
            >
              ⭐ View Our Trustpilot Reviews →
            </a>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-white/40">
          <div className="flex gap-4">
            <a href="/refund-policy" className="hover:text-white/70 transition">Privacy Policy</a>
            <span>|</span>
            <a href="/refund-policy" className="hover:text-white/70 transition">Terms & Conditions</a>
          </div>
          <p>&copy;{new Date().getFullYear()} {settings?.site_name || 'KayiCom'} {t('allRightsReserved')}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
