
import React from 'react';
import { useNavigate } from 'react-router-dom';

export const RefundPolicy: React.FC = () => {
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
            <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center text-2xl">
              <i className="fas fa-truck-fast"></i>
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">Shipping & Refunds</h1>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">Digital Fulfillment Policy</p>
            </div>
          </div>

          <div className="prose prose-orange max-w-none space-y-10 text-gray-600 font-medium leading-relaxed">
            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4 italic">Instant Shipping</h2>
              <p>
                DIGi QuRY deals exclusively in digital assets. We do not ship physical products. Delivery is instantaneous upon successful payment verification. You will receive:
              </p>
              <ul className="list-disc pl-5 mt-4 space-y-2">
                <li>An immediate download link on the order success page.</li>
                <li>Permanent access to the asset via your "My Orders" dashboard.</li>
                <li>A transaction confirmation email with access instructions.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4 italic">Refund Policy</h2>
              <p>
                Due to the nature of digital goods, which cannot be "returned" once downloaded, <strong>all sales are final and non-refundable</strong>. Unlike physical goods, digital assets can be duplicated and stored indefinitely once accessed.
              </p>
              <p className="mt-4">
                Exceptions may be considered in the following rare circumstances:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>The file is demonstrably corrupt or unusable (verified by our technical team).</li>
                <li>The product description significantly misrepresented the actual content.</li>
                <li>Multiple accidental purchases of the exact same asset.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900 mb-4 italic">Technical Support</h2>
              <p>
                If you encounter any issues downloading or using your purchased assets, our support team is available 24/7. Please provide your Order ID and a description of the issue.
              </p>
            </section>

            <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100 flex items-start gap-4">
               <i className="fas fa-triangle-exclamation text-orange-600 mt-1"></i>
               <p className="text-xs text-orange-800 font-bold leading-relaxed">
                 Please ensure you review all preview images and technical specifications (format, resolution) before completing your purchase to ensure the asset meets your requirements.
               </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

