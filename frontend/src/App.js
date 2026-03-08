import { useState, useEffect, createContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { getTranslation } from './utils/i18n';
import Navbar from './components/Navbar';
import Footer from './components/Footer';

// Pages
import HomePage from './pages/NewHomePage';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import RefundPolicy from './pages/RefundPolicy';
import OrderTrackingPage from './pages/OrderTrackingPage';
import CustomerDashboard from './pages/CustomerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/AdminProducts';
import AdminOrders from './pages/AdminOrders';
import AdminSettings from './pages/AdminSettings';
import AdminWithdrawals from './pages/AdminWithdrawals';
import AdminWalletTopups from './pages/AdminWalletTopups';
import AdminCoupons from './pages/AdminCoupons';
import AdminMinutesTransfers from './pages/AdminMinutesTransfers';
import AdminCustomers from './pages/AdminCustomers';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ReferralPage from './pages/ReferralPage';
import WithdrawPage from './pages/WithdrawPage';
import WalletPage from './pages/WalletPage';
import MinutesTransferPage from './pages/MinutesTransferPage';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import BlogPage from './pages/BlogPage';
import BlogDetailPage from './pages/BlogDetailPage';
import AdminBlog from './pages/AdminBlog';
import AdminSellers from './pages/AdminSellers';
import AdminProductRequests from './pages/AdminProductRequests';
import AdminPendingProducts from './pages/AdminPendingProducts';
import SellerApplyPage from './pages/SellerApplyPage';
import SellerDashboard from './pages/SellerDashboard';
import SellerStorePage from './pages/SellerStorePage';
import DisputeCenterPage from './pages/DisputeCenterPage';
import MessagesPage from './pages/MessagesPage';
import WhatsAppButton from './components/WhatsAppButton';

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, ''); // Remove trailing slashes
export const API = `${BACKEND_URL}/api`;

// Create axios instance
export const axiosInstance = axios.create({
  baseURL: API,
});

// Create language context
export const LanguageContext = createContext();

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Ensure each route starts at the top
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}

