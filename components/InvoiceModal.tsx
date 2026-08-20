import React from 'react';
import { Product, UserProfile } from '../types.ts';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  user: UserProfile;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, order, user }) => {
  if (!isOpen || !order) return null;

  const product: Product = Array.isArray(order.product) ? order.product[0] : order.product;
  const unitPriceRaw = Number(order?.unit_price);
  const productPriceRaw = Number(product?.price);
  const originalPriceRaw = Number(product?.original_price);
  const discountAmountRaw = Math.max(0, Number(order?.discount_amount || 0));
  const hasCoupon = Boolean(order?.coupon_code);
  const finalPriceRaw = Number(order?.final_price);
  const orderSubtotalRaw = Number(order?.order_subtotal);
  const orderDiscountTotalRaw = Number(order?.order_discount_total);
  const orderFinalTotalRaw = Number(order?.order_final_total);

  const unitPrice = (() => {
    if (Number.isFinite(unitPriceRaw) && unitPriceRaw > 0) return unitPriceRaw;
    if (Number.isFinite(productPriceRaw) && productPriceRaw >= 0) return productPriceRaw;
    return 0;
  })();

  const originalPrice = (() => {
    if (Number.isFinite(originalPriceRaw) && originalPriceRaw > 0) return originalPriceRaw;
    return unitPrice;
  })();

  const discountAmount = Math.min(discountAmountRaw, unitPrice);

  const finalPrice = (() => {
    if (Number.isFinite(finalPriceRaw) && finalPriceRaw > 0) return finalPriceRaw;
    if (hasCoupon && Number.isFinite(finalPriceRaw) && finalPriceRaw === 0 && discountAmount >= unitPrice && unitPrice > 0) {
      return 0;
    }
    return Math.max(0, unitPrice - discountAmount);
  })();

  const productDiscount = Math.max(0, originalPrice - unitPrice);

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

  const handlePrint = () => {
    window.print();
  };

  const detailRows = [
    { label: 'Category', value: product?.category || 'N/A' },
    { label: 'Format', value: product?.format || 'N/A' },
    { label: 'Resolution', value: product?.resolution || 'N/A' },
    { label: 'Seller', value: product?.seller?.name || (product?.seller_id ? 'Verified Seller' : 'N/A') },
    { label: 'Coupon Applied', value: order?.coupon_code ? `${order.coupon_code} ✓` : 'No' },
  ];

  return (
    <div className="invoice-overlay fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="invoice-shell bg-white w-full max-w-4xl rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[92vh]">
        <div className="print:hidden bg-gradient-to-r from-[#2874f0] to-blue-600 px-3 sm:px-6 py-3 sm:py-5 text-white flex justify-between items-center shrink-0 shadow-lg">
          <div className="flex items-center gap-2 sm:gap-3">
            <i className="fas fa-file-invoice-dollar text-lg sm:text-2xl"></i>
            <h2 className="text-sm sm:text-xl font-black uppercase tracking-wide">Invoice</h2>
          </div>
          <button onClick={onClose} className="w-8 sm:w-10 h-8 sm:h-10 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors hover:scale-110">
            <i className="fas fa-times text-base sm:text-lg"></i>
          </button>
        </div>

        <div className="invoice-scroll overflow-y-auto flex-grow bg-gradient-to-br from-gray-50 to-gray-100 p-2 sm:p-4 md:p-8 print:p-0 print:bg-white">
          <div id="invoice-sheet" className="mx-auto w-full max-w-[900px] bg-white rounded-xl sm:rounded-2xl border border-gray-100 sm:border-2 shadow-2xl p-4 sm:p-6 md:p-10 print:shadow-none print:border-0 print:rounded-none print:p-0">

            {/* Header Section */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-6 mb-4 sm:mb-8 pb-4 sm:pb-8 border-b border-gray-200 sm:border-b-2">
              <div className="flex items-center gap-4 sm:gap-6 min-w-0">
                <img src="/logo.png" alt="DIGi QuRY Logo" className="w-16 h-16 sm:w-24 sm:h-24 md:w-32 md:h-32 object-contain shrink-0 drop-shadow-md" />
                <div className="min-w-0">
                  <div className="text-3xl sm:text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#2874f0] to-blue-600 leading-none">DIGi QuRY</div>
                  <div className="text-[10px] sm:text-xs text-[#2874f0] font-black uppercase tracking-[0.15em] mt-1">Digital Assets</div>
                  <div className="text-[10px] sm:text-xs text-gray-600 font-semibold mt-1 sm:mt-2">📧 digiqury@gmail.com</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="inline-block bg-gradient-to-r from-[#2874f0]/10 to-blue-600/10 px-3 sm:px-5 py-2 sm:py-3 rounded-lg sm:rounded-xl border border-[#2874f0]/20">
                  <p className="text-[8px] sm:text-xs font-black text-gray-500 uppercase tracking-wider">Invoice</p>
                  <p className="text-lg sm:text-2xl font-black text-[#2874f0] font-mono mt-1">{invoiceNo}</p>
                </div>
                <p className="text-[9px] sm:text-[11px] text-gray-600 font-medium mt-2 sm:mt-4">📅 {formatDate(order.created_at)}</p>
              </div>
            </div>

            {/* Customer & Order Info */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
              <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 border border-blue-100/50 rounded-lg sm:rounded-xl md:rounded-2xl p-3 sm:p-4 md:p-5">
                <p className="text-[8px] sm:text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1.5 sm:mb-3">👤 Bill To</p>
                <p className="text-sm sm:text-base font-black text-gray-900 truncate">{user.name || 'Customer'}</p>
                <p className="text-[11px] sm:text-xs text-gray-700 mt-1.5 sm:mt-2.5 font-semibold truncate">{user.email || 'N/A'}</p>
                <p className="text-[11px] sm:text-xs text-gray-700 mt-1 font-semibold truncate">{user.phone || 'Ph: N/A'}</p>
              </div>

              <div className="bg-gradient-to-br from-emerald-50/50 to-green-50/50 border border-emerald-100/50 rounded-lg sm:rounded-xl md:rounded-2xl p-3 sm:p-4 md:p-5">
                <p className="text-[8px] sm:text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1.5 sm:mb-3">📋 Order</p>
                <p className="text-[10px] sm:text-xs text-gray-700 font-semibold break-all">ID: <span className="font-mono text-gray-900 font-black">{order.id || 'N/A'}</span></p>
                <p className="text-[10px] sm:text-xs text-gray-700 font-semibold mt-1 sm:mt-2 break-all">Pay: <span className="font-mono text-gray-900 font-black">{order.payment_id || 'N/A'}</span></p>
                <div className="mt-1.5 sm:mt-2.5 flex items-center gap-1.5 sm:gap-2">
                  <span className="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500"></span>
                  <span className="text-[10px] sm:text-xs font-black text-green-700 uppercase">{order.status || 'PAID'}</span>
                </div>
              </div>
            </div>

            {/* Product Details Card */}
            <div className="mb-4 sm:mb-6 md:mb-8 bg-gradient-to-br from-gray-50/50 to-gray-100/30 border border-gray-200/60 rounded-lg sm:rounded-xl md:rounded-2xl p-3 sm:p-4 md:p-6">
              <p className="text-[8px] sm:text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 sm:mb-4">📆 Product</p>
              <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] md:grid-cols-[140px_1fr] gap-3 sm:gap-4 md:gap-5">
                <div className="h-24 sm:h-28 md:h-32 bg-white border-2 border-dashed border-gray-300 rounded-lg sm:rounded-xl p-1 sm:p-2 flex items-center justify-center overflow-hidden hover:border-[#2874f0] transition-colors">
                  {product?.preview_image ? (
                    <img src={product.preview_image} alt={product?.title || 'Preview'} className="max-w-full max-h-full object-contain" />
                  ) : (
                    <div className="text-[8px] text-gray-400 font-black uppercase">No Image</div>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-sm sm:text-base md:text-lg font-black text-gray-900 leading-snug line-clamp-2">{product?.title || 'Unknown'}</p>
                  <p className="text-[10px] sm:text-xs text-gray-600 mt-1 sm:mt-2.5 leading-relaxed font-medium line-clamp-2">{product?.description || 'N/A'}</p>
                  <div className="mt-2 sm:mt-3 md:mt-4 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-1.5 sm:gap-2 md:gap-2.5">
                    {detailRows.map((row) => (
                      <div key={row.label} className="bg-white border border-gray-200/80 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 md:py-2.5 hover:shadow-sm transition-shadow">
                        <p className="text-[7px] sm:text-[8px] font-black text-gray-500 uppercase tracking-widest">{row.label}</p>
                        <p className="text-[10px] sm:text-xs font-bold text-gray-900 mt-1 break-all">{row.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Pricing Breakdown */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <p className="text-[8px] sm:text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 sm:mb-4">💰 Pricing</p>

              <div className="space-y-1.5 sm:space-y-2">
                {/* Original Price */}
                <div className="flex justify-between items-center bg-gray-50 p-2 sm:p-3 md:p-4 rounded-lg sm:rounded-xl border border-gray-200/60">
                  <span className="text-[10px] sm:text-xs md:text-sm font-semibold text-gray-700">Original Price</span>
                  <span className="text-[10px] sm:text-xs md:text-sm font-black text-gray-900">₹ {formatInr(originalPrice)}</span>
                </div>

                {/* Product Discount */}
                {productDiscount > 0 && (
                  <div className="flex justify-between items-center bg-orange-50/60 p-2 sm:p-3 md:p-4 rounded-lg sm:rounded-xl border border-orange-200/60">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="text-orange-600 font-black text-sm">📉</span>
                      <span className="text-[10px] sm:text-xs md:text-sm font-semibold text-gray-700">Store Discount</span>
                    </div>
                    <span className="text-[10px] sm:text-xs md:text-sm font-black text-orange-600">- ₹ {formatInr(productDiscount)}</span>
                  </div>
                )}

                {/* Divider */}
                <div className="h-0.5 bg-gradient-to-r from-transparent via-gray-300 to-transparent my-1 sm:my-2"></div>

                {/* Unit Price */}
                <div className="flex justify-between items-center bg-white p-2 sm:p-3 md:p-4 rounded-lg sm:rounded-xl border-2 border-[#2874f0]/20">
                  <span className="text-[10px] sm:text-xs md:text-sm font-bold text-gray-800">Unit Price</span>
                  <span className="text-sm sm:text-base md:text-lg font-black text-[#2874f0]">₹ {formatInr(unitPrice)}</span>
                </div>

                {/* Coupon Section */}
                {hasCoupon && (
                  <>
                    <div className="flex justify-between items-center bg-green-50/60 p-2 sm:p-3 md:p-4 rounded-lg sm:rounded-xl border-2 border-green-200/60 mt-2 sm:mt-3">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <span className="text-base sm:text-lg font-black text-green-600 flex-shrink-0">🎟️</span>
                        <div className="min-w-0">
                          <p className="text-[8px] sm:text-[9px] font-black text-green-700 uppercase tracking-widest">Coupon</p>
                          <p className="text-[10px] sm:text-xs font-mono font-black text-green-800 mt-0.5 truncate">{order?.coupon_code}</p>
                        </div>
                      </div>
                      <span className="text-sm font-black text-green-600 flex-shrink-0">✓</span>
                    </div>

                    <div className="flex justify-between items-center bg-green-50/60 p-2 sm:p-3 md:p-4 rounded-lg sm:rounded-xl border border-green-200/60">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <span className="text-green-600 font-black text-sm">✂️</span>
                        <span className="text-[10px] sm:text-xs md:text-sm font-semibold text-gray-700">Coupon Discount</span>
                      </div>
                      <span className="text-[10px] sm:text-xs md:text-sm font-black text-green-600">- ₹ {formatInr(discountAmount)}</span>
                    </div>
                  </>
                )}

                {!hasCoupon && discountAmount > 0 && (
                  <div className="flex justify-between items-center bg-green-50/60 p-2 sm:p-3 md:p-4 rounded-lg sm:rounded-xl border border-green-200/60">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="text-green-600 font-black text-sm">✂️</span>
                      <span className="text-[10px] sm:text-xs md:text-sm font-semibold text-gray-700">Discount</span>
                    </div>
                    <span className="text-[10px] sm:text-xs md:text-sm font-black text-green-600">- ₹ {formatInr(discountAmount)}</span>
                  </div>
                )}

                {/* Final Total */}
                <div className="flex justify-between items-center bg-gradient-to-r from-[#2874f0]/10 to-blue-600/10 p-2.5 sm:p-3 md:p-5 rounded-lg sm:rounded-xl border-2 border-[#2874f0]/40 mt-2 sm:mt-3 md:mt-4">
                  <span className="text-xs sm:text-sm md:text-base font-black text-gray-900 uppercase">💳 You Paid</span>
                  <span className="text-base sm:text-lg md:text-2xl font-black text-[#2874f0]">₹ {formatInr(finalPrice)}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t-2 border-gray-200 pt-3 sm:pt-4 md:pt-6 text-center mt-auto print:mt-auto pb-2">
              <p className="text-[8px] sm:text-xs text-gray-600 font-black uppercase tracking-widest">✓ Computer Generated</p>
              <p className="text-[8px] sm:text-xs text-gray-500 font-semibold mt-1 sm:mt-2">Instant delivery • No refund</p>
            </div>
          </div>
        </div>

        <div className="print:hidden p-3 sm:p-4 md:p-6 bg-gradient-to-r from-gray-50 to-gray-100 border-t flex justify-end gap-2 sm:gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 rounded-lg sm:rounded-xl text-[11px] sm:text-xs md:text-sm font-black text-gray-700 uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-4 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 bg-gradient-to-r from-[#2874f0] to-blue-600 text-white rounded-lg sm:rounded-xl text-[11px] sm:text-xs md:text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-500/30 active:scale-95 transition-all flex items-center gap-1.5 sm:gap-2 hover:shadow-xl"
          >
            <i className="fas fa-print text-sm"></i>
            Print
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0 !important;
          }

          html, body {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            overflow: hidden !important;
          }

          body * {
            visibility: hidden;
          }

          .invoice-overlay, .invoice-overlay * {
            visibility: visible;
          }

          .invoice-overlay {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            display: block !important;
            background: #fff !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
          }

          .invoice-shell {
            width: 210mm !important;
            height: 297mm !important;
            max-width: none !important;
            max-height: none !important;
            display: block !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            overflow: hidden !important;
          }
          
          .invoice-scroll {
            width: 210mm !important;
            height: 297mm !important;
            max-height: none !important;
            overflow: hidden !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }

          #invoice-sheet {
            width: 210mm !important;
            height: 297mm !important;
            max-width: none !important;
            display: flex !important;
            flex-direction: column !important;
            margin: 0 !important;
            padding: 12mm !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            box-sizing: border-box !important;
            page-break-inside: avoid;
            overflow: hidden !important;
          }

          /* Compress vertical spacing to guarantee 1-page fit */
          #invoice-sheet [class*="mb-"] { margin-bottom: 2mm !important; }
          #invoice-sheet [class*="pb-"] { padding-bottom: 2mm !important; }
          #invoice-sheet [class*="pt-"] { padding-top: 2mm !important; }
          #invoice-sheet [class*="mt-"] { margin-top: 1mm !important; }
          #invoice-sheet [class*="p-"] { padding: 2mm !important; }
          #invoice-sheet [class*="gap-"] { gap: 2mm !important; }
          
          #invoice-sheet .mt-auto { margin-top: auto !important; }
          #invoice-sheet .print\\:mt-auto { margin-top: auto !important; }
          
          #invoice-sheet .h-24, #invoice-sheet .sm\\:h-28, #invoice-sheet .md\\:h-32 {
            height: 20mm !important;
          }

          /* Force exact colors for all elements inside the invoice */
          #invoice-sheet * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Fix line-clamp overlap in print */
          #invoice-sheet .line-clamp-2 {
            -webkit-line-clamp: unset !important;
            display: block !important;
            overflow: visible !important;
          }

          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

