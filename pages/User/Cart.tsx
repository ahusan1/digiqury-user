import React, { useContext, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../App.tsx';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase.ts';
import { clearPendingResumeAction, getCurrentPath, getPendingResumeAction, setPendingResumeAction, withQueryParams } from '../../lib/loginRedirect.ts';
import { ensureRazorpayLoaded } from '../../lib/razorpay.ts';
import { getCachedSetting, getCachedSettingBoolean } from '../../lib/settingsCache.ts';

export const Cart: React.FC = () => {
  const { cart, removeFromCart, clearCart, user, refreshPurchases } = useContext(AuthContext);
  const [processing, setProcessing] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Dynamic Price Calculations
  const subtotal = cart.reduce((acc, item) => acc + (item.price || 0), 0);
  const originalTotal = cart.reduce((acc, item) => acc + (item.original_price || item.price || 0), 0);
  const totalItems = cart.length;
  const savings = Math.max(0, originalTotal - subtotal);
  const couponDiscount = useMemo(() => {
    if (!appliedCoupon || subtotal <= 0) return 0;
    if (subtotal < Number(appliedCoupon.min_cart_value || 0)) return 0;
    const percentDiscount = Number(appliedCoupon.discount_percent || 0) > 0
      ? (subtotal * Number(appliedCoupon.discount_percent)) / 100
      : 0;
    const flatDiscount = Number(appliedCoupon.discount_amount || 0) > 0
      ? Number(appliedCoupon.discount_amount)
      : 0;
    let discount = percentDiscount > 0 ? percentDiscount : flatDiscount;
    const maxDiscount = Number(appliedCoupon.max_discount || 0);
    if (maxDiscount > 0) discount = Math.min(discount, maxDiscount);
    return Math.min(subtotal, Math.max(0, Number(discount.toFixed(2))));
  }, [appliedCoupon, subtotal]);
  const total = Math.max(0, Number((subtotal - couponDiscount).toFixed(2)));

  const applyCoupon = async () => {
    const normalizedCode = couponInput.trim().toUpperCase();
    if (!normalizedCode) {
      toast.error('Enter a coupon code');
      return;
    }

    setCouponLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', normalizedCode)
        .eq('is_active', true)
        .or(`valid_until.is.null,valid_until.gte.${nowIso}`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Invalid or expired coupon code');
      if (subtotal < Number(data.min_cart_value || 0)) {
        throw new Error(`Cart total should be at least ₹${Number(data.min_cart_value || 0)}`);
      }
      if (data.usage_limit && Number(data.used_count || 0) >= Number(data.usage_limit)) {
        throw new Error('Coupon usage limit reached');
      }

      setAppliedCoupon(data);
      toast.success(`Coupon ${normalizedCode} applied`);
    } catch (err: any) {
      setAppliedCoupon(null);
      toast.error(err.message || 'Unable to apply coupon');
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
  };

  const createOrdersInstantly = async (paymentId: string, globalLimit: number | null): Promise<boolean> => {
    if (!user || !paymentId || cart.length === 0) return false;

    try {
      const productIds = cart.map(item => item.id);
      const { data: existingRows } = await supabase
        .from('orders')
        .select('product_id')
        .eq('user_id', user.id)
        .eq('payment_id', paymentId)
        .in('product_id', productIds);

      const existing = new Set((existingRows || []).map((row: any) => row.product_id));
      const pendingItems = cart.filter(item => !existing.has(item.id));
      if (pendingItems.length === 0) return true;

      const pendingSubtotal = pendingItems.reduce((acc, item) => acc + Number(item.price || 0), 0);
      const pendingCouponDiscount = Math.min(couponDiscount, pendingSubtotal);
      const pendingFinalTotal = Math.max(0, Number((pendingSubtotal - pendingCouponDiscount).toFixed(2)));
      const discountRatio = pendingSubtotal > 0 ? pendingCouponDiscount / pendingSubtotal : 0;
      let allocatedDiscount = 0;

      const enrichedRows = pendingItems.map((item, index) => {
        const unitPrice = Number(Number(item.price || 0).toFixed(2));
        let discountAmount = Number((unitPrice * discountRatio).toFixed(2));
        if (index === pendingItems.length - 1) {
          discountAmount = Number((pendingCouponDiscount - allocatedDiscount).toFixed(2));
        }
        discountAmount = Math.min(unitPrice, Math.max(0, discountAmount));
        allocatedDiscount = Number((allocatedDiscount + discountAmount).toFixed(2));

        return {
          user_id: user.id,
          product_id: item.id,
          payment_id: paymentId,
          status: 'paid',
          unit_price: unitPrice,
          discount_amount: discountAmount,
          coupon_code: appliedCoupon?.code || null,
          final_price: Number((unitPrice - discountAmount).toFixed(2)),
          order_subtotal: Number(pendingSubtotal.toFixed(2)),
          order_discount_total: Number(pendingCouponDiscount.toFixed(2)),
          order_final_total: pendingFinalTotal,
          download_limit: globalLimit,
          download_count: 0
        };
      });

      const { error: enrichedInsertError } = await supabase.from('orders').insert(enrichedRows);
      if (!enrichedInsertError) return true;

      const legacyRows = pendingItems.map(item => ({
        user_id: user.id,
        product_id: item.id,
        payment_id: paymentId,
        status: 'paid',
        download_limit: globalLimit,
        download_count: 0
      }));

      const { error: legacyInsertError } = await supabase.from('orders').insert(legacyRows);
      return !legacyInsertError;
    } catch {
      return false;
    }
  };

  const handleCheckout = async () => {
    if (!user) {
      toast.error('Please login to place order');
      setPendingResumeAction({ type: 'autocheckout', path: location.pathname });
      const from = withQueryParams(getCurrentPath(location), { autocheckout: 1 });
      navigate('/login', { state: { from } });
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || session.user.id !== user.id) {
      setPendingResumeAction({ type: 'autocheckout', path: location.pathname });
      const from = withQueryParams(getCurrentPath(location), { autocheckout: 1 });
      navigate('/login', { state: { from } });
      return;
    }

    if (cart.length === 0) return;

    setProcessing(true);
    try {
      const sdkLoaded = await ensureRazorpayLoaded();
      if (!sdkLoaded) {
        throw new Error('Payment gateway failed to load. Please try again.');
      }

      // 1. Fetch Razorpay key
      const { data: keySetting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'razorpay_key_id')
        .maybeSingle();

      if (!keySetting?.value || keySetting.value.includes('your_key_here')) {
        throw new Error('Payment gateway is not configured by the administrator.');
      }

      const limitEnabled = await getCachedSettingBoolean('download_limit_enabled', true, 300);
      let globalLimit: number | null = null;
      if (limitEnabled) {
        const limitSetting = await getCachedSetting('default_download_limit', 300);
        const parsedLimit = parseInt(limitSetting || '', 10);
        globalLimit = isNaN(parsedLimit) ? null : parsedLimit;
      }

      const options = {
        key: keySetting.value, 
        amount: Math.round(total * 100),
        currency: 'INR',
        name: 'DIGi QuRY Checkout',
        description: `Order for ${totalItems} premium digital assets`,
        notes: {
          user_id: user.id,
          product_ids: cart.map(item => item.id).join(','),
          coupon_code: appliedCoupon?.code || '',
          subtotal: subtotal.toFixed(2),
          coupon_discount: couponDiscount.toFixed(2),
          final_total: total.toFixed(2),
          download_limit: globalLimit !== null ? globalLimit.toString() : '',
          download_limit_enabled: limitEnabled ? '1' : '0'
        },
        handler: async (response: any) => {
          toast.success('Payment Successful! Finalizing your order...');
          const paymentId = response?.razorpay_payment_id;
          let synced = false;

          if (paymentId) {
            const instantInsertOk = await createOrdersInstantly(paymentId, globalLimit);
            synced = instantInsertOk;
          }

          const startedAt = Date.now();
          const timeoutMs = 30000;

          const waitForOrderSync = async () => {
            if (!paymentId || !user?.id) return false;
            const { data, error } = await supabase
              .from('orders')
              .select('id')
              .eq('user_id', user.id)
              .eq('payment_id', paymentId)
              .limit(1);

            if (error) return false;
            return Boolean(data && data.length > 0);
          };

          while (!synced && Date.now() - startedAt < timeoutMs) {
            synced = await waitForOrderSync();
            if (!synced) {
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          }

          clearCart();
          await refreshPurchases();
          if (!synced) {
            toast('Payment verified. Your order may take a few more seconds to appear.', { icon: 'ℹ️' });
          }
          navigate(paymentId ? `/dashboard?payment_id=${encodeURIComponent(paymentId)}` : '/dashboard');
        },
        prefill: { 
          name: user.name, 
          email: user.email,
          contact: user.phone || ''
        },
        theme: { color: '#2874f0' },
        modal: {
          ondismiss: () => setProcessing(false)
        }
      };
      
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      toast.error(err.message || 'Checkout failed');
      setProcessing(false);
    }
  };

  React.useEffect(() => {
    if (!user || processing || cart.length === 0) return;

    const shouldResumeCheckout = new URLSearchParams(location.search).get('autocheckout') === '1';
    if (!shouldResumeCheckout) return;

    const pendingAction = getPendingResumeAction();
    if (!pendingAction || pendingAction.type !== 'autocheckout' || pendingAction.path !== location.pathname) {
      return;
    }

    const cleanPath = withQueryParams(getCurrentPath(location), { autocheckout: null });
    navigate(cleanPath, { replace: true });
    clearPendingResumeAction();
    handleCheckout();
  }, [user, processing, cart.length, location.pathname, location.search, location.hash]);

  if (cart.length === 0) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-20 text-center bg-[#f8fafc]">
        {/* Back Button for Empty Cart */}
        <div className="fixed top-20 left-4 md:left-8 z-50">
          <button 
            onClick={() => navigate('/')}
            className="bg-white p-3 rounded-2xl text-gray-400 hover:text-[#2874f0] transition-all fk-shadow border border-gray-50 active:scale-90"
          >
            <i className="fas fa-arrow-left"></i>
          </button>
        </div>
        
        <div className="relative mb-10">
          <div className="w-48 h-48 md:w-64 md:h-64 bg-blue-50 rounded-full flex items-center justify-center animate-pulse">
            <i className="fas fa-shopping-basket text-blue-200 text-6xl md:text-8xl"></i>
          </div>
          <div className="absolute bottom-4 right-4 bg-white p-4 rounded-3xl shadow-2xl border border-gray-50">
            <i className="fas fa-search-plus text-[#2874f0] text-2xl"></i>
          </div>
        </div>
        <h2 className="text-3xl font-black text-gray-900 mb-3 tracking-tight italic">Your cart is empty!</h2>
        <p className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-10 max-w-sm">
          It looks like you haven't added any premium assets to your cart yet.
        </p>
        <Link 
          to="/" 
          className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-12 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/30 hover:shadow-blue-500/50 transition-all active:scale-95"
        >
          Explore Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-[#f1f3f6] min-h-screen py-6 md:py-10">
      <div className="max-w-7xl mx-auto px-4">
        {/* Navigation */}
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => navigate('/')}
            className="bg-white p-3 rounded-2xl text-gray-400 hover:text-[#2874f0] transition-all fk-shadow border border-gray-50 active:scale-90"
          >
            <i className="fas fa-arrow-left"></i>
          </button>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">Checkout</h1>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-2 flex items-center gap-2">
              <i className="fas fa-lock text-green-500"></i> Secure Checkout Sequence
            </p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Cart Items List */}
          <div className="w-full lg:w-[65%] space-y-6">
            <div className="bg-white rounded-[2.5rem] fk-shadow border border-gray-50 overflow-hidden">
              <div className="p-6 md:p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
                <h2 className="text-lg font-black text-gray-900 italic">My Cart ({totalItems} items)</h2>
                <div className="hidden sm:flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-full">
                  <i className="fas fa-cloud-arrow-down text-[#2874f0] text-xs"></i>
                  <span className="text-[10px] font-black text-[#2874f0] uppercase tracking-tighter">Instant Delivery Enabled</span>
                </div>
              </div>

              <div className="divide-y divide-gray-50">
                {cart.map((item) => {
                  const itemDiscount = Math.round(((item.original_price - item.price) / item.original_price) * 100);
                  return (
                    <div key={item.id} className="p-6 md:p-8 flex flex-col sm:flex-row gap-6 hover:bg-gray-50/20 transition-colors group">
                      <div 
                        className="w-full sm:w-32 h-32 flex-shrink-0 bg-white border border-gray-100 rounded-[1.5rem] p-4 flex items-center justify-center cursor-pointer overflow-hidden shadow-sm group-hover:rotate-1 transition-transform"
                        onClick={() => navigate(`/product/${item.id}`)}
                      >
                        <img 
                          src={item.preview_image} 
                          alt={item.title} 
                          loading="lazy"
                          decoding="async"
                          className="max-h-full max-w-full object-contain group-hover:scale-110 transition-transform duration-700" 
                        />
                      </div>
                      <div className="flex-grow flex flex-col justify-between py-1">
                        <div>
                          <div className="flex justify-between items-start gap-4">
                            <h3 
                              className="text-lg font-black text-gray-900 group-hover:text-[#2874f0] transition-colors cursor-pointer leading-tight truncate max-w-[280px]"
                              onClick={() => navigate(`/product/${item.id}`)}
                            >
                              {item.title}
                            </h3>
                            <button 
                              onClick={() => removeFromCart(item.id)}
                              className="w-10 h-10 rounded-2xl bg-gray-50 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-90"
                              title="Remove item"
                            >
                              <i className="fas fa-trash-alt text-sm"></i>
                            </button>
                          </div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 italic">{item.category}</p>
                          <div className="flex items-center gap-3 mt-4">
                            <span className="text-2xl font-black text-gray-900 tracking-tight">₹{item.price}</span>
                            {item.original_price > item.price && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-400 line-through font-bold opacity-60">₹{item.original_price}</span>
                                <span className="text-xs font-black text-[#388e3c] bg-green-50 px-2 py-0.5 rounded uppercase">{itemDiscount}% Off</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-6 flex items-center gap-1.5 text-[10px] text-gray-400 font-black uppercase tracking-tighter">
                          <i className="fas fa-check-circle text-green-500"></i> Lifetime Updates Guaranteed
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quality Promise */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { icon: 'fa-shield-halved', title: 'Secure Vault', desc: 'Encrypted downloads' },
                { icon: 'fa-certificate', title: 'Authentic', desc: 'Verified source files' },
                { icon: 'fa-headset', title: 'Expert Care', desc: 'Premium support' }
              ].map((item, i) => (
                <div key={i} className="bg-white p-5 rounded-[1.5rem] border border-gray-100 flex items-center gap-4 fk-shadow">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2874f0] flex items-center justify-center text-sm shadow-inner">
                    <i className={`fas ${item.icon}`}></i>
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-gray-900 leading-none uppercase tracking-widest mb-1">{item.title}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter leading-none">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Details Sidebar */}
          <div className="w-full lg:w-[35%] sticky top-24">
            <div className="bg-white rounded-[2.5rem] fk-shadow border border-gray-50 overflow-hidden">
              <div className="p-8 border-b border-gray-50 bg-gray-50/30">
                <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Order Summary</h2>
                <p className="text-sm font-black text-gray-900 italic">Financial Breakdown</p>
              </div>
              
              <div className="p-8 space-y-5">
                <div className="flex justify-between items-center text-sm font-bold text-gray-600">
                  <span className="flex items-center gap-2">
                    Subtotal <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{totalItems} items</span>
                  </span>
                  <span className="text-gray-900">₹{originalTotal}</span>
                </div>
                
                <div className="flex justify-between items-center text-sm font-bold">
                  <span className="text-gray-600">Bundle Discount</span>
                  <span className="text-[#388e3c] font-black">- ₹{savings}</span>
                </div>

                <div className="flex justify-between items-center text-sm font-bold">
                  <span className="text-gray-600">Platform Handling</span>
                  <span className="text-[#388e3c] font-black uppercase tracking-tighter">Free Unlock</span>
                </div>

                <div className="rounded-2xl border border-gray-200 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="Coupon code"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold uppercase outline-none"
                    />
                    <button
                      onClick={applyCoupon}
                      disabled={couponLoading}
                      className="px-4 py-2 rounded-xl bg-[#2874f0] text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50"
                    >
                      {couponLoading ? '...' : 'Apply'}
                    </button>
                  </div>
                  {appliedCoupon && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-green-700 font-black uppercase">{appliedCoupon.code} applied</span>
                      <button onClick={removeCoupon} className="text-red-500 font-black uppercase text-[10px]">Remove</button>
                    </div>
                  )}
                </div>

                {couponDiscount > 0 && (
                  <div className="flex justify-between items-center text-sm font-bold">
                    <span className="text-gray-600">Coupon Discount</span>
                    <span className="text-[#388e3c] font-black">- ₹{couponDiscount}</span>
                  </div>
                )}

                <div className="pt-6 mt-2 border-t border-dashed border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-black text-gray-900 italic tracking-tight">Net Payable</span>
                    <span className="text-3xl font-black text-[#2874f0] tracking-tight">₹{total}</span>
                  </div>
                </div>

                {savings > 0 && (
                  <div className="bg-green-50/50 p-4 rounded-2xl border border-green-100 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                      <i className="fas fa-tags text-xs"></i>
                    </div>
                    <p className="text-[11px] font-black text-green-700 leading-tight">
                      Great Choice! You're saving <span className="text-lg">₹{savings}</span> on this premium acquisition.
                    </p>
                  </div>
                )}
                
                <button 
                  onClick={handleCheckout}
                  disabled={processing}
                  className="w-full bg-[#fb641b] hover:bg-[#e65a18] text-white py-5 rounded-2xl font-black text-sm uppercase tracking-[0.1em] shadow-2xl shadow-orange-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3 mt-4"
                >
                  {processing ? (
                    <i className="fas fa-circle-notch fa-spin"></i>
                  ) : (
                    <>
                      <i className="fas fa-shield-check"></i>
                      Confirm & Pay Securely
                    </>
                  )}
                </button>

                <p className="text-[10px] text-center text-gray-400 font-bold uppercase tracking-widest mt-4">
                  Secured by 256-bit SSL encryption
                </p>
              </div>
            </div>

            {/* Cart Footer */}
            <div className="mt-8 px-8 text-center">
              <p className="text-[11px] text-gray-400 font-bold uppercase leading-relaxed">
                By clicking confirm, you agree to DIGi QuRY's <span className="text-blue-500 cursor-pointer hover:underline">Digital Asset License</span> and <span className="text-blue-500 cursor-pointer hover:underline">Refund Policy</span>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

