
import React from 'react';
import { useNavigate } from 'react-router-dom';

export const License: React.FC = () => {
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
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl">
              <i className="fas fa-certificate"></i>
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">Asset License</h1>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">DIGi QuRY Standard License</p>
            </div>
          </div>

          <div className="prose prose-indigo max-w-none space-y-10 text-gray-600 font-medium leading-relaxed">
            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4 uppercase tracking-tighter">Scope of License</h2>
              <p>
                When you purchase a digital asset from DIGi QuRY, you are granted a perpetual, worldwide, non-exclusive, sub-licensable license to use the asset in your projects.
              </p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-green-50 p-6 rounded-3xl border border-green-100">
                <h3 className="font-black text-green-900 mb-3 uppercase text-xs tracking-widest">What You Can Do</h3>
                <ul className="text-[11px] font-bold text-green-800/70 space-y-2">
                  <li className="flex items-start gap-2"><i className="fas fa-check mt-0.5"></i> Use in commercial & personal projects.</li>
                  <li className="flex items-start gap-2"><i className="fas fa-check mt-0.5"></i> Modify the asset for your specific needs.</li>
                  <li className="flex items-start gap-2"><i className="fas fa-check mt-0.5"></i> Use in social media, ads, and websites.</li>
                </ul>
              </div>
              <div className="bg-red-50 p-6 rounded-3xl border border-red-100">
                <h3 className="font-black text-red-900 mb-3 uppercase text-xs tracking-widest">What You Cannot Do</h3>
                <ul className="text-[11px] font-bold text-red-800/70 space-y-2">
                  <li className="flex items-start gap-2"><i className="fas fa-times mt-0.5"></i> Resell or redistribute as a standalone file.</li>
                  <li className="flex items-start gap-2"><i className="fas fa-times mt-0.5"></i> Use in templates for resale (unless specified).</li>
                  <li className="flex items-start gap-2"><i className="fas fa-times mt-0.5"></i> Claim ownership of the original design.</li>
                </ul>
              </div>
            </div>

            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4 uppercase tracking-tighter">Ownership</h2>
              <p>
                Purchase of an asset does not transfer copyright. The original creator or DIGi QuRY retains full ownership of the underlying IP. You are purchasing a right to use the asset.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

