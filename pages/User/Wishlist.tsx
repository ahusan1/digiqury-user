import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../App.tsx';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase.ts';
import { canOrderDownload, resolveDownloadUrl, incrementOrderDownloadCount } from '../../lib/downloadAccess.ts';
import { downloadAssetToDevice } from '../../lib/downloadedAssets.ts';

export const Wishlist: React.FC = () => {
  const { wishlist, toggleWishlist, addToCart, isInCart, isPurchased, user, refreshPurchases, downloadLimitsEnabled } = useContext(AuthContext);
  const navigate = useNavigate();
  const [clearing, setClearing] = useState(false);

  const handleAddToCart = (product: any) => {
    if (isInCart(product.id)) {
      navigate('/cart');
    } else {
      addToCart(product);
      toast.success('Moved to Cart');
    }
  };

  const handleDownload = async (product: any) => {
    if (!user) {
      toast.error('Please login first.');
      return;
    }

    if (!product.file_url) {
      toast.error("Download link is being prepared...");
      return;
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id,download_count,download_limit,license_active,status')
      .eq('user_id', user.id)
      .eq('product_id', product.id)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderError || !order) {
      toast.error('Purchase record not found.');
      return;
    }

    const { allowed, reason } = canOrderDownload(order as any, { ignoreLimit: !downloadLimitsEnabled });
    if (!allowed) {
      toast.error(reason || 'Download not allowed.');
      return;
    }

    const { url, error } = await resolveDownloadUrl(product.file_url || '');

    if (error || !url) {
      toast.error(error || 'Download unavailable right now.');
      return;
    }

    const currentCount = order.download_count || 0;
    const { ok } = await incrementOrderDownloadCount(order.id, currentCount, { ignoreLimit: !downloadLimitsEnabled });

    if (!ok) {
      toast.error('Unable to track download right now. Please try again.');
      return;
    }

    await refreshPurchases();

    try {
      await downloadAssetToDevice({
        userId: user.id,
        productId: String(product.id),
        title: String(product.title || 'Asset'),
        sourceUrl: url,
        previewImage: String(product.preview_image || ''),
      });
      toast.success('Asset saved to your device');
    } catch (downloadError) {
      console.error('Device download failed:', downloadError);
      toast.error('Download failed on this device. Please try again.');
    }
  };

  const handleClearWishlist = async () => {
    if (!user || wishlist.length === 0) return;
    if (!window.confirm('Are you sure you want to clear your entire wishlist?')) return;

    setClearing(true);
    try {
      const { error } = await supabase
        .from('wishlist')
        .delete()
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      window.location.reload(); 
    } catch (err) {
      toast.error('Failed to clear wishlist');
    } finally {
      setClearing(false);
    }
  };

  const calculateDiscount = (orig: number, sale: number) => {
    if (!orig || orig <= sale) return 0;
    return Math.round(((orig - sale) / orig) * 100);
  };

  if (!user) return null;

  return (
    <div className="bg-[#f1f3f6] min-h-screen py-4 md:py-8">
      <div className="max-w-5xl mx-auto px-2 md:px-4">
        
        <div className="flex items-center justify-between mb-4">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-[#2874f0] font-black text-[10px] md:text-xs uppercase tracking-widest hover:underline"
          >
            <i className="fas fa-arrow-left"></i>
            Back
          </button>
          
          {wishlist.length > 0 && (
            <button 
              onClick={handleClearWishlist}
              disabled={clearing}
              className="text-gray-400 hover:text-red-500 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
            >
              {clearing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash-can"></i>}
              Clear All
            </button>
          )}
        </div>

        <div className="bg-white fk-shadow rounded-sm overflow-hidden min-h-[60vh] flex flex-col">
          <div className="p-4 md:p-5 border-b flex items-center gap-3">
            <h1 className="text-base md:text-lg font-bold text-gray-900">My Wishlist</h1>
            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] md:text-xs font-black">
              {wishlist.length} Items
            </span>
          </div>

          {wishlist.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center py-20 px-4 text-center">
              <div className="relative mb-8">
                <div className="w-32 h-32 md:w-48 md:h-48 bg-blue-50 rounded-full flex items-center justify-center animate-pulse">
                  <i className="fas fa-heart text-blue-200 text-5xl md:text-7xl"></i>
                </div>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-gray-900 mb-2">Empty Wishlist!</h2>
              <Link 
                to="/" 
                className="bg-[#2874f0] text-white px-12 py-3.5 rounded-sm font-bold text-sm shadow-xl shadow-blue-500/20 hover:bg-[#1a5abf] transition-all uppercase tracking-tight"
              >
                Start Shopping
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {wishlist.map((product, idx) => {
                const owned = isPurchased(product.id);
                const discount = calculateDiscount(product.original_price, product.price);
                const inCart = isInCart(product.id);
                
                return (
                  <div key={product.id} className="p-4 md:p-6 group flex flex-col md:flex-row gap-4 md:gap-8 hover:bg-gray-50/50 transition-all duration-300">
                    <div 
                      className="w-full md:w-40 h-32 md:h-40 flex-shrink-0 bg-white rounded-md p-3 flex items-center justify-center cursor-pointer border border-gray-100 group-hover:shadow-md transition-all relative overflow-hidden"
                      onClick={() => navigate(`/product/${product.id}`)}
                    >
                      <img 
                        src={product.preview_image} 
                        className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-700" 
                        alt={product.title} 
                      />
                      {owned && (
                        <div className="absolute top-0 left-0 bg-[#388e3c] text-white text-[8px] font-black px-2 py-0.5 uppercase tracking-tighter">
                          Owned
                        </div>
                      )}
                    </div>

                    <div className="flex-grow flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1">
                            <h3 
                              className="text-sm md:text-base font-medium text-gray-900 group-hover:text-[#2874f0] transition-colors cursor-pointer leading-snug line-clamp-2"
                              onClick={() => navigate(`/product/${product.id}`)}
                            >
                              {product.title}
                            </h3>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{product.category}</span>
                            </div>
                          </div>
                          
                          <button 
                            onClick={() => toggleWishlist(product)}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                            title="Remove from wishlist"
                          >
                            <i className="fas fa-trash-alt text-sm"></i>
                          </button>
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                          <span className="text-xl md:text-2xl font-bold text-gray-900">₹{product.price}</span>
                          {product.original_price > product.price && (
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 line-through text-xs md:text-sm font-medium">₹{product.original_price}</span>
                              <span className="text-[#388e3c] text-xs md:text-sm font-bold">{discount}% OFF</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-6 flex flex-wrap gap-2 md:gap-4 border-t border-gray-50 pt-4">
                        {owned ? (
                          <button 
                            onClick={() => handleDownload(product)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#388e3c] text-white px-10 py-2.5 rounded-sm text-xs font-bold uppercase shadow-sm transition-all active:scale-95"
                          >
                            <i className="fas fa-cloud-arrow-down"></i>
                            Download Now
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleAddToCart(product)}
                            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-10 py-2.5 rounded-sm text-xs font-bold uppercase shadow-sm transition-all active:scale-95 ${
                              inCart 
                              ? 'bg-[#2874f0] text-white' 
                              : 'bg-[#ff9f00] text-white hover:bg-[#f39700]'
                            }`}
                          >
                            <i className={`fas ${inCart ? 'fa-arrow-right' : 'fa-cart-shopping'}`}></i>
                            {inCart ? 'Go to Cart' : 'Move to Cart'}
                          </button>
                        )}
                        <button 
                          onClick={() => navigate(`/product/${product.id}`)}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-200 px-8 py-2.5 rounded-sm text-xs font-bold uppercase hover:bg-gray-50 transition-all active:scale-95"
                        >
                          <i className="fas fa-eye"></i>
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
