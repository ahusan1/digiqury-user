import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

export const About: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="bg-gray-50 min-h-screen py-8 md:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <button onClick={() => navigate(-1)} className="text-sm font-black text-gray-500 hover:text-[#2874f0] uppercase tracking-widest flex items-center gap-2 transition-colors">
            <i className="fas fa-arrow-left"></i> Back
          </button>
        </div>

        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 md:p-12 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400 opacity-20 rounded-full blur-2xl translate-y-1/3 -translate-x-1/4"></div>
            <div className="relative z-10">
              <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl border border-white/20">
                <i className="fas fa-info-circle text-4xl text-white"></i>
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-4 drop-shadow-md">About DIGi QuRY</h1>
              <p className="text-blue-100 text-sm md:text-base font-medium max-w-lg mx-auto leading-relaxed">
                Empowering creators and developers to build, share, and monetize digital assets.
              </p>
            </div>
          </div>

          <div className="p-8 md:p-12 space-y-8 text-gray-600 font-medium">
            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
                <i className="fas fa-rocket text-[#2874f0]"></i> Our Mission
              </h2>
              <p className="leading-relaxed mb-4">
                DIGi QuRY is a premium digital marketplace that empowers creators to buy and sell high-quality digital assets. Our platform provides a secure environment for users to discover, purchase, and download digital products such as software source codes, UI templates, graphics, and web assets.
              </p>
              <p className="leading-relaxed">
                At the same time, we provide a robust dashboard for creators and developers to monetize their digital work effortlessly.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
                <i className="fas fa-shield-check text-green-500"></i> Secure & Personalized
              </h2>
              <p className="leading-relaxed">
                To enable secure checkout, instant download access, and personalized asset library management, we require users to authenticate and sign in to their accounts. This ensures that your purchases are always safely tied to your identity and can be accessed anytime from any device.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
