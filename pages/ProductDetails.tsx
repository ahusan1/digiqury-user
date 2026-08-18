import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, Link, useNavigationType, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { toast } from 'react-hot-toast';
import { AuthContext } from '../App.tsx';
import { Product } from '../types.ts';
import { supabase, robustFetch, calculateDiscount } from '../lib/supabase.ts';
import { appCache } from '../lib/cache.ts';
import { getCachedSetting, getCachedSettingBoolean } from '../lib/settingsCache.ts';
import DOMPurify from 'dompurify';
import { canOrderDownload, getRemainingDownloads, resolveDownloadUrl, incrementDownloadCountByUserProduct } from '../lib/downloadAccess.ts';
import { AdComponent } from '../components/AdComponent.tsx';
import { ProductReviews } from '../components/ProductReviews.tsx';
import { clearPendingResumeAction, getCurrentPath, getPendingResumeAction, setPendingResumeAction, withQueryParams } from '../lib/loginRedirect.ts';
import { openRazorpayCheckout } from '../lib/razorpay.ts';
import { notifyPurchaseActivity } from '../lib/activityNotifications.ts';
import { downloadAssetToDevice } from '../lib/downloadedAssets.ts';
import { buildProductShareUrl } from '../lib/publicAppUrl.ts';

export const ProductDetails: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const { user, addToCart, isInCart, toggleWishlist, isInWishlist, isPurchased, refreshPurchases, purchasedOrders, downloadLimitsEnabled } = useContext(AuthContext);
  
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [sellerInfo, setSellerInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [shareCount, setShareCount] = useState(() => {
    if (!id) return 0;
    const saved = localStorage.getItem(`shares:${id}`);
    return saved ? parseInt(saved) : 0;
  });
  
  // Hero banner slider states
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [slideTransitionMs, setSlideTransitionMs] = useState(320);
  const carouselRef = React.useRef<HTMLDivElement>(null);
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState('');
  const [zoomImageIndex, setZoomImageIndex] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const zoomImageRef = React.useRef<HTMLDivElement>(null);
  const [zoomTouchStart, setZoomTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [zoomTouchEnd, setZoomTouchEnd] = useState<{ x: number; y: number } | null>(null);
  const [zoomStartTime, setZoomStartTime] = useState<number>(0);

  const normalizeImageUrl = (url?: string | null): string => {
    const raw = (url || '').trim();
    if (!raw) return '';
    if (raw.startsWith('data:')) return raw;
    try {
      const parsed = new URL(raw);
      const host = parsed.hostname.toLowerCase();
      const pageHost = (typeof window !== 'undefined' ? window.location.hostname : '').toLowerCase();
      const pageProtocol = (typeof window !== 'undefined' ? window.location.protocol : '').toLowerCase();
      const isAppRuntime = pageHost === 'localhost' || pageHost === '127.0.0.1' || pageProtocol === 'capacitor:';
      const shouldProxy = !isAppRuntime && (
        host === 'images.unsplash.com' ||
        host === 'encrypted-tbn0.gstatic.com' ||
        host === 'ymgyekgmonqhehmnskcw.supabase.co'
      );
      if (shouldProxy) {
        return `/api/image-proxy?url=${encodeURIComponent(parsed.toString())}`;
      }
      return parsed.toString();
    } catch {
      try {
        return encodeURI(raw);
      } catch {
        return raw;
      }
    }
  };

  // Only scroll to top on fresh navigation (PUSH), not on back button (POP)
  useEffect(() => {
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0);
    }
    // Reset selected image index when product changes
    setSelectedImageIndex(0);
  }, [id, navigationType]);

  // Update container width for slider
  useEffect(() => {
    const updateWidth = () => {
      if (carouselRef.current) {
        setContainerWidth(carouselRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Auto-play slider
  useEffect(() => {
    if (!product || isDragging) return;
    const images = getAllImages();
    if (images.length <= 1) return;

    const autoSlideTimer = window.setTimeout(() => {
      setSlideTransitionMs(320);
      setSelectedImageIndex(prev => (prev + 1) % images.length);
    }, 4000);

    return () => window.clearTimeout(autoSlideTimer);
  }, [selectedImageIndex, product, isDragging]);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard navigation for zoom modal
  useEffect(() => {
    if (!showZoomModal) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      switch(e.key) {
        case 'Escape':
          closeZoomModal();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleZoomPrevImage();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleZoomNextImage();
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleZoomReset();
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showZoomModal, zoomImageIndex, zoomScale]);

  const fetchProductAndRelated = async (isSilent = false) => {
    if (!id) return;
    if (!isSilent) setLoading(true);
    
    try {
      const data = isSilent
        ? (await robustFetch<Product>(supabase.from('products').select('*').eq('id', id).single())).data
        : await appCache.getOrSet<Product | null>(
            `product:details:${id}`,
            async () => {
              const { data: productData, error: productError } = await robustFetch<Product>(
                supabase.from('products').select('id,title,preview_image,preview_images,price,original_price,category,seller_id,is_verified,file_url,is_featured,featured_until,ad_clicks,ad_impressions,views,description,format,resolution,average_rating,review_count').eq('id', id).single()
              );
              if (productError) throw productError;
              return productData || null;
            },
            45
          );
      const error = !data ? new Error('Product not found') : null;
      
      if (error || !data) {
        if (!isSilent) {
          toast.error('Asset not found');
          navigate('/');
        }
        return;
      }

      setProduct(data);

      // Fetch Seller Info dynamically - Enhanced
      if (data.seller_id) {
         const sData = await appCache.getOrSet<any>(
           `seller:public:${data.seller_id}`,
           async () => {
             const { data: sellerData } = await robustFetch<any>(
               supabase.from('users').select('id, name, store_name, store_logo, is_verified_seller').eq('id', data.seller_id).single()
             );
             
             if (sellerData) {
               // Count products by this seller
               const { count } = await robustFetch<any>(
                 supabase.from('products').select('*', { count: 'exact', head: true }).eq('seller_id', data.seller_id).eq('is_verified', true)
               );
               return { ...sellerData, product_count: count || 0 };
             }
             return null;
           },
           300
         );
         setSellerInfo(sData);
      } else {
         // No seller_id means it's an admin product
         setSellerInfo(null);
      }

      if (!isSilent) {
        // Use RPC for atomic increment to avoid race conditions with concurrent users
        const { error: rpcError } = await supabase.rpc('increment_product_counters', {
          p_product_id: data.id,
          p_increment_views: true,
          p_increment_impressions: !!(data.is_featured && data.featured_until && new Date(data.featured_until) > new Date())
        });
        if (rpcError) {
          // Fallback if RPC not available: best-effort non-atomic increment
          supabase.from('products').update({ views: (data.views || 0) + 1 }).eq('id', data.id).then(() => undefined, () => undefined);
        }
      }
      
      const related = await appCache.getOrSet<Product[]>(
        `products:related:${data.category}:${data.id}`,
        async () => {
          const { data: relatedData } = await robustFetch<Product[]>(
            supabase
              .from('products')
              .select('id,title,preview_image,price,original_price,category,seller_id,is_verified,file_url,average_rating,review_count')
              .eq('category', data.category)
              .eq('is_enabled', true)
              .eq('is_verified', true)
              .neq('id', data.id)
              .limit(6)
          );
          return relatedData || [];
        },
        120
      );
      
      setRelatedProducts(related || []);
    } catch (e) {
      console.error(e);
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchProductAndRelated();

    const channel = supabase
      .channel(`public:product_${id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'products',
        filter: `id=eq.${id}`
      }, () => {
        fetchProductAndRelated(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, navigate]);

  // Update meta tags for social sharing
  useEffect(() => {
    if (product) {
      // Update Open Graph meta tags
      const updateMetaTag = (property: string, content: string) => {
        let tag = document.querySelector(`meta[property="${property}"]`);
        if (!tag) {
          tag = document.createElement('meta');
          tag.setAttribute('property', property);
          document.head.appendChild(tag);
        }
        tag.setAttribute('content', content);
      };

      const updateMetaName = (name: string, content: string) => {
        let tag = document.querySelector(`meta[name="${name}"]`);
        if (!tag) {
          tag = document.createElement('meta');
          tag.setAttribute('name', name);
          document.head.appendChild(tag);
        }
        tag.setAttribute('content', content);
      };

      // Set Open Graph tags
      updateMetaTag('og:title', product.title || 'Product');
      updateMetaTag('og:description', `Price: ₹${product.price} | Category: ${product.category || 'Products'}`);
      updateMetaTag('og:image', product.preview_image || '');
      updateMetaTag('og:url', window.location.href);
      updateMetaTag('og:type', 'product');

      // Set Twitter Card tags
      updateMetaName('twitter:card', 'summary_large_image');
      updateMetaName('twitter:title', product.title || 'Product');
      updateMetaName('twitter:description', `Price: ₹${product.price}`);
      updateMetaName('twitter:image', product.preview_image || '');

      // Update page title
      document.title = `${product.title} - DIGi QuRY`;
    }
  }, [product]);

  const handleBuyNow = async () => {
    if (!user) {
      toast.error('Please login to purchase');
      setPendingResumeAction({ type: 'autobuy', path: location.pathname, productId: product?.id });
      const from = withQueryParams(getCurrentPath(location), { autobuy: 1 });
      navigate('/login', { state: { from } });
      return;
    }
    if (!product) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || session.user.id !== user.id) {
      setPendingResumeAction({ type: 'autobuy', path: location.pathname, productId: product.id });
      const from = withQueryParams(getCurrentPath(location), { autobuy: 1 });
      navigate('/login', { state: { from } });
      return;
    }
    
    setProcessing(true);
    try {
      const razorpayKey = await getCachedSetting('razorpay_key_id', 300);

      if (!razorpayKey || razorpayKey.includes('your_key_here')) {
        throw new Error('Merchant configuration pending.');
      }

      const limitEnabled = await getCachedSettingBoolean('download_limit_enabled', true, 300);
      let globalLimit: number | null = null;
      if (limitEnabled) {
        const limitSetting = await getCachedSetting('default_download_limit', 300);
        const parsedLimit = parseInt(limitSetting || '', 10);
        globalLimit = isNaN(parsedLimit) ? null : parsedLimit;
      }

      const orderResponse = await fetch('https://ymgyekgmonqhehmnskcw.supabase.co/functions/v1/create-razorpay-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ amount: Math.round(product.price * 100), productIds: product.id })
      });
      
      const orderData = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(orderData.error || 'Failed to create order');

      const options = {
        key: razorpayKey, 
        amount: Math.round(product.price * 100),
        currency: 'INR',
        name: 'DIGi QuRY Store',
        description: product.title,
        order_id: orderData.order.id,
        notes: {
          user_id: user.id,
          product_ids: product.id
        },
        handler: async (response: any) => {
          const { error: updateError } = await supabase
            .from('orders')
            .update({ status: 'paid', payment_id: response.razorpay_payment_id })
            .eq('razorpay_order_id', orderData.order.id);
            
          if (updateError) throw updateError;
          
          toast.success('Payment Successful! Unlocking asset...');
          await refreshPurchases();
          void notifyPurchaseActivity({
            productIds: [product.id],
            itemCount: 1,
            totalAmount: Number(product.price || 0),
            paymentId: String(response?.razorpay_payment_id || ''),
            buyerName: user?.name || 'User',
          });
          navigate('/dashboard');
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
      await openRazorpayCheckout(options);
    } catch (err: any) {
      toast.error(err.message || 'Payment setup failed');
      setProcessing(false);
    }
  };

  useEffect(() => {
    if (!user || !product || processing) return;

    const shouldResumeBuy = new URLSearchParams(location.search).get('autobuy') === '1';
    if (!shouldResumeBuy) return;

    const pendingAction = getPendingResumeAction();
    if (!pendingAction || pendingAction.type !== 'autobuy' || pendingAction.path !== location.pathname || pendingAction.productId !== product.id) {
      return;
    }

    const cleanPath = withQueryParams(getCurrentPath(location), { autobuy: null });
    navigate(cleanPath, { replace: true });
    clearPendingResumeAction();
    handleBuyNow();
  }, [user, product, processing, location.pathname, location.search, location.hash]);

  const handleVerifyOfflinePayment = async () => {
    if (!user || !product) {
      toast.error('Please login first');
      return;
    }
    
    setVerifying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('https://ymgyekgmonqhehmnskcw.supabase.co/functions/v1/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ productIds: [product.id] })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast.success(data.message || 'Payment verified! You now have access.');
        await refreshPurchases();
      } else {
        toast.error(data.error || 'No recent successful payment found for this asset.');
      }
    } catch (err: any) {
      toast.error('Error verifying payment. Try again.');
      console.error(err);
    } finally {
      setVerifying(false);
    }
  };

  const copyProductLink = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const webLink = buildProductShareUrl(String(id || ''));
    navigator.clipboard.writeText(webLink);
    incrementShare();
    toast.success('Link copied!');
  };

  const incrementShare = () => {
    if (!id) return;
    const newCount = shareCount + 1;
    setShareCount(newCount);
    localStorage.setItem(`shares:${id}`, newCount.toString());
  };

  const productShareUrl = buildProductShareUrl(String(id || ''));

  const handleDownload = async () => {
    const order = purchasedOrders[product?.id || ''];
    if (!order) return;
    if (!user?.id) return;

    const { allowed, reason } = canOrderDownload(order, { ignoreLimit: !downloadLimitsEnabled });
    if (!allowed) {
      toast.error(reason || 'Download not allowed');
      return;
    }

    if (!product?.file_url) {
      toast.error("Download link is being prepared...");
      return;
    }

    const { url, error } = await resolveDownloadUrl(product.file_url);

    if (error || !url) {
      toast.error(error || "Unauthorized or file not found in secure storage.");
      return;
    }

    const currentCount = order.download_count || 0;
    const incrementResult = (product?.id)
      ? await incrementDownloadCountByUserProduct(user.id, product.id, currentCount, { ignoreLimit: !downloadLimitsEnabled })
      : { ok: false, newCount: currentCount };

    if (!incrementResult.ok) {
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
        sourcePath: String(product.file_url || ''),
        previewImage: String(product.preview_image || ''),
      });
      toast.success('Asset saved to your device');
    } catch (downloadError) {
      console.error('Device download failed:', downloadError);
      toast.error('Download failed on this device. Please try again.');
    }
  };

  // Get all gallery images (main preview + additional preview images)
  const getAllImages = (): string[] => {
    const images: string[] = [];
    if (product?.preview_image) images.push(product.preview_image);
    if (product?.preview_images && product.preview_images.length > 0) {
      images.push(...product.preview_images.filter(img => img && !images.includes(img)));
    }
    return images.length > 0 ? images : [];
  };

  // Touch handlers for slider
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    setStartTime(Date.now());
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const currentTouch = e.targetTouches[0].clientX;
    setTouchEnd(currentTouch);
    const diff = currentTouch - touchStart;
    setDragOffset(diff);
  };

  const handleTouchEnd = () => {
    if (!touchStart || touchEnd === null) {
      setIsDragging(false);
      setDragOffset(0);
      return;
    }
    
    const distance = touchStart - touchEnd;
    const timeTaken = Math.max(1, Date.now() - startTime);
    const velocity = Math.abs(distance) / timeTaken;
    const width = containerWidth || window.innerWidth;
    const images = getAllImages();
    
    const quickSwipeThreshold = 0.3;
    const minDistanceThreshold = width * 0.15;
    
    let shouldChange = false;
    let direction = 0;
    
    if (velocity > quickSwipeThreshold && Math.abs(distance) > 30) {
      shouldChange = true;
      direction = distance > 0 ? 1 : -1;
    } else if (Math.abs(distance) > minDistanceThreshold) {
      shouldChange = true;
      direction = distance > 0 ? 1 : -1;
    }

    if (shouldChange) {
      const normalizedVelocity = Math.min(1.2, velocity);
      const momentumDuration = Math.round(420 - normalizedVelocity * 220);
      setSlideTransitionMs(Math.max(180, Math.min(420, momentumDuration)));
      setSelectedImageIndex(prev => (prev + direction + images.length) % images.length);
    } else {
      setSlideTransitionMs(260);
    }
    
    setIsDragging(false);
    setDragOffset(0);
    setTouchStart(null);
    setTouchEnd(null);
  };

  const handleImageClick = (imageUrl: string, index: number) => {
    if (!isDragging) {
      setZoomImageUrl(imageUrl);
      setZoomImageIndex(index);
      setZoomScale(1);
      setZoomPosition({ x: 0, y: 0 });
      setShowZoomModal(true);
    }
  };

  const handleZoomIn = () => {
    setZoomScale(prev => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    setZoomScale(prev => {
      const newScale = Math.max(prev - 0.5, 1);
      if (newScale === 1) {
        setZoomPosition({ x: 0, y: 0 });
      }
      return newScale;
    });
  };

  const handleZoomReset = () => {
    setZoomScale(1);
    setZoomPosition({ x: 0, y: 0 });
  };

  const handleZoomPrevImage = () => {
    const images = getAllImages();
    const newIndex = (zoomImageIndex - 1 + images.length) % images.length;
    setZoomImageIndex(newIndex);
    setZoomImageUrl(images[newIndex]);
    setZoomScale(1);
    setZoomPosition({ x: 0, y: 0 });
  };

  const handleZoomNextImage = () => {
    const images = getAllImages();
    const newIndex = (zoomImageIndex + 1) % images.length;
    setZoomImageIndex(newIndex);
    setZoomImageUrl(images[newIndex]);
    setZoomScale(1);
    setZoomPosition({ x: 0, y: 0 });
  };

  const handleZoomWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  const handlePanStart = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      // Always track touch position for swipe detection
      setZoomTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setZoomStartTime(Date.now());
      // Don't set isPanning yet - wait to see if it's a swipe or pan
    } else if (zoomScale > 1 && !('touches' in e)) {
      // Mouse pan only when zoomed
      setIsPanning(true);
      setPanStart({ x: e.clientX - zoomPosition.x, y: e.clientY - zoomPosition.y });
    }
  };

  const handlePanMove = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      // Track for swipe detection
      setZoomTouchEnd({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      
      if (zoomTouchStart && zoomScale > 1) {
        // Check if movement is primarily vertical (for panning)
        const horizontalDiff = Math.abs(e.touches[0].clientX - zoomTouchStart.x);
        const verticalDiff = Math.abs(e.touches[0].clientY - zoomTouchStart.y);
        
        // If vertical movement is greater than horizontal, then enable panning
        if (verticalDiff > horizontalDiff && !isPanning) {
          setIsPanning(true);
          setPanStart({ 
            x: e.touches[0].clientX - zoomPosition.x, 
            y: e.touches[0].clientY - zoomPosition.y 
          });
        }
      }
    }
    
    if (!isPanning || zoomScale <= 1) return;
    
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setZoomPosition({
      x: clientX - panStart.x,
      y: clientY - panStart.y
    });
  };

  const handlePanEnd = () => {
    // Handle swipe for image navigation (works even when zoomed)
    if (zoomTouchStart !== null && zoomTouchEnd !== null && !isPanning) {
      const horizontalDistance = zoomTouchStart.x - zoomTouchEnd.x;
      const verticalDistance = Math.abs(zoomTouchStart.y - zoomTouchEnd.y);
      const timeTaken = Math.max(1, Date.now() - zoomStartTime);
      const velocity = Math.abs(horizontalDistance) / timeTaken;
      
      // Swipe detection: primarily horizontal movement
      const isHorizontalSwipe = Math.abs(horizontalDistance) > verticalDistance;
      const minSwipeThreshold = 30;
      const velocityThreshold = 0.3;

      if (isHorizontalSwipe && (Math.abs(horizontalDistance) > minSwipeThreshold || (velocity > velocityThreshold && Math.abs(horizontalDistance) > 10))) {
        if (horizontalDistance > 0) {
          handleZoomNextImage();
        } else {
          handleZoomPrevImage();
        }
      }
    }
    
    if (isPanning) {
      setIsPanning(false);
    }
    
    setZoomTouchStart(null);
    setZoomTouchEnd(null);
  };

  const closeZoomModal = () => {
    setShowZoomModal(false);
    setZoomScale(1);
    setZoomPosition({ x: 0, y: 0 });
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <i className="fas fa-circle-notch fa-spin text-4xl text-[#2874f0]"></i>
    </div>
  );

  if (!product) return null;

  const owned = isPurchased(product.id);
  const inCart = isInCart(product.id);
  const wishlisted = isInWishlist(product.id);
  const discount = calculateDiscount(product.original_price, product.price);

  const shareMessage = `
🎨 ${product.title}

💰 Price: ₹${product.price}${discount > 0 ? ` (₹${product.original_price} - ${discount}% OFF)` : ''}

📝 ${product.description ? product.description.substring(0, 100) : 'Check out this product'}...

📌 Category: ${product.category}
📏 Format: ${product.format}
🎬 Resolution: ${product.resolution}

🛒 See more: ${productShareUrl}

#DIGi QuRY #Digital #Assets
  `.trim();

  const order = owned ? purchasedOrders[product.id] : null;
  let allowedToDownload = false;
  let downloadText = 'Download Asset';

  if (owned && order) {
      const access = canOrderDownload(order, { ignoreLimit: !downloadLimitsEnabled });
      allowedToDownload = access.allowed;
      const remaining = getRemainingDownloads(order, { ignoreLimit: !downloadLimitsEnabled });
      if (!allowedToDownload) {
          downloadText = 'Limit Reached';
      } else if (remaining !== null) {
          downloadText = `Download (${remaining} Left)`;
      }
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-7xl mx-auto px-4 pt-6 md:pt-8">
        <div className="flex items-center justify-between mb-4">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-[#2874f0] text-xs font-black uppercase tracking-widest hover:bg-blue-50 px-3 py-2 rounded-full transition-all"
          >
            <i className="fas fa-arrow-left"></i> Back
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-2 text-[#2874f0] text-xs font-black uppercase tracking-widest hover:bg-blue-50 px-3 py-2 rounded-full transition-all"
            >
              <i className="fas fa-share-alt"></i> <span className="hidden sm:inline">Share</span>
            </button>
            <button
              onClick={() => toggleWishlist(product)}
              className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest px-3 py-2 rounded-full transition-all ${
                wishlisted ? 'text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
              }`}
            >
              <i className={`${
                wishlisted ? 'fas' : 'far'
              } fa-heart`}></i>
              <span className="hidden sm:inline">Wishlist</span>
            </button>
            <div className="hidden md:flex items-center gap-3 text-[11px] font-bold text-gray-400 uppercase tracking-tighter">
              <Link to="/" className="hover:text-[#2874f0]">DIGi QuRY</Link>
              <i className="fas fa-chevron-right text-[7px] opacity-50"></i>
              <span className="text-gray-900">{product.category}</span>
              <i className="fas fa-chevron-right text-[7px] opacity-50"></i>
              <span className="text-[#2874f0] opacity-80 truncate max-w-[150px]">{product.title}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-0 md:px-4 pb-24">
        <div className="flex flex-col md:flex-row gap-0 md:gap-10">
          
          <div className="w-full md:w-[45%] lg:w-[40%]">
            <div className="md:sticky md:top-24 space-y-5">
              {/* Hero Banner Style Slider */}
              <div className="relative w-full rounded-[2rem] overflow-hidden shadow-xl bg-white fk-shadow">
                <div
                  ref={carouselRef}
                  className="relative w-full aspect-[4/3] md:aspect-[1/1] overflow-hidden touch-none select-none"
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <div 
                    className="flex h-full"
                    style={{
                      transform: `translateX(calc(-${selectedImageIndex * 100}% + ${dragOffset}px))`,
                      transition: isDragging ? 'none' : `transform ${slideTransitionMs}ms cubic-bezier(0.22, 0.8, 0.3, 1)`,
                      willChange: 'transform'
                    }}
                  >
                    {getAllImages().map((img, index) => (
                      <div 
                        key={index} 
                        className="min-w-full w-full h-full flex-shrink-0 flex items-center justify-center p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 cursor-zoom-in min-h-[250px] md:min-h-[400px]"
                        onClick={() => handleImageClick(img, index)}
                      >
                        {img && img.trim() ? (
                          <img 
                            src={normalizeImageUrl(img)} 
                            alt={`${product.title} - Preview ${index + 1}`}
                            loading={index === selectedImageIndex ? 'eager' : 'lazy'}
                            decoding="sync"
                                                        width="400"
                                                        height="300"
                            fetchPriority={index === selectedImageIndex ? 'high' : 'auto'}
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%23f3f4f6" width="200" height="200"/%3E%3Cpath d="M85 95L115 65M115 95L85 65M60 40h80v120H60z" stroke="%23d1d5db" stroke-width="2" fill="none" stroke-linecap="round"/%3E%3C/svg%3E';
                              img.style.display = 'block';
                            }}
                            style={{
                              display: 'block',
                              backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22200%22 height=%22200%22/%3E%3Cpath d=%22M85 95L115 65M115 95L85 65M60 40h80v120H60z%22 stroke=%22%23d1d5db%22 stroke-width=%222%22 fill=%22none%22 stroke-linecap=%22round%22/%3E%3C/svg%3E")',
                              backgroundSize: 'contain',
                              backgroundPosition: 'center',
                              backgroundRepeat: 'no-repeat'
                            }}
                            className="h-full w-full object-contain drop-shadow-2xl"
                            draggable={false}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" className="w-24 h-24 text-gray-300">
                              <rect fill="currentColor" opacity="0.1" width="200" height="200"/>
                              <path d="M80 60h40v80H80z" stroke="currentColor" stroke-width="2" fill="none"/>
                              <circle cx="100" cy="80" r="8" fill="currentColor"/>
                              <path d="M80 140l30-50 30 50" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Badges Overlay */}
                  <div className="absolute bottom-6 left-6 flex gap-2 z-10">
                    <span className="bg-white/90 backdrop-blur px-3 py-1 rounded-lg text-[10px] font-black text-gray-500 uppercase tracking-widest border border-gray-100 shadow-sm">
                      {product.format || 'DIGITAL'}
                    </span>
                    {owned && (
                      <span className="bg-green-100 text-green-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-green-50 shadow-sm flex items-center gap-1">
                        <i className="fas fa-check-circle"></i> Owned
                      </span>
                    )}
                  </div>
                </div>

                {/* Navigation Dots */}
                {getAllImages().length > 1 && (
                  <div className="py-4 flex justify-center">
                    <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-full shadow-md border border-gray-200">
                      {getAllImages().map((_, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setSlideTransitionMs(320);
                            setSelectedImageIndex(i);
                          }}
                          className={`relative h-1.5 rounded-full bg-gray-300 overflow-hidden transition-all duration-300 ${
                            i === selectedImageIndex ? 'w-10' : 'w-3'
                          }`}
                          aria-label={`Go to image ${i + 1}`}
                        >
                          {i === selectedImageIndex && (
                            <span
                              key={`${selectedImageIndex}-${isDragging ? 'pause' : 'run'}`}
                              className="absolute left-0 top-0 h-full w-full origin-left scale-x-0 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full hero-dot-fill"
                              style={{ animationPlayState: isDragging ? 'paused' : 'running', animationDuration: '4000ms' }}
                            ></span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="hidden md:grid grid-cols-1 gap-4">
                {owned ? (
                  <button 
                    onClick={handleDownload}
                    disabled={!allowedToDownload}
                    className={`h-16 text-white font-black text-sm uppercase flex items-center justify-center gap-3 rounded-2xl shadow-xl active:scale-95 transition-all ${allowedToDownload ? 'bg-[#388e3c] hover:bg-[#2e7d32] shadow-green-500/20' : 'bg-gray-400 cursor-not-allowed'}`}
                  >
                    <i className="fas fa-cloud-arrow-down"></i>
                    {downloadText}
                  </button>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    <button 
                      onClick={() => inCart ? navigate('/cart') : addToCart(product)}
                      className={`h-16 flex items-center justify-center gap-3 font-black text-sm uppercase rounded-2xl shadow-xl transition-all active:scale-95 ${inCart ? 'bg-[#2874f0] text-white' : 'bg-[#ff9f00] text-white hover:bg-[#f39700]'}`}
                    >
                      <i className={`fas ${inCart ? 'fa-arrow-right' : 'fa-cart-shopping'}`}></i>
                      {inCart ? 'Go to Cart' : 'Add to Cart'}
                    </button>
                    <button 
                      onClick={handleBuyNow}
                      disabled={processing}
                      className="h-16 bg-[#fb641b] hover:bg-[#e65a18] text-white font-black text-sm uppercase flex items-center justify-center gap-3 rounded-2xl shadow-xl shadow-orange-500/20 active:scale-95 disabled:opacity-50"
                    >
                      {processing ? (
                        <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                      ) : (
                        <>
                          <i className="fas fa-bolt text-yellow-300"></i>
                          Buy Now
                        </>
                      )}
                    </button>
                    {!owned && user && (
                      <button 
                        onClick={handleVerifyOfflinePayment}
                        disabled={verifying}
                        className="w-full h-12 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs uppercase rounded-xl border border-blue-200 transition-colors flex items-center justify-center gap-2 mt-2 shadow-sm"
                      >
                        {verifying ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync-alt"></i>}
                        {verifying ? 'Verifying Payment...' : 'Click Here to Verify Offline Payment'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="w-full md:w-[55%] lg:w-[60%] px-5 py-6 md:px-0">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="bg-blue-50 text-[#2874f0] px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">Premium Collection</span>
                  {product.is_featured && product.featured_until && new Date(product.featured_until) > new Date() && (
                    <span className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                      <i className="fas fa-star"></i> Featured
                    </span>
                  )}
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-gray-900 leading-tight tracking-tight">{product.title}</h1>
                
                {/* Rating Summary */}
                {product.review_count !== undefined && product.review_count > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex text-yellow-400 text-sm">
                      {[1, 2, 3, 4, 5].map(star => (
                        <i key={star} className={`fas fa-star ${star <= (product.average_rating || 0) ? '' : 'text-gray-300'}`}></i>
                      ))}
                    </div>
                    <span className="text-sm font-bold text-gray-700">{product.average_rating?.toFixed(1)}</span>
                    <span className="text-xs text-gray-500">({product.review_count} {product.review_count === 1 ? 'review' : 'reviews'})</span>
                  </div>
                )}
              </div>

              <div className="bg-gray-50/50 p-6 rounded-[2rem] border border-gray-100">
                <p className="text-[#388e3c] text-[11px] font-black uppercase tracking-widest mb-1">Exclusive Marketplace Price</p>
                <div className="flex items-baseline gap-4">
                  <span className="text-3xl md:text-4xl font-black text-gray-900">₹{product.price}</span>
                  {product.original_price > product.price && (
                    <>
                      <span className="text-gray-400 line-through text-lg font-bold">₹{product.original_price}</span>
                      <span className="text-[#388e3c] text-lg font-black">{discount}% off</span>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { icon: 'fa-cloud-arrow-down', text: 'Instant Access' },
                  { icon: 'fa-shield-halved', text: 'Verified Safe' },
                  { icon: 'fa-infinity', text: 'Lifetime Use' },
                  { icon: 'fa-headset', text: '24/7 Support' }
                ].map((badge, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-2 bg-white p-4 rounded-2xl border border-gray-100 text-center hover:border-blue-200 transition-colors">
                    <i className={`fas ${badge.icon} text-[#2874f0] text-lg`}></i>
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-tighter leading-none">{badge.text}</span>
                  </div>
                ))}
              </div>

              {/* DYNAMIC SELLER / STORE SHOWCASE BLOCK */}
              <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 flex items-center justify-between">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-blue-50 flex items-center justify-center text-[#2874f0] text-lg font-black border border-blue-100 overflow-hidden shrink-0">
                    {sellerInfo?.store_logo ? (
                      <img src={sellerInfo.store_logo} alt="Store Logo" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    ) : (
                      <i className="fas fa-store"></i>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base leading-none font-black text-gray-900 truncate">{sellerInfo?.store_name || sellerInfo?.name || 'DIGi QuRY'}</span>
                      {(sellerInfo?.is_verified_seller || !sellerInfo) && (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.06em] leading-none text-[#2874f0]">
                          Verified
                          <svg width="11" height="11" className="inline-block shrink-0" style={{ fill: '#0073e6' }} viewBox="0 0 24 24"><path d="M23,12L20.56,9.22L20.9,5.54L17.29,4.72L15.4,1.54L12,3L8.6,1.54L6.71,4.72L3.1,5.53L3.44,9.21L1,12L3.44,14.78L3.1,18.47L6.71,19.29L8.6,22.47L12,21L15.4,22.46L17.29,19.28L20.9,18.46L20.56,14.78L23,12M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9L10,17Z"></path></svg>
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-1">
                       {product.seller_id && sellerInfo?.product_count ? `${sellerInfo.product_count} Digital Assets` : 'Top Rated Digital Creator'}
                    </p>
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">In Stock</p>
                  <p className="text-xs font-bold text-gray-500">Digital Copy</p>
                </div>
              </div>

              <div className="pt-4">
                <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-tight">
                  <i className="fas fa-align-left text-[#2874f0]"></i> Product Description
                </h3>
                <div className="bg-gray-50/30 p-6 rounded-[2rem] border border-gray-100">
                  <div 
                    className="text-sm text-gray-600 leading-relaxed font-medium whitespace-pre-line"
                    dangerouslySetInnerHTML={{ 
                      __html: DOMPurify.sanitize(product.description || 'This professional digital asset is designed to meet high industry standards.') 
                    }}
                  />
                </div>
              </div>

              <div className="pt-6">
                <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-tight">
                  <i className="fas fa-list-check text-[#2874f0]"></i> Specifications
                </h3>
                <div className="rounded-[2rem] border border-gray-100 overflow-hidden fk-shadow">
                  <div className="divide-y divide-gray-100">
                    {[
                      { k: 'Category', v: product.category, icon: 'fa-tag' },
                      { k: 'File Format', v: product.format || 'ZIP / Universal', icon: 'fa-file-code' },
                      { k: 'Resolution', v: product.resolution || 'High Fidelity', icon: 'fa-expand' },
                      { k: 'Asset ID', v: product.id.slice(0, 8).toUpperCase(), icon: 'fa-fingerprint' }
                    ].map((spec, i) => (
                      <div key={i} className="flex px-6 py-4 items-center bg-white hover:bg-gray-50 transition-colors">
                        <div className="w-[40%] flex items-center gap-3">
                          <i className={`fas ${spec.icon} text-gray-300 text-[10px]`}></i>
                          <span className="text-[11px] text-gray-400 uppercase font-black tracking-widest">{spec.k}</span>
                        </div>
                        <span className="text-sm text-gray-900 font-bold">{spec.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Product Reviews */}
              <div className="pt-6 border-t border-gray-100">
                <ProductReviews productId={product.id} />
              </div>
            </div>
          </div>
        </div>

        {/* Sponsored Product Ad */}
        <div className="mt-16 px-5 md:px-0">
          <AdComponent
            placement="product_details"
            limit={isDesktop ? 4 : 2}
            category={product.category}
            impressionScopeKey={`product:${product.id}`}
          />
        </div>

        {relatedProducts.length > 0 && (
          <div className="mt-16 pt-10 border-t border-gray-100 px-5 md:px-0">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                  <i className="fas fa-sparkles text-amber-500"></i>
                  PEOPLE ALSO BOUGHT
               </h3>
               <Link to={`/?cat=${product.category}`} className="text-[11px] font-black text-[#2874f0] uppercase tracking-widest hover:underline">View All Collection</Link>
            </div>
            <div className="flex overflow-x-auto no-scrollbar gap-5 pb-6">
              {relatedProducts.map(item => (
                <Link 
                  key={item.id} 
                  to={`/product/${item.id}`} 
                  className="w-48 md:w-56 flex-shrink-0 bg-white border border-gray-100 rounded-[2rem] p-4 hover:shadow-2xl hover:-translate-y-1 transition-all group flex flex-col"
                >
                  <div className="h-36 md:h-44 flex items-center justify-center mb-4 bg-gray-50 rounded-2xl overflow-hidden p-3 relative">
                    <img src={item.preview_image} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain group-hover:scale-110 transition-transform duration-500" alt="" />
                    <span className="absolute top-2 left-2 bg-white/90 px-2 py-0.5 rounded text-[8px] font-black text-gray-400 border border-gray-100">{item.category}</span>
                  </div>
                  <div className="mt-auto px-1">
                    <h4 className="text-[12px] font-black text-gray-800 truncate mb-1 group-hover:text-[#2874f0] transition-colors">{item.title}</h4>
                    <div className="flex items-center justify-between">
                      <span className="text-base font-black text-gray-900">₹{item.price}</span>
                      {item.original_price > item.price && (
                         <span className="text-[9px] text-[#388e3c] font-black">{calculateDiscount(item.original_price, item.price)}% OFF</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Related Products Ads Section */}
        <div className="mt-12 pt-10 border-t border-gray-100">
          <AdComponent
            placement="related_products"
            limit={isDesktop ? 4 : 2}
            category={product.category}
            impressionScopeKey={`product:${product.id}`}
          />
        </div>
      </div>

      {/* Share Modal - Native Share Focus */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowShareModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm transform transition-all animate-scale-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl z-10">
              <h3 className="text-lg font-black text-gray-900">Share Product</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <i className="fas fa-times text-gray-600 text-sm"></i>
              </button>
            </div>
            
            <div className="p-5 space-y-5">
              {/* Product Preview Card */}
              <div className="p-4 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl bg-white border border-gray-200 overflow-hidden flex-shrink-0 shadow-sm">
                    <img src={product?.preview_image} alt="Product" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-900 mb-2 line-clamp-2">{product?.title}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-[#2874f0]">₹{product?.price}</span>
                      {product?.original_price && product.original_price > product.price && (
                        <span className="text-xs text-gray-400 line-through">₹{product.original_price}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Share Buttons Grid - 8 Platforms */}
              <div className="grid grid-cols-4 gap-4">
                {/* Copy Link */}
                <button
                  onClick={(e) => { copyProductLink(e); setShowShareModal(false); }}
                  className="flex flex-col items-center gap-2 p-3 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xl">
                    <i className="fas fa-link"></i>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-700 text-center">Copy</span>
                </button>

                {/* WhatsApp */}
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => incrementShare()}
                  className="flex flex-col items-center gap-2 p-3 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl">
                    <i className="fab fa-whatsapp"></i>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-700">WhatsApp</span>
                </a>

                {/* Facebook */}
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productShareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => incrementShare()}
                  className="flex flex-col items-center gap-2 p-3 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xl">
                    <i className="fab fa-facebook-f"></i>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-700">Facebook</span>
                </a>

                {/* Twitter */}
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}&url=${encodeURIComponent(productShareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => incrementShare()}
                  className="flex flex-col items-center gap-2 p-3 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <div className="w-14 h-14 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 text-xl">
                    <i className="fab fa-twitter"></i>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-700">Twitter</span>
                </a>

                {/* Email */}
                <a
                  href={`mailto:?subject=${encodeURIComponent(`Check: ${product?.title}`)}&body=${encodeURIComponent(shareMessage)}`}
                  onClick={() => incrementShare()}
                  className="flex flex-col items-center gap-2 p-3 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xl">
                    <i className="fas fa-envelope"></i>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-700">Email</span>
                </a>

                {/* SMS */}
                <a
                  href={`sms:?body=${encodeURIComponent(shareMessage)}`}
                  onClick={() => incrementShare()}
                  className="flex flex-col items-center gap-2 p-3 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-xl">
                    <i className="fas fa-comment"></i>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-700">SMS</span>
                </a>

                {/* Telegram */}
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(productShareUrl)}&text=${encodeURIComponent(shareMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => incrementShare()}
                  className="flex flex-col items-center gap-2 p-3 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 text-xl">
                    <i className="fab fa-telegram"></i>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-700">Telegram</span>
                </a>

                {/* LinkedIn */}
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(productShareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => incrementShare()}
                  className="flex flex-col items-center gap-2 p-3 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-800 text-xl">
                    <i className="fab fa-linkedin"></i>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-700">LinkedIn</span>
                </a>
              </div>

              {/* Share Stats */}
              <div className="pt-4 border-t border-gray-100 text-center">
                <p className="text-sm text-gray-600 font-medium">
                  <i className="fas fa-share-alt text-[#2874f0] mr-2"></i>Shared <span className="font-black text-[#2874f0]">{shareCount}</span> {shareCount === 1 ? 'time' : 'times'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Zoom Modal */}
      {showZoomModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
          onClick={closeZoomModal}
          onMouseUp={handlePanEnd}
          onTouchEnd={handlePanEnd}
        >
          {/* Top Controls Bar */}
          <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full">
                  <span className="text-white text-sm font-bold">
                    {zoomImageIndex + 1} / {getAllImages().length}
                  </span>
                </div>
                <div className="hidden md:flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full">
                  <i className="fas fa-search-plus text-white text-xs"></i>
                  <span className="text-white text-sm font-semibold">{Math.round(zoomScale * 100)}%</span>
                </div>
              </div>
              
              <button
                onClick={closeZoomModal}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center transition-all"
                aria-label="Close zoom"
              >
                <i className="fas fa-times text-white text-lg"></i>
              </button>
            </div>
          </div>

          {/* Image Container */}
          <div 
            ref={zoomImageRef}
            className="relative w-full h-full flex items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onWheel={handleZoomWheel}
            onMouseDown={handlePanStart}
            onMouseMove={handlePanMove}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
            onTouchStart={handlePanStart}
            onTouchMove={handlePanMove}
            onTouchEnd={handlePanEnd}
          >
            <img 
              src={zoomImageUrl} 
              alt="Zoomed product preview"
              className="max-w-[90vw] max-h-[90vh] object-contain select-none"
              style={{ 
                transform: `scale(${zoomScale}) translate(${zoomPosition.x / zoomScale}px, ${zoomPosition.y / zoomScale}px)`,
                transition: isPanning ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: zoomScale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default'
              }}
              draggable={false}
            />
          </div>

          {/* Bottom Zoom Controls */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
            <div className="bg-white/10 backdrop-blur-md rounded-full p-2 flex items-center gap-2 shadow-2xl">
              <button
                onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
                disabled={zoomScale <= 1}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                aria-label="Zoom out"
              >
                <i className="fas fa-minus text-white"></i>
              </button>
              
              <button
                onClick={(e) => { e.stopPropagation(); handleZoomReset(); }}
                disabled={zoomScale === 1}
                className="px-4 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95"
                aria-label="Reset zoom"
              >
                <span className="text-white text-sm font-bold">{Math.round(zoomScale * 100)}%</span>
              </button>
              
              <button
                onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
                disabled={zoomScale >= 4}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                aria-label="Zoom in"
              >
                <i className="fas fa-plus text-white"></i>
              </button>
            </div>
          </div>

        </div>
      )}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-up {
          from { transform: scale(0.95) translateY(10px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
        .animate-fade-in { animation: fade-in 0.2s ease-out; }
        .animate-scale-up { animation: scale-up 0.3s ease-out; }
      `}</style>

      <div className="fixed bottom-0 left-0 right-0 z-[120] bg-white/90 backdrop-blur-md border-t border-gray-100 flex flex-col md:hidden shadow-[0_-8px_20px_rgba(0,0,0,0.05)] px-4 py-3 gap-2">
        {owned ? (
          <button 
            onClick={handleDownload}
            disabled={!allowedToDownload}
            className={`w-full h-[46px] text-white font-black text-xs uppercase flex items-center justify-center gap-2 rounded-xl active:scale-95 shadow-lg ${allowedToDownload ? 'bg-[#388e3c] shadow-green-500/20' : 'bg-gray-400 cursor-not-allowed'}`}
          >
            <i className="fas fa-cloud-arrow-down"></i>
            {downloadText}
          </button>
        ) : (
          <>
            <div className="flex gap-3 h-[46px]">
              <button 
                onClick={() => inCart ? navigate('/cart') : addToCart(product)}
                className="flex-1 bg-white border-2 border-gray-100 text-gray-900 font-black text-xs uppercase flex items-center justify-center gap-2 rounded-xl active:scale-95 transition-all"
              >
                <i className={`fas ${inCart ? 'fa-arrow-right' : 'fa-cart-shopping'}`}></i>
                {inCart ? 'Cart' : 'Add'}
              </button>
              <button 
                onClick={handleBuyNow}
                disabled={processing}
                className="flex-[2] bg-[#fb641b] text-white font-black text-xs uppercase flex items-center justify-center gap-2 rounded-xl active:scale-95 disabled:opacity-50 shadow-lg shadow-orange-500/20"
              >
                <i className="fas fa-bolt"></i>
                {processing ? '...' : 'Unlock Now'}
              </button>
            </div>
            {user && (
              <button 
                onClick={handleVerifyOfflinePayment}
                disabled={verifying}
                className="w-full h-10 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] uppercase rounded-lg border border-blue-200 transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                {verifying ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync-alt"></i>}
                {verifying ? 'Verifying...' : 'Verify Offline Payment'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
