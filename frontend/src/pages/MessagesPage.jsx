import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send, ArrowLeft, User, Plus, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

const MessagesPage = ({ user, logout, settings }) => {
  const [searchParams] = useSearchParams();
  const [messages, setMessages] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMsg, setNewMsg] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedReceiver, setSelectedReceiver] = useState(null);
  const [receiverName, setReceiverName] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const chatEndRef = useRef(null);
  const initDone = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    loadOrders();
  }, [user?.id]);

  useEffect(() => {
    if (initDone.current || !user?.id) return;
    initDone.current = true;
    const orderParam = searchParams.get('order');
    const sellerParam = searchParams.get('seller');
    if (orderParam && sellerParam) {
      openChat(orderParam, sellerParam);
    }
  }, [searchParams, user?.id]);

  const loadOrders = async () => {
    try {
      const res = await axiosInstance.get(`/orders?user_id=${user.id}`);
      const paid = (res.data || []).filter(o => o.payment_status === 'paid');
      setOrders(paid);
    } catch (err) { console.error('Error loading orders:', err); }
  };

  const loadMessages = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await axiosInstance.get(`/messages?user_id=${user.id}`);
      setMessages(res.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, selectedOrderId]);

  useEffect(() => {
    if (!selectedOrderId) return;
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [selectedOrderId, loadMessages]);

  const openChat = (orderId, receiverId) => {
    setSelectedOrderId(orderId);
    setSelectedReceiver(receiverId);
    setShowNewChat(false);
    const conv = conversations.find(c => c.orderId === orderId);
    if (conv) {
      setReceiverName(conv.otherUser);
      conv.messages.filter(m => m.receiver_id === user?.id && !m.read).forEach(m => {
        axiosInstance.put(`/messages/${m.id}/read?user_id=${user.id}`).catch(() => {});
      });
    } else {
      axiosInstance.get(`/seller/profile?user_id=${receiverId}`).then(r => {
        setReceiverName(r.data?.seller_store_name || r.data?.full_name || 'Seller');
      }).catch(() => setReceiverName('Seller'));
    }
  };

  const startFromOrder = (order) => {
    const sellerId = order.items?.find(i => i.seller_id)?.seller_id;
    if (sellerId) {
      openChat(order.id, sellerId);
    } else {
      toast.error('No seller found for this order');
    }
  };

  const conversations = (() => {
    const map = new Map();
    for (const msg of messages) {
      const key = msg.order_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(msg);
    }
    return Array.from(map.entries()).map(([orderId, msgs]) => ({
      orderId,
      messages: msgs,
      lastMessage: msgs[msgs.length - 1],
      otherUser: msgs.find(m => m.sender_id !== user?.id)?.sender_name || 'User',
      otherRole: msgs.find(m => m.sender_id !== user?.id)?.sender_role || '',
      unread: msgs.filter(m => m.receiver_id === user?.id && !m.read).length,
    })).sort((a, b) => new Date(b.lastMessage?.created_at || 0) - new Date(a.lastMessage?.created_at || 0));
  })();

  const activeMessages = selectedOrderId ? messages.filter(m => m.order_id === selectedOrderId) : [];
  const activeConv = conversations.find(c => c.orderId === selectedOrderId);

  const sendMessage = async () => {
    if (!newMsg.trim()) return;
    if (!selectedOrderId || !selectedReceiver) {
      toast.error('Select an order to message about');
      return;
    }
    try {
      await axiosInstance.post(`/messages?user_id=${user.id}`, {
        order_id: selectedOrderId, receiver_id: selectedReceiver, content: newMsg.trim(),
      });
      setNewMsg('');
      loadMessages();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error sending message'); }
  };

  const sellerOrders = orders.filter(o => o.items?.some(i => i.seller_id));

  const renderChatPanel = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[#111]">
        <button onClick={() => { setSelectedOrderId(null); setShowNewChat(false); }} className="text-white/60 hover:text-white md:hidden"><ArrowLeft size={20} /></button>
        <div className="w-8 h-8 rounded-full bg-[#1c1c1c] flex items-center justify-center">
          <User size={14} className="text-white/40" />
        </div>
        <div>
          <p className="text-white font-semibold text-sm">{activeConv?.otherUser || receiverName || 'Seller'}</p>
          <p className="text-white/30 text-[10px]">Order #{selectedOrderId?.slice(0, 8)}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {activeMessages.map(msg => (
          <div key={msg.id} className={`max-w-[80%] ${msg.sender_id === user?.id ? 'ml-auto' : ''}`}>
            <div className={`p-3 rounded-2xl text-sm ${msg.sender_id === user?.id ? 'bg-green-600 text-white rounded-br-md' : 'bg-[#1c1c1c] text-white/90 rounded-bl-md'}`}>
              {msg.content}
            </div>
            <p className={`text-[10px] text-white/30 mt-0.5 ${msg.sender_id === user?.id ? 'text-right' : ''}`}>
              {msg.sender_name} • {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </p>
          </div>
        ))}
        {activeMessages.length === 0 && <p className="text-white/20 text-center text-sm py-8">Send your first message</p>}
        <div ref={chatEndRef} />
      </div>
      <div className="p-3 border-t border-white/5 bg-[#111] flex gap-2">
        <Input value={newMsg} onChange={(e) => setNewMsg(e.target.value)}
          placeholder="Type a message..." className="bg-white/5 border-white/10 text-white flex-1 text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }} />
        <Button onClick={sendMessage} size="sm" className="bg-green-500 hover:bg-green-600 text-black"><Send size={16} /></Button>
      </div>
    </div>
  );

  const renderOrderPicker = () => (
    <div>
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <button onClick={() => setShowNewChat(false)} className="text-white/60 hover:text-white"><ArrowLeft size={20} /></button>
        <h2 className="text-white font-semibold text-sm">Select an order to message about</h2>
      </div>
      <div className="divide-y divide-white/5">
        {sellerOrders.length === 0 && (
          <p className="text-white/40 text-sm text-center py-12">No orders with sellers yet. Buy from the marketplace first!</p>
        )}
        {sellerOrders.map(order => {
          const sellerItem = order.items?.find(i => i.seller_id);
          return (
            <button key={order.id} onClick={() => startFromOrder(order)}
              className="w-full text-left px-4 py-3 hover:bg-white/5 transition flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <ShoppingCart size={16} className="text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">
                  {order.items?.map(i => i.product_name || i.name).join(', ') || `Order #${order.id?.slice(0, 8)}`}
                </p>
                <p className="text-white/40 text-xs">
                  Order #{order.id?.slice(0, 8)} • ${Number(order.total || 0).toFixed(2)} • {order.order_status}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderConversationList = () => (
    <div>
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <MessageSquare size={20} className="text-green-400" /> Messages
        </h1>
        {sellerOrders.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setShowNewChat(true)}
            className="border-green-500/30 text-green-400 hover:bg-green-500/10 text-xs">
            <Plus size={14} className="mr-1" /> New
          </Button>
        )}
      </div>
      <div className="divide-y divide-white/5">
        {conversations.length === 0 && !loading && (
          <div className="text-center py-12 px-4">
            <MessageSquare size={40} className="text-white/10 mx-auto mb-3" />
            <p className="text-white/40 text-sm mb-4">No messages yet</p>
            {sellerOrders.length > 0 ? (
              <Button size="sm" onClick={() => setShowNewChat(true)}
                className="bg-green-500 hover:bg-green-600 text-black text-xs">
                <Plus size={14} className="mr-1" /> Start a conversation
              </Button>
            ) : (
              <p className="text-white/30 text-xs">Buy from the marketplace to message sellers</p>
            )}
          </div>
        )}
        {conversations.map(conv => (
          <button key={conv.orderId} onClick={() => openChat(conv.orderId, conv.messages.find(m => m.sender_id !== user?.id)?.sender_id)}
            className="w-full text-left px-4 py-3 hover:bg-white/5 transition flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#1c1c1c] flex items-center justify-center flex-shrink-0">
              <User size={18} className="text-white/40" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <p className="text-white font-semibold text-sm">{conv.otherUser}</p>
                <p className="text-white/30 text-[10px]">{conv.lastMessage?.created_at ? new Date(conv.lastMessage.created_at).toLocaleDateString() : ''}</p>
              </div>
              <p className="text-white/40 text-xs truncate">{conv.lastMessage?.content}</p>
            </div>
            {conv.unread > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">{conv.unread}</span>}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-0 md:px-4 py-0 md:py-8 max-w-4xl">

        {/* Mobile */}
        <div className="md:hidden">
          {selectedOrderId ? (
            <div className="h-[calc(100vh-130px)]">{renderChatPanel()}</div>
          ) : showNewChat ? (
            renderOrderPicker()
          ) : (
            renderConversationList()
          )}
        </div>

        {/* Desktop */}
        <div className="hidden md:block">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <MessageSquare className="text-green-400" /> Messages
            </h1>
            {sellerOrders.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => { setShowNewChat(true); setSelectedOrderId(null); }}
                className="border-green-500/30 text-green-400 hover:bg-green-500/10">
                <Plus size={14} className="mr-1" /> New Conversation
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4 min-h-[500px]">
            <div className="space-y-1 overflow-y-auto max-h-[600px]">
              {conversations.length === 0 && !loading && (
                <div className="text-center py-8">
                  <p className="text-white/40 text-sm mb-3">No messages yet</p>
                  {sellerOrders.length > 0 && (
                    <Button size="sm" onClick={() => { setShowNewChat(true); setSelectedOrderId(null); }}
                      className="bg-green-500 hover:bg-green-600 text-black text-xs">
                      <Plus size={14} className="mr-1" /> Start conversation
                    </Button>
                  )}
                </div>
              )}
              {conversations.map(conv => (
                <button key={conv.orderId} onClick={() => openChat(conv.orderId, conv.messages.find(m => m.sender_id !== user?.id)?.sender_id)}
                  className={`w-full text-left p-3 rounded-xl transition ${selectedOrderId === conv.orderId ? 'bg-green-500/10 border border-green-500/30' : 'bg-[#141414] border border-white/5 hover:border-white/10'}`}>
                  <div className="flex justify-between items-center">
                    <p className="text-white text-sm font-semibold">{conv.otherUser}</p>
                    {conv.unread > 0 && <Badge className="bg-red-500 text-white text-xs">{conv.unread}</Badge>}
                  </div>
                  <p className="text-white/30 text-xs">Order #{conv.orderId?.slice(0, 8)}</p>
                  <p className="text-white/50 text-xs mt-1 truncate">{conv.lastMessage?.content}</p>
                </button>
              ))}
            </div>
            <div className="col-span-2">
              {selectedOrderId ? (
                <div className="rounded-xl bg-[#141414] border border-white/5 h-[500px]">{renderChatPanel()}</div>
              ) : showNewChat ? (
                <div className="rounded-xl bg-[#141414] border border-white/5 h-[500px] overflow-y-auto">{renderOrderPicker()}</div>
              ) : (
                <div className="rounded-xl bg-[#141414] border border-white/5 flex items-center justify-center h-[500px]">
                  <div className="text-center">
                    <MessageSquare size={40} className="text-white/10 mx-auto mb-3" />
                    <p className="text-white/30">Select a conversation or start a new one</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer settings={settings} />
    </div>
  );
};

export default MessagesPage;
