import React, { useState, useEffect, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../App.tsx';
import { Product } from '../../types.ts';
import { supabase } from '../../lib/supabase.ts';
import { toast } from 'react-hot-toast';
import { InvoiceModal } from '../../components/InvoiceModal.tsx';
import { AdComponent } from '../../components/AdComponent.tsx';
import { 
  canOrderDownload, 
  getRemainingDownloads, 
  resolveDownloadUrl, 
  incrementDownloadCountByUserProduct
} from '../../lib/downloadAccess.ts';

export const Dashboard: React.FC = () => {
  const { user, downloadLimitsEnabled } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingOrder, setSyncingOrder] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const formatInr = (amount: number) => {
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  };

  const resolvePaidAmount = (order: any, product: Product | null) => {
    const finalPrice = Number(order?.final_price);
    const unitPrice = Number(order?.unit_price);
    const productPrice = Number(product?.price);
    const discountAmount = Number(order?.discount_amount || 0);
    const hasCoupon = Boolean(order?.coupon_code);

    if (Number.isFinite(finalPrice) && finalPrice > 0) return finalPrice;

    if (
      hasCoupon &&
      Number.isFinite(finalPrice) &&
      finalPrice === 0 &&
      Number.isFinite(unitPrice) &&
      unitPrice > 0 &&
      discountAmount >= unitPrice
    ) {
      return 0;
    }

    if (Number.isFinite(unitPrice) && unitPrice > 0) return unitPrice;
    if (Number.isFinite(productPrice) && productPrice >= 0) return productPrice;
    return 0;
  };

  const fetchOrders = async (showToast = false) => {
    if (!user) return;
    if (showToast) setRefreshing(true);
    
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          product:products (*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'paid')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      
      if (error) throw error;
      const latestByProduct: Record<string, any> = {};
      (data || []).forEach((order: any) => {
        const key = order.product_id || order.id;
        if (!latestByProduct[key]) latestByProduct[key] = order;
      });
      setOrders(Object.values(latestByProduct));
      if (showToast) toast.success('Orders Refreshed');
    } catch (err: any) {
      console.error('Error fetching orders:', err);
      toast.error('Sync failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`orders-live-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` },
        () => fetchOrders(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const paymentId = new URLSearchParams(location.search).get('payment_id');
    if (!paymentId) return;

    let alive = true;
    const runSync = async () => {
      setSyncingOrder(true);
      const startedAt = Date.now();
      const timeoutMs = 30000;
      let found = false;

      while (alive && !found && Date.now() - startedAt < timeoutMs) {
        const { data, error } = await supabase
          .from('orders')
          .select('id')
          .eq('user_id', user.id)
          .eq('payment_id', paymentId)
          .eq('status', 'paid')
          .limit(1);

        if (!error && data && data.length > 0) {
          found = true;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      if (alive) {
        await fetchOrders();
        if (!found) {
          toast('Payment captured. Order sync is taking longer than expected.', { icon: 'ℹ️' });
        }
        setSyncingOrder(false);
        navigate('/dashboard', { replace: true });
      }
    };

    runSync();
    return () => {
      alive = false;
    };
  }, [location.search, user?.id]);

  const handleDownload = async (order: any) => {
    // Check Download Access Limits First
    const { allowed, reason } = canOrderDownload(order, { ignoreLimit: !downloadLimitsEnabled });
    if (!allowed) {
      toast.error(reason || 'Download not allowed');
      return;
    }

    const product = Array.isArray(order.product) ? order.product[0] : order.product;
    const fileUrl = String(product?.file_url || '').trim();

    if (!fileUrl) {
      toast.error("Download link is being prepared...");
      return;
    }

    const { url, error } = await resolveDownloadUrl(fileUrl);
    
    if (error || !url) {
      toast.error(error || "Download unavailable right now. Please contact support.");
      return;
    }

    // Increment Database Download Count
    const currentCount = order.download_count || 0;
    const { ok, newCount } = user?.id && product?.id
      ? await incrementDownloadCountByUserProduct(user.id, product.id, currentCount, { ignoreLimit: !downloadLimitsEnabled })
      : { ok: false, newCount: currentCount };

    if (!ok) {
      toast.error('Unable to track download right now. Please try again.');
      return;
    }

    // Instantly update UI without needing to refresh
    setOrders(prev => prev.map(o => (o.product_id === order.product_id || o.id === order.id) ? { ...o, download_count: newCount } : o));

    toast.success('Download started');
    window.open(url, '_blank');
  };

  const getProductInfo = (productData: any): Product | null => {
    if (!productData) return null;
    return Array.isArray(productData) ? productData[0] : productData;
  };

  // Filter orders based on search query
  const filteredOrders = orders.filter(order => {
    if (!searchQuery.trim()) return true;
    
    const product = getProductInfo(order.product);
    const searchLower = searchQuery.toLowerCase();
    
    return (
      product?.title?.toLowerCase().includes(searchLower) ||
      order.id?.toLowerCase().includes(searchLower) ||
      order.payment_id?.toLowerCase().includes(searchLower)
    );
  });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <i className="fas fa-circle-notch fa-spin text-4xl text-[#2874f0]"></i>
    </div>
  );

  return (
    <div className="bg-[#f1f3f6] min-h-screen py-4 md:py-8">
      <div className="max-w-5xl mx-auto px-3">
        {syncingOrder && (
          <div className="mb-4 bg-blue-50 border border-blue-100 text-[#2874f0] px-4 py-3 rounded-sm text-xs font-black uppercase tracking-widest flex items-center gap-2">
            <i className="fas fa-circle-notch fa-spin"></i>
            Syncing your latest order...
          </div>
        )}

        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-[#2874f0] font-bold text-xs uppercase tracking-tight hover:underline"
          >
            <i className="fas fa-arrow-left text-[10px]"></i>
            Back
          </button>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-sm fk-shadow mb-4">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">My Orders</h1>
        </div>

        {/* Search Bar */}
        {orders.length > 0 && (
          <div className="bg-white p-4 rounded-sm fk-shadow mb-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by product name, order ID, or payment ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-10 py-3 border border-gray-200 rounded-sm text-sm font-medium placeholder-gray-400 focus:outline-none focus:border-[#2874f0] focus:ring-2 focus:ring-blue-100 transition-all"
              />
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="mt-2 text-xs text-gray-500 font-medium">
                <i className="fas fa-filter mr-1"></i>
                Showing {filteredOrders.length} of {orders.length} orders
              </p>
            )}
          </div>
        )}

        {/* Personalized Ad */}
        <AdComponent placement="dashboard" limit={isDesktop ? 4 : 2} />

        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="bg-white rounded-sm fk-shadow p-12 text-center">
              <img 
                src="https://static-assets-web.flixcart.com/fk-p-linchpin-web/fk-cp-zion/img/myorders-empty_831518.png" 
                className="w-48 mx-auto mb-6 opacity-80" 
                alt="Empty"
                loading="lazy"
                decoding="async"
              />
              <h3 className="text-lg font-bold mb-2">You haven't ordered anything yet!</h3>
              <p className="text-sm text-gray-400 mb-8">Unlock premium digital assets to see them here.</p>
              <Link to="/" className="bg-[#2874f0] text-white px-10 py-3 rounded-sm font-bold text-sm shadow-lg">
                Go to Store
              </Link>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white rounded-sm fk-shadow p-12 text-center">
              <i className="fas fa-search text-6xl text-gray-300 mb-6"></i>
              <h3 className="text-lg font-bold mb-2">No orders found</h3>
              <p className="text-sm text-gray-400 mb-6">No orders match your search "{searchQuery}"</p>
              <button 
                onClick={() => setSearchQuery('')}
                className="bg-[#2874f0] text-white px-8 py-2.5 rounded-sm font-bold text-sm shadow-lg hover:bg-[#1e5bc6] active:scale-95 transition-all"
              >
                Clear Search
              </button>
            </div>
          ) : (
            filteredOrders.map(order => {
              const product = getProductInfo(order.product);
              const paidAmount = resolvePaidAmount(order, product);
              const paidAmountLabel = formatInr(paidAmount);
              
              // Calculate Access Limits
              const remaining = getRemainingDownloads(order, { ignoreLimit: !downloadLimitsEnabled });
              const { allowed } = canOrderDownload(order, { ignoreLimit: !downloadLimitsEnabled });
              
              // Dynamic Button Text
              let downloadText = 'Download Asset';
              if (!allowed) {
                  downloadText = 'Limit Reached / Cancelled';
              } else if (remaining !== null) {
                  downloadText = `Download (${remaining} Left)`;
              }

              return (
                <div key={order.id} className="bg-white rounded-sm fk-shadow overflow-hidden group border border-transparent hover:border-blue-100 transition-colors">
                  <div className="flex flex-col md:flex-row p-4 md:p-6 gap-6">
                    <div 
                      onClick={() => navigate(`/product/${product?.id}`)}
                      className="w-full md:w-32 h-32 flex-shrink-0 bg-gray-50 rounded-sm overflow-hidden p-2 flex items-center justify-center border border-gray-100 cursor-pointer hover:border-blue-300 transition-colors"
                    >
                      <img 
                        src={product?.preview_image} 
                        alt={product?.title} 
                        loading="lazy"
                        decoding="async"
                        className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>

                    <div className="flex-grow flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-sm uppercase tracking-widest">
                            <i className="fas fa-check-circle mr-1"></i> Paid
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                            Order ID: {order.id || 'N/A'}
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold tracking-tight font-mono">
                            Payment ID: {order.payment_id || 'N/A'}
                          </span>
                          {new Date().getTime() - new Date(order.created_at).getTime() < 300000 && (
                            <span className="bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase animate-pulse">
                              New Order
                            </span>
                          )}
                        </div>
                        <h3 
                          onClick={() => navigate(`/product/${product?.id}`)}
                          className="text-base md:text-lg font-bold text-gray-900 group-hover:text-[#2874f0] transition-colors cursor-pointer hover:underline"
                        >
                          {product?.title || 'Unknown Product'}
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
                          <span className="flex items-center gap-1">
                            <i className="far fa-calendar-alt"></i>
                            {new Date(order.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="text-gray-900 font-bold">₹{paidAmountLabel}</span>
                          {order.coupon_code && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span className="text-green-700 font-black uppercase text-[10px]">{order.coupon_code}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-6 flex flex-wrap gap-3">
                        {/* Download Button with Dynamic Styles */}
                        <button 
                          onClick={() => handleDownload(order)}
                          disabled={!allowed}
                          className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-2.5 rounded-sm text-sm font-bold shadow-md transition-all ${
                            allowed 
                              ? 'bg-[#fb641b] text-white hover:bg-[#e65a18] active:scale-95' 
                              : 'bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300'
                          }`}
                        >
                          <i className={`fas ${allowed ? 'fa-cloud-arrow-down' : 'fa-lock'}`}></i>
                          {downloadText}
                        </button>
                        <button 
                          onClick={() => {
                            setSelectedOrder(order);
                            setInvoiceOpen(true);
                          }}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-[#2874f0] border border-blue-100 px-6 py-2.5 rounded-sm text-sm font-bold hover:bg-blue-50 active:scale-95 transition-all"
                        >
                          <i className="fas fa-file-invoice"></i>
                          Invoice
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${allowed ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                      <span className={`text-[11px] font-bold uppercase tracking-widest ${allowed ? 'text-gray-600' : 'text-red-500'}`}>
                        Access Status: {allowed ? 'Active & Ready' : 'Restricted / Limit Exceeded'}
                      </span>
                    </div>
                    <button 
                      onClick={() => navigate('/support')}
                      className="text-[11px] font-black text-[#2874f0] uppercase tracking-widest cursor-pointer hover:underline transition-colors"
                    >
                      Need Help?
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {user && (
        <InvoiceModal 
          isOpen={invoiceOpen} 
          onClose={() => setInvoiceOpen(false)} 
          order={selectedOrder} 
          user={user} 
        />
      )}
    </div>
  );
};

