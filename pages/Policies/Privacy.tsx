
import React from 'react';
import { useNavigate } from 'react-router-dom';

export const Privacy: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="bg-[#f8fafc] min-h-screen py-10 md:py-20">
      <div className="max-w-4xl mx-auto px-6">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-[#2874f0] font-black text-xs uppercase tracking-widest mb-10 hover:underline"
        >
          <i className="fas fa-arrow-left"></i> Back
        </button>

        <div className="bg-white rounded-[3rem] p-8 md:p-16 shadow-xl border border-gray-100">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl">
              <i className="fas fa-user-shield"></i>
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">Privacy Policy</h1>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">Version 2.0 • Data Protection</p>
            </div>
          </div>

          <div className="prose prose-emerald max-w-none space-y-10 text-gray-600 font-medium leading-relaxed">
            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4">Information We Collect</h2>
              <p>
                We collect information you provide directly to us when you create an account, make a purchase, or communicate with us. This includes your name, email address, phone number, and transaction history. Payment data is processed securely via Razorpay and is not stored on our primary servers.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4">How We Use Your Data</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>To provide, maintain, and improve our marketplace services.</li>
                <li>To process transactions and send related information, including confirmations and receipts.</li>
                <li>To provide technical support and security alerts.</li>
                <li>To personalize your experience and show you relevant assets.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4">Data Security (Supabase)</h2>
              <p>
                DIGi QuRY utilizes Supabase for secure data storage and authentication. We implement Row Level Security (RLS) to ensure that your private data is only accessible to you. Your passwords are encrypted using industry-standard hashing algorithms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4">Your Rights</h2>
              <p>
                You have the right to access, update, or delete your personal information at any time via your Profile settings. If you wish to permanently delete your account, please contact our support team.
              </p>
            </section>

            <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100">
              <p className="text-xs text-emerald-700 font-bold">
                <i className="fas fa-info-circle mr-2"></i>
                We do not sell, rent, or lease our customer lists to third parties. Your data is used exclusively to power your experience on DIGi QuRY.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

