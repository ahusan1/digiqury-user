
import React, { useState, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { AuthContext } from '../App.tsx';
import { supabase } from '../lib/supabase.ts';
import { notifyAdminActivity } from '../lib/activityNotifications.ts';

// Country codes with their phone number max lengths
const COUNTRY_CODES = [
  { code: '+91', country: 'India', flag: '🇮🇳', maxDigits: 10 },
  { code: '+1', country: 'USA/Canada', flag: '🇺🇸', maxDigits: 10 },
  { code: '+44', country: 'UK', flag: '🇬🇧', maxDigits: 11 },
  { code: '+61', country: 'Australia', flag: '🇦🇺', maxDigits: 10 },
  { code: '+81', country: 'Japan', flag: '🇯🇵', maxDigits: 11 },
  { code: '+86', country: 'China', flag: '🇨🇳', maxDigits: 13 },
  { code: '+49', country: 'Germany', flag: '🇩🇪', maxDigits: 13 },
  { code: '+33', country: 'France', flag: '🇫🇷', maxDigits: 10 },
  { code: '+39', country: 'Italy', flag: '🇮🇹', maxDigits: 11 },
  { code: '+7', country: 'Russia', flag: '🇷🇺', maxDigits: 10 },
  { code: '+971', country: 'UAE', flag: '🇦🇪', maxDigits: 9 },
  { code: '+966', country: 'Saudi Arabia', flag: '🇸🇦', maxDigits: 9 },
  { code: '+92', country: 'Pakistan', flag: '🇵🇰', maxDigits: 10 },
  { code: '+880', country: 'Bangladesh', flag: '🇧🇩', maxDigits: 10 },
  { code: '+94', country: 'Sri Lanka', flag: '🇱🇰', maxDigits: 9 },
  { code: '+977', country: 'Nepal', flag: '🇳🇵', maxDigits: 10 },
  { code: '+52', country: 'Mexico', flag: '🇲🇽', maxDigits: 10 },
  { code: '+55', country: 'Brazil', flag: '🇧🇷', maxDigits: 11 },
  { code: '+54', country: 'Argentina', flag: '🇦🇷', maxDigits: 11 },
  { code: '+34', country: 'Spain', flag: '🇪🇸', maxDigits: 9 },
  { code: '+351', country: 'Portugal', flag: '🇵🇹', maxDigits: 9 },
  { code: '+31', country: 'Netherlands', flag: '🇳🇱', maxDigits: 10 },
  { code: '+32', country: 'Belgium', flag: '🇧🇪', maxDigits: 9 },
  { code: '+41', country: 'Switzerland', flag: '🇨🇭', maxDigits: 10 },
  { code: '+46', country: 'Sweden', flag: '🇸🇪', maxDigits: 10 },
  { code: '+47', country: 'Norway', flag: '🇳🇴', maxDigits: 8 },
  { code: '+48', country: 'Poland', flag: '🇵🇱', maxDigits: 9 },
  { code: '+82', country: 'South Korea', flag: '🇰🇷', maxDigits: 11 },
  { code: '+65', country: 'Singapore', flag: '🇸🇬', maxDigits: 8 },
  { code: '+60', country: 'Malaysia', flag: '🇲🇾', maxDigits: 10 },
  { code: '+62', country: 'Indonesia', flag: '🇮🇩', maxDigits: 12 },
  { code: '+63', country: 'Philippines', flag: '🇵🇭', maxDigits: 10 },
  { code: '+66', country: 'Thailand', flag: '🇹🇭', maxDigits: 9 },
  { code: '+84', country: 'Vietnam', flag: '🇻🇳', maxDigits: 10 },
  { code: '+90', country: 'Turkey', flag: '🇹🇷', maxDigits: 10 },
  { code: '+20', country: 'Egypt', flag: '🇪🇬', maxDigits: 10 },
  { code: '+27', country: 'South Africa', flag: '🇿🇦', maxDigits: 9 },
  { code: '+234', country: 'Nigeria', flag: '🇳🇬', maxDigits: 10 },
  { code: '+254', country: 'Kenya', flag: '🇰🇪', maxDigits: 10 },
  { code: '+98', country: 'Iran', flag: '🇮🇷', maxDigits: 10 },
  { code: '+964', country: 'Iraq', flag: '🇮🇶', maxDigits: 10 },
  { code: '+962', country: 'Jordan', flag: '🇯🇴', maxDigits: 9 },
  { code: '+961', country: 'Lebanon', flag: '🇱🇧', maxDigits: 8 },
  { code: '+974', country: 'Qatar', flag: '🇶🇦', maxDigits: 8 },
  { code: '+973', country: 'Bahrain', flag: '🇧🇭', maxDigits: 8 },
  { code: '+968', country: 'Oman', flag: '🇴🇲', maxDigits: 8 },
  { code: '+965', country: 'Kuwait', flag: '🇰🇼', maxDigits: 8 },
  { code: '+93', country: 'Afghanistan', flag: '🇦🇫', maxDigits: 9 },
  { code: '+64', country: 'New Zealand', flag: '🇳🇿', maxDigits: 10 },
  { code: '+353', country: 'Ireland', flag: '🇮🇪', maxDigits: 10 },
];

const PASSWORD_MIN_LENGTH = 8;

const getPasswordChecks = (password: string) => ({
  minLength: password.length >= PASSWORD_MIN_LENGTH,
  upper: /[A-Z]/.test(password),
  lower: /[a-z]/.test(password),
  digit: /\d/.test(password),
  special: /[^A-Za-z0-9]/.test(password),
});

export const Signup: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [countryCode, setCountryCode] = useState(COUNTRY_CODES[0]); // Default: India
  const [loading, setLoading] = useState(false);
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

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits
    const val = e.target.value.replace(/[^\d]/g, '');
    // Limit based on selected country's max digits
    if (val.length <= countryCode.maxDigits) {
      setFormData({ ...formData, phone: val });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const checks = getPasswordChecks(formData.password);
    const isStrongPassword = Object.values(checks).every(Boolean);

    if (!isStrongPassword) {
      toast.error('Use a stronger password (8+ chars with upper, lower, number, special character)');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (formData.phone.length < countryCode.maxDigits) {
      toast.error(`Please enter a valid ${countryCode.maxDigits}-digit phone number for ${countryCode.country}`);
      return;
    }

    setLoading(true);
    
    const fullPhoneNumber = `${countryCode.code}${formData.phone}`;
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            phone: fullPhoneNumber
          }
        }
      });

      if (error) {
        toast.error(error.message);
        setLoading(false);
      } else if (data.user) {
        // Update users table with phone number
        await supabase
          .from('users')
          .update({ phone: fullPhoneNumber })
          .eq('id', data.user.id);

        if (data.session) {
          const profile = await fetchProfileWithRetry(data.user.id);
          if (profile) {
            setUser(profile);
            toast.success('Account created and logged in!');
            void notifyAdminActivity({
              title: 'User Signup',
              message: `${formData.name} created account and logged in.`,
            });
            navigate(redirectTo, { replace: true });
          } else {
             toast.success('Account created! Logging you in...');
             void notifyAdminActivity({
               title: 'User Signup',
               message: `${formData.name} created account (pending profile sync).`,
             });
             setTimeout(() => navigate(redirectTo, { replace: true }), 1000);
          }
        } else {
           toast.success('Check your email to confirm your account!');
            navigate('/login', { state: { from: redirectTo }, replace: true });
        }
      }
    } catch (err) {
      toast.error('Registration failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 relative overflow-hidden bg-[#f8fafc]">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100/50 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-100/50 rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="w-full max-w-[560px] relative z-10">
        <div className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] p-8 md:p-12 border border-white shadow-[0_32px_64px_-12px_rgba(0,0,0,0.08)]">
          <div className="mb-10 text-center">
            <Link to="/" className="inline-block mb-8 group">
               <div className="flex items-center justify-center gap-1 italic">
                  <span className="text-2xl font-black tracking-tighter text-gray-900">DIGi QuRY</span>
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
               </div>
            </Link>
            <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Create Account</h1>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.2em]">Join the premium digital asset community</p>
          </div>
          
          <form onSubmit={handleSignup} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-gray-400 mb-1 uppercase tracking-widest ml-1">Full Name</label>
                <div className="relative group">
                  <input 
                    type="text" 
                    required
                    className="w-full px-5 py-4 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 bg-white transition-all outline-none text-gray-900 font-bold placeholder-gray-300 text-sm"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                  <i className="fas fa-user absolute right-4 top-1/2 -translate-y-1/2 text-gray-200 group-focus-within:text-blue-500 transition-colors text-xs"></i>
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="block text-[10px] font-black text-gray-400 mb-1 uppercase tracking-widest ml-1">Phone Number</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative group w-full sm:w-[170px] shrink-0">
                    <select
                      value={countryCode.code}
                      onChange={(e) => {
                        const selected = COUNTRY_CODES.find(c => c.code === e.target.value);
                        if (selected) {
                          setCountryCode(selected);
                          // Clear phone number if it exceeds new country's max digits
                          if (formData.phone.length > selected.maxDigits) {
                            setFormData({ ...formData, phone: formData.phone.slice(0, selected.maxDigits) });
                          }
                        }
                      }}
                      className="w-full px-3 py-4 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 bg-white transition-all outline-none text-gray-900 font-bold text-sm appearance-none cursor-pointer"
                    >
                      {COUNTRY_CODES.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.flag} {country.code}
                        </option>
                      ))}
                    </select>
                    <i className="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                  </div>
                  <div className="relative group min-w-0 flex-1">
                    <input 
                      type="tel" 
                      required
                      className="w-full px-5 py-4 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 bg-white transition-all outline-none text-gray-900 font-bold placeholder-gray-300 text-sm"
                      placeholder={`${'0'.repeat(countryCode.maxDigits)}`}
                      value={formData.phone}
                      onChange={handlePhoneChange}
                      maxLength={countryCode.maxDigits}
                    />
                    <i className="fas fa-phone absolute right-4 top-1/2 -translate-y-1/2 text-gray-200 group-focus-within:text-blue-500 transition-colors text-xs"></i>
                    <div className="absolute -bottom-5 left-1 text-[9px] text-gray-400 font-bold">
                      {formData.phone.length}/{countryCode.maxDigits} digits
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-gray-400 mb-1 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative group">
                <input 
                  type="email" 
                  required
                  className="w-full px-5 py-4 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 bg-white transition-all outline-none text-gray-900 font-bold placeholder-gray-300 text-sm"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
                <i className="fas fa-envelope absolute right-4 top-1/2 -translate-y-1/2 text-gray-200 group-focus-within:text-blue-500 transition-colors text-xs"></i>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-gray-400 mb-1 uppercase tracking-widest ml-1">Password</label>
                <div className="relative group">
                  <input 
                    type="password" 
                    required
                    minLength={PASSWORD_MIN_LENGTH}
                    className="w-full px-5 py-4 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 bg-white transition-all outline-none text-gray-900 font-bold placeholder-gray-300 text-sm"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                  />
                  <i className="fas fa-lock absolute right-4 top-1/2 -translate-y-1/2 text-gray-200 group-focus-within:text-blue-500 transition-colors text-xs"></i>
                </div>
                <p className="text-[10px] text-gray-500 font-semibold ml-1">
                  Must include 8+ chars, uppercase, lowercase, number, and special character.
                </p>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-gray-400 mb-1 uppercase tracking-widest ml-1">Confirm</label>
                <div className="relative group">
                  <input 
                    type="password" 
                    required
                    minLength={PASSWORD_MIN_LENGTH}
                    className="w-full px-5 py-4 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 bg-white transition-all outline-none text-gray-900 font-bold placeholder-gray-300 text-sm"
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                  />
                  <i className="fas fa-shield-check absolute right-4 top-1/2 -translate-y-1/2 text-gray-200 group-focus-within:text-blue-500 transition-colors text-xs"></i>
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-500/20 mt-4 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
            >
              {loading ? <i className="fas fa-circle-notch fa-spin"></i> : <span className="uppercase tracking-widest text-xs">Create Account</span>}
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-gray-50 text-center">
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-4">Already a member?</p>
            <Link to="/login" state={{ from: redirectTo }} className="inline-flex items-center gap-2 text-blue-600 font-black uppercase tracking-widest text-xs group">
              Login to your vault
              <i className="fas fa-chevron-right text-[8px] group-hover:translate-x-1 transition-transform"></i>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

