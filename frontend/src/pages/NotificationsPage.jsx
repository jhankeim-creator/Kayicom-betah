import { useEffect, useState, useCallback } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, CheckCheck, ShoppingBag, Star, Tag, Shield, FolderOpen, Truck } from 'lucide-react';

const NOTIF_ICONS = {
  new_sale: ShoppingBag,
  new_review: Star,
  seller_approved: Shield,
  seller_rejected: Shield,
  category_approved: FolderOpen,
  category_rejected: FolderOpen,
  order_delivered: Truck,
  default: Bell,
};

const NOTIF_COLORS = {
  new_sale: 'text-green-400',
  new_review: 'text-yellow-400',
  seller_approved: 'text-green-400',
  seller_rejected: 'text-red-400',
  category_approved: 'text-green-400',
  category_rejected: 'text-red-400',
  order_delivered: 'text-blue-400',
  default: 'text-white/60',
};

const NotificationsPage = ({ user, logout, settings }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await axiosInstance.get(`/notifications?user_id=${user.user_id || user.id}&limit=100`);
      setNotifications(res.data?.notifications || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const markAllRead = async () => {
    try {
      await axiosInstance.put(`/notifications/read-all?user_id=${user.user_id || user.id}`);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };

  const markRead = async (id) => {
    try {
      await axiosInstance.put(`/notifications/${id}/read?user_id=${user.user_id || user.id}`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {}
  };

  const cartItemCount = 0;
  const unreadCount = notifications.filter(n => !n.read).length;

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Bell className="text-green-400" /> Notifications
            {unreadCount > 0 && (
              <Badge className="bg-green-500 text-white">{unreadCount} new</Badge>
            )}
          </h1>
          {unreadCount > 0 && (
            <Button size="sm" onClick={markAllRead} className="bg-white/10 text-white text-xs hover:bg-white/20">
              <CheckCheck size={14} className="mr-1" /> Mark all read
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-white/60 text-center py-12">Loading...</p>
        ) : notifications.length === 0 ? (
          <Card className="glass-effect border-white/20">
            <CardContent className="p-12 text-center">
              <Bell size={48} className="text-white/20 mx-auto mb-4" />
              <p className="text-white/40">No notifications yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map(notif => {
              const Icon = NOTIF_ICONS[notif.type] || NOTIF_ICONS.default;
              const color = NOTIF_COLORS[notif.type] || NOTIF_COLORS.default;
              return (
                <Card
                  key={notif.id}
                  className={`glass-effect border-white/10 hover:border-white/20 transition cursor-pointer ${!notif.read ? 'border-l-2 border-l-cyan-400' : ''}`}
                  onClick={() => !notif.read && markRead(notif.id)}
                >
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className={`flex-shrink-0 mt-0.5 ${color}`}>
                      <Icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!notif.read ? 'text-white font-semibold' : 'text-white/70'}`}>
                        {notif.message}
                      </p>
                      <p className="text-white/40 text-xs mt-1">{formatTime(notif.created_at)}</p>
                    </div>
                    {!notif.read && (
                      <div className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0 mt-2" />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      <Footer settings={settings} />
    </div>
  );
};

export default NotificationsPage;
