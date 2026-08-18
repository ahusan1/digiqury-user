import React, { useState, useContext } from 'react';
import { AuthContext } from '../App.tsx';
import { supabase } from '../lib/supabase.ts';
import { toast } from 'react-hot-toast';

interface PhoneRequirementModalProps {
  isOpen: boolean;
}

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

export const PhoneRequirementModal: React.FC<PhoneRequirementModalProps> = ({ isOpen }) => {
  const { user, setUser } = useContext(AuthContext);
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState(COUNTRY_CODES[0]);
  const [loading, setLoading] = useState(false);

  if (!isOpen || !user) return null;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^\d]/g, '');
    if (val.length <= countryCode.maxDigits) {
      setPhone(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < countryCode.maxDigits) {
      toast.error(`Please enter a valid ${countryCode.maxDigits}-digit phone number`);
      return;
    }

    const fullPhoneNumber = `${countryCode.code}${phone}`;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ phone: fullPhoneNumber })
        .eq('id', user.id);

      if (error) throw error;

      setUser({ ...user, phone: fullPhoneNumber });
      toast.success('Phone number saved successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save phone number');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200]"></div>
      <div className="fixed inset-0 flex items-center justify-center z-[210] p-4">
        <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#2874f0] to-sky-400"></div>
          
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-50 text-[#2874f0] rounded-full flex items-center justify-center text-2xl mx-auto mb-4 border border-blue-100 shadow-inner">
              <i className="fas fa-mobile-screen"></i>
            </div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Add Phone Number</h2>
            <p className="text-sm text-gray-500 mt-2 font-medium">
              We require a phone number for account security and important updates. Please add it to continue using your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative group w-full sm:w-[150px] shrink-0">
                <select
                  value={countryCode.code}
                  onChange={(e) => {
                    const selected = COUNTRY_CODES.find(c => c.code === e.target.value);
                    if (selected) {
                      setCountryCode(selected);
                      if (phone.length > selected.maxDigits) {
                        setPhone(phone.slice(0, selected.maxDigits));
                      }
                    }
                  }}
                  className="w-full px-3 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:border-[#2874f0] focus:ring-4 focus:ring-blue-50 outline-none font-bold text-gray-900 appearance-none cursor-pointer text-sm"
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
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder={`${'0'.repeat(countryCode.maxDigits)}`}
                  maxLength={countryCode.maxDigits}
                  className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:border-[#2874f0] focus:ring-4 focus:ring-blue-50 outline-none font-bold text-gray-900 transition-all"
                  required
                />
                <i className="fas fa-phone-alt text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 group-focus-within:text-[#2874f0]"></i>
                <div className="absolute -bottom-5 left-1 text-[9px] text-gray-400 font-bold">
                  {phone.length}/{countryCode.maxDigits} digits
                </div>
              </div>
            </div>
            
            <button
              type="submit"
              disabled={loading || phone.length < countryCode.maxDigits}
              className="w-full bg-[#2874f0] text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-blue-500/30 hover:shadow-blue-500/40 transition-all active:scale-95 disabled:opacity-70 flex justify-center items-center gap-2 mt-4"
            >
              {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}
              {loading ? 'Saving...' : 'Save Phone Number'}
            </button>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              Required field
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
