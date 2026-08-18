import React, { useState, useEffect, useContext, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../../App.tsx';
import { supabase } from '../../lib/supabase.ts';
import { toast } from 'react-hot-toast';
import { getCurrentPath } from '../../lib/loginRedirect.ts';

const QUICK_ACTIONS = [
  { icon: 'fa-box', label: 'Order Status', query: 'I want to check the status of my recent purchase.' },
  { icon: 'fa-credit-card', label: 'Payment Issue', query: 'I am having trouble with my payment transaction.' },
  { icon: 'fa-cloud-arrow-down', label: 'Download Help', query: 'I am unable to download my purchased asset.' },
  { icon: 'fa-shield-halved', label: 'License Query', query: 'I have a question about the asset usage license.' }
];

const HELP_LINKS = [
  { label: 'Refund Policy', to: '/refund-policy' },
  { label: 'Asset Licensing', to: '/license' },
  { label: 'Account Security', to: '/profile' },
  { label: 'Terms of Service', to: '/terms' }
];

export const LiveSupport: React.FC = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [messages, setMessages] = useState<any[]>([]);
  const [conversation, setConversation] = useState<any>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login', { state: { from: getCurrentPath(location) } });
      return;
    }

    let channel: any;

    const initChat = async () => {
      setLoading(true);
      try {
        let { data, error } = await supabase
          .from('support_conversations')
          .select('*')
          .eq('user_id', user.id)
          .neq('status', 'closed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        if (!data) {
          const { data: newConv, error: createError } = await supabase
            .from('support_conversations')
            .insert({ user_id: user.id, status: 'open', messages: [] })
            .select()
            .single();
          if (createError) throw createError;
          data = newConv;
        }

        setConversation(data);
        setMessages(data.messages || []);

        channel = supabase
          .channel('support_conv_' + data.id)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'support_conversations',
              filter: 'id=eq.' + data.id
            },
            (payload) => {
              setMessages(payload.new.messages || []);
            }
          )
          .subscribe();
      } catch (err: any) {
        console.error('Init error:', err);
        toast.error(err.message || 'Failed to connect');
      } finally {
        setLoading(false);
      }
    };

    initChat();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user, navigate]);

  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    scrollToBottom();
    setTimeout(scrollToBottom, 100);
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || !conversation || sending) return;

    setSending(true);
    const msgObj = {
      id: crypto.randomUUID(),
      sender: 'user',
      sender_id: user?.id,
      message: content.trim(),
      message_type: 'text',
      timestamp: new Date().toISOString(),
      is_read: false
    };

    setNewMessage('');
    setMessages(prev => [...prev, msgObj]);

    try {
      const { error } = await supabase.rpc('append_support_message', {
        conversation_id: conversation.id,
        message_json: msgObj
      });
      if (error) throw error;
    } catch (err: any) {
      console.error('Send error:', err);
      toast.error(err.message || 'Message failed to send');
    } finally {
      setSending(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f1f3f6]">
      <div className="w-12 h-12 border-4 border-[#2874f0]/20 border-t-[#2874f0] rounded-full animate-spin mb-4"></div>
      <p className="text-[10px] text-gray-500 font-normal uppercase tracking-[0.3em]">Syncing Session...</p>
    </div>
  );

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (newMessage.trim() && !sending) {
        sendMessage(newMessage);
        e.currentTarget.style.height = 'auto';
      }
    }
  };

  return (
    <div className="bg-[#f1f3f6] flex flex-col flex-grow relative overflow-hidden text-[#212121]">
      <div className="w-full h-full flex-grow flex flex-col lg:flex-row overflow-hidden md:p-6 max-w-[1200px] mx-auto lg:gap-6 min-h-0">
        
        <div className="flex-grow flex flex-col bg-white md:border md:border-gray-200 md:rounded-xl md:shadow-sm overflow-hidden relative min-h-0 lg:h-full">
          
          <div className="bg-[#2874f0] px-4 py-3 flex items-center justify-between sticky top-0 z-30 shrink-0 shadow-md">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate('/')} className="text-white md:hidden">
                 <i className="fas fa-arrow-left text-xl"></i>
              </button>
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#2874f0] text-lg shrink-0 shadow-sm">
                <i className="fas fa-headset"></i>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white leading-none">
                  Live Support
                </h1>
                <div className="text-[13px] text-blue-100 mt-1 font-medium">
                   We usually reply in a few minutes
                </div>
              </div>
            </div>
          </div>

          <div 
            ref={scrollRef}
            className="flex-grow overflow-y-auto p-4 md:p-8 space-y-3 bg-[#e5ddd5]/30 custom-scrollbar scroll-smooth relative"
          >
            <div className="flex justify-center mb-6">
               <div className="bg-[#e3f2fd] px-4 py-2 rounded-full flex items-center gap-2 shadow-sm border border-blue-100">
                  <i className="fas fa-shield-alt text-[#2874f0] text-[10px]"></i>
                  <span className="text-[11px] text-[#2874f0] font-medium">Your chat is securely encrypted and confidential.</span>
               </div>
            </div>

            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[60%] text-center max-w-md mx-auto animate-in fade-in zoom-in-95">
                <div className="w-20 h-20 bg-blue-50 text-[#2874f0] rounded-full flex items-center justify-center text-4xl mb-4 shadow-sm border border-blue-100">
                  <i className="fas fa-headset"></i>
                </div>
                <h3 className="text-xl font-bold text-[#212121] tracking-tight mb-2">Hello, {user?.name?.split(' ')[0] || 'User'}</h3>
                <p className="text-sm text-[#878787] mb-8">How can we help you today? Choose an option below or type your query.</p>
                
                <div className="grid grid-cols-1 gap-3 w-full">
                  {QUICK_ACTIONS.map((action, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(action.query)}
                      className="p-3 bg-white hover:bg-blue-50 border border-gray-200 hover:border-[#2874f0] rounded-xl transition-all text-left flex items-center gap-3 group shadow-sm"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0 text-[#2874f0] group-hover:bg-[#2874f0] group-hover:text-white transition-colors">
                        <i className={'fas ' + action.icon + ' text-sm'}></i>
                      </div>
                      <span className="text-sm font-medium text-[#212121]">{action.label}</span>
                      <i className="fas fa-chevron-right ml-auto text-xs text-gray-400 group-hover:text-[#2874f0]"></i>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, idx) => {
                  const isMe = msg.sender === 'user' || msg.sender === 'seller';
                  const containerClass = 'flex ' + (isMe ? 'justify-end' : 'justify-start');
                  const bubbleClass = 'max-w-[85%] md:max-w-[70%] px-4 py-2.5 shadow-sm relative ' + (isMe ? 'bg-[#dcf8c6] text-[#212121] rounded-2xl rounded-tr-sm' : 'bg-white text-[#212121] rounded-2xl rounded-tl-sm border border-gray-100');
                  const textClass = 'text-[14.2px] leading-relaxed whitespace-pre-wrap text-[#212121]';
                  const timeClass = 'text-[10px] flex items-center gap-1 justify-end mt-1 ' + (isMe ? 'text-gray-500' : 'text-[#878787]');
                  
                  return (
                    <div key={msg.id || idx} className={containerClass}>
                      <div className={bubbleClass}>
                        <p className={textClass}>{msg.message}</p>
                        <p className={timeClass}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {isMe && <i className="fas fa-check-double text-blue-400 text-[10px]"></i>}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); sendMessage(newMessage); }} className="px-3 py-3 bg-[#f0f2f5] border-t border-gray-200 shrink-0 flex items-end gap-2 z-30">
            <button type="button" className="w-10 h-10 rounded-full text-gray-500 hover:bg-gray-200 flex items-center justify-center transition-colors shrink-0 mb-0.5">
              <i className="fas fa-paperclip text-lg"></i>
            </button>
            <div className="flex-grow relative bg-white border border-transparent rounded-2xl shadow-sm focus-within:border-blue-400 transition-all flex items-end min-h-[44px]">
              <textarea 
                value={newMessage}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                className="w-full bg-transparent outline-none resize-none px-4 py-3 text-[15px] text-[#212121] placeholder-gray-500 custom-scrollbar"
                style={{ maxHeight: '120px' }}
                disabled={sending}
              />
            </div>
            <button 
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="w-11 h-11 bg-[#2874f0] text-white rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md shrink-0 mb-0.5"
            >
              {sending ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-paper-plane -ml-0.5"></i>}
            </button>
          </form>
        </div>

        <div className="hidden lg:flex flex-col w-[300px] gap-4">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
             <p className="text-sm font-bold text-[#212121] mb-6 border-b border-gray-100 pb-3">User Identity</p>
             <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-bold text-[#2874f0] text-xl border border-blue-200">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <div className="min-w-0">
                   <p className="font-bold text-[#212121] text-base truncate">{user?.name}</p>
                   <p className="text-xs text-[#878787] mt-1 font-medium uppercase tracking-wider">Verified User</p>
                </div>
             </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 flex-grow">
             <p className="text-sm font-bold text-[#212121] mb-6 border-b border-gray-100 pb-3">Help Resources</p>
             <div className="space-y-3">
                {HELP_LINKS.map((link, idx) => (
                  <Link 
                    key={idx} 
                    to={link.to} 
                    className="flex items-center justify-between p-3 bg-white hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-lg transition-all group"
                  >
                    <span className="text-sm font-medium text-[#212121] group-hover:text-[#2874f0]">{link.label}</span>
                    <i className="fas fa-chevron-right text-xs text-gray-400 group-hover:text-[#2874f0]"></i>
                  </Link>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
