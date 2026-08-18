import React, { useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../App.tsx';

export const BottomNav: React.FC = () => {
  const { cart, user } = useContext(AuthContext);
  const location = useLocation();
  const path = location.pathname;

  const isActive = (href: string) => {
    if (href === '/') return path === '/';
    return path.startsWith(href);
  };

  const navItems = [
    { to: '/', icon: 'fa-home', label: 'Home' },
    { to: '/search', icon: 'fa-search', label: 'Search' },
    { to: '/cart', icon: 'fa-shopping-cart', label: 'Cart', badge: cart.length },
    { to: '/dashboard', icon: 'fa-box-open', label: 'Orders' },
    { to: user ? '/profile' : '/login', icon: 'fa-user-circle', label: user ? 'Profile' : 'Login' },
  ];

  // Hide on support/policy pages
  const hideOn = ['/support', '/terms', '/privacy', '/refund-policy', '/license'];
  if (hideOn.some(p => path.startsWith(p))) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[150] md:hidden bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700 shadow-[0_-6px_24px_rgba(0,0,0,0.12)]"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
    >
      <div className="flex items-stretch h-[68px]">
        {navItems.map(item => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex-1 flex flex-col items-center justify-center gap-1 relative transition-all duration-200 active:scale-95 ${
                active
                  ? 'text-[#2874f0]'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#2874f0] rounded-b-full" />
              )}
              <span className="relative">
                <i className={`fas ${item.icon} text-[19px]`}></i>
                {item.badge != null && item.badge > 0 && (
                  <span className="absolute -top-2 -right-2 bg-[#ff9f00] text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center leading-none border border-white">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-bold ${active ? 'text-[#2874f0]' : ''}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
