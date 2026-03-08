import { useEffect, useState, useCallback } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';

const MessagesPage = ({ user, logout, settings }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMsg, setNewMsg] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedReceiver, setSelectedReceiver] = useState(null);

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
      unread: msgs.filter(m => m.receiver_id === user?.id && !m.read).length,
    }));
  })();

  const activeMessages = selectedOrderId
    ? messages.filter(m => m.order_id === selectedOrderId)
    : [];

  const sendMessage = async () => {
    if (!newMsg.trim() || !selectedOrderId || !selectedReceiver) return;
    try {
      await axiosInstance.post(`/messages?user_id=${user.id}`, {
        order_id: selectedOrderId,
        receiver_id: selectedReceiver,
        content: newMsg.trim(),
      });
      setNewMsg('');
      loadMessages();
    } catch (err) { toast.error('Error sending'); }
  };

  const selectConversation = (conv) => {
    setSelectedOrderId(conv.orderId);
    const other = conv.messages.find(m => m.sender_id !== user?.id);
    setSelectedReceiver(other?.sender_id || null);
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
          <MessageSquare className="text-green-400" /> Messages
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Conversation list */}
          <div className="space-y-2">
            {conversations.length === 0 && !loading && (
              <p className="text-white/40 text-sm text-center py-4">No messages yet</p>
            )}
            {conversations.map(conv => (
              <Card key={conv.orderId}
                className={`cursor-pointer transition ${selectedOrderId === conv.orderId ? 'border-green-500' : 'border-white/20'} glass-effect hover:border-white/40`}
                onClick={() => selectConversation(conv)}>
                <CardContent className="p-3">
                  <div className="flex justify-between items-center">
                    <p className="text-white text-sm font-semibold">{conv.otherUser}</p>
                    {conv.unread > 0 && <Badge className="bg-red-500 text-white text-xs">{conv.unread}</Badge>}
                  </div>
                  <p className="text-white/40 text-xs">Order #{conv.orderId?.slice(0, 8)}</p>
                  <p className="text-white/60 text-xs mt-1 truncate">{conv.lastMessage?.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Chat area */}
          <div className="md:col-span-2">
            {selectedOrderId ? (
              <Card className="glass-effect border-white/20">
                <CardContent className="p-4">
                  <p className="text-white/50 text-xs mb-3">Order #{selectedOrderId?.slice(0, 8)}</p>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto mb-4 p-2">
                    {activeMessages.map(msg => (
                      <div key={msg.id} className={`p-3 rounded-lg max-w-[80%] ${msg.sender_id === user?.id ? 'ml-auto bg-cyan-500/20' : 'bg-white/5'}`}>
                        <p className="text-white/60 text-xs mb-1">{msg.sender_name}</p>
                        <p className="text-white text-sm">{msg.content}</p>
                      </div>
                    ))}
                    {activeMessages.length === 0 && <p className="text-white/30 text-center text-sm py-8">No messages in this conversation</p>}
                  </div>
                  <div className="flex gap-2">
                    <Input value={newMsg} onChange={(e) => setNewMsg(e.target.value)}
                      placeholder="Type a message..." className="bg-white/10 border-white/20 text-white flex-1"
                      onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }} />
                    <Button onClick={sendMessage} className="bg-cyan-600 text-white"><Send size={16} /></Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="glass-effect border-white/20">
                <CardContent className="p-8 text-center">
                  <p className="text-white/40">Select a conversation</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      <Footer settings={settings} />
    </div>
  );
};

export default MessagesPage;
