import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, User, LogOut, Home, Package, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import LanguageSwitcher from './LanguageSwitcher';
import { LanguageContext } from '../App';

const Navbar = ({ user, logout, cartItemCount, settings }) => {
  const { t } = useContext(LanguageContext);

  return (
    <nav className="sticky top-0 z-50 nav-surface">
      {settings?.announcement_enabled && settings?.announcement_message && (
        <div className="w-full bg-black/30 border-b border-white/10">
          <div className="w-full max-w-[1400px] mx-auto px-3 py-2 text-center text-white/90 text-sm">
            {settings.announcement_message}
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
            <Link to="/" className="nav-link" data-testid="nav-home">
              Home
            </Link>
            <Link to="/crypto" className="nav-link" data-testid="nav-crypto">
              Crypto
            </Link>
            {user && (
              <>
                <Link to="/dashboard" className="nav-link">
                  Dashboard
                </Link>
                <Link to="/mobile-topup" className="nav-link">
                  Topup Mobile
                </Link>
                <Link to="/referral" className="nav-link">
                  Referral
                </Link>
                <Link to="/withdraw" className="nav-link">
                  Withdraw
                </Link>
              </>
            )}
          </div>
          
          {/* Mobile Menu - Hamburger for logged in users */}
          <div className="flex lg:hidden items-center gap-1">
            {!user && (
              <Link to="/crypto" className="nav-link p-1.5 text-xs font-semibold">
                Crypto
              </Link>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-0 md:gap-3 flex-shrink-0">
            <LanguageSwitcher />
            
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
                  {/* Mobile only - show nav items in dropdown */}
                  <div className="lg:hidden">
                    <DropdownMenuItem asChild>
                      <Link to="/products" className="cursor-pointer text-gray-300 hover:text-pink-400">
                        <Package className="mr-2" size={16} />
                        Products
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/crypto" className="cursor-pointer text-gray-300 hover:text-pink-400">
                        💱 Crypto
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