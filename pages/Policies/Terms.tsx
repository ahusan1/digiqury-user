
import React from 'react';
import { useNavigate } from 'react-router-dom';

export const Terms: React.FC = () => {
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
            <div className="w-14 h-14 bg-blue-50 text-[#2874f0] rounded-2xl flex items-center justify-center text-2xl">
              <i className="fas fa-file-contract"></i>
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">Terms & Conditions</h1>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">Last Updated: March 2024</p>
            </div>
          </div>

          <div className="prose prose-blue max-w-none space-y-10 text-gray-600 font-medium leading-relaxed">
            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-xs text-gray-400">01</span>
                Acceptance of Terms
              </h2>
              <p>
                By accessing and using DIGi QuRY, you agree to comply with and be bound by these Terms and Conditions. If you do not agree to these terms, please refrain from using our services. We reserve the right to modify these terms at any time without prior notice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-xs text-gray-400">02</span>
                User Accounts
              </h2>
              <p>
                To access certain features, including purchasing digital assets, you must create an account. You are responsible for maintaining the confidentiality of your credentials and for all activities that occur under your account. You must notify us immediately of any unauthorized use.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-xs text-gray-400">03</span>
                Digital Content
              </h2>
              <p>
                All products sold on DIGi QuRY are digital goods. Upon successful payment, assets are unlocked for immediate download. Users are granted a non-exclusive, non-transferable license to use the assets according to our Digital License Agreement.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-xs text-gray-400">04</span>
                Prohibited Conduct
              </h2>
              <p>
                Users may not:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>Redistribute, resell, or share digital assets without explicit authorization.</li>
                <li>Attempt to bypass security measures or gain unauthorized access to the database.</li>
                <li>Use assets for illegal, harmful, or offensive purposes.</li>
              </ul>
            </section>

            <section className="pt-10 border-t border-gray-50 text-center">
              <p className="text-xs text-gray-400">
                Questions about our Terms? Contact our legal team at <span className="text-[#2874f0] font-bold">digiqury@gmail.com</span>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

