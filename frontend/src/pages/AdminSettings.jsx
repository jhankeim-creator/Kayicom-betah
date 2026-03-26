import { useState, useEffect, useCallback, useMemo, startTransition } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, Settings as SettingsIcon, Key, Package, Mail, Plus, X, HelpCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const CORE_CATEGORIES = ['giftcard', 'topup', 'subscription', 'service'];
const DEFAULT_GIFTCARD_CATEGORIES = ['Shopping', 'Gaming', 'Entertainment', 'Food', 'Travel', 'Other'];
const DEFAULT_GIFTCARD_TAXONOMY = DEFAULT_GIFTCARD_CATEGORIES.map((name) => ({
  name,
  subcategories: []
}));
const DEFAULT_REFUND_POLICY = [
  'Refund Policy',
  '',
  'Digital goods are non-refundable once delivered or redeemed.',
  'If you do not receive your order or receive the wrong item, contact support within 24 hours.',
  'Approved refunds are issued as wallet credit unless required otherwise by law.',
  'Chargebacks or fraudulent activity may result in account restrictions.'
].join('\n');
const normalizeCategoryKey = (value = '') => String(value || '').trim().toLowerCase();

const mergeCategories = (base = [], extras = []) => {
  const combined = [...base, ...extras];
  const seen = new Set();
  return combined.reduce((acc, item) => {
    const key = normalizeCategoryKey(item);
    if (!key || seen.has(key)) return acc;
    seen.add(key);
    acc.push(String(item).trim());
    return acc;
  }, []);
};

const isCoreCategory = (value) => CORE_CATEGORIES.includes(normalizeCategoryKey(value));

