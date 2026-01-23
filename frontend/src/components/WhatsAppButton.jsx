import { MessageCircle } from 'lucide-react';

const DEFAULT_WHATSAPP_NUMBER = '50939308318';
const DEFAULT_WHATSAPP_MESSAGE = 'Hello! I need support with KayiCom.';

const normalizeWhatsappNumber = (value) => String(value || '').replace(/[^\d]/g, '');

const WhatsAppButton = ({ settings }) => {
  const enabled = settings?.whatsapp_support_enabled ?? true;
  if (!enabled) return null;

  const rawNumber = settings?.whatsapp_support_number || DEFAULT_WHATSAPP_NUMBER;
  const phoneNumber = normalizeWhatsappNumber(rawNumber);
  if (!phoneNumber) return null;

  const message = settings?.whatsapp_support_message || DEFAULT_WHATSAPP_MESSAGE;
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-full shadow-lg transition-all duration-300 hover:scale-110"
      aria-label="Contact us on WhatsApp"
    >
      <MessageCircle size={24} />
      <span className="font-semibold">Support</span>
    </a>
  );
};

export default WhatsAppButton;
