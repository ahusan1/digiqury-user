import React, { useState, useEffect, useRef } from 'react';
import { Product, UserProfile } from '../types.ts';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  user: UserProfile;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, order, user }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        if (containerWidth < 834) {
          setScale(containerWidth / 834);
        } else {
          setScale(1);
        }
      }
    };
    
    if (isOpen) {
      updateScale();
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
    }
  }, [isOpen]);

  if (!isOpen || !order) return null;

  const product: Product = Array.isArray(order.product) ? order.product[0] : order.product;

  const originalPrice = product?.original_price || product?.price || 0;
  const unitPrice = product?.price || 0;
  const productDiscount = Math.max(0, originalPrice - unitPrice);
  const hasCoupon = !!order?.coupon_code;
  const discountAmount = Number(order?.discount_amount || 0);
  const finalPrice = Number(order?.amount || 0);

  const formatInr = (amount: number) => {
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const invoiceNo = `INV-${String(order.id || 'NA').slice(0, 8).toUpperCase()}`;

  const handleDownload = () => {
    // Target the hidden, unscaled element to prevent iOS WebKit text overlap bugs caused by CSS transform
    const element = document.getElementById('invoice-sheet-hidden');
    if (!element) return;
    
    const opt = {
      margin:       0,
      filename:     `${invoiceNo}.pdf`,
      image:        { type: 'jpeg', quality: 1 },
      html2canvas:  { scale: 2, useCORS: true }, 
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    } as any;
    
    html2pdf().set(opt).from(element).save();
  };

  const detailRows = [
    { label: 'Category', value: product?.category || 'N/A' },
    { label: 'Format', value: product?.format || 'N/A' },
    { label: 'Resolution', value: product?.resolution || 'N/A' },
    { label: 'Seller', value: product?.seller?.name || (product?.seller_id ? 'Verified Seller' : 'N/A') },
    { label: 'Coupon Applied', value: order?.coupon_code ? `${order.coupon_code} ✓` : 'No' },
  ];

  const renderInvoiceContent = () => (
    <>
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-200 pb-8 mb-8">
        <div className="flex items-center gap-6">
          <img src="/logo.png" alt="DIGi QuRY" className="w-20 h-20 object-contain" />
          <div>
            <h1 className="text-4xl font-black text-blue-600 tracking-tight m-0 p-0">DIGi QuRY</h1>
            <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mt-1">Digital Assets</p>
            <p className="text-sm text-slate-500 mt-2">digiqury@gmail.com</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-3xl font-black text-slate-300 uppercase tracking-widest mb-2">INVOICE</h2>
          <p className="text-lg font-bold text-slate-700">{invoiceNo}</p>
          <p className="text-sm text-slate-500 mt-1">Date: {formatDate(order.created_at)}</p>
        </div>
      </div>

      {/* Bill To & Order Details */}
      <div className="flex justify-between gap-12 mb-10">
        <div className="flex-1">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Billed To</h3>
          <p className="text-lg font-bold text-slate-800">{user.name || 'Customer'}</p>
          <p className="text-sm text-slate-600 mt-1">{user.email || 'N/A'}</p>
          <p className="text-sm text-slate-600">{user.phone || 'N/A'}</p>
        </div>
        <div className="flex-1">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Order Details</h3>
          <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
            <span className="font-bold text-slate-500">Order ID:</span>
            <span className="font-mono text-slate-800 break-all">{order.id}</span>
            <span className="font-bold text-slate-500">Payment ID:</span>
            <span className="font-mono text-slate-800 break-all">{order.payment_id || 'N/A'}</span>
            <span className="font-bold text-slate-500">Status:</span>
            <span className="font-bold text-green-600 uppercase">Paid</span>
          </div>
        </div>
      </div>

      {/* Product Table */}
      <div className="mb-10">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="py-3 font-black text-slate-400 uppercase tracking-widest text-xs">Item Description</th>
              <th className="py-3 font-black text-slate-400 uppercase tracking-widest text-xs text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-5">
                <p className="font-bold text-slate-800 text-lg mb-1">{product?.title || 'Unknown Product'}</p>
                <p className="text-sm text-slate-500 max-w-[500px] leading-relaxed break-words">{product?.description || 'N/A'}</p>
                <div className="flex flex-wrap gap-4 mt-3">
                  {detailRows.map(row => (
                    <div key={row.label} className="bg-slate-50 px-2 py-1 rounded text-xs border border-slate-100">
                      <span className="font-bold text-slate-400 mr-1">{row.label}:</span>
                      <span className="font-medium text-slate-700">{row.value}</span>
                    </div>
                  ))}
                </div>
              </td>
              <td className="py-5 text-right font-bold text-slate-800 text-lg align-top">
                ₹ {formatInr(originalPrice)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Pricing Summary */}
      <div className="flex justify-end mb-12">
        <div className="w-[350px]">
          <div className="flex justify-between py-2 text-slate-600">
            <span>Subtotal</span>
            <span className="font-bold">₹ {formatInr(originalPrice)}</span>
          </div>
          {productDiscount > 0 && (
            <div className="flex justify-between py-2 text-orange-500">
              <span>Store Discount</span>
              <span className="font-bold">- ₹ {formatInr(productDiscount)}</span>
            </div>
          )}
          {hasCoupon && (
            <div className="flex justify-between py-2 text-green-600">
              <span>Coupon Discount</span>
              <span className="font-bold">- ₹ {formatInr(discountAmount)}</span>
            </div>
          )}
          {!hasCoupon && discountAmount > 0 && (
            <div className="flex justify-between py-2 text-green-600">
              <span>Discount</span>
              <span className="font-bold">- ₹ {formatInr(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between py-4 mt-2 border-t-2 border-slate-200">
            <span className="text-xl font-black text-slate-800">Total Paid</span>
            <span className="text-2xl font-black text-blue-600">₹ {formatInr(finalPrice)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-12 left-12 right-12 text-center border-t border-slate-200 pt-6">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">✓ Computer Generated Document</p>
        <p className="text-xs text-slate-500 mt-2">Instant delivery • No refunds on digital assets</p>
        <p className="text-xs text-slate-400 mt-1">Thank you for your business!</p>
      </div>
    </>
  );

  return (
    <div className="invoice-overlay fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="invoice-shell bg-white w-full max-w-4xl rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="print:hidden bg-gradient-to-r from-[#2874f0] to-blue-600 px-3 sm:px-6 py-3 sm:py-5 text-white flex justify-between items-center shrink-0 shadow-lg">
          <div className="flex items-center gap-2 sm:gap-3">
            <i className="fas fa-file-invoice-dollar text-lg sm:text-2xl"></i>
            <h2 className="text-sm sm:text-xl font-black uppercase tracking-wide">Invoice</h2>
          </div>
          <button onClick={onClose} className="w-8 sm:w-10 h-8 sm:h-10 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors hover:scale-110">
            <i className="fas fa-times text-base sm:text-lg"></i>
          </button>
        </div>

        {/* Scaled Visible Invoice Container */}
        <div ref={containerRef} className="invoice-scroll overflow-y-auto overflow-x-hidden flex-grow bg-gradient-to-br from-gray-50 to-gray-100 p-2 sm:p-4 md:p-5 flex justify-center items-start print:p-0 print:bg-white">
          <div 
            style={{ 
              transform: `scale(${scale})`, 
              transformOrigin: 'top center',
              width: '794px',
              height: `${scale * 1122}px`,
              transition: 'transform 0.2s ease-out'
            }}
          >
            <div id="invoice-sheet" className="w-[794px] min-h-[1122px] shrink-0 bg-white p-12 text-slate-800 font-sans relative box-border shadow-2xl print:shadow-none">
              {renderInvoiceContent()}
            </div>
          </div>
        </div>

        {/* Hidden Unscaled Clone for html2pdf */}
        <div className="fixed top-[-9999px] left-[-9999px] opacity-0 pointer-events-none">
          <div id="invoice-sheet-hidden" className="w-[794px] min-h-[1122px] shrink-0 bg-white p-12 text-slate-800 font-sans relative box-border">
            {renderInvoiceContent()}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="print:hidden p-3 sm:p-4 md:p-6 bg-gradient-to-r from-gray-50 to-gray-100 border-t flex justify-end gap-2 sm:gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 rounded-lg sm:rounded-xl text-[11px] sm:text-xs md:text-sm font-black text-gray-700 uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95"
          >
            Close
          </button>
          <button
            onClick={handleDownload}
            className="px-4 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 bg-gradient-to-r from-[#2874f0] to-blue-600 text-white rounded-lg sm:rounded-xl text-[11px] sm:text-xs md:text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-500/30 active:scale-95 transition-all flex items-center gap-1.5 sm:gap-2 hover:shadow-xl"
          >
            <i className="fas fa-download text-sm"></i>
            Download
          </button>
        </div>

      </div>
    </div>
  );
};
