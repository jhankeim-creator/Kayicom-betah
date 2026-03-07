import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, ShoppingBag, Users, DollarSign, Settings, AlertCircle, FileText, Store } from 'lucide-react';
import { toast } from 'sonner';

const AdminDashboard = ({ user, logout, settings }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await axiosInstance.get('/stats/dashboard');
      setStats(response.data);
    } catch (error) {      console.error('Error loading stats:', error);
      toast.error('Error loading stats');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { title: 'Total Orders', value: stats?.total_orders || 0, icon: ShoppingBag, color: 'from-blue-500 to-cyan-500', testId: 'stat-orders' },
    { title: 'Total Products', value: stats?.total_products || 0, icon: Package, color: 'from-purple-500 to-indigo-500', testId: 'stat-products' },
    { title: 'Total Customers', value: stats?.total_customers || 0, icon: Users, color: 'from-green-500 to-emerald-500', testId: 'stat-customers' },
    { title: 'Total Revenue', value: `$${stats?.total_revenue?.toFixed(2) || '0.00'}`, icon: DollarSign, color: 'from-yellow-500 to-orange-500', testId: 'stat-revenue' },
  ];

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-12">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-2" data-testid="admin-title">Admin Panel</h1>
              <p className="text-white/80 text-lg">Manage your site</p>
            </div>
            <Link to="/admin/settings">
              <Button className="bg-white text-purple-600 hover:bg-gray-100" data-testid="settings-link">
                <Settings className="mr-2" size={20} />
                Settings
              </Button>
            </Link>
          </div>

          {/* Stats Grid */}
          {loading ? (
            <div className="text-center text-white text-xl py-12">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              {statCards.map((stat) => {
                const Icon = stat.icon;
                return (
                  <Card key={stat.title} className={`overflow-hidden bg-gradient-to-br ${stat.color}`} data-testid={stat.testId}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <Icon className="text-white" size={32} />
                      </div>
                      <p className="text-white/90 text-sm mb-1">{stat.title}</p>
                      <p className="text-3xl font-bold text-white">{stat.value}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Pending Payments Alert */}
          {stats && stats.pending_payments > 0 && (
            <Card className="glass-effect border-yellow-400/30 mb-8" data-testid="pending-alert">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <AlertCircle className="text-yellow-400" size={32} />
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-1">Pending Payments</h3>
                    <p className="text-white/80">You have {stats.pending_payments} payments requiring review</p>
                  </div>
                  <Link to="/admin/orders">
                    <Button className="bg-yellow-400 text-gray-900 hover:bg-yellow-300">
                      Review
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link to="/admin/products">
              <Card className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer" data-testid="manage-products">
                <CardContent className="p-8 text-center">
                  <Package className="mx-auto mb-4 text-white" size={48} />
                  <h3 className="text-xl font-bold text-white mb-2">Manage Products</h3>
                  <p className="text-white/70">Add, edit or delete products</p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/orders">
              <Card className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer" data-testid="manage-orders">
                <CardContent className="p-8 text-center">
                  <ShoppingBag className="mx-auto mb-4 text-white" size={48} />
                  <h3 className="text-xl font-bold text-white mb-2">Manage Orders</h3>
                  <p className="text-white/70">View and manage customer orders</p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/customers">
              <Card className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer" data-testid="manage-customers">
                <CardContent className="p-8 text-center">
                  <Users className="mx-auto mb-4 text-white" size={48} />
                  <h3 className="text-xl font-bold text-white mb-2">Manage Customers</h3>
                  <p className="text-white/70">Search and manage customer accounts</p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/sellers">
              <Card className="glass-effect border-white/20 hover:border-cyan-500/40 transition cursor-pointer">
                <CardContent className="p-8 text-center">
                  <Store className="mx-auto mb-4 text-cyan-400" size={48} />
                  <h3 className="text-xl font-bold text-white mb-2">Manage Sellers</h3>
                  <p className="text-white/70">Review KYC, approve sellers, manage categories</p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/settings">
              <Card className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer" data-testid="site-settings">
                <CardContent className="p-8 text-center">
                  <Settings className="mx-auto mb-4 text-white" size={48} />
                  <h3 className="text-xl font-bold text-white mb-2">Site Settings</h3>
                  <p className="text-white/70">Configure API keys and customization</p>
                </CardContent>
              </Card>
            </Link>
            
            <Link to="/admin/withdrawals">
              <Card className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer">
                <CardContent className="p-8 text-center">
                  <DollarSign className="mx-auto mb-4 text-green-400" size={48} />
                  <h3 className="text-xl font-bold text-white mb-2">Withdrawals</h3>
                  <p className="text-white/70">Manage user withdrawal requests</p>
                </CardContent>
              </Card>
            </Link>
            
            <Link to="/admin/wallet-topups">
              <Card className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer">
                <CardContent className="p-8 text-center">
                  <span className="text-5xl mb-4 block">💳</span>
                  <h3 className="text-xl font-bold text-white mb-2">Wallet Topups</h3>
                  <p className="text-white/70">Approve wallet funding requests</p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/coupons">
              <Card className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer">
                <CardContent className="p-8 text-center">
                  <span className="text-5xl mb-4 block">🏷️</span>
                  <h3 className="text-xl font-bold text-white mb-2">Coupons</h3>
                  <p className="text-white/70">Create promo codes</p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/blog">
              <Card className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer">
                <CardContent className="p-8 text-center">
                  <FileText className="mx-auto mb-4 text-cyan-400" size={48} />
                  <h3 className="text-xl font-bold text-white mb-2">Blog</h3>
                  <p className="text-white/70">Publish updates for customers</p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/mobile-topups">
              <Card className="glass-effect border-white/20 hover:border-white/40 transition cursor-pointer">
                <CardContent className="p-8 text-center">
                  <span className="text-5xl mb-4 block">📲</span>
                  <h3 className="text-xl font-bold text-white mb-2">Mobile Topups</h3>
                  <p className="text-white/70">Manage airtime topup requests</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default AdminDashboard;
