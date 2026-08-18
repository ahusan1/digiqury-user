import React, { useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../App.tsx';
import { getCurrentPath } from '../lib/loginRedirect.ts';

interface NavbarProps {
  onMenuClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const { user, cart, wishlist, confirmLogout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const cartCount = cart.length;
  const wishlistCount = wishlist.length;

  return (
    <nav className="bg-[#2874f0] text-white sticky top-0 z-[100] flex flex-col items-center w-full shadow-md">
      <div className="max-w-7xl w-full h-14 md:h-16 flex items-center justify-between px-3 md:px-4 gap-2 md:gap-10">
        
        {/* Left Section: Mobile Left Menu & Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={onMenuClick} className="md:hidden p-1 -ml-1 hover:bg-white/10 rounded-md transition-colors">
            <i className="fas fa-bars text-lg"></i>
          </button>
          <Link to="/" className="flex flex-col items-start group">
            <div className="flex items-center gap-0.5 md:gap-1 italic leading-none">
              <span className="text-lg md:text-xl font-black tracking-tight">DIGi QuRY</span>
            </div>
            <div className="flex items-center gap-1 text-[9px] md:text-[11px] font-bold leading-none mt-0.5 italic group-hover:underline">
              <span className="text-white/80">Premium</span>
              <span className="text-[#ffe500] flex items-center gap-0.5">
                Member <i className="fas fa-bolt text-[7px]"></i>
              </span>
            </div>
          </Link>
        </div>

        {/* Center Section: Desktop Search Bar (Ab hamesha visible rahega) */}
        <div 
          onClick={() => navigate('/search')}
          className="flex-grow max-w-2xl hidden md:block cursor-text relative group"
        >
          <div className="w-full h-10 pl-4 pr-12 text-sm text-gray-500 rounded-lg shadow-inner bg-white font-medium flex items-center border border-transparent group-hover:border-[#ffe500] transition-colors cursor-text">
             Search assets, descriptions, or try 'under 100'...
          </div>
          <div className="absolute right-0 top-0 h-full px-4 flex items-center text-[#2874f0] bg-gray-50 rounded-r-lg group-hover:bg-gray-100 transition-colors cursor-pointer">
            <i className="fas fa-search text-sm"></i>
          </div>
        </div>

        {/* Right Section: Mobile Search Icon, Cart, Profile/Login */}
        <div className="flex items-center gap-2 md:gap-8 font-bold text-sm md:text-[15px] shrink-0">
          
          {/* Mobile Search Icon (Ab mobile mein bhi hamesha visible rahega) */}
          <Link to="/search" className="md:hidden p-2 hover:bg-white/10 rounded-full transition-colors">
            <i className="fas fa-search text-lg"></i>
          </Link>

          {/* Cart Icon */}
          <Link to="/cart" className="flex items-center gap-2 hover:bg-white/10 px-2 md:px-3 py-1.5 rounded-sm transition-all relative group">
            <div className="relative">
              <i className="fas fa-shopping-cart text-lg"></i>
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-[#ff9f00] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#2874f0] shadow-sm animate-bounce-short">
                  {cartCount}
                </span>
              )}
            </div>
            <span className="hidden sm:inline font-black tracking-tight uppercase text-xs">Cart</span>
          </Link>

          {/* User Profile or Login Button */}
          <div className="flex items-center">
            {user ? (
              <div className="relative group hidden md:flex items-center gap-3">
                <button className="flex items-center gap-2 hover:bg-white/10 px-3 py-1.5 rounded-sm transition-all duration-200">
                  <i className="fas fa-user-circle text-lg"></i>
                  <span className="font-bold">
                    {user.name.split(' ')[0]}
                  </span>
                  <i className="fas fa-chevron-down text-[9px] mt-0.5 group-hover:rotate-180 transition-transform"></i>
                </button>
                
                <div className="absolute top-full -right-4 w-60 pt-2 invisible md:group-hover:visible opacity-0 md:group-hover:opacity-100 translate-y-2 md:group-hover:translate-y-0 transition-all duration-300 ease-out z-[110]">
                  <div className="bg-white text-black rounded-sm shadow-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">My Account</span>
                      <span className="text-[9px] font-bold text-[#2874f0] bg-blue-50 px-1.5 py-0.5 rounded uppercase">Member</span>
                    </div>
                    
                    <Link to="/profile" className="flex items-center gap-4 px-4 py-3.5 hover:bg-[#2874f0]/5 transition-colors border-b border-gray-50">
                      <i className="fas fa-user text-[#2874f0] w-4 text-center"></i>
                      <span className="text-sm font-medium">My Profile</span>
                    </Link>

                    <Link to="/wishlist" className="flex items-center gap-4 px-4 py-3.5 hover:bg-[#2874f0]/5 transition-colors border-b border-gray-50">
                      <div className="relative">
                        <i className="fas fa-heart text-red-500 w-4 text-center"></i>
                        {wishlistCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[7px] w-3 h-3 flex items-center justify-center rounded-full font-black">
                            {wishlistCount}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-medium">Wishlist</span>
                    </Link>

                    <Link to="/dashboard" className="flex items-center gap-4 px-4 py-3.5 hover:bg-[#2874f0]/5 transition-colors border-b border-gray-50">
                      <i className="fas fa-box-open text-[#2874f0] w-4 text-center"></i>
                      <span className="text-sm font-medium">Orders</span>
                    </Link>

                    <button 
                      onClick={confirmLogout}
                      className="w-full flex items-center gap-4 px-4 py-4 hover:bg-red-50 text-left text-gray-700 hover:text-red-600 transition-colors"
                    >
                      <i className="fas fa-power-off w-4 text-center"></i>
                      <span className="text-sm font-bold">Logout</span>
                    </button>
                  </div>
                  <div className="absolute top-0 right-10 w-3 h-3 bg-white rotate-45 -translate-y-1.5 border-l border-t border-gray-100"></div>
                </div>
              </div>
            ) : (
              <Link to="/login" state={{ from: getCurrentPath(location) }} className="bg-white text-[#2874f0] px-5 md:px-9 py-1 md:py-1.5 rounded-sm hover:shadow-lg transition-all font-black text-[11px] md:text-sm active:scale-95">
                Login
              </Link>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce-short {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        .animate-bounce-short {
          animation: bounce-short 1.5s infinite;
        }
      `}</style>
    </nav>
  );
};
