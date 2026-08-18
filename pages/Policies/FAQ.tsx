import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

export const FAQ: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="bg-gray-50 min-h-screen py-8 md:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <button 
          onClick={() => navigate(-1)} 
          className="mb-6 flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-blue-600 transition-colors bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100 w-fit"
        >
          <i className="fas fa-arrow-left"></i> Back
        </button>

        <div className="text-center mb-10 md:mb-12">
          <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tight sm:text-4xl">
            Frequently Asked Questions
          </h1>
          <p className="mt-4 text-gray-500">
            Find answers to common questions about buying and selling on DIGi QuRY.
          </p>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="border-b border-gray-200">
            <dl>
              <div className="px-4 py-5 sm:p-6 border-b border-gray-100 bg-gray-50/50">
                <dt className="text-base font-bold text-gray-900">
                  What is DIGi QuRY?
                </dt>
                <dd className="mt-2 text-sm text-gray-600">
                  DIGi QuRY is a premium digital marketplace where creators can sell and buyers can instantly purchase high-quality digital products, software, source codes, and digital assets securely.
                </dd>
              </div>

              <div className="px-4 py-5 sm:p-6 border-b border-gray-100">
                <dt className="text-base font-bold text-gray-900">
                  How do I buy a digital product?
                </dt>
                <dd className="mt-2 text-sm text-gray-600">
                  Simply browse our extensive catalog of digital assets, select the product you need, and proceed to our secure checkout. Once the payment is confirmed, you will instantly receive access to download your assets directly from your dashboard. We support various payment methods to ensure a smooth checkout experience.
                </dd>
              </div>

              <div className="px-4 py-5 sm:p-6 border-b border-gray-100 bg-gray-50/50">
                <dt className="text-base font-bold text-gray-900">
                  How can I sell digital products on DIGi QuRY?
                </dt>
                <dd className="mt-2 text-sm text-gray-600">
                  You can easily join our seller platform by navigating to <a href="https://seller.digiqury.in" className="text-blue-600 hover:underline">seller.digiqury.in</a>. Once registered, you can start uploading and listing your digital products to reach thousands of potential buyers across the globe. We provide the tools you need to manage your inventory, track sales, and grow your digital business.
                </dd>
              </div>

              <div className="px-4 py-5 sm:p-6 border-b border-gray-100">
                <dt className="text-base font-bold text-gray-900">
                  Are the digital assets verified and secure?
                </dt>
                <dd className="mt-2 text-sm text-gray-600">
                  Yes, absolutely. At DIGi QuRY, we take security and quality very seriously. All sellers and their digital products go through a stringent verification process before they are listed on our marketplace. We guarantee a secure checkout environment and ensure that the files you purchase are authentic and safe to use.
                </dd>
              </div>

              <div className="px-4 py-5 sm:p-6 border-b border-gray-100 bg-gray-50/50">
                <dt className="text-base font-bold text-gray-900">
                  Why choose DIGi QuRY?
                </dt>
                <dd className="mt-2 text-sm text-gray-600">
                  With a growing catalog of premium digital goods, instant delivery, 24/7 dedicated live support, and a commitment to quality, DIGi QuRY stands out as the premier digital marketplace for both creators and buyers.
                </dd>
              </div>

              <div className="px-4 py-5 sm:p-6">
                <dt className="text-base font-bold text-gray-900">
                  Need more help?
                </dt>
                <dd className="mt-2 text-sm text-gray-600">
                  If you couldn't find the answer to your question, feel free to contact our <Link to="/support" className="text-blue-600 hover:underline">Live Cast Support</Link>.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
};
