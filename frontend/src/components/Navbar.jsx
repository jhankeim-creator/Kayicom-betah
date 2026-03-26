import { useContext, useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, User, LogOut, Package, Settings, Heart, Menu, X, Search, ChevronRight, Bell, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import LanguageSwitcher from './LanguageSwitcher';
import { LanguageContext, axiosInstance } from '../App';

const Navbar = ({ user, logout, cartItemCount, settings }) => {
  const { t } = useContext(LanguageContext);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const fetchBadges = useCallback(async () => {
    if (!user) return;
    const userId = user.user_id || user.id;
    try {
      const [notifRes, msgRes] = await Promise.all([
        axiosInstance.get(`/notifications/unread-count?user_id=${userId}`),
        axiosInstance.get(`/messages/unread-count?user_id=${userId}`),
      ]);
      setUnreadNotifs(notifRes.data?.unread_count || 0);
      setUnreadMessages(msgRes.data?.unread || 0);
    } catch {}
  }, [user]);

  useEffect(() => {
    fetchBadges();
    const interval = setInterval(fetchBadges, 30000);
    return () => clearInterval(interval);
  }, [fetchBadges]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const categories = [
    { name: 'Gift Cards', icon: '🎁', href: '/products/gift-cards' },
    { name: 'Subscriptions', icon: '🔄', href: '/products/subscriptions' },
    { name: 'Game Top-Up', icon: '🎮', href: '/products/game-top-up' },
    { name: 'Services', icon: '⚡', href: '/products/services' },
  ];

  return (
    <>
      <nav className="sticky top-0 z-50 bg-[#111] border-b border-white/5">
        {settings?.announcement_enabled && settings?.announcement_message && (
          <div className="w-full bg-green-500 text-black">
            <div className="w-full max-w-[1400px] mx-auto px-3 py-1.5 text-sm font-medium">
              <div className="announcement-marquee">
                <div className="announcement-marquee__content">
                  {settings.announcement_message}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="w-full max-w-[1400px] mx-auto px-3 md:px-6 py-2 md:py-3">
          <div className="flex items-center justify-between gap-2 md:gap-4">
            {/* Logo */}
            <Link to="/" className="flex items-center flex-shrink-0" data-testid="nav-logo">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="h-8 md:h-12 w-auto" />
              ) : (
                <img src="/images/kayeecomlogo.png" alt="KayiCom" className="h-8 md:h-12 w-auto" />
              )}
            </Link>

            {/* Desktop Menu */}
            <div className="hidden lg:flex items-center space-x-5 text-sm">
              <Link to="/" className="text-white/80 font-medium hover:text-green-400 transition" data-testid="nav-home">
                Home
              </Link>
              <Link to="/marketplace" className="text-white/80 font-medium hover:text-green-400 transition">
                Marketplace
              </Link>
              <Link to="/products" className="text-white/80 font-medium hover:text-green-400 transition">
                Products
              </Link>
              <Link to="/blog" className="text-white/80 font-medium hover:text-green-400 transition" data-testid="nav-blog">
                Blog
              </Link>
              {user && (
                <>
                  <Link to="/dashboard" className="text-white/80 font-medium hover:text-green-400 transition">
                    Dashboard
                  </Link>
                  <Link to="/mobile-topup" className="text-white/80 font-medium hover:text-green-400 transition">
                    Topup Mobile
                  </Link>
                  <Link to="/referral" className="text-white/80 font-medium hover:text-green-400 transition">
                    Referral
                  </Link>
                  <Link to="/withdraw" className="text-white/80 font-medium hover:text-green-400 transition">
                    Withdraw
                  </Link>
                </>
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
              <LanguageSwitcher />

              <Link to="/cart" className="relative" data-testid="nav-cart">
                <Button variant="ghost" size="sm" className="text-white/70 hover:bg-white/5 hover:text-green-400 p-1.5 md:p-2">
                  <ShoppingCart size={18} className="md:w-5 md:h-5" />
                  {cartItemCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-green-500 text-black text-[10px] rounded-full h-4 w-4 md:h-5 md:w-5 flex items-center justify-center font-bold">
                      {cartItemCount}
                    </span>
                  )}
                </Button>
              </Link>

              {user && (
                <>
                  <Link to="/messages" className="relative" data-testid="nav-messages">
                    <Button variant="ghost" size="sm" className="text-white/70 hover:bg-white/5 hover:text-green-400 p-1.5 md:p-2">
                      <MessageCircle size={18} className="md:w-5 md:h-5" />
                      {unreadMessages > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[10px] rounded-full h-4 w-4 md:h-5 md:w-5 flex items-center justify-center font-bold">
                          {unreadMessages > 99 ? '99+' : unreadMessages}
                        </span>
                      )}
                    </Button>
                  </Link>
                  <Link to="/notifications" className="relative" data-testid="nav-notifications">
                    <Button variant="ghost" size="sm" className="text-white/70 hover:bg-white/5 hover:text-green-400 p-1.5 md:p-2">
                      <Bell size={18} className="md:w-5 md:h-5" />
                      {unreadNotifs > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full h-4 w-4 md:h-5 md:w-5 flex items-center justify-center font-bold">
                          {unreadNotifs > 99 ? '99+' : unreadNotifs}
                        </span>
                      )}
                    </Button>
                  </Link>
                </>
              )}

              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-white/70 hover:bg-white/5 hover:text-green-400 p-1.5 md:p-2" data-testid="user-menu">
                      <User size={18} className="md:w-5 md:h-5" />
                      <span className="ml-1.5 hidden xl:inline text-sm">{user.full_name}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-[#1a1a1a] border-white/10">
                    {user.role === 'admin' && (
                      <DropdownMenuItem asChild>
                        <Link to="/admin" className="cursor-pointer text-gray-300 hover:text-green-400" data-testid="admin-link">
                          <Settings className="mr-2" size={16} />
                          {t('adminPanel')}
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <Link to="/wallet" className="cursor-pointer text-gray-300 hover:text-green-400">
                        💳 Wallet
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/mobile-topup" className="cursor-pointer text-gray-300 hover:text-green-400">
                        📲 Topup Mobile
                      </Link>
                    </DropdownMenuItem>
                    <div className="lg:hidden">
                      <DropdownMenuItem asChild>
                        <Link to="/products" className="cursor-pointer text-gray-300 hover:text-green-400">
                          <Package className="mr-2" size={16} />
                          Products
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/blog" className="cursor-pointer text-gray-300 hover:text-green-400">
                          📰 Blog
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/dashboard" className="cursor-pointer text-gray-300 hover:text-green-400" data-testid="dashboard-link">
                          <User className="mr-2" size={16} />
                          {t('myAccount')}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/referral" className="cursor-pointer text-gray-300 hover:text-green-400">
                          👥 Referral
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/withdraw" className="cursor-pointer text-gray-300 hover:text-green-400">
                          💰 Withdraw
                        </Link>
                      </DropdownMenuItem>
                    </div>
                    <DropdownMenuItem onClick={logout} className="cursor-pointer text-gray-300 hover:text-green-400" data-testid="logout-btn">
                      <LogOut className="mr-2" size={16} />
                      {t('logout')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link to="/login">
                  <Button variant="ghost" size="sm" className="text-white/70 hover:bg-white/5 hover:text-green-400 p-1.5 md:p-2" data-testid="login-btn">
                    <User size={18} className="md:w-5 md:h-5" />
                    <span className="ml-1 text-xs md:text-sm">{t('login')}</span>
                  </Button>
                </Link>
              )}

              {/* Mobile hamburger */}
              <button
                className="lg:hidden text-white/70 hover:text-green-400 p-1.5"
                onClick={() => setSideMenuOpen(true)}
              >
                <Menu size={22} />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex items-center gap-2 mt-2 md:mt-3">
            <button
              type="button"
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-white/5 text-white/60"
              onClick={() => setSideMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="flex-1 flex">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your products..."
                className="flex-1 bg-white/5 border border-white/10 rounded-l-lg px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-green-500/50"
              />
              <button
                type="submit"
                className="bg-green-500 hover:bg-green-600 text-black font-semibold px-5 py-2.5 rounded-r-lg text-sm transition"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </nav>

      {/* Side menu overlay */}
      {sideMenuOpen && (
        <div className="fixed inset-0 z-[60] flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSideMenuOpen(false)} />
          <div className="relative w-72 max-w-[80vw] bg-[#111] h-full overflow-y-auto border-r border-white/5">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="h-8 w-auto" />
              ) : (
                <img src="/images/kayeecomlogo.png" alt="KayiCom" className="h-8 w-auto" />
              )}
              <button onClick={() => setSideMenuOpen(false)} className="text-red-400 hover:text-red-300 p-1">
                <X size={22} />
              </button>
            </div>

            <div className="border-b border-white/5 pb-2">
              <Link
                to="/marketplace"
                className="flex items-center justify-between px-4 py-3 text-white/80 hover:bg-white/5 transition"
                onClick={() => setSideMenuOpen(false)}
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">🏪</span>
                  <span className="text-sm font-semibold text-green-400">Marketplace</span>
                </span>
                <ChevronRight size={16} className="text-white/30" />
              </Link>
            </div>

            <div className="border-b border-white/5 pb-2">
              <div className="px-4 py-2 flex gap-4 text-sm">
                <span className="text-green-400 font-semibold">Categories</span>
                <span className="text-white/50">|</span>
                <span className="text-white/70">Main Menu</span>
              </div>
              {categories.map((cat) => (
                <Link
                  key={cat.name}
                  to={cat.href}
                  className="flex items-center justify-between px-4 py-3 text-white/80 hover:bg-white/5 transition"
                  onClick={() => setSideMenuOpen(false)}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-lg">{cat.icon}</span>
                    <span className="text-sm">{cat.name}</span>
                  </span>
                  <ChevronRight size={16} className="text-white/30" />
                </Link>
              ))}
            </div>

            <div className="p-4 flex gap-4">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
