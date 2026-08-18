import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white pt-16 pb-6 mt-auto relative overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[140px]"></div>
      
      <div className="max-w-7xl mx-auto px-4 relative z-10">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {/* Brand Section */}
          <div>
            <Link to="/" className="inline-flex items-center gap-1 mb-4 group">
              <span className="text-3xl font-black tracking-tighter italic">DIGi QuRY</span>
              <div className="w-2.5 h-2.5 bg-blue-500 rounded-full group-hover:scale-125 transition-transform"></div>
            </Link>
            
            {/* Required for Google OAuth Verification */}
            <p className="text-gray-400 text-[11px] md:text-xs leading-relaxed mb-6 font-medium pr-4">
              DIGi QuRY is a premium digital marketplace that empowers creators to buy and sell high-quality digital assets. We require user authentication to provide secure checkout, instant downloads, and personalized asset library management.
            </p>
            
            {/* Trust Badges */}
            <div className="flex flex-col gap-3">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 flex items-center gap-2">
                <i className="fas fa-shield-check text-green-400"></i>
                <span className="text-xs font-bold">Secure Payment</span>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 flex items-center gap-2">
                <i className="fas fa-headset text-blue-400"></i>
                <span className="text-xs font-bold">24/7 Support</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-black text-white uppercase tracking-widest text-xs mb-4 flex items-center gap-2">
              <i className="fas fa-bolt text-yellow-400"></i>Quick Links
            </h4>
            <ul className="space-y-3">
              <li>
                <Link to="/" className="text-gray-400 hover:text-white transition-colors text-sm font-medium flex items-center gap-2 group">
                  <i className="fas fa-home text-xs text-gray-600 group-hover:text-blue-400 transition-colors"></i>
                  Store Home
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-gray-400 hover:text-white transition-colors text-sm font-medium flex items-center gap-2 group">
                  <i className="fas fa-info-circle text-xs text-gray-600 group-hover:text-blue-400 transition-colors"></i>
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="text-gray-400 hover:text-white transition-colors text-sm font-medium flex items-center gap-2 group">
                  <i className="fas fa-box-open text-xs text-gray-600 group-hover:text-blue-400 transition-colors"></i>
                  My Purchases
                </Link>
              </li>
              <li>
                <Link to="/wishlist" className="text-gray-400 hover:text-white transition-colors text-sm font-medium flex items-center gap-2 group">
                  <i className="fas fa-heart text-xs text-gray-600 group-hover:text-blue-400 transition-colors"></i>
                  Wishlist
                </Link>
              </li>
              <li>
                <Link to="/profile" className="text-gray-400 hover:text-white transition-colors text-sm font-medium flex items-center gap-2 group">
                  <i className="fas fa-user-circle text-xs text-gray-600 group-hover:text-blue-400 transition-colors"></i>
                  My Account
                </Link>
              </li>
            </ul>
          </div>

          {/* Support & Legal */}
          <div>
            <h4 className="font-black text-white uppercase tracking-widest text-xs mb-4 flex items-center gap-2">
              <i className="fas fa-info-circle text-orange-400"></i>Support
            </h4>
            <ul className="space-y-3">
              <li>
                <Link to="/support" className="text-gray-400 hover:text-white transition-colors text-sm font-medium flex items-center gap-2 group">
                  <i className="fas fa-headset text-xs text-gray-600 group-hover:text-orange-400 transition-colors"></i>
                  Help Center
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-gray-400 hover:text-white transition-colors text-sm font-medium flex items-center gap-2 group">
                  <i className="fas fa-file-contract text-xs text-gray-600 group-hover:text-orange-400 transition-colors"></i>
                  Terms & Policies
                </Link>
              </li>
              <li>
                <a href="https://seller.digiqury.in" className="text-orange-400 hover:text-orange-300 transition-colors text-sm font-bold flex items-center gap-2 group">
                  <i className="fas fa-rocket text-xs group-hover:scale-110 transition-transform"></i>
                  Become a Seller
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400 font-medium">
            © {new Date().getFullYear()} <span className="font-bold text-white">DIGi QuRY</span>. All rights reserved.
          </p>

          {/* Social Links */}
          <div className="flex items-center gap-3">
            <a 
              href="#" 
              className="w-10 h-10 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-blue-500 hover:border-blue-500 transition-all group"
            >
              <i className="fab fa-twitter text-gray-400 group-hover:text-white transition-colors"></i>
            </a>
            <a 
              href="#" 
              className="w-10 h-10 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-gradient-to-br hover:from-purple-500 hover:to-pink-500 hover:border-transparent transition-all group"
            >
              <i className="fab fa-instagram text-gray-400 group-hover:text-white transition-colors"></i>
            </a>
            <a 
              href="#" 
              className="w-10 h-10 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-indigo-500 hover:border-indigo-500 transition-all group"
            >
              <i className="fab fa-discord text-gray-400 group-hover:text-white transition-colors"></i>
            </a>
            <a 
              href="#" 
              className="w-10 h-10 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-red-500 hover:border-red-500 transition-all group"
            >
              <i className="fab fa-youtube text-gray-400 group-hover:text-white transition-colors"></i>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
