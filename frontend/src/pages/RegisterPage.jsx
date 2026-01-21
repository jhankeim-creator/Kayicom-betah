import { useState, useContext } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { axiosInstance, LanguageContext } from '../App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';

const RegisterPage = ({ login, settings }) => {
  const { t } = useContext(LanguageContext);
  
  // Get referral code from URL
  const urlParams = new URLSearchParams(window.location.search);
  const referralCode = urlParams.get('ref');
  
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error(t('passwordsDoNotMatch'));
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = formData.email.trim().toLowerCase();
      const normalizedName = formData.full_name.trim();
      const endpoint = referralCode 
        ? `/auth/register-with-referral?referral_code=${referralCode}`
        : '/auth/register';
      
      await axiosInstance.post(endpoint, {
        full_name: normalizedName,
        email: normalizedEmail,
        password: formData.password
      });

      // Auto login after registration
      const loginResponse = await axiosInstance.post('/auth/login', {
        email: normalizedEmail,
        password: formData.password
      });
      
      login(loginResponse.data, { remember: true });
      toast.success(t('success'));
      const from = location.state?.from;
      const redirectTo = from?.pathname
        ? `${from.pathname}${from.search || ''}${from.hash || ''}`
        : '/dashboard';
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

        <Card className="glass-effect border-white/10" data-testid="register-form">
          <CardHeader>
            <CardTitle className="text-2xl text-center text-white">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="h-12 mx-auto mb-4" />
              ) : (
                <img src="/images/kayeecomlogo.png" alt="KayiCom" className="h-12 mx-auto mb-4" />
              )}
              {t('createAccount')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="full_name" className="text-gray-300">{t('fullName')}</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  type="text"
                  value={formData.full_name}
                  onChange={handleChange}
                  autoComplete="name"
                  required
                  className="bg-gray-900/50 border-white/10 text-white placeholder:text-gray-500"
                  placeholder="John Doe"
                  data-testid="fullname-input"
                />
              </div>

              <div>
                <Label htmlFor="email" className="text-gray-300">{t('email')}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
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
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleChange}
                    autoComplete="new-password"
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

              <div>
                <Label htmlFor="confirmPassword" className="text-gray-300">{t('confirmPassword')}</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    autoComplete="new-password"
                    required
                    className="bg-gray-900/50 border-white/10 text-white placeholder:text-gray-500 pr-10"
                    placeholder="••••••••"
                    data-testid="confirm-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                    aria-label={showConfirmPassword ? t('hidePassword') : t('showPassword')}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full gradient-button text-white"
                disabled={loading}
                data-testid="register-submit-btn"
              >
                {loading ? t('loading') : t('createAccount')}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-gray-400">
                {t('alreadyHaveAccount')}{' '}
                <Link to="/login" className="text-cyan-400 font-semibold hover:underline" data-testid="login-link">
                  {t('login')}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RegisterPage;