const AdminSettings = ({ user, logout, settings: currentSettings, loadSettings }) => {
  const [loading, setLoading] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testingNatcash, setTestingNatcash] = useState(false);
  const [testingBinance, setTestingBinance] = useState(false);
  const [binanceTestResult, setBinanceTestResult] = useState(null);
  const [natcashTestSms, setNatcashTestSms] = useState('');
  const [natcashTestDryRun, setNatcashTestDryRun] = useState(true);
  const [natcashTestResult, setNatcashTestResult] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [categoryImageUploads, setCategoryImageUploads] = useState({});
  const [formData, setFormData] = useState({
    site_name: '',
    logo_url: '',
    primary_color: '',
    secondary_color: '',
    support_email: '',
    whatsapp_support_enabled: true,
    whatsapp_support_number: '',
    whatsapp_support_message: '',
    crisp_enabled: false,
    crisp_website_id: '',
    plisio_api_key: '',
    mtcgame_api_key: '',
    gosplit_api_key: '',
    z2u_api_key: '',
    g2bulk_api_key: '',
    natcash_usd_htg_rate: '',
    natcash_callback_secret: '',
    resend_api_key: '',
    resend_from_email: '',
    telegram_notifications_enabled: false,
    telegram_bot_token: '',
    telegram_admin_chat_id: '',
    announcement_enabled: false,
    announcement_message: '',
    trustpilot_enabled: false,
    trustpilot_business_id: '',
    product_categories: [],
    category_images: {},
    refund_policy: DEFAULT_REFUND_POLICY,
    giftcard_taxonomy: DEFAULT_GIFTCARD_TAXONOMY,
    crypto_payment_gateways: {
      paypal: { enabled: false, email: '', instructions: '' },
      airtm: { enabled: false, email: '', instructions: '' },
      skrill: { enabled: false, email: '', instructions: '' },
      moncash: { enabled: false, email: '', instructions: '' },
      binance_pay: { enabled: false, email: '', instructions: '' },
      zelle: { enabled: false, email: '', instructions: '' },
      cashapp: { enabled: false, email: '', instructions: '' }
    },
    payment_gateways: {
      paypal: { enabled: true, email: '', instructions: '' },
      airtm: { enabled: true, email: '', instructions: '' },
      skrill: { enabled: true, email: '', instructions: '' },
      moncash: { enabled: true, email: '', instructions: '' },
      natcash: { enabled: false, phone: '', account_name: '', instructions: '' },
      binance_pay: { enabled: true, email: '', instructions: '' },
      zelle: { enabled: true, email: '', instructions: '' },
      cashapp: { enabled: true, email: '', instructions: '' }
    },
    crypto_settings: {
      buy_rate_usdt: 1.0,
      sell_rate_usdt: 0.98,
      transaction_fee_percent: 2.0,
      min_transaction_usd: 10.0,
      sell_instructions: '',
      wallets: { BEP20: '', TRC20: '' }
    },
    minutes_transfer_enabled: false,
    minutes_transfer_fee_type: 'percent',
    minutes_transfer_fee_value: 0,
    minutes_transfer_min_amount: 1,
    minutes_transfer_max_amount: 500,
    minutes_transfer_instructions: '',
    social_links: {
      facebook: '',
      instagram: '',
      tiktok: '',
      youtube: '',
      twitter: '',
      telegram: '',
      whatsapp: ''
    }
  });
  const [newCategory, setNewCategory] = useState('');
  const [newGiftcardCategory, setNewGiftcardCategory] = useState('');
  const [newGiftcardSubcategory, setNewGiftcardSubcategory] = useState({});
  const [bulkEmail, setBulkEmail] = useState({
    subject: '',
    message: '',
    recipient_type: 'all'
  });
  const [sendingEmail, setSendingEmail] = useState(false);

  const defaultPaymentGateways = useMemo(() => ({
    paypal: { enabled: true, email: '', instructions: '' },
    airtm: { enabled: true, email: '', instructions: '' },
    skrill: { enabled: true, email: '', instructions: '' },
    moncash: { enabled: true, email: '', instructions: '' },
    natcash: { enabled: false, phone: '', account_name: '', instructions: '' },
    binance_pay: { enabled: true, email: '', instructions: '' },
    binance_pay_manual: { enabled: true, email: '', instructions: '' },
    zelle: { enabled: true, email: '', instructions: '' },
    cashapp: { enabled: true, email: '', instructions: '' }
  }), []);

  const defaultCryptoPaymentGateways = useMemo(() => ({
    paypal: { enabled: false, email: '', instructions: '' },
    airtm: { enabled: false, email: '', instructions: '' },
    skrill: { enabled: false, email: '', instructions: '' },
    moncash: { enabled: false, email: '', instructions: '' },
    binance_pay: { enabled: false, email: '', instructions: '' },
    zelle: { enabled: false, email: '', instructions: '' },
    cashapp: { enabled: false, email: '', instructions: '' }
  }), []);

  useEffect(() => {
    if (currentSettings) {
      startTransition(() => {
        const mergedCategories = mergeCategories(
          CORE_CATEGORIES,
          currentSettings.product_categories || []
        );
        const hasGiftcardTaxonomy = Object.prototype.hasOwnProperty.call(
          currentSettings,
          'giftcard_taxonomy'
        );
        const giftcardTaxonomy = hasGiftcardTaxonomy
          ? (currentSettings.giftcard_taxonomy || [])
          : DEFAULT_GIFTCARD_TAXONOMY;
        setFormData({
          site_name: currentSettings.site_name || '',
          logo_url: currentSettings.logo_url || '',
          primary_color: currentSettings.primary_color || '',
          secondary_color: currentSettings.secondary_color || '',
          support_email: currentSettings.support_email || '',
          whatsapp_support_enabled: currentSettings.whatsapp_support_enabled ?? true,
          whatsapp_support_number: currentSettings.whatsapp_support_number || '',
          whatsapp_support_message: currentSettings.whatsapp_support_message || '',
          crisp_enabled: currentSettings.crisp_enabled ?? false,
          crisp_website_id: currentSettings.crisp_website_id || '',
          plisio_api_key: currentSettings.plisio_api_key || '',
          mtcgame_api_key: currentSettings.mtcgame_api_key || '',
          gosplit_api_key: currentSettings.gosplit_api_key || '',
          z2u_api_key: currentSettings.z2u_api_key || '',
          g2bulk_api_key: currentSettings.g2bulk_api_key || '',
          natcash_usd_htg_rate: currentSettings.natcash_usd_htg_rate || '',
          natcash_callback_secret: currentSettings.natcash_callback_secret || '',
          resend_api_key: currentSettings.resend_api_key || '',
          resend_from_email: currentSettings.resend_from_email || '',
          telegram_notifications_enabled: currentSettings.telegram_notifications_enabled ?? false,
          telegram_bot_token: currentSettings.telegram_bot_token || '',
          telegram_admin_chat_id: currentSettings.telegram_admin_chat_id || '',
          announcement_enabled: currentSettings.announcement_enabled || false,
          announcement_message: currentSettings.announcement_message || '',
          trustpilot_enabled: currentSettings.trustpilot_enabled || false,
          trustpilot_business_id: currentSettings.trustpilot_business_id || '',
          product_categories: mergedCategories,
          category_images: currentSettings.category_images || {},
          refund_policy: currentSettings.refund_policy || DEFAULT_REFUND_POLICY,
          giftcard_taxonomy: giftcardTaxonomy,
          crypto_payment_gateways: currentSettings.crypto_payment_gateways || defaultCryptoPaymentGateways,
          payment_gateways: currentSettings.payment_gateways || defaultPaymentGateways,
          crypto_settings: currentSettings.crypto_settings || {
            buy_rate_usdt: 1.0,
            sell_rate_usdt: 0.98,
            transaction_fee_percent: 2.0,
            min_transaction_usd: 10.0,
            sell_instructions: '',
            wallets: { BEP20: '', TRC20: '' }
          },
          minutes_transfer_enabled: currentSettings.minutes_transfer_enabled || false,
          minutes_transfer_fee_type: currentSettings.minutes_transfer_fee_type || 'percent',
          minutes_transfer_fee_value: currentSettings.minutes_transfer_fee_value ?? 0,
          minutes_transfer_min_amount: currentSettings.minutes_transfer_min_amount ?? 1,
          minutes_transfer_max_amount: currentSettings.minutes_transfer_max_amount ?? 500,
          minutes_transfer_instructions: currentSettings.minutes_transfer_instructions || '',
          seller_withdrawal_min_amount: currentSettings.seller_withdrawal_min_amount ?? 5,
          faq_buyer: currentSettings.faq_buyer || [],
          faq_seller: currentSettings.faq_seller || [],
          withdrawal_methods: currentSettings.withdrawal_methods || {
            binance_pay: { label: 'Binance Pay', enabled: true, fee_percent: 0, fee_fixed: 0, placeholder: 'Binance Pay ID' },
            usdt_bep20: { label: 'USDT (BEP20)', enabled: true, fee_percent: 1, fee_fixed: 0.5, placeholder: 'BEP20 Wallet Address' },
            usdt_trc20: { label: 'USDT (TRC20)', enabled: true, fee_percent: 1, fee_fixed: 0.5, placeholder: 'TRC20 Wallet Address' },
            paypal: { label: 'PayPal', enabled: true, fee_percent: 3, fee_fixed: 0.3, placeholder: 'PayPal Email' },
            moncash: { label: 'MonCash', enabled: true, fee_percent: 2, fee_fixed: 0, placeholder: 'MonCash Phone' },
          },
          social_links: currentSettings.social_links || {
            facebook: '',
            instagram: '',
            tiktok: '',
            youtube: '',
            twitter: '',
            telegram: '',
            whatsapp: ''
          }
        });
      });
    }
  }, [currentSettings, defaultPaymentGateways, defaultCryptoPaymentGateways]);

  const addCategory = useCallback(() => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    setFormData(prev => {
      const existingKeys = new Set((prev.product_categories || []).map(normalizeCategoryKey));
      const key = normalizeCategoryKey(trimmed);
      if (!key || existingKeys.has(key)) {
        setNewCategory('');
        return prev;
      }
      setNewCategory('');
      return {
        ...prev,
        product_categories: [...(prev.product_categories || []), trimmed]
      };
    });
  }, [newCategory]);

  const removeCategory = useCallback((cat) => {
    if (isCoreCategory(cat)) return;
    setFormData(prev => {
      const key = normalizeCategoryKey(cat);
      const nextCategories = (prev.product_categories || []).filter(
        (value) => normalizeCategoryKey(value) !== key
      );
      const nextImages = { ...(prev.category_images || {}) };
      delete nextImages[key];
      return {
        ...prev,
        product_categories: nextCategories,
        category_images: nextImages
      };
    });
  }, []);

  const addGiftcardCategory = useCallback(() => {
    const trimmed = newGiftcardCategory.trim();
    if (!trimmed) return;
    setFormData(prev => {
      const existingKeys = new Set((prev.giftcard_taxonomy || []).map((item) => normalizeCategoryKey(item?.name)));
      const key = normalizeCategoryKey(trimmed);
      if (!key || existingKeys.has(key)) {
        setNewGiftcardCategory('');
        return prev;
      }
      setNewGiftcardCategory('');
      return {
        ...prev,
        giftcard_taxonomy: [
          ...(prev.giftcard_taxonomy || []),
          { name: trimmed, subcategories: [] }
        ]
      };
    });
  }, [newGiftcardCategory]);

  const removeGiftcardCategory = useCallback((categoryName) => {
    const key = normalizeCategoryKey(categoryName);
    setFormData(prev => ({
      ...prev,
      giftcard_taxonomy: (prev.giftcard_taxonomy || []).filter(
        (item) => normalizeCategoryKey(item?.name) !== key
      )
    }));
    setNewGiftcardSubcategory(prev => {
      const next = { ...(prev || {}) };
      delete next[key];
      return next;
    });
  }, []);

  const addGiftcardSubcategory = useCallback((categoryName) => {
    const key = normalizeCategoryKey(categoryName);
    const raw = (newGiftcardSubcategory || {})[key] || '';
    const trimmed = raw.trim();
    if (!trimmed) return;
    setFormData(prev => {
      const nextTaxonomy = (prev.giftcard_taxonomy || []).map((item) => {
        if (normalizeCategoryKey(item?.name) !== key) return item;
        const existing = new Set((item?.subcategories || []).map(normalizeCategoryKey));
        if (existing.has(normalizeCategoryKey(trimmed))) return item;
        return {
          ...item,
          subcategories: [...(item?.subcategories || []), trimmed]
        };
      });
      return { ...prev, giftcard_taxonomy: nextTaxonomy };
    });
    setNewGiftcardSubcategory(prev => ({ ...(prev || {}), [key]: '' }));
  }, [newGiftcardSubcategory]);

  const removeGiftcardSubcategory = useCallback((categoryName, subcategoryName) => {
    const key = normalizeCategoryKey(categoryName);
    const subKey = normalizeCategoryKey(subcategoryName);
    setFormData(prev => {
      const nextTaxonomy = (prev.giftcard_taxonomy || []).map((item) => {
        if (normalizeCategoryKey(item?.name) !== key) return item;
        const nextSubs = (item?.subcategories || []).filter(
          (value) => normalizeCategoryKey(value) !== subKey
        );
        return { ...item, subcategories: nextSubs };
      });
      return { ...prev, giftcard_taxonomy: nextTaxonomy };
    });
  }, []);

  const handleSendBulkEmail = async () => {
    if (!bulkEmail.subject || !bulkEmail.message) {
      toast.error('Please fill in subject and message');
      return;
    }

    setSendingEmail(true);
    try {
      const response = await axiosInstance.post('/emails/bulk-send', bulkEmail);
      toast.success(`Email sent to ${response.data.sent_count} recipients!`);
      setBulkEmail({subject: '', message: '', recipient_type: 'all'});
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error sending bulk email');
    } finally {
      setSendingEmail(false);
    }
  };

  const uploadLogo = async (file) => {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB');
      return null;
    }

    setUploadingLogo(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await axiosInstance.post('/upload/image', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data?.url || null;
    } catch (e) {
      console.error('Logo upload failed:', e);
      toast.error('Error uploading logo');
      return null;
    } finally {
      setUploadingLogo(false);
    }
  };

  const uploadCategoryImage = async (category, file) => {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB');
      return null;
    }

    const key = normalizeCategoryKey(category);
    setCategoryImageUploads(prev => ({ ...prev, [key]: true }));
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await axiosInstance.post('/upload/image', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data?.url || null;
    } catch (e) {
      console.error('Category image upload failed:', e);
      toast.error('Error uploading category image');
      return null;
    } finally {
      setCategoryImageUploads(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateCategoryImage = useCallback((category, url) => {
    const key = normalizeCategoryKey(category);
    setFormData(prev => {
      const nextImages = { ...(prev.category_images || {}) };
      if (url) {
        nextImages[key] = url;
      } else {
        delete nextImages[key];
      }
      return { ...prev, category_images: nextImages };
    });
  }, []);

  const handlePaymentGatewayChange = useCallback((gateway, field, value) => {
    setFormData(prev => {
      // Ensure payment_gateways exists
      if (!prev.payment_gateways) return prev;
      
      return {
        ...prev,
        payment_gateways: {
          ...prev.payment_gateways,
          [gateway]: {
            ...(prev.payment_gateways[gateway] || {}),
            [field]: value
          }
        }
      };
    });
  }, []);

  const handleCryptoGatewayChange = useCallback((gateway, field, value) => {
    setFormData(prev => {
      if (!prev.crypto_payment_gateways) return prev;
      return {
        ...prev,
        crypto_payment_gateways: {
          ...prev.crypto_payment_gateways,
          [gateway]: {
            ...(prev.crypto_payment_gateways[gateway] || {}),
            [field]: value
          }
        }
      };
    });
  }, []);

  const handleCryptoSettingsChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      crypto_settings: {
        ...(prev.crypto_settings || {}),
        [field]: value
      }
    }));
  }, []);

  const handleCryptoWalletChange = useCallback((chain, value) => {
    setFormData(prev => ({
      ...prev,
      crypto_settings: {
        ...(prev.crypto_settings || {}),
        wallets: {
          ...((prev.crypto_settings || {}).wallets || {}),
          [chain]: value
        }
      }
    }));
  }, []);

  const handleSocialLinkChange = useCallback((key, value) => {
    setFormData(prev => ({
      ...prev,
      social_links: {
        ...(prev.social_links || {}),
        [key]: value
      }
    }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const updates = {};
      Object.keys(formData).forEach(key => {
        // Include all fields except empty strings (but keep false booleans)
        if (formData[key] !== '' && formData[key] !== undefined) {
          updates[key] = formData[key];
        }
      });

      await axiosInstance.put('/settings', updates);
      toast.success('Settings saved successfully!');
      await loadSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Error saving settings');
    } finally {
      setLoading(false);
    }
  };

  const handleTelegramTest = async () => {
    setTestingTelegram(true);
    const payload = {
      // Force enable for test flow so legacy fallback can trigger a real notification.
      telegram_notifications_enabled: true
    };
    const botToken = String(formData.telegram_bot_token || '').trim();
    const chatId = String(formData.telegram_admin_chat_id || '').trim();
    if (botToken) {
      payload.telegram_bot_token = botToken;
    }
    if (chatId) {
      payload.telegram_admin_chat_id = chatId;
    }
    try {
      const response = await axiosInstance.post('/settings/telegram/test', payload);
      toast.success(response?.data?.message || 'Telegram test message sent.');
      if (!formData.telegram_notifications_enabled) {
        handleChange('telegram_notifications_enabled', true);
      }
    } catch (error) {
      if (error?.response?.status === 404) {
        // Backward compatibility: older backend versions don't expose /settings/telegram/test.
        try {
          await axiosInstance.put('/settings', payload);
          toast.success('Telegram activated and test notification sent (legacy mode).');
          await loadSettings();
          return;
        } catch (fallbackError) {
          const fallbackDetail = fallbackError?.response?.data?.detail || 'Failed to activate Telegram in legacy mode';
          toast.error(fallbackDetail);
          return;
        }
      }
      const detail = error?.response?.data?.detail || 'Failed to send Telegram test message';
      toast.error(detail);
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleNatcashTest = async () => {
    setTestingNatcash(true);
    setNatcashTestResult(null);
    try {
      const response = await axiosInstance.post('/natcash/test-sms', {
        sms_body: natcashTestSms || undefined,
        dry_run: natcashTestDryRun,
      });
      setNatcashTestResult(response.data);
      if (response.data.matched) {
        toast.success(
          natcashTestDryRun
            ? `SMS matche ak kòmand ${response.data.matched_order?.id?.slice(0, 8)} (dry run — pa make kòm peye)`
            : `Kòmand ${response.data.matched_order?.id?.slice(0, 8)} make kòm peye!`
        );
      } else {
        toast.error(response.data.error || 'SMS pa matche ak okenn kòmand an atant.');
      }
    } catch (error) {
      const detail = error?.response?.data?.detail || error?.response?.data?.error || 'Erè pandan tès NatCash';
      toast.error(detail);
    } finally {
      setTestingNatcash(false);
    }
  };

  const handleBinanceTest = async () => {
    setTestingBinance(true);
    setBinanceTestResult(null);
    try {
      const response = await axiosInstance.post('/payments/binance-pay/test');
      setBinanceTestResult(response.data);
      if (response.data.ok) {
        toast.success(response.data.message || 'Koneksyon Binance reyisi!');
      } else {
        toast.error(response.data.error || 'Koneksyon Binance echwe');
      }
    } catch (error) {
      const detail = error?.response?.data?.detail || error?.response?.data?.error || 'Erè pandan tès Binance';
      toast.error(detail);
      setBinanceTestResult({ ok: false, error: detail });
    } finally {
      setTestingBinance(false);
    }
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={currentSettings} />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-white" data-testid="settings-title">Site Settings</h1>
            <Button 
              onClick={() => window.location.href = '/admin'}
              className="bg-green-500 text-white px-6 py-3"
            >
              🏠 Admin Home
            </Button>
          </div>

          <Card className="glass-effect border-white/20">
            <CardContent className="p-6">
              <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-2 lg:grid-cols-6 mb-6">
                  <TabsTrigger value="general" data-testid="tab-general">
                    <SettingsIcon size={16} className="mr-2" />
                    General
                  </TabsTrigger>
                  <TabsTrigger value="api" data-testid="tab-api">
                    <Key size={16} className="mr-2" />
                    API Keys
                  </TabsTrigger>
                  <TabsTrigger value="integrations" data-testid="tab-integrations">
                    <Package size={16} className="mr-2" />
                    Integrations
                  </TabsTrigger>
                  <TabsTrigger value="payments" data-testid="tab-payments">
                    <Key size={16} className="mr-2" />
                    Payments
                  </TabsTrigger>
                  <TabsTrigger value="categories" data-testid="tab-categories">
                    <Package size={16} className="mr-2" />
                    Categories
                  </TabsTrigger>
                  <TabsTrigger value="email" data-testid="tab-email">
                    <Mail size={16} className="mr-2" />
                    Bulk Email
                  </TabsTrigger>
                  <TabsTrigger value="faq">
                    <HelpCircle size={16} className="mr-2" />
                    FAQ
                  </TabsTrigger>
                </TabsList>

                <form onSubmit={handleSubmit}>
                  <TabsContent value="general" className="space-y-4">
                    <div>
                      <Label htmlFor="site_name" className="text-white">Site Name</Label>
                      <Input
                        id="site_name"
                        value={formData.site_name}
                        onChange={(e) => handleChange('site_name', e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                        data-testid="site-name-input"
                      />
                    </div>

                    <div>
                      <Label htmlFor="support_email" className="text-white">Support Email</Label>
                      <Input
                        id="support_email"
                        type="email"
                        value={formData.support_email}
                        onChange={(e) => handleChange('support_email', e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                        data-testid="support-email-input"
                      />
                    </div>

                    <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label className="text-white">WhatsApp Support</Label>
                          <p className="text-white/60 text-sm mt-1">
                            Configure the WhatsApp support button.
                          </p>
                        </div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.whatsapp_support_enabled}
                            onChange={(e) => handleChange('whatsapp_support_enabled', e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-white text-sm">Enabled</span>
                        </label>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <Label className="text-white/70 text-sm">WhatsApp Number</Label>
                          <Input
                            value={formData.whatsapp_support_number}
                            onChange={(e) => handleChange('whatsapp_support_number', e.target.value)}
                            className="bg-white/10 border-white/20 text-white mt-1"
                            placeholder="50939308318"
                          />
                          <p className="text-white/50 text-xs mt-1">
                            Use international format without "+" or spaces.
                          </p>
                        </div>
                        <div>
                          <Label className="text-white/70 text-sm">Default Message</Label>
                          <Input
                            value={formData.whatsapp_support_message}
                            onChange={(e) => handleChange('whatsapp_support_message', e.target.value)}
                            className="bg-white/10 border-white/20 text-white mt-1"
                            placeholder="Hello! I need support."
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label className="text-white">Crisp Live Chat</Label>
                          <p className="text-white/60 text-sm mt-1">
                            Enable Crisp chat by adding your Website ID.
                          </p>
                        </div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.crisp_enabled}
                            onChange={(e) => handleChange('crisp_enabled', e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-white text-sm">Enabled</span>
                        </label>
                      </div>
                      <div className="mt-4">
                        <Label className="text-white/70 text-sm">Crisp Website ID</Label>
                        <Input
                          value={formData.crisp_website_id}
                          onChange={(e) => handleChange('crisp_website_id', e.target.value)}
                          className="bg-white/10 border-white/20 text-white mt-1"
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="logo_url" className="text-white">Logo URL</Label>
                      <Input
                        id="logo_url"
                        value={formData.logo_url}
                        onChange={(e) => handleChange('logo_url', e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                        placeholder="https://example.com/logo.png"
                        data-testid="logo-url-input"
                      />
                      <div className="mt-3">
                        <Label htmlFor="logo_file" className="text-white">Or Upload Logo</Label>
                        <Input
                          id="logo_file"
                          type="file"
                          accept="image/*"
                          disabled={uploadingLogo}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            const url = await uploadLogo(file);
                            if (url) {
                              handleChange('logo_url', url);
                              toast.success('Logo uploaded');
                            }
                          }}
                          className="bg-white/10 border-white/20 text-white cursor-pointer mt-2"
                        />
                        {uploadingLogo && (
                          <p className="text-white/60 text-sm mt-2">Uploading...</p>
                        )}
                      </div>
                      {formData.logo_url && (
                        <div className="mt-2">
                          <img src={formData.logo_url} alt="Logo preview" className="h-16 bg-white/10 p-2 rounded" />
                        </div>
                      )}
                    </div>

                    <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label className="text-white">Announcement (Flash Message)</Label>
                          <p className="text-white/60 text-sm mt-1">
                            Show a message bar at the top of the site.
                          </p>
                        </div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.announcement_enabled}
                            onChange={(e) => handleChange('announcement_enabled', e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-white text-sm">Enabled</span>
                        </label>
                      </div>
                      {formData.announcement_enabled && (
                        <div className="mt-3">
                          <Label className="text-white/70 text-sm">Message</Label>
                          <Textarea
                            value={formData.announcement_message}
                            onChange={(e) => handleChange('announcement_message', e.target.value)}
                            className="bg-white/10 border-white/20 text-white mt-1"
                            rows={2}
                            placeholder="Eg: Promo! 10% off with code KAYI10"
                          />
                        </div>
                      )}
                    </div>

                    <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                      <Label className="text-white">Social Media (Follow buttons)</Label>
                      <p className="text-white/60 text-sm mt-1">Add your social links to show follow buttons in the footer.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        {[
                          { key: 'facebook', label: 'Facebook URL' },
                          { key: 'instagram', label: 'Instagram URL' },
                          { key: 'tiktok', label: 'TikTok URL' },
                          { key: 'youtube', label: 'YouTube URL' },
                          { key: 'twitter', label: 'Twitter/X URL' },
                          { key: 'telegram', label: 'Telegram URL' },
                          { key: 'whatsapp', label: 'WhatsApp URL' }
                        ].map(item => (
                          <div key={item.key}>
                            <Label className="text-white/70 text-sm">{item.label}</Label>
                            <Input
                              value={(formData.social_links || {})[item.key] || ''}
                              onChange={(e) => handleSocialLinkChange(item.key, e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                              placeholder="https://..."
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                      <Label className="text-white">Refund Policy</Label>
                      <p className="text-white/60 text-sm mt-1">Displayed on the Refund Policy page.</p>
                      <Textarea
                        value={formData.refund_policy}
                        onChange={(e) => handleChange('refund_policy', e.target.value)}
                        className="bg-white/10 border-white/20 text-white mt-3"
                        rows={6}
                        placeholder="Enter your refund policy..."
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="api" className="space-y-4">
                    <div>
                      <Label htmlFor="plisio_api_key" className="text-white">Plisio API Key (Crypto Payment)</Label>
                      <Input
                        id="plisio_api_key"
                        type="password"
                        value={formData.plisio_api_key}
                        onChange={(e) => handleChange('plisio_api_key', e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                        placeholder="••••••••"
                        data-testid="plisio-key-input"
                      />
                    </div>

                    <div>
                      <Label htmlFor="g2bulk_api_key" className="text-white">G2Bulk API Key (Game Top-Up)</Label>
                      <Input
                        id="g2bulk_api_key"
                        type="password"
                        value={formData.g2bulk_api_key}
                        onChange={(e) => handleChange('g2bulk_api_key', e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                        placeholder="••••••••"
                      />
                      <p className="text-white/40 text-xs mt-1">Get from <a href="https://t.me/G2BULKBOT" target="_blank" rel="noopener noreferrer" className="text-green-400 underline">@G2BULKBOT on Telegram</a>. Used for automatic game topup delivery.</p>
                    </div>

                    <div className="border-t border-white/10 pt-4 mt-4">
                      <h4 className="text-white font-bold text-sm mb-3">NatCash Settings</h4>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-white">USD/HTG Rate</Label>
                          <Input type="number" step="0.01"
                            value={formData.natcash_usd_htg_rate || ''}
                            onChange={(e) => handleChange('natcash_usd_htg_rate', e.target.value ? parseFloat(e.target.value) : null)}
                            className="bg-white/10 border-white/20 text-white" placeholder="e.g. 135" />
                          <p className="text-white/40 text-xs mt-1">1 USD = ? HTG (used to calculate NatCash amount in Goud)</p>
                        </div>
                        <div>
                          <Label className="text-white">NatCash Callback Secret</Label>
                          <Input type="password"
                            value={formData.natcash_callback_secret || ''}
                            onChange={(e) => handleChange('natcash_callback_secret', e.target.value)}
                            className="bg-white/10 border-white/20 text-white" placeholder="••••••••" />
                          <p className="text-white/40 text-xs mt-1">Secret key for SMS Forwarder webhook (Bearer token) and legacy Automate callback</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="resend_api_key" className="text-white">Resend API Key (Email)</Label>
                      <Input
                        id="resend_api_key"
                        type="password"
                        value={formData.resend_api_key}
                        onChange={(e) => handleChange('resend_api_key', e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                        placeholder="••••••••"
                        data-testid="resend-key-input"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="resend_from_email" className="text-white">Resend From Email</Label>
                      <Input
                        id="resend_from_email"
                        value={formData.resend_from_email}
                        onChange={(e) => handleChange('resend_from_email', e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                        placeholder='Example: "KayiCom <no-reply@yourdomain.com>"'
                      />
                      <p className="text-white/50 text-xs mt-1">
                        This must be a verified sender/domain in Resend; otherwise sending will fail.
                      </p>
                    </div>

                    <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label className="text-white">Telegram Admin Notifications</Label>
                          <p className="text-white/60 text-sm mt-1">
                            Receive all important site notifications in Telegram.
                          </p>
                        </div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.telegram_notifications_enabled}
                            onChange={(e) => handleChange('telegram_notifications_enabled', e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-white text-sm">Enabled</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <Label className="text-white/70 text-sm">Telegram Bot Token</Label>
                          <Input
                            type="password"
                            value={formData.telegram_bot_token}
                            onChange={(e) => handleChange('telegram_bot_token', e.target.value)}
                            className="bg-white/10 border-white/20 text-white mt-1"
                            placeholder="123456:ABCDEF..."
                          />
                          <p className="text-white/50 text-xs mt-1">
                            Leave blank to keep existing token unchanged.
                          </p>
                        </div>
                        <div>
                          <Label className="text-white/70 text-sm">Admin Chat ID</Label>
                          <Input
                            value={formData.telegram_admin_chat_id}
                            onChange={(e) => handleChange('telegram_admin_chat_id', e.target.value)}
                            className="bg-white/10 border-white/20 text-white mt-1"
                            placeholder="-1001234567890"
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleTelegramTest}
                          disabled={testingTelegram}
                          className="border-cyan-400 text-green-300 hover:bg-cyan-400/10"
                        >
                          {testingTelegram ? 'Sending test...' : 'Send Test Telegram Message'}
                        </Button>
                        <p className="text-white/50 text-xs">
                          This test uses values in this form (even before saving).
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-blue-400/10 border border-blue-400/30 rounded-lg mt-4">
                      <p className="text-blue-200 text-sm">
                        <strong>Note:</strong> API keys are encrypted and used for automation.
                      </p>
                    </div>
                  </TabsContent>

                  {/* Integrations Tab */}
                  <TabsContent value="integrations" className="space-y-6">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-4">Trustpilot Reviews</h3>
                      <p className="text-gray-400 mb-6">Add a link to your Trustpilot reviews page in the website footer.</p>
                      
                      {/* Enable Trustpilot */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <h4 className="text-white font-semibold flex items-center gap-2">
                              ⭐ Trustpilot Link
                            </h4>
                            <p className="text-white/60 text-sm mt-1">Show Trustpilot reviews button in footer</p>
                          </div>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={formData.trustpilot_enabled}
                              onChange={(e) => handleChange('trustpilot_enabled', e.target.checked)}
                              className="w-4 h-4" 
                            />
                            <span className="text-white text-sm">Enabled</span>
                          </label>
                        </div>
                        
                        {formData.trustpilot_enabled && (
                          <div className="space-y-3 mt-4">
                            <div>
                              <Label className="text-white/70 text-sm">Trustpilot Business ID</Label>
                              <Input
                                placeholder="kayicom.com"
                                value={formData.trustpilot_business_id}
                                onChange={(e) => handleChange('trustpilot_business_id', e.target.value)}
                                className="bg-white/10 border-white/20 text-white mt-1"
                              />
                              <p className="text-white/50 text-xs mt-1">
                                Example: kayicom.com (from URL: https://fr.trustpilot.com/review/<strong>kayicom.com</strong>)
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="p-4 bg-green-400/10 border border-green-400/30 rounded-lg">
                        <p className="text-green-200 text-sm">
                          <strong>Note:</strong> After enabling, a button linking to your Trustpilot reviews will appear in the footer. Customers can click to see your actual reviews on Trustpilot.
                        </p>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="categories" className="space-y-4">
                    <div>
                      <Label className="text-white text-lg font-semibold mb-3 block">Product Categories</Label>
                      <p className="text-gray-400 text-sm mb-4">
                        Manage product categories and add cover images for the homepage cards.
                      </p>
                      
                      <div className="flex gap-2 mb-4">
                        <Input
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-gray-500"
                          placeholder="Enter new category"
                          data-testid="new-category-input"
                        />
                        <Button onClick={addCategory} type="button" className="gradient-button text-white" data-testid="add-category-btn">
                          <Plus size={16} className="mr-1" />
                          Add
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {(formData.product_categories || []).map((cat) => {
                          const categoryKey = normalizeCategoryKey(cat);
                          const coverImage = (formData.category_images || {})[categoryKey] || '';
                          const isCore = isCoreCategory(cat);
                          const isUploading = categoryImageUploads[categoryKey];
                          return (
                            <div key={categoryKey} className="p-4 glass-effect rounded-lg space-y-3" data-testid={`category-${categoryKey}`}>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-white font-medium capitalize">{cat}</span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeCategory(cat)}
                                  disabled={isCore}
                                  className={`text-red-400 hover:text-red-300 hover:bg-red-400/10 ${isCore ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  data-testid={`remove-${categoryKey}`}
                                >
                                  <X size={16} />
                                </Button>
                              </div>
                              <div>
                                <Label className="text-white/70 text-sm">Cover Image URL</Label>
                                <Input
                                  value={coverImage}
                                  onChange={(e) => updateCategoryImage(cat, e.target.value)}
                                  className="bg-white/10 border-white/20 text-white mt-1"
                                  placeholder="https://example.com/category-cover.png"
                                />
                              </div>
                              <div>
                                <Label className="text-white/70 text-sm">Or Upload Cover Image</Label>
                                <Input
                                  type="file"
                                  accept="image/*"
                                  disabled={isUploading}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    const url = await uploadCategoryImage(cat, file);
                                    if (url) {
                                      updateCategoryImage(cat, url);
                                      toast.success('Category cover uploaded');
                                    }
                                  }}
                                  className="bg-white/10 border-white/20 text-white cursor-pointer mt-2"
                                />
                                {isUploading && (
                                  <p className="text-white/60 text-sm mt-2">Uploading...</p>
                                )}
                              </div>
                              {coverImage && (
                                <div className="mt-2">
                                  <img src={coverImage} alt={`${cat} cover`} className="h-24 w-full object-cover rounded" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-6 border-t border-white/10 pt-6">
                        <Label className="text-white text-lg font-semibold mb-3 block">Giftcard Categories & Subcategories</Label>
                        <p className="text-gray-400 text-sm mb-4">
                          Add giftcard subcategories even before products are created.
                        </p>

                        <div className="flex gap-2 mb-4">
                          <Input
                            value={newGiftcardCategory}
                            onChange={(e) => setNewGiftcardCategory(e.target.value)}
                            className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-gray-500"
                            placeholder="Enter giftcard category"
                            data-testid="new-giftcard-category-input"
                          />
                          <Button
                            onClick={addGiftcardCategory}
                            type="button"
                            className="gradient-button text-white"
                            data-testid="add-giftcard-category-btn"
                          >
                            <Plus size={16} className="mr-1" />
                            Add
                          </Button>
                        </div>

                        <div className="space-y-3">
                          {(formData.giftcard_taxonomy || []).length ? (
                            (formData.giftcard_taxonomy || []).map((item) => {
                              const categoryKey = normalizeCategoryKey(item?.name);
                              const subcategories = Array.isArray(item?.subcategories) ? item.subcategories : [];
                              return (
                                <div key={categoryKey} className="p-4 glass-effect rounded-lg space-y-3" data-testid={`giftcard-category-${categoryKey}`}>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-white font-medium capitalize">{item?.name}</span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => removeGiftcardCategory(item?.name)}
                                      className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                      data-testid={`remove-giftcard-category-${categoryKey}`}
                                    >
                                      <X size={16} />
                                    </Button>
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    {subcategories.length ? (
                                      subcategories.map((sub) => {
                                        const subKey = `${categoryKey}-${normalizeCategoryKey(sub)}`;
                                        return (
                                          <span key={subKey} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
                                            {sub}
                                            <button
                                              type="button"
                                              onClick={() => removeGiftcardSubcategory(item?.name, sub)}
                                              className="text-red-300 hover:text-red-200"
                                              aria-label={`Remove ${sub}`}
                                            >
                                              <X size={12} />
                                            </button>
                                          </span>
                                        );
                                      })
                                    ) : (
                                      <span className="text-white/50 text-xs">No subcategories yet.</span>
                                    )}
                                  </div>

                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <Input
                                      value={(newGiftcardSubcategory || {})[categoryKey] || ''}
                                      onChange={(e) => setNewGiftcardSubcategory(prev => ({ ...(prev || {}), [categoryKey]: e.target.value }))}
                                      className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-gray-500"
                                      placeholder="Enter subcategory"
                                      data-testid={`giftcard-subcategory-input-${categoryKey}`}
                                    />
                                    <Button
                                      type="button"
                                      onClick={() => addGiftcardSubcategory(item?.name)}
                                      className="border-cyan-400 text-green-400 hover:bg-cyan-400/10"
                                      variant="outline"
                                      data-testid={`add-giftcard-subcategory-${categoryKey}`}
                                    >
                                      <Plus size={16} className="mr-1" />
                                      Add
                                    </Button>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-white/60 text-sm">No giftcard categories yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>


                  {/* Payment Gateways Tab */}
                  <TabsContent value="payments" className="space-y-6">
                    {formData.payment_gateways ? (
                    <div>
                      <h3 className="text-xl font-bold text-white mb-4">Payment Gateway Configuration</h3>
                      <p className="text-gray-400 mb-6">Configure payment methods, wallets, and instructions for customers.</p>

                      {/* Mobile Topup (Minutes/Airtime) Settings */}
                      <div className="bg-white/5 p-4 rounded-lg mb-6 border border-white/10">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-white font-semibold flex items-center gap-2">
                            <span>📲</span> Mobile Topup Service
                          </h4>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={formData.minutes_transfer_enabled}
                              onChange={(e) => handleChange('minutes_transfer_enabled', e.target.checked)}
                              className="w-4 h-4"
                            />
                            <span className="text-white text-sm">Enabled</span>
                          </label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-white/70 text-sm">Fee Type</Label>
                            <Select
                              value={formData.minutes_transfer_fee_type}
                              onValueChange={(v) => handleChange('minutes_transfer_fee_type', v)}
                            >
                              <SelectTrigger className="bg-white/10 border-white/20 text-white mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percent">Percent (%)</SelectItem>
                                <SelectItem value="fixed">Fixed (USD)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Fee Value</Label>
                            <Input
                              type="number"
                              step="0.01"
                              className="bg-white/10 border-white/20 text-white mt-1"
                              value={formData.minutes_transfer_fee_value}
                              onChange={(e) => handleChange('minutes_transfer_fee_value', parseFloat(e.target.value || '0'))}
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Minimum Amount (USD)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              className="bg-white/10 border-white/20 text-white mt-1"
                              value={formData.minutes_transfer_min_amount}
                              onChange={(e) => handleChange('minutes_transfer_min_amount', parseFloat(e.target.value || '0'))}
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Maximum Amount (USD)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              className="bg-white/10 border-white/20 text-white mt-1"
                              value={formData.minutes_transfer_max_amount}
                              onChange={(e) => handleChange('minutes_transfer_max_amount', parseFloat(e.target.value || '0'))}
                            />
                          </div>
                        </div>
                        <div className="mt-4">
                          <Label className="text-white/70 text-sm">Service Instructions (shown to customers)</Label>
                          <Textarea
                            className="bg-white/10 border-white/20 text-white mt-1"
                            rows={2}
                            value={formData.minutes_transfer_instructions}
                            onChange={(e) => handleChange('minutes_transfer_instructions', e.target.value)}
                            placeholder="Example: Phone number must include country code (e.g. +509...)."
                          />
                        </div>
                      </div>
                      
                      {/* PayPal */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-white font-semibold flex items-center gap-2">
                            <span>💳</span> PayPal
                          </h4>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={formData.payment_gateways?.paypal?.enabled || false}
                              onChange={(e) => handlePaymentGatewayChange('paypal', 'enabled', e.target.checked)}
                              className="w-4 h-4" 
                            />
                            <span className="text-white text-sm">Enabled</span>
                          </label>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-white/70 text-sm">PayPal Email</Label>
                            <Input
                              placeholder="your@paypal.com"
                              value={formData.payment_gateways?.paypal?.email || ""}
                              onChange={(e) => handlePaymentGatewayChange('paypal', 'email', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Instructions for Customers</Label>
                            <Textarea
                              placeholder="Send payment to the email above with order ID in notes"
                              value={formData.payment_gateways?.paypal?.instructions || ""}
                              onChange={(e) => handlePaymentGatewayChange('paypal', 'instructions', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                              rows={2}
                            />
                          </div>
                        </div>
                      </div>

                      {/* AirTM */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-white font-semibold flex items-center gap-2">
                            <span>💸</span> AirTM
                          </h4>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={formData.payment_gateways?.airtm?.enabled || false}
                              onChange={(e) => handlePaymentGatewayChange('airtm', 'enabled', e.target.checked)}
                              className="w-4 h-4" 
                            />
                            <span className="text-white text-sm">Enabled</span>
                          </label>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-white/70 text-sm">AirTM Email/Username</Label>
                            <Input
                              placeholder="your@email.com"
                              value={formData.payment_gateways?.airtm?.email || ""}
                              onChange={(e) => handlePaymentGatewayChange('airtm', 'email', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Instructions</Label>
                            <Textarea
                              placeholder="Send via AirTM to the email above"
                              value={formData.payment_gateways?.airtm?.instructions || ""}
                              onChange={(e) => handlePaymentGatewayChange('airtm', 'instructions', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                              rows={2}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Skrill */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-white font-semibold flex items-center gap-2">
                            <span>💰</span> Skrill
                          </h4>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={formData.payment_gateways?.skrill?.enabled || false}
                              onChange={(e) => handlePaymentGatewayChange('skrill', 'enabled', e.target.checked)}
                              className="w-4 h-4" 
                            />
                            <span className="text-white text-sm">Enabled</span>
                          </label>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-white/70 text-sm">Skrill Email</Label>
                            <Input
                              placeholder="your@skrill.com"
                              value={formData.payment_gateways?.skrill?.email || ""}
                              onChange={(e) => handlePaymentGatewayChange('skrill', 'email', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Instructions</Label>
                            <Textarea
                              placeholder="Send to Skrill email above"
                              value={formData.payment_gateways?.skrill?.instructions || ""}
                              onChange={(e) => handlePaymentGatewayChange('skrill', 'instructions', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                              rows={2}
                            />
                          </div>
                        </div>
                      </div>

                      {/* MonCash */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-white font-semibold flex items-center gap-2">
                            <span>💵</span> MonCash
                          </h4>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={formData.payment_gateways?.moncash?.enabled || false}
                              onChange={(e) => handlePaymentGatewayChange('moncash', 'enabled', e.target.checked)}
                              className="w-4 h-4" 
                            />
                            <span className="text-white text-sm">Enabled</span>
                          </label>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-white/70 text-sm">MonCash Number</Label>
                            <Input
                              placeholder="+509XXXXXXXX"
                              value={formData.payment_gateways?.moncash?.email || ""}
                              onChange={(e) => handlePaymentGatewayChange('moncash', 'email', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Instructions</Label>
                            <Textarea
                              placeholder="Send via MonCash to number above"
                              value={formData.payment_gateways?.moncash?.instructions || ""}
                              onChange={(e) => handlePaymentGatewayChange('moncash', 'instructions', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                              rows={2}
                            />
                          </div>
                        </div>
                      </div>

                      {/* NatCash */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-white font-semibold flex items-center gap-2">
                            <span>📱</span> NatCash (HTG - Auto Verify via SMS Forwarder)
                          </h4>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={formData.payment_gateways?.natcash?.enabled || false}
                              onChange={(e) => handlePaymentGatewayChange('natcash', 'enabled', e.target.checked)}
                              className="w-4 h-4" 
                            />
                            <span className="text-white text-sm">Enabled</span>
                          </label>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-white/70 text-sm">NatCash Phone Number</Label>
                            <Input
                              placeholder="509XXXXXXXX"
                              value={formData.payment_gateways?.natcash?.phone || ""}
                              onChange={(e) => handlePaymentGatewayChange('natcash', 'phone', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Account Name</Label>
                            <Input
                              placeholder="Non ki ap parèt pou kliyan an"
                              value={formData.payment_gateways?.natcash?.account_name || ""}
                              onChange={(e) => handlePaymentGatewayChange('natcash', 'account_name', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Instructions</Label>
                            <Textarea
                              placeholder="Voye montan an via NatCash nan nimewo ki endike a"
                              value={formData.payment_gateways?.natcash?.instructions || ""}
                              onChange={(e) => handlePaymentGatewayChange('natcash', 'instructions', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                              rows={2}
                            />
                          </div>

                          {/* SMS Forwarder webhook URL */}
                          <div className="border-t border-yellow-400/20 pt-4 mt-4">
                            <h5 className="text-yellow-400 font-semibold text-sm mb-2 flex items-center gap-2">
                              🔗 Webhook URL pou SMS Forwarder
                            </h5>
                            <div className="bg-black/30 rounded p-3 font-mono text-xs text-green-400 break-all select-all">
                              {window.location.origin.replace(':3000', ':8000')}/api/webhook/natcash
                            </div>
                            <p className="text-white/40 text-xs mt-1">Konfigure URL sa a nan app SMS Forwarder (FKT Solutions) sou telefòn Android ou. Mete metòd POST ak header: Authorization: Bearer [secret ou a]</p>
                          </div>

                          {/* NatCash SMS Forwarder Test */}
                          <div className="border-t border-yellow-400/20 pt-4 mt-4">
                            <h5 className="text-yellow-400 font-semibold text-sm mb-2 flex items-center gap-2">
                              🧪 Teste SMS Forwarder
                            </h5>
                            <p className="text-white/50 text-xs mb-3">
                              Simulate yon mesaj SMS ki soti nan app SMS Forwarder ou a pou teste si sistèm nan ka analize li, jwenn kontni an, epi matche ak yon kòmand NatCash.
                            </p>
                            <div className="space-y-3">
                              <div>
                                <Label className="text-white/70 text-sm">Mesaj SMS (kite vid pou otomatik)</Label>
                                <Textarea
                                  placeholder="Ex: Ou resevwa 3375.00 HTG nan JEAN PIERRE 50912345678 nan 14:30 18/03/2026, kontni: ABC123. Balans ou: 5000.00 HTG. Transcode: 26031800000000. Mesi"
                                  value={natcashTestSms}
                                  onChange={(e) => setNatcashTestSms(e.target.value)}
                                  className="bg-white/10 border-white/20 text-white mt-1"
                                  rows={2}
                                />
                                <p className="text-white/40 text-xs mt-1">
                                  Si ou kite vid, sistèm nan ap jenere yon mesaj SMS tankou sa app SMS Forwarder ou a ta voye, baze sou dènye kòmand NatCash ki an atant.
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={natcashTestDryRun}
                                    onChange={(e) => setNatcashTestDryRun(e.target.checked)}
                                    className="w-4 h-4"
                                  />
                                  <span className="text-white/70 text-sm">Dry Run (tès sèlman, pa make kòmand kòm peye)</span>
                                </label>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleNatcashTest}
                                disabled={testingNatcash}
                                className="border-yellow-400 text-yellow-300 hover:bg-yellow-400/10 w-full"
                              >
                                {testingNatcash ? '⏳ Ap teste...' : '📲 Teste SMS Forwarder'}
                              </Button>

                              {natcashTestResult && (
                                <div className={`p-4 rounded-lg border text-sm space-y-2 ${
                                  natcashTestResult.matched
                                    ? 'bg-green-500/10 border-green-500/30'
                                    : 'bg-red-500/10 border-red-500/30'
                                }`}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">{natcashTestResult.matched ? '✅' : '❌'}</span>
                                    <span className={`font-bold ${natcashTestResult.matched ? 'text-green-400' : 'text-red-400'}`}>
                                      {natcashTestResult.matched ? 'SMS matche!' : 'SMS pa matche'}
                                    </span>
                                    {natcashTestResult.dry_run && (
                                      <span className="text-yellow-400/70 text-xs bg-yellow-400/10 px-2 py-0.5 rounded">DRY RUN</span>
                                    )}
                                    {natcashTestResult.order_marked_paid && (
                                      <span className="text-green-400/70 text-xs bg-green-400/10 px-2 py-0.5 rounded">PEYE</span>
                                    )}
                                  </div>

                                  <div className="text-white/60 text-xs space-y-1">
                                    <p><span className="text-white/40">📩 SMS Forwarder voye:</span> {natcashTestResult.sms_body_used}</p>
                                    <p><span className="text-white/40">💰 Montan parse:</span> {natcashTestResult.parsed?.amount_htg != null ? `${natcashTestResult.parsed.amount_htg} HTG` : 'pa jwenn'}</p>
                                    <p><span className="text-white/40">🔑 Kontni/Ref parse:</span> {natcashTestResult.parsed?.reference_code || 'pa jwenn'}</p>
                                    {natcashTestResult.match_method && (
                                      <p><span className="text-white/40">🔍 Metòd match:</span> {natcashTestResult.match_method === 'reference_code' ? 'Kòd referans (kontni)' : 'Montan'}</p>
                                    )}
                                  </div>

                                  {natcashTestResult.matched_order && (
                                    <div className="bg-white/5 rounded p-2 text-xs text-white/70 space-y-1">
                                      <p className="text-white/90 font-semibold">Kòmand matche:</p>
                                      <p>ID: {natcashTestResult.matched_order.id?.slice(0, 8)}...</p>
                                      <p>Total: ${natcashTestResult.matched_order.total_amount_usd} USD = {natcashTestResult.matched_order.expected_htg} HTG</p>
                                      <p>Ref: {natcashTestResult.matched_order.natcash_reference}</p>
                                    </div>
                                  )}

                                  {natcashTestResult.pending_natcash_orders?.length > 0 && (
                                    <div className="bg-white/5 rounded p-2 text-xs text-white/70">
                                      <p className="text-white/90 font-semibold mb-1">Kòmand NatCash an atant ({natcashTestResult.pending_natcash_orders.length}):</p>
                                      {natcashTestResult.pending_natcash_orders.map((o, i) => (
                                        <p key={i} className="ml-2">• {o.id?.slice(0, 8)}... — ${o.total_usd} ({o.expected_htg} HTG) — Ref: {o.ref}</p>
                                      ))}
                                    </div>
                                  )}

                                  <div className="text-white/40 text-xs">
                                    <p>Rate: 1 USD = {natcashTestResult.config?.usd_htg_rate} HTG | Secret: {natcashTestResult.config?.callback_secret_set ? '✅ konfigire' : '⚠️ pa konfigire'}</p>
                                  </div>

                                  {natcashTestResult.recent_sms_logs?.length > 0 && (
                                    <div className="bg-white/5 rounded p-3 text-xs text-white/70 space-y-2 mt-2 border border-white/10">
                                      <p className="text-white/90 font-semibold flex items-center gap-1">📨 Dènye SMS ki rive nan webhook ({natcashTestResult.recent_sms_logs.length}):</p>
                                      {natcashTestResult.recent_sms_logs.map((log, i) => (
                                        <div key={i} className={`p-2 rounded ${log.matched_order ? 'bg-green-500/10 border border-green-500/20' : log.error ? 'bg-red-500/10 border border-red-500/20' : 'bg-yellow-500/10 border border-yellow-500/20'}`}>
                                          <p className="text-white/80 break-all">📩 {log.sms_body || '(vid)'}</p>
                                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-white/50">
                                            {log.sms_from && <span>📱 {log.sms_from}</span>}
                                            <span>💰 {log.parsed_amount != null ? `${log.parsed_amount} HTG` : 'pa jwenn'}</span>
                                            <span>🔑 {log.parsed_ref || 'pa jwenn'}</span>
                                            <span>{log.matched_order ? `✅ Matche: ${log.matched_order.slice(0, 8)}...` : '❌ Pa matche'}</span>
                                            {log.source && <span>📡 {log.source}</span>}
                                            {log.created_at && <span>🕐 {new Date(log.created_at).toLocaleString()}</span>}
                                          </div>
                                          {log.error && <p className="text-red-400 mt-1">⚠️ {log.error}</p>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Binance Pay */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-white font-semibold flex items-center gap-2">
                            <span>🟡</span> Binance Pay (Auto Verify)
                          </h4>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={formData.payment_gateways?.binance_pay?.enabled || false}
                              onChange={(e) => handlePaymentGatewayChange('binance_pay', 'enabled', e.target.checked)}
                              className="w-4 h-4" 
                            />
                            <span className="text-white text-sm">Enabled</span>
                          </label>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-white/70 text-sm">Binance Pay UID</Label>
                            <Input
                              placeholder="Your Binance Pay UID (e.g. 589353477)"
                              value={formData.payment_gateways?.binance_pay?.email || ""}
                              onChange={(e) => handlePaymentGatewayChange('binance_pay', 'email', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Binance API Key</Label>
                            <Input
                              placeholder="API Key from your Binance account"
                              value={formData.binance_pay_api_key || ""}
                              onChange={(e) => setFormData(prev => ({ ...prev, binance_pay_api_key: e.target.value }))}
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Binance Secret Key</Label>
                            <Input
                              type="password"
                              placeholder="Secret Key from your Binance account"
                              value={formData.binance_pay_secret_key || ""}
                              onChange={(e) => setFormData(prev => ({ ...prev, binance_pay_secret_key: e.target.value }))}
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Instructions</Label>
                            <Textarea
                              placeholder="Send USDT via Binance Pay. Auto-verified."
                              value={formData.payment_gateways?.binance_pay?.instructions || ""}
                              onChange={(e) => handlePaymentGatewayChange('binance_pay', 'instructions', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                              rows={2}
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Cloudflare Proxy URL (required)</Label>
                            <Input
                              placeholder="https://binance-proxy.your-account.workers.dev"
                              value={formData.binance_pay_proxy_url || ""}
                              onChange={(e) => setFormData(prev => ({ ...prev, binance_pay_proxy_url: e.target.value }))}
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                            <p className="text-white/30 text-xs mt-1">Deploy the Cloudflare Worker from /cloudflare-worker/binance-proxy.js</p>
                          </div>
                          <p className="text-white/40 text-xs">Binance &rarr; Account &rarr; <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noopener noreferrer" className="text-yellow-400 underline">API Management</a> &rarr; Create API Key (enable "Pay" permission)</p>

                          {/* Binance Test */}
                          <div className="border-t border-yellow-400/20 pt-4 mt-4">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleBinanceTest}
                              disabled={testingBinance}
                              className="border-yellow-400 text-yellow-300 hover:bg-yellow-400/10 w-full"
                            >
                              {testingBinance ? '⏳ Ap teste...' : '🧪 Teste Koneksyon Binance API'}
                            </Button>

                            {binanceTestResult && (
                              <div className={`p-4 rounded-lg border text-sm space-y-2 mt-3 ${
                                binanceTestResult.ok
                                  ? 'bg-green-500/10 border-green-500/30'
                                  : 'bg-red-500/10 border-red-500/30'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{binanceTestResult.ok ? '✅' : '❌'}</span>
                                  <span className={`font-bold ${binanceTestResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                                    {binanceTestResult.ok ? 'Koneksyon reyisi!' : 'Koneksyon echwe'}
                                  </span>
                                </div>
                                {binanceTestResult.ok && (
                                  <div className="text-white/60 text-xs space-y-1">
                                    <p>💰 {binanceTestResult.transaction_count} tranzaksyon nan dènye 24è</p>
                                    <p>🌐 Proxy: {binanceTestResult.proxy_used ? '✅ Aktif' : '❌ Pa itilize'}</p>
                                    {binanceTestResult.transactions?.length > 0 && (
                                      <div className="bg-white/5 rounded p-2 mt-2">
                                        <p className="text-white/90 font-semibold mb-1">Dènye tranzaksyon:</p>
                                        {binanceTestResult.transactions.map((tx, i) => (
                                          <p key={i} className="ml-2 text-white/50">• {tx.amount} {tx.currency} — {tx.status} — ID: {tx.id}</p>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {binanceTestResult.error && (
                                  <p className="text-red-400 text-xs">{binanceTestResult.error}</p>
                                )}
                                {binanceTestResult.debug && (
                                  <div className="bg-white/5 rounded p-2 mt-2 text-xs text-white/40 space-y-1">
                                    <p className="text-white/60 font-semibold">Debug:</p>
                                    <p>API Key: {binanceTestResult.debug.api_key_prefix}</p>
                                    <p>Proxy URL: {binanceTestResult.debug.proxy_url}</p>
                                    {binanceTestResult.debug.proxy_reachable !== undefined && (
                                      <p>Proxy aksesib: {binanceTestResult.debug.proxy_reachable ? '✅ Wi' : '❌ Non'}</p>
                                    )}
                                    {binanceTestResult.debug.proxy_error && (
                                      <p className="text-red-400">Proxy erè: {binanceTestResult.debug.proxy_error}</p>
                                    )}
                                    {binanceTestResult.debug.raw_code !== undefined && (
                                      <p>Binance code: {String(binanceTestResult.debug.raw_code)}</p>
                                    )}
                                    {binanceTestResult.debug.raw_msg && (
                                      <p>Binance mesaj: {binanceTestResult.debug.raw_msg}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Binance Pay Manual */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-white font-semibold flex items-center gap-2">
                            <span>🟡</span> Binance Pay (Manual)
                          </h4>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={formData.payment_gateways?.binance_pay_manual?.enabled || false}
                              onChange={(e) => handlePaymentGatewayChange('binance_pay_manual', 'enabled', e.target.checked)}
                              className="w-4 h-4" 
                            />
                            <span className="text-white text-sm">Enabled</span>
                          </label>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-white/70 text-sm">Binance Pay ID / UID</Label>
                            <Input
                              placeholder="Your Binance Pay UID (e.g. 589353477)"
                              value={formData.payment_gateways?.binance_pay_manual?.email || ""}
                              onChange={(e) => handlePaymentGatewayChange('binance_pay_manual', 'email', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Instructions for Customers</Label>
                            <Textarea
                              placeholder="Send USDT via Binance Pay to the ID above, then submit your transaction ID."
                              value={formData.payment_gateways?.binance_pay_manual?.instructions || ""}
                              onChange={(e) => handlePaymentGatewayChange('binance_pay_manual', 'instructions', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                              rows={2}
                            />
                          </div>
                          <p className="text-white/40 text-xs">Customer sends payment via Binance Pay, then submits the Transaction ID. Admin verifies and approves manually.</p>
                        </div>
                      </div>

                      {/* Zelle */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-white font-semibold flex items-center gap-2">
                            <span>💲</span> Zelle
                          </h4>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={formData.payment_gateways?.zelle?.enabled || false}
                              onChange={(e) => handlePaymentGatewayChange('zelle', 'enabled', e.target.checked)}
                              className="w-4 h-4" 
                            />
                            <span className="text-white text-sm">Enabled</span>
                          </label>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-white/70 text-sm">Zelle Email/Phone</Label>
                            <Input
                              placeholder="your@email.com or phone"
                              value={formData.payment_gateways?.zelle?.email || ""}
                              onChange={(e) => handlePaymentGatewayChange('zelle', 'email', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Instructions</Label>
                            <Textarea
                              placeholder="Send via Zelle"
                              value={formData.payment_gateways?.zelle?.instructions || ""}
                              onChange={(e) => handlePaymentGatewayChange('zelle', 'instructions', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                              rows={2}
                            />
                          </div>
                        </div>
                      </div>

                      {/* CashApp */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-white font-semibold flex items-center gap-2">
                            <span>💵</span> CashApp
                          </h4>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={formData.payment_gateways?.cashapp?.enabled || false}
                              onChange={(e) => handlePaymentGatewayChange('cashapp', 'enabled', e.target.checked)}
                              className="w-4 h-4" 
                            />
                            <span className="text-white text-sm">Enabled</span>
                          </label>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-white/70 text-sm">CashApp Tag</Label>
                            <Input
                              placeholder="$YourCashtag"
                              value={formData.payment_gateways?.cashapp?.email || ""}
                              onChange={(e) => handlePaymentGatewayChange('cashapp', 'email', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Instructions</Label>
                            <Textarea
                              placeholder="Send via CashApp"
                              value={formData.payment_gateways?.cashapp?.instructions || ""}
                              onChange={(e) => handlePaymentGatewayChange('cashapp', 'instructions', e.target.value)}
                              className="bg-white/10 border-white/20 text-white mt-1"
                              rows={2}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Crypto Exchange Manual Payments */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4 border border-green-500/20">
                        <h4 className="text-white font-semibold flex items-center gap-2 mb-3">
                          <span>🔄</span> Crypto Exchange Manual Payments
                        </h4>
                        <p className="text-white/60 text-sm mb-4">
                          These methods are used only for crypto exchange (buy/sell) and are separate from store payments.
                        </p>

                        {[
                          { key: 'paypal', label: 'PayPal', placeholder: 'your@paypal.com' },
                          { key: 'airtm', label: 'AirTM', placeholder: 'your@email.com' },
                          { key: 'skrill', label: 'Skrill', placeholder: 'your@skrill.com' },
                          { key: 'moncash', label: 'MonCash', placeholder: '+509XXXXXXXX' },
                          { key: 'binance_pay', label: 'Binance Pay', placeholder: 'Your Binance Pay ID' },
                          { key: 'zelle', label: 'Zelle', placeholder: 'your@email.com or phone' },
                          { key: 'cashapp', label: 'CashApp', placeholder: '$YourCashtag' }
                        ].map((method) => (
                          <div key={method.key} className="bg-white/5 p-4 rounded-lg mb-3">
                            <div className="flex justify-between items-center mb-3">
                              <h5 className="text-white font-semibold">{method.label}</h5>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={formData.crypto_payment_gateways?.[method.key]?.enabled || false}
                                  onChange={(e) => handleCryptoGatewayChange(method.key, 'enabled', e.target.checked)}
                                  className="w-4 h-4"
                                />
                                <span className="text-white text-sm">Enabled</span>
                              </label>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <Label className="text-white/70 text-sm">{method.label} Identifier</Label>
                                <Input
                                  placeholder={method.placeholder}
                                  value={formData.crypto_payment_gateways?.[method.key]?.email || ''}
                                  onChange={(e) => handleCryptoGatewayChange(method.key, 'email', e.target.value)}
                                  className="bg-white/10 border-white/20 text-white mt-1"
                                />
                              </div>
                              <div>
                                <Label className="text-white/70 text-sm">Instructions</Label>
                                <Textarea
                                  placeholder={`Send via ${method.label}`}
                                  value={formData.crypto_payment_gateways?.[method.key]?.instructions || ''}
                                  onChange={(e) => handleCryptoGatewayChange(method.key, 'instructions', e.target.value)}
                                  className="bg-white/10 border-white/20 text-white mt-1"
                                  rows={2}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* BTC */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-white font-semibold flex items-center gap-2">
                            <span>₿</span> Bitcoin (BTC)
                          </h4>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" defaultChecked className="w-4 h-4" />
                            <span className="text-white text-sm">Enabled</span>
                          </label>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-white/70 text-sm">BTC Wallet Address</Label>
                            <Input
                              placeholder="bc1q..."
                              className="bg-white/10 border-white/20 text-white mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Instructions</Label>
                            <Textarea
                              placeholder="Send BTC to the address above"
                              className="bg-white/10 border-white/20 text-white mt-1"
                              rows={2}
                            />
                          </div>
                        </div>
                      </div>

                      {/* USDT Wallets (used by Crypto page fallback + display) */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-white font-semibold flex items-center gap-2">
                            <span>₮</span> USDT (Multiple Chains)
                          </h4>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <Label className="text-white/70 text-sm">BEP20 Wallet (Binance Smart Chain)</Label>
                            <Input
                              placeholder="0x..."
                              className="bg-white/10 border-white/20 text-white mt-1"
                              value={formData.crypto_settings?.wallets?.BEP20 || ''}
                              onChange={(e) => handleCryptoWalletChange('BEP20', e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">TRC20 Wallet (Tron)</Label>
                            <Input
                              placeholder="T..."
                              className="bg-white/10 border-white/20 text-white mt-1"
                              value={formData.crypto_settings?.wallets?.TRC20 || ''}
                              onChange={(e) => handleCryptoWalletChange('TRC20', e.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Crypto exchange settings */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4">
                        <h4 className="text-white font-semibold mb-3">Crypto Exchange (USDT) Settings</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-white/70 text-sm">Buy Rate (USD per 1 USDT)</Label>
                            <Input
                              type="number"
                              step="0.0001"
                              className="bg-white/10 border-white/20 text-white mt-1"
                              value={formData.crypto_settings?.buy_rate_usdt ?? 1.0}
                              onChange={(e) => handleCryptoSettingsChange('buy_rate_usdt', parseFloat(e.target.value))}
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Sell Rate (USD per 1 USDT)</Label>
                            <Input
                              type="number"
                              step="0.0001"
                              className="bg-white/10 border-white/20 text-white mt-1"
                              value={formData.crypto_settings?.sell_rate_usdt ?? 0.98}
                              onChange={(e) => handleCryptoSettingsChange('sell_rate_usdt', parseFloat(e.target.value))}
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Fee %</Label>
                            <Input
                              type="number"
                              step="0.1"
                              className="bg-white/10 border-white/20 text-white mt-1"
                              value={formData.crypto_settings?.transaction_fee_percent ?? 2.0}
                              onChange={(e) => handleCryptoSettingsChange('transaction_fee_percent', parseFloat(e.target.value))}
                            />
                          </div>
                          <div>
                            <Label className="text-white/70 text-sm">Minimum Transaction (USD)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              className="bg-white/10 border-white/20 text-white mt-1"
                              value={formData.crypto_settings?.min_transaction_usd ?? 10.0}
                              onChange={(e) => handleCryptoSettingsChange('min_transaction_usd', parseFloat(e.target.value))}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label className="text-white/70 text-sm">Sell USDT Instructions</Label>
                            <Textarea
                              className="bg-white/10 border-white/20 text-white mt-1"
                              placeholder="Add instructions customers should see when selling USDT."
                              rows={3}
                              value={formData.crypto_settings?.sell_instructions || ''}
                              onChange={(e) => handleCryptoSettingsChange('sell_instructions', e.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Seller Withdrawal Methods & Fees */}
                      <div className="bg-white/5 p-4 rounded-lg mb-4 border border-orange-500/20">
                        <h4 className="text-white font-semibold flex items-center gap-2 mb-3">
                          <span>💸</span> Seller Withdrawal Methods & Fees
                        </h4>
                        <p className="text-white/50 text-xs mb-3">Configure withdrawal methods, fees (% + flat), and min amount for sellers.</p>
                        <div className="space-y-2 mb-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-white/70 text-xs">Min Withdrawal ($)</Label>
                              <Input type="number" step="0.01"
                                value={formData.seller_withdrawal_min_amount ?? 5}
                                onChange={(e) => setFormData(prev => ({...prev, seller_withdrawal_min_amount: parseFloat(e.target.value)}))}
                                className="bg-white/10 border-white/20 text-white mt-1" />
                            </div>
                          </div>
                        </div>
                        {Object.entries(formData.withdrawal_methods || {}).map(([key, cfg]) => (
                          <div key={key} className="bg-white/5 p-3 rounded-lg mb-2">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-white text-sm font-semibold">{cfg.label || key}</span>
                              <label className="flex items-center gap-2">
                                <input type="checkbox" checked={cfg.enabled !== false}
                                  onChange={(e) => setFormData(prev => ({...prev, withdrawal_methods: {...prev.withdrawal_methods, [key]: {...(prev.withdrawal_methods?.[key] || {}), enabled: e.target.checked}}}))}
                                  className="w-4 h-4" />
                                <span className="text-white/60 text-xs">Enabled</span>
                              </label>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <Label className="text-white/50 text-[10px]">Fee %</Label>
                                <Input type="number" step="0.1"
                                  value={cfg.fee_percent ?? 0}
                                  onChange={(e) => setFormData(prev => ({...prev, withdrawal_methods: {...prev.withdrawal_methods, [key]: {...(prev.withdrawal_methods?.[key] || {}), fee_percent: parseFloat(e.target.value)}}}))}
                                  className="bg-white/10 border-white/20 text-white mt-0.5 text-xs" />
                              </div>
                              <div>
                                <Label className="text-white/50 text-[10px]">Fee $ (flat)</Label>
                                <Input type="number" step="0.01"
                                  value={cfg.fee_fixed ?? 0}
                                  onChange={(e) => setFormData(prev => ({...prev, withdrawal_methods: {...prev.withdrawal_methods, [key]: {...(prev.withdrawal_methods?.[key] || {}), fee_fixed: parseFloat(e.target.value)}}}))}
                                  className="bg-white/10 border-white/20 text-white mt-0.5 text-xs" />
                              </div>
                              <div>
                                <Label className="text-white/50 text-[10px]">Placeholder</Label>
                                <Input
                                  value={cfg.placeholder || ''}
                                  onChange={(e) => setFormData(prev => ({...prev, withdrawal_methods: {...prev.withdrawal_methods, [key]: {...(prev.withdrawal_methods?.[key] || {}), placeholder: e.target.value}}}))}
                                  className="bg-white/10 border-white/20 text-white mt-0.5 text-xs" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <Button type="submit" className="w-full bg-white text-green-600 hover:bg-gray-100">
                        Save Payment Settings
                      </Button>
                    </div>
                    ) : (
                      <div className="text-center text-white/60 py-8">
                        Loading payment gateways...
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="email" className="space-y-4">
                    <div>
                      <Label className="text-white text-lg font-semibold mb-3 block">Send Bulk Email</Label>
                      <p className="text-gray-400 text-sm mb-4">Send promotional emails using Resend.com API.</p>
                      
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="recipient_type" className="text-white">Recipients</Label>
                          <Select value={bulkEmail.recipient_type} onValueChange={(value) => setBulkEmail({...bulkEmail, recipient_type: value})}>
                            <SelectTrigger className="bg-white/10 border-white/20 text-white" data-testid="recipient-select">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Users</SelectItem>
                              <SelectItem value="customers">Customers Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label htmlFor="email_subject" className="text-white">Subject</Label>
                          <Input
                            id="email_subject"
                            value={bulkEmail.subject}
                            onChange={(e) => setBulkEmail({...bulkEmail, subject: e.target.value})}
                            className="bg-white/10 border-white/20 text-white placeholder:text-gray-500"
                            placeholder="Email subject"
                            data-testid="email-subject-input"
                          />
                        </div>

                        <div>
                          <Label htmlFor="email_message" className="text-white">Message</Label>
                          <Textarea
                            id="email_message"
                            value={bulkEmail.message}
                            onChange={(e) => setBulkEmail({...bulkEmail, message: e.target.value})}
                            className="bg-white/10 border-white/20 text-white placeholder:text-gray-500"
                            placeholder="Your promotional message..."
                            rows={6}
                            data-testid="email-message-input"
                          />
                        </div>

                        <Button
                          type="button"
                          onClick={handleSendBulkEmail}
                          disabled={sendingEmail}
                          className="w-full gradient-button text-white"
                          data-testid="send-email-btn"
                        >
                          <Mail className="mr-2" size={20} />
                          {sendingEmail ? 'Sending...' : 'Send Bulk Email'}
                        </Button>

                        <div className="p-4 bg-yellow-400/10 border border-yellow-400/30 rounded-lg">
                          <p className="text-yellow-200 text-sm">
                            <strong>Note:</strong> Configure Resend API key in API Keys tab first.
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="faq" className="space-y-6">
                    {/* Buyer FAQ */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-white font-bold text-lg">Buyer FAQ</h3>
                        <Button type="button" size="sm" className="bg-green-600 text-white text-xs" onClick={() => {
                          setFormData(prev => ({...prev, faq_buyer: [...(prev.faq_buyer || []), {q: '', a: ''}]}));
                        }}><Plus size={14} className="mr-1" /> Add</Button>
                      </div>
                      <div className="space-y-3">
                        {(formData.faq_buyer || []).map((item, i) => (
                          <div key={i} className="bg-white/5 p-3 rounded-lg border border-white/10">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 space-y-2">
                                <Input value={item.q} placeholder="Question"
                                  onChange={(e) => {
                                    const arr = [...(formData.faq_buyer || [])];
                                    arr[i] = {...arr[i], q: e.target.value};
                                    setFormData(prev => ({...prev, faq_buyer: arr}));
                                  }}
                                  className="bg-white/5 border-white/10 text-white text-sm" />
                                <Textarea value={item.a} placeholder="Answer" rows={2}
                                  onChange={(e) => {
                                    const arr = [...(formData.faq_buyer || [])];
                                    arr[i] = {...arr[i], a: e.target.value};
                                    setFormData(prev => ({...prev, faq_buyer: arr}));
                                  }}
                                  className="bg-white/5 border-white/10 text-white text-sm" />
                              </div>
                              <button type="button" className="text-red-400 hover:text-red-300 p-1 mt-1" onClick={() => {
                                const arr = (formData.faq_buyer || []).filter((_, idx) => idx !== i);
                                setFormData(prev => ({...prev, faq_buyer: arr}));
                              }}><Trash2 size={16} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Seller FAQ */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-white font-bold text-lg">Seller FAQ</h3>
                        <Button type="button" size="sm" className="bg-orange-600 text-white text-xs" onClick={() => {
                          setFormData(prev => ({...prev, faq_seller: [...(prev.faq_seller || []), {q: '', a: ''}]}));
                        }}><Plus size={14} className="mr-1" /> Add</Button>
                      </div>
                      <div className="space-y-3">
                        {(formData.faq_seller || []).map((item, i) => (
                          <div key={i} className="bg-white/5 p-3 rounded-lg border border-white/10">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 space-y-2">
                                <Input value={item.q} placeholder="Question"
                                  onChange={(e) => {
                                    const arr = [...(formData.faq_seller || [])];
                                    arr[i] = {...arr[i], q: e.target.value};
                                    setFormData(prev => ({...prev, faq_seller: arr}));
                                  }}
                                  className="bg-white/5 border-white/10 text-white text-sm" />
                                <Textarea value={item.a} placeholder="Answer" rows={2}
                                  onChange={(e) => {
                                    const arr = [...(formData.faq_seller || [])];
                                    arr[i] = {...arr[i], a: e.target.value};
                                    setFormData(prev => ({...prev, faq_seller: arr}));
                                  }}
                                  className="bg-white/5 border-white/10 text-white text-sm" />
                              </div>
                              <button type="button" className="text-red-400 hover:text-red-300 p-1 mt-1" onClick={() => {
                                const arr = (formData.faq_seller || []).filter((_, idx) => idx !== i);
                                setFormData(prev => ({...prev, faq_seller: arr}));
                              }}><Trash2 size={16} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  <div className="mt-6 pt-6 border-t border-white/20">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full gradient-button text-white py-6 text-lg"
                      data-testid="save-settings-btn"
                    >
                      <Save className="mr-2" size={20} />
                      {loading ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </div>
                </form>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer settings={currentSettings} />
    </div>
  );
};

export default AdminSettings;
