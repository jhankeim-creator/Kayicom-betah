import { useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { axiosInstance, LanguageContext } from '../App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

const ForgotPasswordPage = ({ settings }) => {
  const { t } = useContext(LanguageContext);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axiosInstance.post('/auth/forgot-password', {
        email: email.trim().toLowerCase(),
      });
      setSent(true);
      toast.success(t('resetLinkSent'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/login" className="inline-flex items-center text-gray-400 hover:text-green-400 mb-6 transition" data-testid="back-login">
          <ArrowLeft className="mr-2" size={20} />
          {t('backToLogin')}
        </Link>

        <Card className="glass-effect border-white/10" data-testid="forgot-password-form">
          <CardHeader>
            <CardTitle className="text-2xl text-center text-white">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="h-12 mx-auto mb-4" />
              ) : (
                <img src="/images/kayeecomlogo.png" alt="KayiCom" className="h-12 mx-auto mb-4" />
              )}
              {t('forgotPassword')}
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
                  disabled={sent}
                  className="bg-gray-900/50 border-white/10 text-white placeholder:text-gray-500"
                  placeholder="you@email.com"
                  data-testid="email-input"
                />
              </div>

              <Button
                type="submit"
                className="w-full gradient-button text-white"
                disabled={loading || sent}
                data-testid="forgot-submit-btn"
              >
                {loading ? t('loading') : t('sendResetLink')}
              </Button>
            </form>

            {sent && (
              <p className="mt-4 text-center text-sm text-gray-300">
                {t('resetLinkSent')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
