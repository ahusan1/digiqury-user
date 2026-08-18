
import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../../App.tsx';
import { supabase } from '../../lib/supabase.ts';
import { toast } from 'react-hot-toast';

const SUPPORT_CATEGORIES = [
  { icon: 'fa-box', label: 'Order Status', value: 'order_status', description: 'Track your purchase or delivery' },
  { icon: 'fa-credit-card', label: 'Payment Issue', value: 'payment_issue', description: 'Transaction or refund problems' },
  { icon: 'fa-cloud-arrow-down', label: 'Download Help', value: 'download_help', description: 'Cannot download purchased assets' },
  { icon: 'fa-shield-halved', label: 'License Query', value: 'license_query', description: 'Questions about usage rights' },
  { icon: 'fa-user-circle', label: 'Account Issue', value: 'account_issue', description: 'Profile or login problems' },
  { icon: 'fa-exclamation-triangle', label: 'Other', value: 'other', description: 'General support request' }
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
  
  // State for ticket creation
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [ticketSubject, setTicketSubject] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [creating, setCreating] = useState(false);
  
  // State for active ticket
  const [userTickets, setUserTickets] = useState<any[]>([]);
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  const hasOpenTicket = useMemo(() => userTickets.some(t => t.status === 'open'), [userTickets]);

  const loadTicketMessages = async (ticketId: string) => {
    const { data: msgData, error: msgError } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (msgError) throw msgError;
    setMessages(msgData || []);
  };

  const refreshTickets = async (preferredTicketId?: string) => {
    if (!user?.id) return;

    const { data: ticketsData, error: ticketsError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (ticketsError) throw ticketsError;

    const allTickets = ticketsData || [];
    setUserTickets(allTickets);

    if (allTickets.length === 0) {
      setActiveTicket(null);
      setMessages([]);
      setShowCreateTicket(true);
      return;
    }

    const nextActive = preferredTicketId
      ? allTickets.find(t => t.id === preferredTicketId)
      : allTickets.find(t => t.status === 'open') || allTickets[0];

    if (nextActive) {
      setActiveTicket(nextActive);
      setShowCreateTicket(false);
      await loadTicketMessages(nextActive.id);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const loadInitialData = async () => {
      setLoading(true);
      try {
        await refreshTickets();
      } catch (err: any) {
        console.error('Failed to load ticket:', err);
        toast.error('Failed to connect to support');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [user, navigate]);

  useEffect(() => {
    if (!activeTicket) return;

    const channel = supabase
      .channel(`support_ticket_${activeTicket.id}`, {
        config: { broadcast: { self: true } }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `ticket_id=eq.${activeTicket.id}`
      }, (payload) => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        setOtherTyping(false);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_tickets',
        filter: `id=eq.${activeTicket.id}`
      }, (payload) => {
        setActiveTicket(payload.new);
        setUserTickets(prev => prev.map(t => (t.id === payload.new.id ? payload.new : t)));
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.is_admin) {
          setOtherTyping(payload.payload.typing);
        }
      })
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTicket?.id]);

  const openTicketConversation = async (ticket: any) => {
    if (!ticket?.id || activeTicket?.id === ticket.id) return;
    setLoading(true);
    try {
      setActiveTicket(ticket);
      setShowCreateTicket(false);
      await loadTicketMessages(ticket.id);
    } catch (err) {
      console.error('Failed to load ticket conversation:', err);
      toast.error('Failed to load conversation');
    } finally {
      setLoading(false);
    }
  };

  const deleteTicket = async (ticket: any) => {
    if (!ticket?.id || deletingTicketId) return;
    if (ticket.status === 'open') {
      toast.error('Please close this ticket before deleting it.');
      return;
    }

    const confirmed = window.confirm('Delete this ticket and all its messages permanently?');
    if (!confirmed) return;

    setDeletingTicketId(ticket.id);
    try {
      const { error } = await supabase
        .from('support_tickets')
        .delete()
        .eq('id', ticket.id)
        .eq('user_id', user?.id);

      if (error) throw error;

      toast.success('Ticket deleted');
      await refreshTickets(activeTicket?.id === ticket.id ? undefined : activeTicket?.id);
    } catch (err: any) {
      console.error('Delete ticket failed:', err);
      toast.error(err?.message || 'Failed to delete ticket');
    } finally {
      setDeletingTicketId(null);
    }
  };

  // Polling effect to catch messages that might have missed real-time
  useEffect(() => {
    if (!activeTicket || loading) return;

    const pollMessages = async () => {
      try {
        const { data: latestMessages, error } = await supabase
          .from('support_messages')
          .select('*')
          .eq('ticket_id', activeTicket.id)
          .order('created_at', { ascending: true });

        if (error) throw error;

        // Update only if there are new messages
        setMessages(prev => {
          const newIds = new Set(latestMessages?.map(m => m.id) || []);
          const oldIds = new Set(prev.map(m => m.id));
          
          // If we have new messages, update
          if (latestMessages && latestMessages.length > prev.length) {
            return latestMessages;
          }
          return prev;
        });
      } catch (err) {
        console.error('Polling failed:', err);
      }
    };

    // Poll every 2 seconds for new messages
    const pollInterval = setInterval(pollMessages, 2000);

    return () => clearInterval(pollInterval);
  }, [activeTicket, loading]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, otherTyping]);

  const handleTyping = () => {
    if (!activeTicket || activeTicket.status === 'closed') return;
    
    if (!isTyping) {
      setIsTyping(true);
      supabase.channel(`support_ticket_${activeTicket.id}`).send({
        type: 'broadcast',
        event: 'typing',
        payload: { typing: true, is_admin: false },
      });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (activeTicket) {
        supabase.channel(`support_ticket_${activeTicket.id}`).send({
          type: 'broadcast',
          event: 'typing',
          payload: { typing: false, is_admin: false },
        });
      }
    }, 2000);
  };

  const createTicket = async () => {
    if (!selectedCategory || !ticketSubject.trim() || !initialMessage.trim() || creating) return;

    setCreating(true);
    try {
      console.log('Creating ticket with:', { userId: user?.id, subject: ticketSubject, category: selectedCategory });
      
      // Create ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('support_tickets')
        .insert({
          user_id: user?.id,
          subject: ticketSubject.trim(),
          category: selectedCategory,
          status: 'open'
        })
        .select()
        .single();

      if (ticketError) {
        console.error('Ticket insert error:', ticketError);

        if (ticketError.code === '23505' || String(ticketError.message || '').toLowerCase().includes('idx_one_open_ticket_per_user')) {
          toast.error('You already have an open ticket. Please close it first.');
          return;
        }

        toast.error(ticketError.message || 'An error occurred while creating the ticket. Please try again later.');
        return;
      }

      console.log('Ticket created:', ticket);

      // Send initial message
      const { error: messageError } = await supabase
        .from('support_messages')
        .insert({
          ticket_id: ticket.id,
          sender_id: user?.id,
          content: initialMessage.trim(),
          is_admin_reply: false
        });

      if (messageError) {
        console.error('Message insert error:', messageError);
        throw messageError;
      }

      toast.success(`Ticket ${ticket.ticket_number} created successfully!`);
      setSelectedCategory('');
      setTicketSubject('');
      setInitialMessage('');
      await refreshTickets(ticket.id);
    } catch (err: any) {
      console.error('Ticket creation failed:', err);
      console.error('Error details:', JSON.stringify(err, null, 2));
      if (!String(err?.message || '').includes('Ticket creation failed')) {
        toast.error('Failed to create ticket. Please try again.');
      }
    } finally {
      setCreating(false);
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || !activeTicket || activeTicket.status === 'closed' || sending) return;

    setSending(true);
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .insert({
          ticket_id: activeTicket.id,
          sender_id: user?.id,
          content: content.trim(),
          is_admin_reply: false
        })
        .select()
        .single();

      if (error) throw error;
      if (data) setMessages(prev => [...prev, data]);
      setNewMessage('');
      setIsTyping(false);
    } catch (err: any) {
      console.error('Message send failed:', err);
      toast.error('Message failed to send');
    } finally {
      setSending(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="w-16 h-16 border-4 border-purple-200 border-t-blue-600 rounded-full animate-spin mb-4 shadow-lg"></div>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 animate-pulse flex items-center gap-2">
        <i className="fas fa-comments text-blue-600"></i>
        Loading Support
      </p>
    </div>
  );

  // Ticket Creation UI
  if (showCreateTicket) {
    return (
      <div className="bg-gradient-to-br from-blue-50 via-white to-purple-50 flex-grow flex flex-col overflow-hidden">
        <div className="max-w-3xl w-full mx-auto flex-grow flex flex-col p-4 md:p-8 gap-6">
          
          {/* Header */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-blue-100/50 p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                  <i className="fas fa-ticket-alt"></i>
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tight">Create Support Ticket</h1>
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Get Expert Help</p>
                </div>
              </div>
              <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>

            {/* Notice */}
            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-2xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <i className="fas fa-info-circle text-yellow-600 mt-1"></i>
                <div>
                  <p className="text-sm font-bold text-yellow-900">One Ticket at a Time</p>
                  <p className="text-xs text-yellow-700 mt-1">You can only have one open ticket. Once resolved and closed by our team, you can create a new ticket.</p>
                </div>
              </div>
            </div>

            {/* Category Selection */}
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-black text-gray-700 uppercase tracking-wide mb-3 block">Select Issue Category *</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {SUPPORT_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setSelectedCategory(cat.value)}
                      className={`p-4 rounded-2xl border-2 transition-all text-left flex items-start gap-3 ${
                        selectedCategory === cat.value
                          ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-purple-50 shadow-lg'
                          : 'border-gray-200 bg-white hover:border-blue-300'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        selectedCategory === cat.value
                          ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'
                          : 'bg-gray-100 text-gray-400'
                      }`}>
                        <i className={`fas ${cat.icon}`}></i>
                      </div>
                      <div className="min-w-0 flex-grow">
                        <p className={`font-black text-sm ${selectedCategory === cat.value ? 'text-blue-600' : 'text-gray-700'}`}>{cat.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{cat.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </label>

              {/* Subject */}
              <label className="block">
                <span className="text-sm font-black text-gray-700 uppercase tracking-wide mb-2 block">Ticket Subject *</span>
                <input
                  type="text"
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  maxLength={100}
                  className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none font-medium text-sm transition-all"
                />
                <span className="text-xs text-gray-400 mt-1 block">{ticketSubject.length}/100</span>
              </label>

              {/* Initial Message */}
              <label className="block">
                <span className="text-sm font-black text-gray-700 uppercase tracking-wide mb-2 block">Describe Your Issue *</span>
                <textarea
                  value={initialMessage}
                  onChange={(e) => setInitialMessage(e.target.value)}
                  placeholder="Please provide detailed information about your issue..."
                  rows={6}
                  maxLength={500}
                  className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none font-medium text-sm transition-all resize-none"
                />
                <span className="text-xs text-gray-400 mt-1 block">{initialMessage.length}/500</span>
              </label>

              {/* Submit Button */}
              <button
                onClick={createTicket}
                disabled={!selectedCategory || !ticketSubject.trim() || !initialMessage.trim() || creating}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-black uppercase tracking-wide shadow-xl shadow-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <i className="fas fa-circle-notch fa-spin"></i>
                    Creating Ticket...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane"></i>
                    Create Ticket
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Help Links */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl border border-blue-100/50 p-6">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Quick Help</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {HELP_LINKS.map((link, idx) => (
                <Link
                  key={idx}
                  to={link.to}
                  className="p-3 bg-gradient-to-r from-gray-50 to-blue-50/30 hover:from-blue-100 hover:to-purple-100 rounded-xl transition-all group border border-gray-100 hover:border-blue-300 text-center"
                >
                  <span className="text-xs font-black text-gray-600 uppercase tracking-tight group-hover:text-blue-600">{link.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Chat Interface for Active Ticket
  return (
    <div className="bg-gradient-to-br from-blue-50 via-white to-purple-50 flex-grow flex flex-col overflow-hidden">
      <div className="max-w-[1600px] w-full mx-auto flex-grow flex flex-col md:flex-row md:p-6 gap-6 overflow-hidden">
        
        {/* Main Chat Window */}
        <div className="flex-grow flex flex-col bg-white/80 backdrop-blur-xl md:rounded-[2.5rem] shadow-2xl border border-blue-100/50 overflow-hidden relative h-full">
          
          {/* Header with Ticket Info */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 border-b border-blue-400/20 p-4 md:p-6 sticky top-0 z-30 shrink-0 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-white text-lg shadow-xl border border-white/30">
                    <i className="fas fa-ticket-alt"></i>
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-white rounded-full ${
                    activeTicket?.status === 'open' ? 'bg-green-400 animate-pulse' : 'bg-gray-400'
                  }`}></div>
                </div>
                <div>
                  <h1 className="text-sm md:text-base font-black text-white leading-none tracking-tight flex items-center gap-2">
                    Ticket #{activeTicket?.ticket_number}
                  </h1>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
                      activeTicket?.status === 'open' 
                        ? 'bg-green-400 text-green-900' 
                        : 'bg-gray-400 text-gray-900'
                    }`}>
                      {activeTicket?.status}
                    </span>
                    <span className="text-[8px] font-bold text-white/90 uppercase tracking-widest">
                      {activeTicket?.subject}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => navigate('/')}
                  className="text-[10px] font-black uppercase text-white/80 hover:text-white tracking-widest bg-white/10 px-3 py-1.5 rounded-lg backdrop-blur-sm border border-white/20"
                >
                  Exit
                </button>
              </div>
            </div>
            
            {/* Closed Ticket Notice */}
            {activeTicket?.status === 'closed' && (
              <div className="mt-4 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl p-3">
                <div className="flex items-center justify-between gap-3 text-white">
                  <div className="flex items-center gap-2 flex-grow">
                    <i className="fas fa-check-circle"></i>
                    <div>
                      <p className="text-xs font-bold">This ticket has been closed</p>
                      <p className="text-[10px] opacity-80 mt-0.5">
                        Closed on {new Date(activeTicket.closed_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => deleteTicket(activeTicket)}
                    disabled={deletingTicketId === activeTicket?.id}
                    className="text-[9px] font-black uppercase bg-red-500/80 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
                  >
                    {deletingTicketId === activeTicket?.id ? (
                      <>
                        <i className="fas fa-circle-notch fa-spin mr-1"></i>
                        Deleting...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-trash mr-1"></i>
                        Delete Ticket
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Message List Area */}
          <div 
            ref={scrollRef}
            className="flex-grow overflow-y-auto p-4 md:p-8 space-y-1.5 bg-gradient-to-b from-blue-50/30 to-purple-50/30 custom-scrollbar scroll-smooth relative"
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[80%] text-center max-w-sm mx-auto animate-in fade-in zoom-in-95">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-2xl shadow-blue-500/30">
                  <i className="fas fa-headset"></i>
                </div>
                <h3 className="text-2xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tight">Ticket Created!</h3>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-2 mb-8">Our support team will respond soon</p>
                
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-4 w-full text-left">
                  <p className="text-xs font-black text-gray-600 uppercase tracking-wide mb-2">Your Issue:</p>
                  <p className="text-sm text-gray-700 font-medium">{activeTicket?.subject}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {messages.map((msg, idx) => {
                  const isMe = !msg.is_admin_reply;
                  const prevMsg = messages[idx - 1];
                  const isFirstInGroup = !prevMsg || prevMsg.is_admin_reply !== msg.is_admin_reply;

                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${isFirstInGroup ? 'mt-4' : 'mt-0.5'}`}>
                      {!isMe && isFirstInGroup && (
                        <p className="text-[8px] font-black uppercase tracking-widest text-purple-600 mb-1 ml-1 flex items-center gap-1">
                          <i className="fas fa-user-headset text-[7px]"></i>
                          Support Team
                        </p>
                      )}
                      <div className={`max-w-[85%] md:max-w-[70%] px-4 py-3 shadow-lg ${
                        isMe 
                          ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white' 
                          : 'bg-white text-gray-800 border border-gray-200'
                      } ${
                        isMe 
                          ? 'rounded-l-2xl rounded-t-2xl'
                          : 'rounded-r-2xl rounded-t-2xl'
                      }`}>
                        <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        <div className={`flex items-center gap-1.5 mt-1.5 opacity-30 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <p className="text-[7px] font-black uppercase tracking-widest">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {otherTyping && activeTicket?.status === 'open' && (
              <div className="flex items-start gap-3 mt-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-2xl px-4 py-3 shadow-lg text-[9px] text-purple-700 font-bold uppercase tracking-wide flex items-center gap-3">
                  <i className="fas fa-user-headset text-purple-600"></i>
                  Support typing
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Message Input (only for open tickets) */}
          {activeTicket?.status === 'open' ? (
            <div className="p-3 md:p-6 bg-gradient-to-r from-blue-50 to-purple-50 border-t border-blue-100 shrink-0">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(newMessage); }} className="flex items-center gap-2 md:gap-4">
                <div className="flex-grow relative">
                  <input 
                    type="text" 
                    value={newMessage}
                    onKeyDown={handleTyping}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="w-full pl-5 pr-10 py-4 bg-white border-2 border-gray-200 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none font-medium transition-all text-sm shadow-sm"
                  />
                  <i className="fas fa-pencil absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 text-xs"></i>
                </div>
                <button 
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/30 active:scale-95 disabled:opacity-30 disabled:shadow-none transition-all shrink-0 hover:shadow-2xl hover:shadow-blue-500/40"
                >
                  {sending ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                </button>
              </form>
            </div>
          ) : (
            <div className="p-6 bg-gray-100 border-t border-gray-200 text-center">
              <p className="text-sm font-bold text-gray-600">This ticket is closed. You cannot send new messages.</p>
              <button 
                onClick={() => setShowCreateTicket(true)}
                disabled={hasOpenTicket}
                className="mt-3 px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition-all"
              >
                Create New Ticket
              </button>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="hidden lg:flex flex-col w-[300px] gap-4">

          {/* Ticket History */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-4 shadow-xl border border-blue-100/50 max-h-[320px] overflow-y-auto custom-scrollbar">
             <div className="flex items-center justify-between mb-3">
               <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Your Tickets</p>
               {!hasOpenTicket && (
                 <button
                   onClick={() => setShowCreateTicket(true)}
                   className="text-[9px] font-black uppercase text-blue-600 hover:text-purple-600"
                 >
                   New
                 </button>
               )}
             </div>
             <div className="space-y-2">
               {userTickets.map((ticket) => (
                 <div
                   key={ticket.id}
                   className={`p-3 rounded-xl border transition-all ${
                     activeTicket?.id === ticket.id
                       ? 'border-blue-400 bg-gradient-to-r from-blue-50 to-purple-50'
                       : 'border-gray-200 bg-white hover:border-blue-300'
                   }`}
                 >
                   <button
                     onClick={() => openTicketConversation(ticket)}
                     className="w-full text-left"
                   >
                     <div className="flex items-center justify-between gap-2">
                       <p className="text-[10px] font-black text-gray-700 truncate">#{ticket.ticket_number}</p>
                       <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${ticket.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                         {ticket.status}
                       </span>
                     </div>
                     <p className="text-[10px] text-gray-500 truncate mt-1">{ticket.subject}</p>
                     <p className="text-[8px] text-gray-400 mt-1">{new Date(ticket.created_at).toLocaleDateString()}</p>
                   </button>

                   {ticket.status !== 'open' && (
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         deleteTicket(ticket);
                       }}
                       disabled={deletingTicketId === ticket.id}
                       className="mt-2 text-[9px] font-black uppercase text-red-500 hover:text-red-700 disabled:opacity-50"
                     >
                       {deletingTicketId === ticket.id ? 'Deleting...' : 'Delete'}
                     </button>
                   )}
                 </div>
               ))}
             </div>
          </div>
          
          {/* Ticket Details */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-xl border border-blue-100/50">
             <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4">Ticket Details</p>
             <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100">
                   <span className="text-[9px] font-bold text-gray-500 uppercase">Status</span>
                   <span className={`text-[9px] font-black uppercase flex items-center gap-1 ${
                     activeTicket?.status === 'open' ? 'text-green-600' : 'text-gray-600'
                   }`}>
                     <i className={`fas fa-circle text-[6px] ${activeTicket?.status === 'open' ? 'text-green-500' : 'text-gray-400'}`}></i>
                     {activeTicket?.status}
                   </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100">
                   <span className="text-[9px] font-bold text-gray-500 uppercase">Category</span>
                   <span className="text-[9px] font-black text-blue-600 uppercase">
                     {SUPPORT_CATEGORIES.find(c => c.value === activeTicket?.category)?.label || activeTicket?.category}
                   </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100">
                   <span className="text-[9px] font-bold text-gray-500 uppercase">Created</span>
                   <span className="text-[9px] font-black text-gray-600">
                     {new Date(activeTicket?.created_at).toLocaleDateString()}
                   </span>
                </div>
             </div>
          </div>

          {/* User Identity */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-xl border border-blue-100/50">
             <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-6">Your Identity</p>
             <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-black text-white text-lg shadow-lg">
                  {user.name.charAt(0)}
                </div>
                <div className="min-w-0">
                   <p className="font-black text-gray-900 text-sm truncate">{user.name}</p>
                   <p className="text-[8px] font-black text-green-600 uppercase tracking-widest mt-1 flex items-center gap-1">
                     <i className="fas fa-shield-check text-[8px]"></i>
                     Verified
                   </p>
                </div>
             </div>
          </div>

          {/* Help Resources */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-xl border border-blue-100/50 flex-grow">
             <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-6">Help Resources</p>
             <div className="space-y-2">
                {HELP_LINKS.map((link, idx) => (
                  <Link 
                    key={idx} 
                    to={link.to} 
                    className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-blue-50/30 hover:from-blue-100 hover:to-purple-100 rounded-xl transition-all group border border-gray-100 hover:border-blue-300 hover:shadow-md"
                  >
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-tight group-hover:text-blue-600">{link.label}</span>
                    <i className="fas fa-arrow-right text-[8px] text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all"></i>
                  </Link>
                ))}
             </div>
          </div>

          {/* Security Badge */}
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl p-5 text-white text-center shadow-xl shadow-green-500/30">
             <i className="fas fa-shield-check text-2xl mb-2 opacity-90"></i>
             <p className="text-[10px] font-black uppercase tracking-widest mb-1">Privacy Guaranteed</p>
             <p className="text-[11px] font-medium opacity-90 leading-relaxed">End-to-End Encrypted</p>
          </div>

        </div>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(229, 231, 235, 0.3); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: linear-gradient(to bottom, #3b82f6, #8b5cf6); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: linear-gradient(to bottom, #2563eb, #7c3aed); }
      `}</style>
    </div>
  );
};
