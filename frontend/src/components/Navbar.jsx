import { useContext, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, User, LogOut, Package, Settings, Bell, MessageCircle } from 'lucide-react';
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
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (user) {
      const fetchCounts = async () => {
        try {
          const [notifRes, msgRes] = await Promise.all([
            axiosInstance.get(`/notifications/unread-count?user_id=${user.user_id || user.id}`),
            axiosInstance.get(`/messages/unread-count?user_id=${user.user_id || user.id}`),
          ]);
          setUnreadNotifs(notifRes.data?.unread_count || 0);
          setUnreadMessages(msgRes.data?.unread_count || 0);
        } catch {}
      };
      fetchCounts();
      const interval = setInterval(fetchCounts, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  return (
    <nav className="sticky top-0 z-50 shadow-lg border-b border-purple-500/20" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      {settings?.announcement_enabled && settings?.announcement_message && (
        <div className="w-full bg-black/30 border-b border-white/10">
          <div className="w-full max-w-[1400px] mx-auto px-3 py-2 text-white/90 text-sm">
            <div className="announcement-marquee">
              <div className="announcement-marquee__content">
                {settings.announcement_message}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="w-full max-w-[1400px] mx-auto px-2 md:px-6 py-2 md:py-4">
        <div className="flex items-center justify-between gap-0.5 md:gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-1 flex-shrink-0" data-testid="nav-logo">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="h-8 md:h-14 w-auto" />
            ) : (
              <img src="/images/kayeecomlogo.png" alt="KayiCom" className="h-8 md:h-14 w-auto" />
            )}
          </Link>

          {/* Desktop Menu */}
          <div className="hidden lg:flex items-center space-x-4 xl:space-x-6 text-sm xl:text-base">
            <Link to="/" className="text-white font-medium hover:text-pink-400 transition" data-testid="nav-home">
              Home
            </Link>
            <Link to="/blog" className="text-white font-medium hover:text-pink-400 transition" data-testid="nav-blog">
              Blog
            </Link>
            {user && (
              <>
                <Link to="/dashboard" className="text-white font-medium hover:text-pink-400 transition">
                  Dashboard
                </Link>
                {(user.seller_status === 'approved' || user.role === 'seller') && (
                  <Link to="/seller" className="text-cyan-300 font-medium hover:text-cyan-400 transition">
                    Seller Dashboard
                  </Link>
                )}
                <Link to="/mobile-topup" className="text-white font-medium hover:text-pink-400 transition">
                  Topup Mobile
                </Link>
                <Link to="/referral" className="text-white font-medium hover:text-pink-400 transition">
                  Referral
                </Link>
                <Link to="/withdraw" className="text-white font-medium hover:text-pink-400 transition">
                  Withdraw
                </Link>
              </>
            )}
          </div>
          
          {/* Right side */}
          <div className="flex items-center gap-0 md:gap-3 flex-shrink-0">
            <LanguageSwitcher />

            {user && (
              <>
                <Link to="/messages" className="relative text-white hover:text-pink-400 transition">
                  <MessageCircle size={20} />
                  {unreadMessages > 0 && (
                    <span className="absolute -top-1 -right-1 bg-pink-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{unreadMessages}</span>
                  )}
                </Link>
                <Link to="/notifications" className="relative text-white hover:text-pink-400 transition">
                  <Bell size={20} />
                  {unreadNotifs > 0 && (
                    <span className="absolute -top-1 -right-1 bg-pink-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{unreadNotifs}</span>
                  )}
                </Link>
              </>
            )}

            <Link to="/cart" className="relative" data-testid="nav-cart">
              <Button variant="ghost" size="sm" className="text-gray-300 hover:bg-white/5 hover:text-pink-400 p-1 md:p-2 md:px-3">
                <ShoppingCart size={16} className="md:w-5 md:h-5" />
                {cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-gradient-to-r from-pink-500 to-blue-500 text-white text-xs rounded-full h-4 w-4 md:h-5 md:w-5 flex items-center justify-center text-[10px] md:text-xs font-bold">
                    {cartItemCount}
                  </span>
                )}
              </Button>
            </Link>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-gray-300 hover:bg-white/5 hover:text-pink-400 p-1 md:p-2 md:px-3" data-testid="user-menu">
                    <User size={16} className="md:w-5 md:h-5" />
                    <span className="ml-2 hidden xl:inline text-base">{user.full_name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-gray-900 border-white/10">
                  {user.role === 'admin' && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="cursor-pointer text-gray-300 hover:text-pink-400" data-testid="admin-link">
                        <Settings className="mr-2" size={16} />
                        {t('adminPanel')}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/wallet" className="cursor-pointer text-gray-300 hover:text-pink-400">
                      💳 Wallet
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/mobile-topup" className="cursor-pointer text-gray-300 hover:text-pink-400">
                      📲 Topup Mobile
                    </Link>
                  </DropdownMenuItem>
                  {/* Seller link */}
                  {user?.seller_status === 'approved' || user?.role === 'seller' ? (
                    <DropdownMenuItem asChild>
                      <Link to="/seller" className="cursor-pointer text-cyan-300 hover:text-cyan-400">
                        🏪 Seller Dashboard
                      </Link>
                    </DropdownMenuItem>
                  ) : user?.role !== 'admin' && (
                    <DropdownMenuItem asChild>
                      <Link to="/seller/apply" className="cursor-pointer text-cyan-300 hover:text-cyan-400">
                        🏪 Become a Seller
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/messages" className="cursor-pointer text-gray-300 hover:text-pink-400">
                      💬 Messages {unreadMessages > 0 && `(${unreadMessages})`}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/notifications" className="cursor-pointer text-gray-300 hover:text-pink-400">
                      🔔 Notifications {unreadNotifs > 0 && `(${unreadNotifs})`}
                    </Link>
                  </DropdownMenuItem>
                  {/* Mobile only - show nav items in dropdown */}
                  <div className="lg:hidden">
                    <DropdownMenuItem asChild>
                      <Link to="/products" className="cursor-pointer text-gray-300 hover:text-pink-400">
                        <Package className="mr-2" size={16} />
                        Products
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/blog" className="cursor-pointer text-gray-300 hover:text-pink-400">
                        📰 Blog
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard" className="cursor-pointer text-gray-300 hover:text-pink-400" data-testid="dashboard-link">
                        <User className="mr-2" size={16} />
                        {t('myAccount')}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/referral" className="cursor-pointer text-gray-300 hover:text-pink-400">
                        👥 Referral
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/withdraw" className="cursor-pointer text-gray-300 hover:text-pink-400">
                        💰 Withdraw
                      </Link>
                    </DropdownMenuItem>
                  </div>
                  <DropdownMenuItem onClick={logout} className="cursor-pointer text-gray-300 hover:text-pink-400" data-testid="logout-btn">
                    <LogOut className="mr-2" size={16} />
                    {t('logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/login">
                <Button variant="ghost" size="sm" className="text-gray-300 hover:bg-white/5 hover:text-pink-400 p-1 md:p-2 md:px-3" data-testid="login-btn">
                  <User size={16} className="md:w-5 md:h-5" />
                  <span className="ml-1 text-xs md:text-base">{t('login')}</span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;