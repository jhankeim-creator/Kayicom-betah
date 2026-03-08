import { useEffect, useState, useCallback, useRef } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send, ArrowLeft, User } from 'lucide-react';
import { toast } from 'sonner';

const MessagesPage = ({ user, logout, settings }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMsg, setNewMsg] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedReceiver, setSelectedReceiver] = useState(null);
  const chatEndRef = useRef(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedOrderId ? `?user_id=${user.id}&order_id=${selectedOrderId}` : `?user_id=${user.id}`;
      const res = await axiosInstance.get(`/messages${params}`);
      setMessages(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [user?.id, selectedOrderId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, selectedOrderId]);

  useEffect(() => {
    if (!selectedOrderId) return;
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [selectedOrderId, loadMessages]);

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

  const sendMessage = async () => {
    if (!newMsg.trim() || !selectedOrderId || !selectedReceiver) return;
    try {
      await axiosInstance.post(`/messages?user_id=${user.id}`, {
        order_id: selectedOrderId, receiver_id: selectedReceiver, content: newMsg.trim(),
      });
      setNewMsg('');
      loadMessages();
    } catch (err) { toast.error('Error sending'); }
  };

  const selectConversation = (conv) => {
    setSelectedOrderId(conv.orderId);
    const other = conv.messages.find(m => m.sender_id !== user?.id);
    setSelectedReceiver(other?.sender_id || null);
    // Mark as read
    conv.messages.filter(m => m.receiver_id === user?.id && !m.read).forEach(m => {
      axiosInstance.put(`/messages/${m.id}/read?user_id=${user.id}`).catch(() => {});
    });
  };

  const showChatView = selectedOrderId && (window.innerWidth < 768 || conversations.length > 0);
  const activeConv = conversations.find(c => c.orderId === selectedOrderId);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-0 md:px-4 py-0 md:py-8 max-w-4xl">

        {/* Mobile: show either list or chat */}
        <div className="md:hidden">
          {!selectedOrderId ? (
            <div>
              <div className="px-4 py-3 border-b border-white/5">
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <MessageSquare size={20} className="text-green-400" /> Messages
                </h1>
              </div>
              <div className="divide-y divide-white/5">
                {conversations.length === 0 && !loading && (
                  <p className="text-white/40 text-sm text-center py-12">No messages yet</p>
                )}
                {conversations.map(conv => (
                  <button key={conv.orderId} onClick={() => selectConversation(conv)}
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
          ) : (
            <div className="flex flex-col h-[calc(100vh-130px)]">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[#111]">
                <button onClick={() => setSelectedOrderId(null)} className="text-white/60 hover:text-white"><ArrowLeft size={20} /></button>
                <div className="w-8 h-8 rounded-full bg-[#1c1c1c] flex items-center justify-center">
                  <User size={14} className="text-white/40" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{activeConv?.otherUser || 'User'}</p>
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
                      {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                ))}
                {activeMessages.length === 0 && <p className="text-white/20 text-center text-sm py-8">Start the conversation</p>}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-white/5 bg-[#111] flex gap-2">
                <Input value={newMsg} onChange={(e) => setNewMsg(e.target.value)}
                  placeholder="Type a message..." className="bg-white/5 border-white/10 text-white flex-1 text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }} />
                <Button onClick={sendMessage} size="sm" className="bg-green-500 hover:bg-green-600 text-black"><Send size={16} /></Button>
              </div>
            </div>
          )}
        </div>

        {/* Desktop: side-by-side */}
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <MessageSquare className="text-green-400" /> Messages
          </h1>
          <div className="grid grid-cols-3 gap-4 min-h-[500px]">
            <div className="space-y-1 overflow-y-auto max-h-[600px]">
              {conversations.length === 0 && !loading && <p className="text-white/40 text-sm text-center py-4">No messages yet</p>}
              {conversations.map(conv => (
                <button key={conv.orderId} onClick={() => selectConversation(conv)}
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
                <div className="rounded-xl bg-[#141414] border border-white/5 flex flex-col h-[500px]">
                  <div className="px-4 py-3 border-b border-white/5">
                    <p className="text-white font-semibold text-sm">{activeConv?.otherUser}</p>
                    <p className="text-white/30 text-xs">Order #{selectedOrderId?.slice(0, 8)}</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {activeMessages.map(msg => (
                      <div key={msg.id} className={`max-w-[70%] ${msg.sender_id === user?.id ? 'ml-auto' : ''}`}>
                        <div className={`p-3 rounded-2xl text-sm ${msg.sender_id === user?.id ? 'bg-green-600 text-white rounded-br-md' : 'bg-white/5 text-white/90 rounded-bl-md'}`}>
                          {msg.content}
                        </div>
                        <p className={`text-[10px] text-white/30 mt-0.5 ${msg.sender_id === user?.id ? 'text-right' : ''}`}>
                          {msg.sender_name} • {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </p>
                      </div>
                    ))}
                    {activeMessages.length === 0 && <p className="text-white/20 text-center text-sm py-8">Start the conversation</p>}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="p-3 border-t border-white/5 flex gap-2">
                    <Input value={newMsg} onChange={(e) => setNewMsg(e.target.value)}
                      placeholder="Type a message..." className="bg-white/5 border-white/10 text-white flex-1"
                      onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }} />
                    <Button onClick={sendMessage} className="bg-green-500 hover:bg-green-600 text-black"><Send size={16} /></Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-[#141414] border border-white/5 flex items-center justify-center h-[500px]">
                  <p className="text-white/30">Select a conversation</p>
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
