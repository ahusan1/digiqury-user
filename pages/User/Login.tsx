
import React, { useState, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { AuthContext } from '../../App.tsx';
import { supabase } from '../../lib/supabase.ts';
import { signInWithNativeGoogle } from '../../lib/nativeGoogleAuth.ts';

const getErrorMessage = (err: unknown): string => {
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Unable to start Google login right now.';
};

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const { setUser, fetchProfileWithRetry } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (() => {
    const from = (location.state as { from?: string } | null)?.from;
    if (!from || typeof from !== 'string') return '/';
    if (!from.startsWith('/')) return '/';
    if (from.startsWith('/login') || from.startsWith('/signup')) return '/';
    return from;
  })();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        if (error.message.includes('Email not confirmed')) {
          toast.error('Please confirm your email address first.');
        } else {
          toast.error(error.message);
        }
        setLoading(false);
        return;
      }

      if (data.user) {
        const profile = await fetchProfileWithRetry(data.user.id);
        
        if (profile) {
          // Sync phone from auth metadata if missing
          if (!profile.phone && data.user.user_metadata?.phone) {
            await supabase
              .from('users')
              .update({ phone: data.user.user_metadata.phone })
              .eq('id', data.user.id);
            profile.phone = data.user.user_metadata.phone;
          }
          
          setUser(profile);
          toast.success(`Welcome back, ${profile.name}!`);
          navigate(redirectTo, { replace: true });
        } else {
          toast.error('Profile not found. Please try again.');
          setLoading(false);
        }
      }
    } catch (err) {
      toast.error('An unexpected error occurred.');
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      toast.error('Please enter your email first.');
      return;
    }

    setSendingReset(true);

    try {
      const redirectTo = `${window.location.origin}/login`;
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });

      if (error) {
        toast.error(error.message || 'Failed to send reset link.');
        return;
      }

      toast.success('Password reset link sent. Check your email inbox.');
    } catch (err) {
      toast.error('Unable to send reset link right now.');
    } finally {
      setSendingReset(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);

    try {
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        try {
          const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

          if (!clientId) {
            toast.error('Google Client ID missing. Please contact support.');
            return;
          }

          const { idToken } = await signInWithNativeGoogle(clientId);
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: idToken,
          });

          if (error) {
            toast.error(error.message || 'Google login failed.');
            return;
          }

          if (data.user) {
            const profile = await fetchProfileWithRetry(data.user.id);

            if (profile) {
              if (!profile.phone && data.user.user_metadata?.phone) {
                await supabase
                  .from('users')
                  .update({ phone: data.user.user_metadata.phone })
                  .eq('id', data.user.id);
                profile.phone = data.user.user_metadata.phone;
              }

              setUser(profile);
              toast.success(`Welcome back, ${profile.name}!`);
              navigate(redirectTo, { replace: true });
              return;
            }

            toast.error('Profile not found. Please try again.');
            return;
          }
        } catch (nativeErr) {
          toast.error(`Native Google failed: ${getErrorMessage(nativeErr)}. Trying browser login...`);
        }
      }

      const oauthRedirectTo = isNative
        ? 'com.vexora.app://auth/callback'
        : `${window.location.origin}/login`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: oauthRedirectTo,
          skipBrowserRedirect: isNative,
          queryParams: { prompt: 'select_account consent', access_type: 'offline' }
        }
      });

      if (error) {
        toast.error(error.message || 'Google login failed.');
        return;
      }

      if (isNative && data?.url) {
        await Browser.open({ url: data.url });
      } else if (!isNative && data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 relative overflow-hidden bg-[#f8fafc]">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100/50 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-100/50 rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="w-full max-w-[440px] relative z-10">
        <div className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] p-8 md:p-12 border border-white shadow-[0_32px_64px_-12px_rgba(0,0,0,0.08)]">
          <div className="mb-10 text-center">
            <Link to="/" className="inline-block mb-8 group">
               <div className="flex items-center justify-center gap-1 italic">
                  <span className="text-2xl font-black tracking-tighter text-gray-900">DIGi QuRY</span>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
               </div>
            </Link>
            
            <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Welcome Back</h1>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.2em]">Enter your credentials to access your assets</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative group">
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-6 py-4 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 bg-white transition-all outline-none text-gray-900 font-bold placeholder-gray-300"
                  placeholder="name@example.com"
                />
                <i className="fas fa-envelope absolute right-5 top-1/2 -translate-y-1/2 text-gray-200 group-focus-within:text-blue-500 transition-colors"></i>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Password</label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={sendingReset}
                  className="text-[10px] font-black text-blue-500 uppercase tracking-widest hover:text-blue-600 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  {sendingReset ? 'Sending...' : 'Forgot?'}
                </button>
              </div>
              <div className="relative group">
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-6 py-4 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 bg-white transition-all outline-none text-gray-900 font-bold placeholder-gray-300"
                  placeholder="••••••••"
                />
                <i className="fas fa-lock absolute right-5 top-1/2 -translate-y-1/2 text-gray-200 group-focus-within:text-blue-500 transition-colors"></i>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading || googleLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3 mt-4"
            >
              {loading ? <i className="fas fa-circle-notch fa-spin"></i> : (
                <>
                  <span className="uppercase tracking-widest text-xs">Sign In</span>
                  <i className="fas fa-arrow-right text-[10px]"></i>
                </>
              )}
            </button>

            <div className="relative py-1">
              <div className="border-t border-gray-100"></div>
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-[10px] text-gray-400 font-black uppercase tracking-widest">
                or continue with
              </span>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading}
              className="w-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-black py-4 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60"
            >
              {googleLoading ? (
                <i className="fas fa-circle-notch fa-spin"></i>
              ) : (
                <>
                  <i className="fab fa-google text-red-500"></i>
                  <span className="uppercase tracking-widest text-xs">Google</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-gray-50 text-center">
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-4">New to the marketplace?</p>
            <Link to="/signup" state={{ from: redirectTo }} className="inline-flex items-center gap-2 text-blue-600 font-black uppercase tracking-widest text-xs group">
              Create an account
              <i className="fas fa-chevron-right text-[8px] group-hover:translate-x-1 transition-transform"></i>
            </Link>
          </div>
        </div>
        
        <p className="text-center mt-8 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
          Secure 256-bit encrypted authentication
        </p>
      </div>
    </div>
  );
};