function App() {
  const [user, setUser] = useState(null);
  const [cart, setCart] = useState([]);
  const [settings, setSettings] = useState(null);
  const [language, setLanguage] = useState('en'); // Default to English
  const [loading, setLoading] = useState(true); // Add loading state

  const getStoredUser = () => {
    const readUser = (storage) => {
      const raw = storage.getItem('user');
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.error('Error parsing saved user:', e);
        storage.removeItem('user');
        return null;
      }
    };
    return readUser(localStorage) || readUser(sessionStorage);
  };

  useEffect(() => {
    // Load user from storage (local or session)
    const savedUser = getStoredUser();
    if (savedUser) {
      setUser(savedUser);
    }
    setLoading(false); // Mark loading complete

    // Load cart from localStorage
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }

    // Load language from localStorage
    const savedLang = localStorage.getItem('language');
    if (savedLang) {
      setLanguage(savedLang);
    }

    // Load site settings
    loadSettings();
  }, []);

  useEffect(() => {
    const crispId = (settings?.crisp_website_id || '').trim();
    const enabled = Boolean(settings?.crisp_enabled && crispId);
    const existingScript = document.getElementById('crisp-chat-script');
    const currentId = window.CRISP_WEBSITE_ID;

    if (enabled) {
      if (existingScript && currentId === crispId) {
        return;
      }
      if (existingScript) {
        existingScript.remove();
      }
      window.$crisp = window.$crisp || [];
      window.CRISP_WEBSITE_ID = crispId;
      const script = document.createElement('script');
      script.id = 'crisp-chat-script';
      script.src = 'https://client.crisp.chat/l.js';
      script.async = true;
      document.body.appendChild(script);
    } else {
      if (existingScript) {
        existingScript.remove();
      }
      if (window.$crisp) {
        try {
          window.$crisp.push(['do', 'chat:hide']);
        } catch (e) {
          // no-op
        }
      }
      if (window.$crisp) delete window.$crisp;
      if (window.CRISP_WEBSITE_ID) delete window.CRISP_WEBSITE_ID;
    }
  }, [settings?.crisp_enabled, settings?.crisp_website_id]);

  const loadSettings = async () => {
    try {
      const response = await axiosInstance.get('/settings');
      setSettings(response.data);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const login = (userData, options = {}) => {
    const { remember = true } = options;
    const normalized = { ...(userData || {}) };
    // Add id field for consistency (backend sends user_id)
    if (normalized.user_id && !normalized.id) {
      normalized.id = normalized.user_id;
    }
    // Normalize name field used by dashboards/UI
    if (!normalized.full_name && normalized.username) {
      normalized.full_name = normalized.username;
    }
    setUser(normalized);
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem('user', JSON.stringify(normalized));
    (remember ? sessionStorage : localStorage).removeItem('user');
    return normalized; // Return for redirect logic
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    sessionStorage.removeItem('user');
    const t = (key) => getTranslation(language, key);
    toast.success(t('logoutSuccess'));
  };

  const switchLanguage = (lang) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
  };

  const t = (key) => getTranslation(language, key);

  const addToCart = (product, quantity = 1) => {
    const existingItem = cart.find(item => item.product.id === product.id);
    let newCart;
    
    if (existingItem) {
      newCart = cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + quantity }
          : item
      );
    } else {
      newCart = [...cart, { product, quantity }];
    }
    
    setCart(newCart);
    localStorage.setItem('cart', JSON.stringify(newCart));
    toast.success(t('productAdded'));
  };

  const removeFromCart = (productId) => {
    const newCart = cart.filter(item => item.product.id !== productId);
    setCart(newCart);
    localStorage.setItem('cart', JSON.stringify(newCart));
    toast.success(t('productRemoved'));
  };

  const updateCartQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    
    const newCart = cart.map(item =>
      item.product.id === productId ? { ...item, quantity } : item
    );
    setCart(newCart);
    localStorage.setItem('cart', JSON.stringify(newCart));
  };

  const clearCart = () => {
    setCart([]);
    localStorage.removeItem('cart');
  };

  const ProtectedRoute = ({ children, adminOnly = false }) => {
    const location = useLocation();
    // Show loading while checking authentication
    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-white text-xl">Loading...</div>
        </div>
      );
    }

    // Check storage as fallback if user state is null
    const savedUser = !user ? getStoredUser() : null;
    const currentUser = user || savedUser;
    
    if (!currentUser) {
      return <Navigate to="/login" replace state={{ from: location }} />;
    }
    
    if (adminOnly && currentUser.role !== 'admin') {
      return <Navigate to="/" replace />;
    }
    
    return children;
  };

  return (
    <LanguageContext.Provider value={{ language, switchLanguage, t }}>
      <BrowserRouter>
        <ScrollToTop />
        <div className="App">
          <Routes>
            <Route path="/" element={<HomePage user={user} logout={logout} cart={cart} settings={settings} />} />
          <Route path="/products" element={<ProductsPage user={user} logout={logout} addToCart={addToCart} cart={cart} settings={settings} />} />
          <Route path="/products/:category" element={<ProductsPage user={user} logout={logout} addToCart={addToCart} cart={cart} settings={settings} />} />
          <Route path="/product/:id" element={<ProductDetailPage user={user} logout={logout} addToCart={addToCart} cart={cart} settings={settings} />} />
          <Route path="/cart" element={<CartPage user={user} logout={logout} cart={cart} removeFromCart={removeFromCart} updateCartQuantity={updateCartQuantity} settings={settings} />} />
          <Route path="/checkout" element={<CheckoutPage user={user} logout={logout} cart={cart} clearCart={clearCart} settings={settings} />} />
          <Route path="/refund-policy" element={<RefundPolicy user={user} logout={logout} cart={cart} settings={settings} />} />
          <Route path="/blog" element={<BlogPage user={user} logout={logout} cart={cart} settings={settings} />} />
          <Route path="/blog/:slug" element={<BlogDetailPage user={user} logout={logout} cart={cart} settings={settings} />} />
          <Route path="/track/:orderId" element={<OrderTrackingPage user={user} logout={logout} settings={settings} />} />
          <Route path="/payment-success" element={<PaymentSuccessPage user={user} logout={logout} settings={settings} />} />
          <Route path="/login" element={<LoginPage login={login} settings={settings} />} />
          <Route path="/register" element={<RegisterPage login={login} settings={settings} />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage settings={settings} />} />
          <Route path="/reset-password" element={<ResetPasswordPage settings={settings} />} />
          
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <CustomerDashboard user={user} logout={logout} settings={settings} cart={cart} />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/referral"
            element={
              <ProtectedRoute>
                <ReferralPage user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/withdraw"
            element={
              <ProtectedRoute>
                <WithdrawPage user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/wallet"
            element={
              <ProtectedRoute>
                <WalletPage user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/minutes"
            element={
              <ProtectedRoute>
                <MinutesTransferPage user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mobile-topup"
            element={
              <ProtectedRoute>
                <MinutesTransferPage user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/seller/apply"
            element={
              <ProtectedRoute>
                <SellerApplyPage user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/seller"
            element={
              <ProtectedRoute>
                <SellerDashboard user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/disputes"
            element={
              <ProtectedRoute>
                <DisputeCenterPage user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/messages"
            element={
              <ProtectedRoute>
                <MessagesPage user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminDashboard user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/products"
            element={
              <ProtectedRoute adminOnly>
                <AdminProducts user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/orders"
            element={
              <ProtectedRoute adminOnly>
                <AdminOrders user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute adminOnly>
                <AdminSettings user={user} logout={logout} settings={settings} loadSettings={loadSettings} />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/withdrawals"
            element={
              <ProtectedRoute adminOnly>
                <div className="min-h-screen gradient-bg">
                  <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
                  <div className="container mx-auto px-4 py-12">
                    <AdminWithdrawals />
                  </div>
                  <Footer settings={settings} />
                </div>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/wallet-topups"
            element={
              <ProtectedRoute adminOnly>
                <AdminWalletTopups user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/coupons"
            element={
              <ProtectedRoute adminOnly>
                <AdminCoupons user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/minutes-transfers"
            element={
              <ProtectedRoute adminOnly>
                <AdminMinutesTransfers user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/mobile-topups"
            element={
              <ProtectedRoute adminOnly>
                <AdminMinutesTransfers user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/customers"
            element={
              <ProtectedRoute adminOnly>
                <AdminCustomers user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/blog"
            element={
              <ProtectedRoute adminOnly>
                <AdminBlog user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/sellers"
            element={
              <ProtectedRoute adminOnly>
                <AdminSellers user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/product-requests"
            element={
              <ProtectedRoute adminOnly>
                <AdminProductRequests user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/pending-products"
            element={
              <ProtectedRoute adminOnly>
                <AdminPendingProducts user={user} logout={logout} settings={settings} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/store/:sellerId"
            element={
              <SellerStorePage user={user} logout={logout} settings={settings} addToCart={addToCart} />
            }
          />
        </Routes>
        <Toaster position="top-right" richColors />
          <WhatsAppButton settings={settings} />
        </div>
      </BrowserRouter>
    </LanguageContext.Provider>
  );
}

export default App;
