import { useState, useContext } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { axiosInstance, LanguageContext } from '../App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';

const LoginPage = ({ login, settings }) => {
  const { t } = useContext(LanguageContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await axiosInstance.post('/auth/login', { email: normalizedEmail, password });
      login(response.data, { remember: rememberMe });
      toast.success(t('loginSuccess'));
      const from = location.state?.from;
      const redirectTo = from?.pathname
        ? `${from.pathname}${from.search || ''}${from.hash || ''}`
        : (response.data.role === 'admin' ? '/admin' : '/dashboard');
      navigate(redirectTo, { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.detail || t('error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center text-gray-400 hover:text-cyan-400 mb-6 transition" data-testid="back-home">
          <ArrowLeft className="mr-2" size={20} />
          {t('home')}
        </Link>

        <Card className="glass-effect border-white/10" data-testid="login-form">
          <CardHeader>
            <CardTitle className="text-2xl text-center text-white">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="h-12 mx-auto mb-4" />
              ) : (
                <img src="/images/kayeecomlogo.png" alt="KayiCom" className="h-12 mx-auto mb-4" />
              )}
              {t('login')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-gray-300">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="bg-gray-900/50 border-white/10 text-white placeholder:text-gray-500"
                  placeholder="you@email.com"
                  data-testid="email-input"
                />
              </div>

              <div>
                <Label htmlFor="password" className="text-gray-300">{t('password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="bg-gray-900/50 border-white/10 text-white placeholder:text-gray-500 pr-10"
                    placeholder="••••••••"
                    data-testid="password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(Boolean(checked))}
                />
                <Label htmlFor="rememberMe" className="text-gray-300 cursor-pointer">
                  {t('rememberMe')}
                </Label>
              </div>

              <Button
                type="submit"
                className="w-full gradient-button text-white"
                disabled={loading}
                data-testid="login-submit-btn"
              >
                {loading ? t('loading') : t('login')}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-gray-400">
                {t('dontHaveAccount')}{' '}
                <Link to="/register" className="text-cyan-400 font-semibold hover:underline" data-testid="register-link">
                  {t('register')}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
