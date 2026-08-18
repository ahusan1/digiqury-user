import React, { useState, useEffect, useContext, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Product } from '../../types.ts';
import { supabase, robustFetch } from '../../lib/supabase.ts';
import { getCachedSetting, getCachedSettingBoolean } from '../../lib/settingsCache.ts';
import { AuthContext } from '../../App.tsx';
import { toast } from 'react-hot-toast';
import { canOrderDownload, getRemainingDownloads, resolveDownloadUrl, incrementDownloadCountByUserProduct } from '../../lib/downloadAccess.ts';
import { AdComponent } from '../../components/AdComponent.tsx';
import { DEFAULT_CATEGORIES, getManagedCategories } from '../../lib/categories.ts?v=2';
import { clearPendingResumeAction, getCurrentPath, getPendingResumeAction, setPendingResumeAction, withQueryParams } from '../../lib/loginRedirect.ts';
import { ensureRazorpayLoaded } from '../../lib/razorpay.ts';
import { getRecentlyViewed, RecentProduct } from '../../lib/recentlyViewed.ts';
import { hapticMedium, isNative } from '../../lib/capacitorUtils.ts';

const DEFAULT_LAYOUT = {
  showHero: true, showFlashSale: true, showTopSelling: true,
  flashSaleIds: [] as string[], topSellingIds: [] as string[], banners: [] as any[], flashSaleEndTime: ''
};

const DEFAULT_BANNERS = [
  { id: '1', title: '🔥 50% OFF on All Fonts', sub: 'Upgrade your typography today.', cta: 'Explore Fonts', bg: 'from-blue-600 to-indigo-900', cat: 'Fonts', image_url: '', link_url: '' },
  { id: '2', title: '🚀 New UI Kits Released', sub: 'Design faster with premium components.', cta: 'View UI Kits', bg: 'from-orange-500 to-pink-600', cat: 'UI Kits', image_url: '', link_url: '' },
  { id: '3', title: '✨ Premium Templates', sub: 'Professional designs ready to use.', cta: 'Browse Templates', bg: 'from-purple-600 to-pink-500', cat: 'Templates', image_url: '', link_url: '' }
];

const HERO_AUTOPLAY_MS = 12000;
const HERO_TRANSITION_BASE_MS = 320;

const parseSearchQuery = (q: string) => {
  let text = q.trim();
  let maxPrice: number | null = null;
  let minPrice: number | null = null;

  const underMatch = text.match(/(?:under|below|<)\s*(\d+)/i);
  if (underMatch) {
    maxPrice = parseInt(underMatch[1], 10);
    text = text.replace(underMatch[0], '').trim();
  }

  const aboveMatch = text.match(/(?:above|over|>)\s*(\d+)/i);
  if (aboveMatch) {
    minPrice = parseInt(aboveMatch[1], 10);
    text = text.replace(aboveMatch[0], '').trim();
  }

  if (/^\d+$/.test(text) && !maxPrice) {
    maxPrice = parseInt(text, 10);
    text = '';
  }

  return { text, maxPrice, minPrice };
};

