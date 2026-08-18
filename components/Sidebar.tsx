import React, { useContext, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { AuthContext } from '../App.tsx';
import { supabase } from '../lib/supabase';
import { getCurrentPath } from '../lib/loginRedirect.ts';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, confirmLogout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [supportUnread, setSupportUnread] = useState(0);

  const loadSupportUnread = async () => {
    if (!user) {
      setSupportUnread(0);
      return;
    }

    const { data: conv } = await supabase
      .from('support_conversations')
      .select('messages, admin_last_seen_at')
      .eq('user_id', user.id)
      .neq('status', 'closed')
      .limit(1)
      .maybeSingle();

    if (!conv || !conv.messages) {
      setSupportUnread(0);
      return;
    }

    const lastSeenKey = `support_user_seen_${user.id}_${conv.id}`;
    const localSeenRaw = localStorage.getItem(lastSeenKey);
    const lastSeenTime = localSeenRaw ? new Date(localSeenRaw).getTime() : 0;
    
    let count = 0;
    for (const msg of conv.messages) {
      if (msg.sender === 'admin' && new Date(msg.timestamp).getTime() > lastSeenTime) {
        count++;
      }
    }

    setSupportUnread(count);
  };

  useEffect(() => {
    if (!user) return;

    loadSupportUnread();
    const interval = setInterval(loadSupportUnread, 15000);
    const refresh = () => loadSupportUnread();

    const messageChannel = supabase
      .channel(`sidebar_support_unread_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_conversations',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          loadSupportUnread();
        }
      )
      .subscribe();

    window.addEventListener('support-unread-updated', refresh);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(messageChannel);
      window.removeEventListener('support-unread-updated', refresh);
    };
  }, [user?.id, user?.role]);

  // Avoid keeping an invisible full-screen overlay in the DOM when closed.
  // Some browser/runtime combinations can fail to apply pointer-events-none reliably.
  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] transition-opacity duration-300 opacity-100"
        onClick={onClose}
      />

      <div className="fixed top-0 left-0 h-full w-[280px] bg-white z-[120] transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl translate-x-0">
        
        <div className="bg-[#2874f0] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-lg">
              <i className="fas fa-user"></i>
            </div>
            {user ? (
              <div>
                <p className="font-bold text-sm">{user.name}</p>
                <p className="text-[10px] text-blue-200 uppercase tracking-widest font-black">{user.role}</p>
              </div>
            ) : (
              <Link to="/login" state={{ from: getCurrentPath(location) }} onClick={onClose} className="font-bold text-sm hover:underline">Log In / Sign Up</Link>
            )}
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex-grow overflow-y-auto py-2">
          
          <Link to="/" onClick={onClose} className="flex items-center gap-4 px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-[#2874f0] transition-colors">
            <i className="fas fa-home w-5 text-center text-gray-400"></i>
            <span className="font-medium text-sm">Home</span>
          </Link>
          
          <div className="h-px bg-gray-100 my-2 mx-4"></div>
          
          <p className="px-6 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">My Account</p>
          
          <Link to="/dashboard" onClick={onClose} className="flex items-center gap-4 px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-[#2874f0] transition-colors">
            <i className="fas fa-box-open w-5 text-center text-gray-400"></i>
            <span className="font-medium text-sm">My Purchases</span>
          </Link>
          
          <Link to="/wishlist" onClick={onClose} className="flex items-center gap-4 px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-[#2874f0] transition-colors">
            <i className="fas fa-heart w-5 text-center text-gray-400"></i>
            <span className="font-medium text-sm">Wishlist</span>
          </Link>
          
          <Link to="/profile" onClick={onClose} className="flex items-center gap-4 px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-[#2874f0] transition-colors">
            <i className="fas fa-user-circle w-5 text-center text-gray-400"></i>
            <span className="font-medium text-sm">Profile Settings</span>
          </Link>

          {user && Capacitor.isNativePlatform() && (
            <Link to="/downloads" onClick={onClose} className="flex items-center gap-4 px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-[#2874f0] transition-colors">
              <i className="fas fa-folder-open w-5 text-center text-gray-400"></i>
              <span className="font-medium text-sm">Downloaded Assets</span>
            </Link>
          )}

          <div className="h-px bg-gray-100 my-2 mx-4"></div>
          
          <p className="px-6 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Help & Support</p>
          
          <Link to="/support" onClick={onClose} className="flex items-center gap-4 px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-[#2874f0] transition-colors">
            <div className="relative w-5 text-center">
              <i className="fas fa-headset text-gray-400"></i>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Live Support</span>
              {supportUnread > 0 && (
                <span className="bg-red-500 text-white text-[9px] font-black min-w-5 h-5 px-1.5 rounded-full inline-flex items-center justify-center leading-none">
                  {supportUnread > 99 ? '99+' : supportUnread}
                </span>
              )}
            </div>
          </Link>

          <Link to="/terms" onClick={onClose} className="flex items-center gap-4 px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-[#2874f0] transition-colors">
            <i className="fas fa-file-contract w-5 text-center text-gray-400"></i>
            <span className="font-medium text-sm">Terms & Policies</span>
          </Link>

          <a href="https://seller.digiqury.in" onClick={onClose} className="flex items-center gap-4 px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-[#2874f0] transition-colors">
            <i className="fas fa-store w-5 text-center text-gray-400"></i>
            <span className="font-medium text-sm">Become a Seller</span>
          </a>

          {user && (
            <>
              <div className="h-px bg-gray-100 my-2 mx-4"></div>
              <button
                onClick={() => { onClose(); confirmLogout(); }}
                className="w-full flex items-center gap-4 px-6 py-3 text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <i className="fas fa-sign-out-alt w-5 text-center text-gray-400"></i>
                <span className="font-medium text-sm">Logout</span>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
};