export const Home: React.FC = () => {
  const { addToCart, user, isInCart, toggleWishlist, isInWishlist, isPurchased, isOnline, refreshPurchases, purchasedOrders, downloadLimitsEnabled } = useContext(AuthContext);
  const [products, setProducts] = useState<Product[]>([]);
  const [promoProducts, setPromoProducts] = useState<Product[]>([]);
  const [layoutConfig, setLayoutConfig] = useState(DEFAULT_LAYOUT);
  const [loading, setLoading] = useState(true);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentProduct[]>([]);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [pullY, setPullY] = useState(0);
  const pullStartY = useRef(0);
  const PULL_THRESHOLD = 72;
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'live'>('idle');
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeBanner, setActiveBanner] = useState(0);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [slideTransitionMs, setSlideTransitionMs] = useState(HERO_TRANSITION_BASE_MS);
  const carouselRef = React.useRef<HTMLDivElement>(null);

  // Items per page: 20 for desktop, 10 for mobile
  const itemsPerPage = isDesktop ? 20 : 10;

  // Timer States
  const [flashActive, setFlashActive] = useState(true);
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });
  const [flashAutoDisabled, setFlashAutoDisabled] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const query = searchParams.get('q') || '';
  const selectedCat = searchParams.get('cat') || '';
  const currentPage = parseInt(searchParams.get('p') || '1', 10);
  const isDefaultView = !query && (!selectedCat || selectedCat === 'All') && currentPage === 1;
  const [categories, setCategories] = useState([
    { name: 'All', img: 'https://cdn-icons-png.flaticon.com/128/3502/3502601.png' },
    ...DEFAULT_CATEGORIES
  ]);

  const displayBanners = useMemo(() => {
    const normalized = Array.isArray(layoutConfig.banners)
      ? layoutConfig.banners
      : Object.values(layoutConfig.banners || {});
    const allBanners = normalized.length > 0 ? normalized : DEFAULT_BANNERS;
    const deviceFiltered = allBanners.filter((banner: any) => {
      const audience = banner?.audience || 'all';
      if (audience === 'desktop') return isDesktop;
      if (audience === 'mobile') return !isDesktop;
      return true;
    });
    return deviceFiltered.length > 0 ? deviceFiltered : allBanners;
  }, [layoutConfig.banners, isDesktop]);

  useEffect(() => {
    setRecentlyViewed(getRecentlyViewed());
  }, []);

  useEffect(() => {
    const heroImage = displayBanners[0]?.image_url;
    if (!heroImage) return;

    const existing = document.querySelector<HTMLLinkElement>('link[data-hero-preload="home-banner"]');
    if (existing?.href === heroImage) return;

    if (existing) {
      existing.remove();
    }

    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'image';
    preload.href = heroImage;
    preload.setAttribute('fetchpriority', 'high');
    preload.dataset.heroPreload = 'home-banner';
    document.head.appendChild(preload);
  }, [displayBanners]);

  useEffect(() => {
    const updateWidth = () => {
      if (carouselRef.current) {
        setContainerWidth(carouselRef.current.offsetWidth);
      }
      setIsDesktop(window.innerWidth >= 768);
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    if (activeBanner >= displayBanners.length) {
      setActiveBanner(0);
    }
    // Update container width when banners change
    if (carouselRef.current) {
      setContainerWidth(carouselRef.current.offsetWidth);
    }
  }, [activeBanner, displayBanners.length]);

  useEffect(() => {
    if (!isDefaultView || loading || !layoutConfig.showHero || displayBanners.length <= 1 || isDragging) {
      return;
    }

    const autoSlideTimer = window.setTimeout(() => {
      setSlideTransitionMs(HERO_TRANSITION_BASE_MS);
      setActiveBanner(prev => (prev + 1) % displayBanners.length);
    }, HERO_AUTOPLAY_MS);

    return () => window.clearTimeout(autoSlideTimer);
  }, [activeBanner, displayBanners.length, isDefaultView, loading, layoutConfig.showHero, isDragging]);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    setStartTime(Date.now());
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    e.preventDefault();
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
    const velocity = Math.abs(distance) / timeTaken; // px per ms
    const width = containerWidth || window.innerWidth;

    // More responsive thresholds
    const quickSwipeThreshold = 0.3; // Lower = more sensitive
    const minDistanceThreshold = width * 0.15; // 15% of screen

    let shouldChange = false;
    let direction = 0;

    // Fast swipe OR significant drag distance
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
      setActiveBanner(prev => (prev + direction + displayBanners.length) % displayBanners.length);
    } else {
      setSlideTransitionMs(260);
    }

    setIsDragging(false);
    setDragOffset(0);
    setTouchStart(null);
    setTouchEnd(null);
  };

  useEffect(() => {
    const countdownInterval = setInterval(() => {
      if (layoutConfig.flashSaleEndTime) {
        const end = new Date(layoutConfig.flashSaleEndTime).getTime();
        const now = new Date().getTime();
        const distance = end - now;

        if (distance <= 0) {
          setFlashActive(false);
          setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
        } else {
          setFlashActive(true);
          setTimeLeft({
            d: Math.floor(distance / (1000 * 60 * 60 * 24)),
            h: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
            m: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
            s: Math.floor((distance % (1000 * 60)) / 1000)
          });
        }
      } else {
        setFlashActive(true);
        setTimeLeft(prev => {
          if (prev.s > 0) return { ...prev, s: prev.s - 1 };
          if (prev.m > 0) return { ...prev, m: prev.m - 1, s: 59 };
          if (prev.h > 0) return { ...prev, h: prev.h - 1, m: 59, s: 59 };
          return { d: 0, h: 23, m: 59, s: 59 };
        });
      }
    }, 1000);

    return () => { clearInterval(countdownInterval); };
  }, [layoutConfig.flashSaleEndTime]);

  useEffect(() => {
    const autoDisableFlashSale = async () => {
      if (!layoutConfig.flashSaleEndTime || flashActive || flashAutoDisabled || !layoutConfig.showFlashSale) return;

      try {
        const nextLayout = { ...layoutConfig, showFlashSale: false };
        const { error } = await supabase.from('settings').upsert(
          {
            key: 'homepage_layout',
            value: JSON.stringify(nextLayout),
            updated_at: new Date().toISOString()
          },
          { onConflict: 'key' }
        );
        if (error) throw error;

        setLayoutConfig(nextLayout);
        setFlashAutoDisabled(true);
      } catch (err) {
        console.error('Failed to auto-disable flash sale:', err);
      }
    };

    autoDisableFlashSale();
  }, [flashActive, flashAutoDisabled, layoutConfig]);

  const fetchProducts = useCallback(async (isSilent = false, page = currentPage) => {
    if (!isSilent) { setLoading(true); setSyncStatus('syncing'); }
    setError(null);

    // Create cache key based on all filter params
    const cacheKey = `home_cache_${selectedCat || 'all'}_${query}_${page}_${itemsPerPage}_${user?.role || 'guest'}`;
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    let cacheAge = Number.POSITIVE_INFINITY;
    let usedCache = false;

    // Cache-first: render immediately from session cache, then optionally revalidate.
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached);
        cacheAge = Date.now() - timestamp;

        if (cacheAge < CACHE_TTL) {
          console.log(`📦 Using cached data (age: ${Math.round(cacheAge / 1000)}s)`);
          setProducts(cachedData.products || []);
          setPromoProducts(cachedData.promoProducts || []);
          setLayoutConfig(cachedData.layoutConfig || DEFAULT_LAYOUT);
          setTotalResults(cachedData.totalResults || 0);
          setTotalPages(cachedData.totalPages || 1);
          setSyncStatus('live');
          if (!isSilent) setLoading(false);
          usedCache = true;
        }
      }
    } catch (e) {
      console.warn('Cache read failed:', e);
    }

    // Fresh cache is good enough for instant homepage loads.
    if (usedCache && cacheAge < 90_000) {
      return;
    }

    try {
      const { data: layoutData } = await robustFetch<any>(supabase.from('settings').select('value').eq('key', 'homepage_layout').maybeSingle());
      let layout = DEFAULT_LAYOUT;
      let promos: Product[] = [];

      if (layoutData?.value) {
        const parsed = JSON.parse(layoutData.value);
        layout = { ...DEFAULT_LAYOUT, ...parsed };
        setLayoutConfig(layout);
        const explicitIds = [...(Array.isArray(parsed.flashSaleIds) ? parsed.flashSaleIds : []), ...(Array.isArray(parsed.topSellingIds) ? parsed.topSellingIds : [])];
        if (explicitIds.length > 0) {
          const { data: pData } = await supabase.from('products').select('id,title,preview_image,price,original_price,category,seller_id,is_verified,file_url,is_featured,featured_until,ad_clicks,ad_impressions,views').in('id', explicitIds);
          if (pData) {
            promos = pData as Product[];
            setPromoProducts(promos);
          }
        }
      }

      const { text, maxPrice, minPrice } = parseSearchQuery(query);
      const from = (page - 1) * itemsPerPage;

      let dataRpc = supabase.from('products').select('id,title,preview_image,price,original_price,category,seller_id,is_verified,file_url,is_featured,featured_until,ad_clicks,ad_impressions,views', { count: 'estimated' });
      dataRpc = dataRpc.eq('is_enabled', true);
      if (selectedCat && selectedCat !== 'All') dataRpc = dataRpc.eq('category', selectedCat);
      if (maxPrice !== null) dataRpc = dataRpc.lte('price', maxPrice);
      if (minPrice !== null) dataRpc = dataRpc.gte('price', minPrice);
      if (text) {
        const term = `%${text}%`;
        dataRpc = dataRpc.or(`title.ilike.${term},description.ilike.${term},category.ilike.${term},format.ilike.${term},resolution.ilike.${term}`);
      }

      const isNewArrivalsView = !query && (!selectedCat || selectedCat === 'All');
      const orderedRpc = isNewArrivalsView
        ? dataRpc.order('created_at', { ascending: false })
        : dataRpc.order('is_featured', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });

      const { data, count: totalCount, error: sbError } = await robustFetch<Product[]>(orderedRpc.range(from, from + itemsPerPage - 1));
      if (sbError) throw sbError;

      const totalRes = totalCount || 0;
      const totalPgs = Math.ceil(totalRes / itemsPerPage) || 1;
      setTotalResults(totalRes);
      setTotalPages(totalPgs);

      const prods = data || [];
      setProducts(prods);
      setSyncStatus('live');

      // Save to cache for fast back navigation
      try {
        const cacheData = {
          data: {
            products: prods,
            promoProducts: promos,
            layoutConfig: layout,
            totalResults: totalRes,
            totalPages: totalPgs
          },
          timestamp: Date.now()
        };
        sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
        console.log(`💾 Cached data for key: ${cacheKey}`);
      } catch (e) {
        console.warn('Cache write failed:', e);
      }
    } catch (err: any) {
      setError(err.message || 'Database connection failure');
      setSyncStatus('idle');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [query, selectedCat, user?.role, currentPage, itemsPerPage]);

  useEffect(() => {
    const loadCategories = async () => {
      const dynamic = await getManagedCategories();
      setCategories([
        { name: 'All', img: 'https://cdn-icons-png.flaticon.com/128/3502/3502601.png' },
        ...dynamic
      ]);
    };

    loadCategories();
    fetchProducts(false, currentPage);
    const channel = supabase.channel('products_live_sync').on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchProducts(true, currentPage)).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchProducts, currentPage]);

  const handleCategoryClick = (catName: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (catName === 'All') nextParams.delete('cat'); else nextParams.set('cat', catName);
    nextParams.delete('p');
    setSearchParams(nextParams);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('p', newPage.toString());
      setSearchParams(nextParams);
    }
  };

  const handleBuyNow = async (product: Product) => {
    if (!user) {
      setPendingResumeAction({ type: 'autobuy', path: location.pathname, productId: product.id });
      const from = withQueryParams(getCurrentPath(location), { autobuy: product.id });
      navigate('/login', { state: { from } });
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || session.user.id !== user.id) {
      setPendingResumeAction({ type: 'autobuy', path: location.pathname, productId: product.id });
      const from = withQueryParams(getCurrentPath(location), { autobuy: product.id });
      navigate('/login', { state: { from } });
      return;
    }

    setProcessingId(product.id);
    try {
      const sdkLoaded = await ensureRazorpayLoaded();
      if (!sdkLoaded) {
        toast.error('Payment gateway failed to load. Please try again.');
        setProcessingId(null);
        return;
      }

      const razorpayKey = await getCachedSetting('razorpay_key_id', 300);
      if (!razorpayKey || razorpayKey.includes('your_key_here')) throw new Error('Merchant configuration pending.');

      const limitEnabled = await getCachedSettingBoolean('download_limit_enabled', true, 300);
      let globalLimit: number | null = null;
      if (limitEnabled) {
        const limitSetting = await getCachedSetting('default_download_limit', 300);
        const parsedLimit = parseInt(limitSetting || '', 10);
        globalLimit = isNaN(parsedLimit) ? null : parsedLimit;
      }

      const options = {
        key: razorpayKey, amount: Math.round(product.price * 100), currency: 'INR', name: 'DIGi QuRY Store', description: product.title,
        handler: async (response: any) => {
          const { error: orderError } = await supabase.from('orders').insert({
            user_id: user.id,
            product_id: product.id,
            payment_id: response.razorpay_payment_id,
            status: 'paid',
            unit_price: product.price,
            final_price: product.price,
            license_active: true,
            download_limit: globalLimit,
            download_count: 0
          });
          if (orderError) throw orderError;

          await refreshPurchases();
          toast.success('Purchase Successful!');
          navigate('/dashboard');
        },
        prefill: { name: user.name, email: user.email, contact: user.phone || '' }, theme: { color: '#2874f0' }, modal: { ondismiss: () => setProcessingId(null) }
      };
      new (window as any).Razorpay(options).open();
    } catch (err: any) { toast.error(err.message || 'Payment setup failed'); setProcessingId(null); }
  };

  useEffect(() => {
    if (!user || processingId) return;

    const resumeProductId = searchParams.get('autobuy');
    if (!resumeProductId) return;

    const pendingAction = getPendingResumeAction();
    if (!pendingAction || pendingAction.type !== 'autobuy' || pendingAction.path !== location.pathname || pendingAction.productId !== resumeProductId) {
      return;
    }

    const targetProduct =
      products.find((item) => item.id === resumeProductId) ||
      promoProducts.find((item) => item.id === resumeProductId);

    if (!targetProduct) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('autobuy');
    setSearchParams(nextParams, { replace: true });
    clearPendingResumeAction();
    handleBuyNow(targetProduct);
  }, [user, processingId, searchParams, products, promoProducts, location.pathname]);

  const flashSaleProducts = useMemo(() => {
    if (layoutConfig.flashSaleIds && layoutConfig.flashSaleIds.length > 0) {
      // Use manually selected products
      const selected = layoutConfig.flashSaleIds
        .map(id => promoProducts.find(p => p.id === id))
        .filter((p): p is Product => p !== undefined && p !== null);
      console.log('🔥 Flash Sale - Using manually selected products:', selected.length);
      if (selected.length > 0) return selected;
    }
    // Fall back to products with discounts (original_price > current price)
    const discounted = products.filter(p => p.original_price && p.price && p.original_price > p.price).slice(0, 4);
    if (discounted.length > 0) {
      console.log('🔥 Flash Sale - Using discounted products:', discounted.length);
      return discounted;
    }
    // Last resort: show featured or first few products
    const featured = products.filter(p => p.is_featured).slice(0, 4);
    console.log('🔥 Flash Sale - Fallback to featured products:', featured.length);
    return featured;
  }, [products, promoProducts, layoutConfig.flashSaleIds]);

  const topSellingProducts = useMemo(() => {
    if (layoutConfig.topSellingIds && layoutConfig.topSellingIds.length > 0) {
      // Use manually selected products
      const selected = layoutConfig.topSellingIds
        .map(id => promoProducts.find(p => p.id === id))
        .filter((p): p is Product => p !== undefined && p !== null);
      if (selected.length > 0) return selected;
    }
    // Fall back to most viewed/popular products (sorted by views, then ad_impressions, then featured status)
    return [...products]
      .sort((a, b) => {
        const aViews = a.views || 0;
        const bViews = b.views || 0;
        if (aViews !== bViews) return bViews - aViews;
        const aImpressions = a.ad_impressions || 0;
        const bImpressions = b.ad_impressions || 0;
        if (aImpressions !== bImpressions) return bImpressions - aImpressions;
        return (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0);
      })
      .slice(0, 5);
  }, [products, promoProducts, layoutConfig.topSellingIds]);

  const paginationRange = useMemo(() => {
    const range: (number | string)[] = [];
    const delta = 1;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i);
      } else if (range[range.length - 1] !== '...') {
        range.push('...');
      }
    }
    return range;
  }, [currentPage, totalPages]);

  const renderProductCard = (product: Product, keyPrefix: string, showSaleBadge: boolean = false) => {
    const owned = isPurchased(product.id), inCart = isInCart(product.id), wishlisted = isInWishlist(product.id), isProcessing = processingId === product.id;

    const order = owned ? purchasedOrders[product.id] : null;
    let allowedToDownload = false;
    let downloadText = 'Download';

    if (owned && order) {
      const access = canOrderDownload(order, { ignoreLimit: !downloadLimitsEnabled });
      allowedToDownload = access.allowed;
      const remaining = getRemainingDownloads(order, { ignoreLimit: !downloadLimitsEnabled });
      if (!allowedToDownload) {
        downloadText = 'Limit Reached';
      } else if (remaining !== null) {
        downloadText = `Download (${remaining})`;
      }
    }

    // Check if product is currently featured
    const isFeatured = product.is_featured && product.featured_until && new Date(product.featured_until) > new Date();

    return (
      <div key={`${keyPrefix}-${product.id}`} className={`group flex flex-col bg-white border border-gray-100 rounded-[1.5rem] hover:shadow-2xl transition-all duration-500 relative overflow-hidden`}>
        <Link
          to={`/product/${product.id}`}
          onClick={async () => {
            // Track ad click if product is featured (atomic via RPC to avoid race conditions)
            if (isFeatured) {
              supabase.rpc('increment_product_counters', {
                p_product_id: product.id,
                p_increment_views: false,
                p_increment_impressions: false,
                p_increment_clicks: true
              }).then(({ error }) => {
                if (error) {
                  // Fallback: best-effort non-atomic increment
                  supabase.from('products').update({ ad_clicks: (product.ad_clicks || 0) + 1 }).eq('id', product.id).then(() => undefined, () => undefined);
                }
              });
            }
          }}
          className="p-3 md:p-4 flex-grow"
        >
          <div className="h-32 md:h-44 w-full mb-4 bg-gray-50 rounded-2xl flex items-center justify-center p-3 relative overflow-hidden">
            <img src={product.preview_image} alt={product.title} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain group-hover:scale-110 transition-transform duration-700" />
            <button onClick={(e) => { e.preventDefault(); toggleWishlist(product); }} className={`absolute top-2 right-2 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center transition-all active:scale-75 z-10 ${wishlisted ? 'text-red-500' : 'text-gray-300 hover:text-red-400'}`}><i className={`${wishlisted ? 'fas' : 'far'} fa-heart text-sm`}></i></button>
            {owned && <div className="absolute top-2 left-2 bg-[#388e3c] text-white text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter shadow-sm z-10">Owned</div>}
            {showSaleBadge && product.original_price > product.price && !owned && (
              <div className="absolute top-2 left-2 bg-[#ff9f00] text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter shadow-sm z-10">Sale</div>
            )}
          </div>
          <h3 className="text-[12px] md:text-sm font-black text-gray-800 line-clamp-1 mb-1 group-hover:text-[#2874f0]">{product.title}</h3>
          <div className="flex items-center gap-1.5 mb-2"><span className="text-[9px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-tighter italic">{product.category}</span></div>
          <div className="flex items-center gap-2">
            <span className="text-base md:text-xl font-black text-gray-900">₹{product.price}</span>
            {product.original_price > product.price && <><span className="text-[10px] md:text-xs text-gray-400 line-through">₹{product.original_price}</span><span className="text-[10px] md:text-xs text-[#388e3c] font-black">{Math.round(((product.original_price - product.price) / product.original_price) * 100)}% off</span></>}
          </div>
        </Link>
        <div className="p-3 pt-0 border-t border-gray-50 mt-auto">
          <div className="flex gap-2 h-10 mt-3">
            {owned ? (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  if (order) {
                    if (!allowedToDownload) {
                      toast.error('Download limit reached or license cancelled.');
                      return;
                    }
                    resolveDownloadUrl(product.file_url || '').then(async ({ url, error }) => {
                      if (error || !url) {
                        toast.error(error || 'Download unavailable.');
                        return;
                      }
                      const currentCount = order.download_count || 0;
                      const incrementResult = user?.id
                        ? await incrementDownloadCountByUserProduct(user.id, product.id, currentCount, { ignoreLimit: !downloadLimitsEnabled })
                        : { ok: false, newCount: currentCount };

                      if (!incrementResult.ok) {
                        toast.error('Unable to track download right now. Please try again.');
                        return;
                      }
                      await refreshPurchases();
                      window.open(url, '_blank');
                    });
                  }
                }}
                disabled={!allowedToDownload}
                className={`w-full text-white rounded-xl text-[10px] font-black uppercase tracking-tight flex items-center justify-center gap-2 shadow-lg transition-all ${allowedToDownload ? 'bg-[#388e3c] hover:bg-[#2e7d32] active:scale-95' : 'bg-gray-400 cursor-not-allowed'}`}
              >
                <i className="fas fa-cloud-arrow-down"></i> {downloadText}
              </button>
            ) : (
              <>
                <button onClick={(e) => { e.preventDefault(); if (inCart) navigate('/cart'); else addToCart(product); }} className={`flex-1 rounded-xl text-[10px] font-black uppercase tracking-tight flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${inCart ? 'bg-[#2874f0] text-white' : 'bg-[#ff9f00] text-white'}`}><i className={`fas ${inCart ? 'fa-arrow-right' : 'fa-cart-plus'}`}></i> {inCart ? 'Cart' : 'Add'}</button>
                <button onClick={(e) => { e.preventDefault(); handleBuyNow(product); }} disabled={isProcessing} className="flex-1 bg-[#fb641b] text-white rounded-xl text-[10px] font-black uppercase tracking-tight flex items-center justify-center gap-2 shadow-lg hover:bg-[#e65a18] transition-all active:scale-95 disabled:opacity-50"><i className={`fas ${isProcessing ? 'fa-circle-notch fa-spin' : 'fa-bolt'}`}></i> {isProcessing ? '...' : 'Buy'}</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handlePullStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) pullStartY.current = e.touches[0].clientY;
  };

  const handlePullMove = (e: React.TouchEvent) => {
    if (pullRefreshing || window.scrollY > 0) return;
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0 && dy < PULL_THRESHOLD * 1.5) setPullY(dy);
  };

  const handlePullEnd = async () => {
    if (pullY >= PULL_THRESHOLD) {
      setPullRefreshing(true);
      hapticMedium();
      await fetchProducts(false, 1);
      setPullRefreshing(false);
    }
    setPullY(0);
    pullStartY.current = 0;
  };

  return (
    <div
      className="flex flex-col min-h-screen bg-[#f1f3f6] pb-12 md:pb-0"
      onTouchStart={handlePullStart}
      onTouchMove={handlePullMove}
      onTouchEnd={handlePullEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullY > 0 || pullRefreshing) && (
        <div
          className="fixed top-[56px] left-0 right-0 flex items-center justify-center z-[60] pointer-events-none transition-all"
          style={{ transform: `translateY(${Math.min(pullY, PULL_THRESHOLD) * 0.5}px)` }}
        >
          <div className="bg-white shadow-lg rounded-full w-10 h-10 flex items-center justify-center border border-gray-100">
            <i className={`fas ${pullRefreshing ? 'fa-circle-notch fa-spin text-[#2874f0]' : pullY >= PULL_THRESHOLD ? 'fa-arrow-up text-[#2874f0]' : 'fa-arrow-down text-gray-400'} text-sm`}></i>
          </div>
        </div>
      )}
      <div
        className="bg-white border-b shadow-sm overflow-x-auto no-scrollbar py-1.5 sticky z-50 -mt-1"
        style={{ top: 'calc(64px + env(safe-area-inset-top))' }}
      >
        <div className="max-w-7xl mx-auto flex justify-start md:justify-center gap-4 md:gap-10 px-4 min-w-max">
          {categories.map((cat, i) => {
            const isActive = (selectedCat === '' && cat.name === 'All') || selectedCat === cat.name;
            return (
              <button key={i} disabled={!isOnline} onClick={() => handleCategoryClick(cat.name)} className={`flex flex-col items-center gap-1 group w-14 md:w-20 outline-none transition-opacity ${!isOnline ? 'opacity-50 grayscale' : ''}`}>
                <div className={`w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center p-2 transition-all duration-300 ${isActive ? 'bg-blue-100 ring-2 ring-blue-500 scale-110 shadow-lg' : 'bg-gray-50 group-hover:bg-blue-50'}`}><img src={cat.img} alt={cat.name} className="w-full h-full object-contain" /></div>
                <span className={`text-[9px] md:text-[11px] font-black text-center truncate w-full ${isActive ? 'text-[#2874f0]' : 'text-gray-500'}`}>{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-7xl w-full mx-auto px-3 py-4 space-y-6">

        {/* Dynamic Banners (Clear Image Mode Supported) */}
        {isDefaultView && layoutConfig.showHero && (
          <div className="w-full">
            {loading ? (
              <div className="w-full aspect-[2/1] sm:aspect-[16/6] md:aspect-[16/5] lg:aspect-[16/4] rounded-3xl bg-gray-100 animate-pulse"></div>
            ) : (
              <div
                ref={carouselRef}
                className="relative w-full aspect-[2/1] sm:aspect-[16/6] md:aspect-[16/5] lg:aspect-[16/4] rounded-3xl overflow-hidden shadow-xl bg-gray-900 touch-none select-none"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div
                  className="flex h-full"
                  style={{
                    transform: `translateX(calc(-${activeBanner * 100}% + ${dragOffset}px))`,
                    transition: isDragging ? 'none' : `transform ${slideTransitionMs}ms cubic-bezier(0.22, 0.8, 0.3, 1)`,
                    willChange: 'transform'
                  }}
                >
                  {displayBanners.map((banner, index) => {
                    const hasText = banner.title || banner.sub || banner.cta;

                    const BannerContent = (
                      <div className="relative w-full h-full flex flex-col justify-center">
                        {banner.image_url ? (
                          <>
                            <img
                              src={banner.image_url}
                              alt={banner.title || 'Promo'}
                              loading={index === 0 ? 'eager' : 'lazy'}
                              decoding="async"
                              fetchPriority={index === 0 ? 'high' : 'auto'}
                              className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
                              draggable={false}
                            />
                            {hasText && <div className="absolute inset-0 bg-gradient-to-r from-black/80 to-transparent"></div>}
                          </>
                        ) : (
                          <div className={`absolute inset-0 bg-gradient-to-r ${banner.bg || 'from-gray-800 to-black'}`}></div>
                        )}

                        {hasText && (
                          <div className="relative z-20 p-3 sm:p-4 md:p-6 lg:p-8 max-w-xl pointer-events-none">
                            <span className="inline-block px-2 py-0.5 bg-white/20 text-white rounded-full text-[7px] sm:text-[8px] md:text-[9px] font-black uppercase tracking-widest mb-1 sm:mb-1.5 md:mb-2 backdrop-blur-sm border border-white/20">Featured</span>
                            {banner.title && <h1 className="text-sm sm:text-base md:text-2xl lg:text-3xl font-black text-white mb-1 sm:mb-1.5 md:mb-2 tracking-tight drop-shadow-md line-clamp-2">{banner.title}</h1>}
                            {banner.sub && <p className="text-white/90 text-[8px] sm:text-[9px] md:text-xs lg:text-sm font-medium mb-2 sm:mb-2.5 md:mb-3 line-clamp-1 md:line-clamp-2">{banner.sub}</p>}
                            {banner.cta && (
                              <button
                                onClick={(e) => { if (!banner.link_url) { e.preventDefault(); handleCategoryClick(banner.cat); } }}
                                className="pointer-events-auto bg-white text-gray-900 px-3 py-1 sm:px-4 sm:py-1.5 md:px-5 md:py-2 rounded-full font-black text-[8px] sm:text-[9px] md:text-xs lg:text-sm shadow-lg hover:scale-105 active:scale-95 transition-all"
                              >
                                {banner.cta} <i className="fas fa-arrow-right ml-1 text-[#2874f0]"></i>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );

                    return (
                      <div
                        key={banner.id || index}
                        className="min-w-full w-full h-full flex-shrink-0"
                      >
                        {banner.link_url ? (
                          <a href={banner.link_url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                            {BannerContent}
                          </a>
                        ) : (
                          BannerContent
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {!loading && displayBanners.length > 1 && (
              <div className="mt-2.5 sm:mt-3 flex justify-center">
                <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm px-2.5 sm:px-3 md:px-3.5 py-1.5 sm:py-1.5 md:py-2 rounded-full shadow-md border border-gray-200">
                  {displayBanners.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSlideTransitionMs(HERO_TRANSITION_BASE_MS);
                        setActiveBanner(i);
                      }}
                      className={`relative h-1 sm:h-1.5 rounded-full bg-gray-300 overflow-hidden transition-all duration-300 ${i === activeBanner ? 'w-8 sm:w-9 md:w-10' : 'w-2 sm:w-2.5 md:w-3'
                        }`}
                      aria-label={`Go to banner ${i + 1}`}
                    >
                      {i === activeBanner && (
                        <span
                          key={`${activeBanner}-${isDragging ? 'pause' : 'run'}`}
                          className="absolute left-0 top-0 h-full w-full origin-left scale-x-0 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full hero-dot-fill"
                          style={{ animationPlayState: isDragging ? 'paused' : 'running', animationDuration: `${HERO_AUTOPLAY_MS}ms` }}
                        ></span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {error && !products.length ? (
          <div className="bg-white p-12 rounded-[2rem] text-center fk-shadow"><i className="fas fa-satellite-dish text-3xl text-red-500 mb-6"></i><h2 className="text-xl font-black mb-2">Signal Lost</h2><button onClick={() => fetchProducts()} className="bg-[#2874f0] text-white px-10 py-3 rounded-xl font-black text-sm active:scale-95 transition-all mt-4">Retry</button></div>
        ) : (
          <div className="space-y-6">

            {/* Featured Ad Campaigns - Show on all pages */}
            {!loading ? (
              <AdComponent
                key={`home-ads-p${currentPage}`}
                placement="home"
                limit={isDesktop ? (isDefaultView ? 8 : 4) : (isDefaultView ? 6 : 2)}
                impressionScopeKey={`home::p=${currentPage}`}
              />
            ) : (
              <div className="h-[140px] rounded-2xl bg-gray-100 animate-pulse border border-gray-100"></div>
            )}

            {/* Recently Viewed Section */}
            {recentlyViewed.length > 0 && (
              <div className="bg-white p-4 md:p-6 fk-shadow rounded-2xl border border-gray-100">
                <h2 className="text-base md:text-lg font-black text-gray-900 flex items-center gap-2 mb-4">
                  <i className="fas fa-history text-[#2874f0]"></i> Recently Viewed
                </h2>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                  {recentlyViewed.map((item) => (
                    <Link key={item.id} to={`/product/${item.id}`} className="flex-shrink-0 w-28 md:w-36 group">
                      <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-100 group-hover:border-blue-200 transition-colors">
                        {item.thumbnail_url ? (
                          <img src={item.thumbnail_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <i className="fas fa-image text-gray-300 text-2xl"></i>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] font-bold text-gray-700 mt-1.5 line-clamp-2 leading-tight">{item.title}</p>
                      <p className="text-[12px] font-black text-[#2874f0] mt-0.5">₹{item.price}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Auto-Hiding Flash Sale Block */}
            {(() => {
              const shouldShow = isDefaultView && !loading && layoutConfig.showFlashSale && flashActive && flashSaleProducts.length > 0;
              if (loading && isDefaultView && layoutConfig.showFlashSale) {
                return <div className="h-[430px] rounded-2xl bg-gray-100 animate-pulse border border-gray-100"></div>;
              }
              return shouldShow && (
                <div className="bg-white p-4 md:p-6 fk-shadow rounded-2xl relative overflow-hidden border border-orange-100">
                  <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-100 pb-4 mb-5 gap-4">
                    <h2 className="text-lg md:text-xl font-black text-gray-900 flex items-center gap-3 tracking-tight"><i className="fas fa-bolt text-orange-500 text-2xl animate-pulse"></i> ⚡ FLASH SALE</h2>
                    {flashActive && layoutConfig.flashSaleEndTime && (
                      <div className="flex items-center gap-2 bg-orange-50 px-4 py-2 rounded-xl border border-orange-100">
                        <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest mr-2">Ends In:</span>
                        <div className="flex gap-2 text-sm font-black text-gray-800">
                          {timeLeft.d > 0 && <><span className="bg-white px-2 py-1 rounded shadow-sm min-w-[32px] text-center text-orange-600">{timeLeft.d}d</span><span className="text-orange-300"></span></>}
                          <span className="bg-white px-2 py-1 rounded shadow-sm min-w-[32px] text-center">{String(timeLeft.h).padStart(2, '0')}</span><span className="text-orange-300">:</span>
                          <span className="bg-white px-2 py-1 rounded shadow-sm min-w-[32px] text-center">{String(timeLeft.m).padStart(2, '0')}</span><span className="text-orange-300">:</span>
                          <span className="bg-white px-2 py-1 rounded shadow-sm min-w-[32px] text-center text-orange-600">{String(timeLeft.s).padStart(2, '0')}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3 md:gap-5">
                    {flashSaleProducts.map(p => renderProductCard(p, 'flash', true))}
                  </div>
                </div>
              );
            })()}

            {/* Top Selling Products Block */}
            {isDefaultView && layoutConfig.showTopSelling && (
              loading ? (
                <div className="h-[470px] rounded-2xl bg-gray-100 animate-pulse border border-gray-100"></div>
              ) : topSellingProducts.length > 0 ? (
                <div className="bg-white p-4 md:p-6 fk-shadow rounded-2xl relative overflow-hidden border border-emerald-100">
                  <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-100 pb-4 mb-5 gap-4">
                    <h2 className="text-lg md:text-xl font-black text-gray-900 flex items-center gap-3 tracking-tight"><i className="fas fa-crown text-emerald-500 text-2xl"></i> 👑 TOP SELLING</h2>
                    <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
                      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Trending Now</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-5">
                    {topSellingProducts.map(p => renderProductCard(p, 'grid'))}
                  </div>
                </div>
              ) : null
            )}



            <div className="bg-white p-4 md:p-6 fk-shadow rounded-2xl min-h-[500px] relative border border-gray-50">
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-100 pb-4 mb-6 gap-3">
                <h2 className="text-sm md:text-lg font-black uppercase tracking-tight text-gray-800 flex items-center gap-3">
                  <i className="fas fa-fire text-orange-500"></i>
                  {query ? `Searching: "${query}"` : selectedCat ? `${selectedCat} Assets` : '🆕 NEW ARRIVALS'}
                </h2>
                <span className="text-gray-400 text-[10px] md:text-xs font-black uppercase tracking-widest bg-gray-50 px-3 py-1 rounded-full border border-gray-100">{totalResults} Assets</span>
              </div>
              {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => <div key={i} className="h-64 bg-gray-50 animate-pulse rounded-2xl border border-gray-100"></div>)}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-5">
                    {products.map(p => renderProductCard(p, 'grid'))}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 pb-8 pt-10 border-t border-gray-100 mt-8 md:mt-12">
                      <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="flex items-center gap-1 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-white border border-gray-200 text-[#2874f0] font-black text-[10px] md:text-[11px] uppercase shadow-sm disabled:opacity-30 active:scale-95 transition-all">
                        <i className="fas fa-chevron-left"></i> <span className="hidden sm:inline">Prev</span>
                      </button>
                      <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
                        {paginationRange.map((page, idx) => (
                          <React.Fragment key={idx}>
                            {page === '...' ? (
                              <span className="px-1 md:px-2 text-gray-400 font-black text-xs">...</span>
                            ) : (
                              <button onClick={() => handlePageChange(page as number)} className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl font-black text-xs sm:text-sm transition-all active:scale-90 ${currentPage === page ? 'bg-[#2874f0] text-white shadow-lg shadow-blue-500/20' : 'bg-white border border-gray-100 text-gray-600 hover:border-blue-300 hover:text-blue-600'}`}>{page}</button>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                      <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="flex items-center gap-1 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-white border border-gray-200 text-[#2874f0] font-black text-[10px] md:text-[11px] uppercase shadow-sm disabled:opacity-30 active:scale-95 transition-all">
                        <span className="hidden sm:inline">Next</span> <i className="fas fa-chevron-right"></i>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

