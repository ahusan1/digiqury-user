import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { useNavigate, useSearchParams, Link, useLocation, useNavigationType } from 'react-router-dom';
import { supabase, robustFetch } from '../lib/supabase.ts';
import { appCache } from '../lib/cache.ts';
import { getCachedSetting, getCachedSettingBoolean } from '../lib/settingsCache.ts';
import { Product } from '../types.ts';
import { AuthContext } from '../App.tsx';
import { toast } from 'react-hot-toast';
import { canOrderDownload, getRemainingDownloads, resolveDownloadUrl, incrementDownloadCountByUserProduct } from '../lib/downloadAccess.ts';
import { AdComponent } from '../components/AdComponent.tsx';
import { DEFAULT_CATEGORIES } from '../lib/categories.ts';
import { clearPendingResumeAction, getCurrentPath, getPendingResumeAction, setPendingResumeAction, withQueryParams } from '../lib/loginRedirect.ts';
import { openRazorpayCheckout } from '../lib/razorpay.ts';
import { notifyPurchaseActivity } from '../lib/activityNotifications.ts';
import { downloadAssetToDevice } from '../lib/downloadedAssets.ts';

const ITEMS_PER_PAGE = 10;

interface StoreSearchResult {
  id: string;
  store_name: string | null;
  store_logo?: string | null;
  is_verified_seller?: boolean | null;
}

// Smart query parser for price filters
const parseSearchQuery = (q: string) => {
  let text = q.trim().toLowerCase();
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

  if (/^\d+$/.test(text) && !maxPrice && !minPrice) {
    maxPrice = parseInt(text, 10);
    text = ''; 
  }

  return { text, maxPrice, minPrice };
};

export const Search: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  
  // Get active state directly from URL for perfect History/Back Button management
  const urlQuery = searchParams.get('q') || '';
  const urlPid = searchParams.get('pid') || null;
  const urlStoreId = searchParams.get('storeId') || null;
  const urlPage = parseInt(searchParams.get('p') || '1', 10);
  
  const [query, setQuery] = useState(urlQuery);
  const [submittedQuery, setSubmittedQuery] = useState(urlQuery);
  const [prioritizedProductId, setPrioritizedProductId] = useState<string | null>(urlPid);
  const [currentPage, setCurrentPage] = useState(urlPage);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  
  const [isFocused, setIsFocused] = useState(false);
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
  
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allStores, setAllStores] = useState<StoreSearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [storeSuggestions, setStoreSuggestions] = useState<StoreSearchResult[]>([]);
  const [gridResults, setGridResults] = useState<Product[]>([]);
  const [discoverPool, setDiscoverPool] = useState<string[]>([]);
  const [discoverTags, setDiscoverTags] = useState<string[]>([]);
  const [selectedStore, setSelectedStore] = useState<StoreSearchResult | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);

  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
  const isRestoringScrollRef = useRef(false);
  const routeKey = `${location.pathname}${location.search}${location.hash}`;
  const historyScrollField = '__searchScroll';
  const scrollStorageKey = `search_scroll_${routeKey}`;

  // Added cart to AuthContext destructuring
  const { user, cart, addToCart, isInCart, toggleWishlist, isInWishlist, isPurchased, purchasedOrders, refreshPurchases, downloadLimitsEnabled } = useContext(AuthContext);

  const cartCount = cart?.length || 0;

  const persistSearchScrollSnapshot = () => {
    const container = scrollContainerRef.current;
    if (!container || isRestoringScrollRef.current) return;

    const top = container.scrollTop;
    sessionStorage.setItem(scrollStorageKey, String(top));

    const state = window.history.state ?? {};
    if (state[historyScrollField] !== top) {
      try {
        window.history.replaceState({ ...state, [historyScrollField]: top }, '');
      } catch {
        // Ignore replaceState limits on some mobile browsers.
      }
    }
  };

  // Keep internal scroll position of the search results container per URL state.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let lastHistoryWrite = 0;

    const saveContainerScroll = (persistToHistory = false) => {
      if (isRestoringScrollRef.current) return;

      const top = container.scrollTop;
      sessionStorage.setItem(scrollStorageKey, String(top));

      if (!persistToHistory) return;

      // Bind scroll position to current history entry (throttled + safe for mobile browsers).
      const now = Date.now();
      if (now - lastHistoryWrite < 250) return;
      lastHistoryWrite = now;

      const state = window.history.state ?? {};
      if (state[historyScrollField] === top) return;
      try {
        window.history.replaceState({ ...state, [historyScrollField]: top }, '');
      } catch {
        // Ignore replaceState limits on some mobile browsers.
      }
    };
    const onScrollSave = () => saveContainerScroll(false);
    const saveOnPointerDown = () => saveContainerScroll(true);
    const saveOnTouchStart = () => saveContainerScroll(true);
    const saveOnMouseDown = () => saveContainerScroll(true);
    const saveOnClick = () => saveContainerScroll(true);
    const saveOnPageHide = () => saveContainerScroll(true);
    const saveOnVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveContainerScroll(true);
    };

    container.addEventListener('scroll', onScrollSave, { passive: true });
    window.addEventListener('pagehide', saveOnPageHide);
    document.addEventListener('visibilitychange', saveOnVisibilityChange);
    document.addEventListener('pointerdown', saveOnPointerDown, true);
    document.addEventListener('touchstart', saveOnTouchStart, true);
    document.addEventListener('mousedown', saveOnMouseDown, true);
    document.addEventListener('click', saveOnClick, true);

    return () => {
      container.removeEventListener('scroll', onScrollSave);
      window.removeEventListener('pagehide', saveOnPageHide);
      document.removeEventListener('visibilitychange', saveOnVisibilityChange);
      document.removeEventListener('pointerdown', saveOnPointerDown, true);
      document.removeEventListener('touchstart', saveOnTouchStart, true);
      document.removeEventListener('mousedown', saveOnMouseDown, true);
      document.removeEventListener('click', saveOnClick, true);
    };
  }, [scrollStorageKey, historyScrollField]);

  // Restore after result list settles so Back returns to the exact old position.
  useEffect(() => {
    if (loading) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const savedScroll = sessionStorage.getItem(scrollStorageKey);
    const parsedScroll = savedScroll ? parseInt(savedScroll, 10) : NaN;
    const stateScrollRaw = window.history.state?.[historyScrollField];
    const stateScroll =
      typeof stateScrollRaw === 'number'
        ? stateScrollRaw
        : parseInt(String(stateScrollRaw ?? ''), 10);
    const targetY =
      navigationType === 'POP'
        ? (
            !Number.isNaN(stateScroll)
              ? stateScroll
              : (!Number.isNaN(parsedScroll) ? parsedScroll : 0)
          )
        : 0;

    const restore = () => {
      container.scrollTop = targetY;
    };

    if (navigationType !== 'POP') {
      isRestoringScrollRef.current = false;
      restore();
      return;
    }

    isRestoringScrollRef.current = true;
    let attempts = 0;
    const maxAttempts = 60;
    let intervalId: number | null = null;
    const stop = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      isRestoringScrollRef.current = false;
    };

    const restoreWithRetry = () => {
      restore();
      attempts += 1;
      if (attempts >= maxAttempts || Math.abs(container.scrollTop - targetY) <= 2) {
        stop();
      }
    };

    restoreWithRetry();
    const rafId = requestAnimationFrame(restoreWithRetry);
    const timeoutId = setTimeout(restoreWithRetry, 120);
    const lateTimeoutId = setTimeout(restoreWithRetry, 350);
    intervalId = window.setInterval(restoreWithRetry, 100);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      clearTimeout(lateTimeoutId);
      stop();
    };
  }, [scrollStorageKey, loading, navigationType, historyScrollField]);

  // Sync state when URL changes (Hardware Back Button support)
  useEffect(() => {
    setQuery(urlQuery);
    setSubmittedQuery(urlQuery);
    setPrioritizedProductId(urlPid);
    setCurrentPage(urlPage);
  }, [urlQuery, urlPid, urlPage]);

  // Auto-Focus only on initial mount when there's no search query
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      
      // Only auto-focus if no search is active (empty query and no pid)
      // This allows users to start fresh search, but not for pagination/results view
      if (!urlQuery && !urlPid && inputRef.current) {
        inputRef.current.focus();
        setIsFocused(true);
      }
    }
  }, []);

  // Handle responsive ad limit based on screen size
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch all active products ONLY ONCE for instant typing suggestions
  useEffect(() => {
    const fetchAllProducts = async () => {
      const products = await appCache.getOrSet<Product[]>(
        'products:enabled:all:v1',
        async () => {
          const { data } = await robustFetch<Product[]>(
            supabase.from('products').select('*').eq('is_enabled', true).order('created_at', { ascending: false })
          );
          return data || [];
        },
        120
      );
      setAllProducts(products);
    };
    fetchAllProducts();
  }, []);

  useEffect(() => {
    const fetchAllStores = async () => {
      const { data } = await robustFetch<StoreSearchResult[]>(
        supabase
          .from('users')
          .select('id,store_name,store_logo,is_verified_seller')
          .not('store_name', 'is', null)
          .order('store_name', { ascending: true })
          .limit(500)
      );
      setAllStores((data || []).filter((store) => !!store.store_name));
    };
    fetchAllStores();
  }, []);

  const shuffleArray = (items: string[]) => {
    return [...items].sort(() => 0.5 - Math.random());
  };

  useEffect(() => {
    const categories: string[] = Array.from(
      new Set(allProducts.map((p) => p.category).filter((value): value is string => Boolean(value)))
    );
    const titles: string[] = Array.from(
      new Set(allProducts.map((p) => p.title).filter((value): value is string => Boolean(value)))
    );
    
    // Half categories, half product titles, mixed together
    const halfCats = shuffleArray(categories).slice(0, 4);
    const halfTitles = shuffleArray(titles).slice(0, 4);
    const pool = shuffleArray([...halfCats, ...halfTitles]); // Shuffle the combined array

    const fallback = DEFAULT_CATEGORIES.map((category) => category.name);
    const nextPool = pool.length > 0 ? pool : fallback;
    setDiscoverPool(nextPool);
    setDiscoverTags(nextPool);
  }, [allProducts]);

  // Instant Suggestions from local memory
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setStoreSuggestions([]);
      return;
    }
    const { text, maxPrice, minPrice } = parseSearchQuery(query);
    const matches = allProducts.filter(product => {
      if (maxPrice !== null && product.price > maxPrice) return false;
      if (minPrice !== null && product.price < minPrice) return false;
      if (text) {
        const searchableContent = `${product.title} ${product.description} ${product.category} ${product.format} ${product.resolution}`.toLowerCase();
        if (!searchableContent.includes(text)) return false;
      }
      return true;
    });
    setSuggestions(matches.slice(0, 8));

    const storeTerm = query.trim().toLowerCase();
    const matchedStores = allStores.filter((store) =>
      (store.store_name || '').toLowerCase().includes(storeTerm)
    );
    setStoreSuggestions(matchedStores.slice(0, 6));
  }, [query, allProducts, allStores]);

  const matchingStores = useMemo(() => {
    if (!submittedQuery.trim() || urlStoreId) return [];
    const term = submittedQuery.trim().toLowerCase();
    return allStores
      .filter((store) => (store.store_name || '').toLowerCase().includes(term))
      .slice(0, 8);
  }, [submittedQuery, allStores, urlStoreId]);

  useEffect(() => {
    const hydrateSelectedStore = async () => {
      if (!urlStoreId) {
        setSelectedStore(null);
        return;
      }

      const fromList = allStores.find((store) => store.id === urlStoreId);
      if (fromList) {
        setSelectedStore(fromList);
        return;
      }

      const { data } = await robustFetch<StoreSearchResult>(
        supabase
          .from('users')
          .select('id,store_name,store_logo,is_verified_seller')
          .eq('id', urlStoreId)
          .single()
      );
      setSelectedStore(data || null);
    };

    hydrateSelectedStore();
  }, [urlStoreId, allStores]);

  // Fetch Main Grid Results from Database with Pagination
  useEffect(() => {
    const fetchGridData = async () => {
      if (!submittedQuery.trim() && !prioritizedProductId) {
        setGridResults([]);
        setTotalResults(0);
        setTotalPages(1);
        return;
      }

      setLoading(true);

      if (urlStoreId) {
        const PRODUCT_DISPLAY_COLS = 'id,title,preview_image,price,original_price,category,seller_id,is_verified,file_url';
        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        const dataResult = await robustFetch<Product[]>(
          supabase
            .from('products')
            .select(PRODUCT_DISPLAY_COLS, { count: 'estimated' })
            .eq('is_enabled', true)
            .eq('seller_id', urlStoreId)
            .order('created_at', { ascending: false })
            .range(from, to)
        );

        const total = dataResult.count || 0;
        setTotalResults(total);
        setTotalPages(Math.ceil(total / ITEMS_PER_PAGE) || 1);
        setGridResults(dataResult.data || []);
        setLoading(false);
        return;
      }

      const { text, maxPrice, minPrice } = parseSearchQuery(submittedQuery);

      let categoryToInclude = '';
      let clickedProduct: Product | null = null;
      
      if (prioritizedProductId) {
        const pProd = allProducts.find(p => p.id === prioritizedProductId);
        if (pProd) {
            categoryToInclude = pProd.category;
            clickedProduct = pProd;
        } else {
            const { data: pData } = await supabase.from('products').select('*').eq('id', prioritizedProductId).single();
            if (pData) {
              categoryToInclude = pData.category;
              clickedProduct = pData as Product;
            }
        }
      }

      // On Page 1 with prioritized product: fetch clicked + same category products + title/text matches
      if (currentPage === 1 && clickedProduct) {
        let categoryProducts: Product[] = [];
        let titleMatches: Product[] = [];

        const clickedTitle = clickedProduct.title.toLowerCase().trim();
        
        // Fetch all products from same category
        if (categoryToInclude) {
          const { data: catData } = await robustFetch<Product[]>(
            supabase.from('products').select('*').eq('is_enabled', true).eq('category', categoryToInclude).limit(100)
          );
          categoryProducts = (catData || []).filter(p => p.id !== clickedProduct.id);
        }

        // Fetch products with similar titles
        if (clickedTitle) {
          let titleQuery = supabase.from('products').select('*').eq('is_enabled', true).neq('id', clickedProduct.id);
          const term = `%${clickedTitle}%`;
          titleQuery = titleQuery.or(`title.ilike.${term},description.ilike.${term}`);
          const { data: titleData } = await robustFetch<Product[]>(titleQuery.limit(100));
          titleMatches = titleData || [];
        }

        // Combine: clicked product + category products + title matches (remove duplicates)
        const seen = new Set<string>();
        const combined: Product[] = [];
        
        // Add clicked product first
        combined.push(clickedProduct);
        seen.add(clickedProduct.id);

        // Add category products
        categoryProducts.forEach(p => {
          if (!seen.has(p.id)) {
            combined.push(p);
            seen.add(p.id);
          }
        });

        // Add title/text matches
        titleMatches.forEach(p => {
          if (!seen.has(p.id)) {
            combined.push(p);
            seen.add(p.id);
          }
        });

        setTotalResults(combined.length);
        setTotalPages(Math.ceil(combined.length / ITEMS_PER_PAGE) || 1);
        setGridResults(combined.slice(0, ITEMS_PER_PAGE));
      } else {
        // Pages 2+ or search without prioritized product: standard query
        // Only fetch columns needed for display; use 'estimated' count (fast) instead of 'exact'
        const PRODUCT_DISPLAY_COLS = 'id,title,preview_image,price,original_price,category,seller_id,is_verified,file_url';
        let rpcData = supabase.from('products').select(PRODUCT_DISPLAY_COLS, { count: 'estimated' }).eq('is_enabled', true);

        if (maxPrice !== null) { rpcData = rpcData.lte('price', maxPrice); }
        if (minPrice !== null) { rpcData = rpcData.gte('price', minPrice); }

        if (text) {
          const term = `%${text}%`;
          const orCondition = `title.ilike.${term},description.ilike.${term},category.ilike.${term},format.ilike.${term},resolution.ilike.${term}`;
          rpcData = rpcData.or(orCondition);
        }

        if (categoryToInclude) {
          rpcData = rpcData.eq('category', categoryToInclude);
        }

        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        const dataResult = await robustFetch<Product[]>(rpcData.order('created_at', { ascending: false }).range(from, to));

        const total = dataResult.count || 0;
        setTotalResults(total);
        setTotalPages(Math.ceil(total / ITEMS_PER_PAGE) || 1);
        setGridResults(dataResult.data || []);
      }

      setLoading(false);
    };

    fetchGridData();
  }, [submittedQuery, prioritizedProductId, currentPage, allProducts, urlStoreId]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setIsFocused(true);
  };

  const handleDiscoverTagClick = (tag: string) => {
    setIsFocused(false);
    if (inputRef.current) inputRef.current.blur();
    
    // Check if tag is a product title
    const matchedProduct = allProducts.find(p => p.title.toLowerCase() === tag.toLowerCase());
    
    if (matchedProduct) {
      // If it's a product, set it as prioritized and search by its category
      setSearchParams({ q: matchedProduct.category, pid: matchedProduct.id, p: '1' });
    } else {
      // Otherwise search by category/tag name
      setSearchParams({ q: tag, p: '1' });
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsFocused(false);
    if (inputRef.current) inputRef.current.blur();
    
    const newQ = query.trim();
    if (newQ === urlQuery && urlPid === null && urlPage === 1) return;

    if (newQ) {
      setSearchParams({ q: newQ, p: '1' });
    } else {
      setSearchParams({});
    }
  };

  const handleSuggestionClick = (p: Product) => {
    setIsFocused(false);
    if (inputRef.current) inputRef.current.blur();
    // Search by category when clicking a product suggestion, not by product title
    setSearchParams({ q: p.category, pid: p.id, p: '1' });
  };

  const handleStoreSuggestionClick = (store: StoreSearchResult) => {
    setIsFocused(false);
    if (inputRef.current) inputRef.current.blur();
    persistSearchScrollSnapshot();
    navigate(`/store/${store.id}`);
  };

  const clearSearch = () => {
    setQuery('');
    if (inputRef.current) inputRef.current.focus();
    setIsFocused(true);
  };

  const handleBackClick = () => {
    if (isFocused) {
      setIsFocused(false);
      if (inputRef.current) inputRef.current.blur();
    } else {
      persistSearchScrollSnapshot();
      // Navigates back in history (pops search param or exits page natively)
      navigate(-1);
    }
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      // Ensure input is not focused when paginating
      setIsFocused(false);
      if (inputRef.current) inputRef.current.blur();
      persistSearchScrollSnapshot();
      
      const params: any = {};
      if (urlQuery) params.q = urlQuery;
      if (urlPid) params.pid = urlPid;
      if (urlStoreId) params.storeId = urlStoreId;
      params.p = page.toString();
      
      setSearchParams(params); // Pushes history so back works for pages too
    }
  };

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
      const razorpayKey = await getCachedSetting('razorpay_key_id', 300);
      if (!razorpayKey || razorpayKey.includes('your_key_here')) throw new Error('Merchant configuration pending.');
      
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

          await refreshPurchases();
          toast.success('Purchase Successful!');
          void notifyPurchaseActivity({
            productIds: [product.id],
            itemCount: 1,
            totalAmount: Number(product.price || 0),
            paymentId: String(response?.razorpay_payment_id || ''),
            buyerName: user?.name || 'User',
          });
          navigate('/dashboard');
        },
        prefill: { name: user.name, email: user.email, contact: user.phone || '' }, theme: { color: '#2874f0' }, modal: { ondismiss: () => setProcessingId(null) }
      };
      await openRazorpayCheckout(options);
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
      gridResults.find((item) => item.id === resumeProductId) ||
      allProducts.find((item) => item.id === resumeProductId);

    if (!targetProduct) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('autobuy');
    setSearchParams(nextParams, { replace: true });
    clearPendingResumeAction();
    handleBuyNow(targetProduct);
  }, [user, processingId, searchParams, gridResults, allProducts, location.pathname]);

  const renderProductCard = (product: Product, isHighlighted: boolean) => {
    const owned = isPurchased(product.id);
    const inCart = isInCart(product.id);
    const wishlisted = isInWishlist(product.id);
    const isProcessing = processingId === product.id;
    
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

    return (
      <div 
        key={product.id} 
        className={`group flex flex-col bg-white border rounded-[1.5rem] hover:shadow-2xl transition-all duration-500 relative overflow-hidden ${isHighlighted ? 'border-[#2874f0] shadow-blue-500/10' : 'border-gray-100'}`}
      >
        {isHighlighted && (
          <div className="absolute top-0 left-0 w-full h-1 bg-[#2874f0] z-20 animate-pulse"></div>
        )}
        <Link
          to={`/product/${product.id}`}
          onPointerDownCapture={persistSearchScrollSnapshot}
          onTouchStartCapture={persistSearchScrollSnapshot}
          onMouseDownCapture={persistSearchScrollSnapshot}
          onClickCapture={persistSearchScrollSnapshot}
          className="p-3 md:p-4 flex-grow"
        >
          <div className="h-32 md:h-44 w-full mb-4 bg-gray-50 rounded-2xl flex items-center justify-center p-3 relative overflow-hidden min-h-[128px]">
            {product.preview_image && product.preview_image.trim() ? (
              <img 
                src={normalizeImageUrl(product.preview_image)} 
                alt={product.title} 
                loading="eager"
                decoding="sync"
                                width="300"
                                height="200"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22150%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22200%22 height=%22150%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2214%22 fill=%22%239ca3af%22%3ENo Image%3C/text%3E%3C/svg%3E';
                  img.style.display = 'block';
                }}
                style={{
                  display: 'block',
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 150%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22200%22 height=%22150%22/%3E%3Cpath d=%22M20 125l45-45 28 28 34-34 53 51%22 stroke=%22%23d1d5db%22 stroke-width=%224%22 fill=%22none%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3Ccircle cx=%2275%22 cy=%2258%22 r=%2212%22 fill=%22%23e5e7eb%22/%3E%3C/svg%3E")',
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat'
                }}
                className="h-full w-full object-contain group-hover:scale-110 transition-transform duration-700" 
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm font-semibold bg-gradient-to-br from-gray-100 to-gray-50">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <button onClick={(e) => { e.preventDefault(); toggleWishlist(product); }} className={`absolute top-2 right-2 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center transition-all active:scale-75 z-10 ${wishlisted ? 'text-red-500' : 'text-gray-300 hover:text-red-400'}`}><i className={`${wishlisted ? 'fas' : 'far'} fa-heart text-sm`}></i></button>
            {owned && <div className="absolute top-2 left-2 bg-[#388e3c] text-white text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter shadow-sm z-10">Owned</div>}
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

                        if (!user?.id) {
                          toast.error('Please login again to continue download.');
                          return;
                        }

                        await downloadAssetToDevice({
                          userId: user.id,
                          productId: String(product.id),
                          title: String(product.title || 'Asset'),
                          sourceUrl: url,
                          sourcePath: String(product.file_url || ''),
                          previewImage: String(product.preview_image || ''),
                        });
                        toast.success('Asset saved to your device');
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
                  <button onClick={(e) => { e.preventDefault(); if(inCart) navigate('/cart'); else addToCart(product); }} className={`flex-1 rounded-xl text-[10px] font-black uppercase tracking-tight flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${inCart ? 'bg-[#2874f0] text-white' : 'bg-[#ff9f00] text-white'}`}><i className={`fas ${inCart ? 'fa-arrow-right' : 'fa-cart-plus'}`}></i> {inCart ? 'Cart' : 'Add'}</button>
                  <button onClick={(e) => { e.preventDefault(); handleBuyNow(product); }} disabled={isProcessing} className="flex-1 bg-[#fb641b] text-white rounded-xl text-[10px] font-black uppercase tracking-tight flex items-center justify-center gap-2 shadow-lg hover:bg-[#e65a18] transition-all active:scale-95 disabled:opacity-50"><i className={`fas ${isProcessing ? 'fa-circle-notch fa-spin' : 'fa-bolt'}`}></i> {isProcessing ? '...' : 'Buy'}</button>
                </>
              )}
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[#f1f3f6] flex flex-col h-[100dvh]">
      {/* Search Header */}
      <div className="bg-[#2874f0] text-white flex items-center h-14 md:h-16 px-3 shadow-md shrink-0 relative z-50">
        <button 
          onClick={handleBackClick} 
          className="p-2 mr-2 hover:bg-white/10 rounded-full active:scale-90 transition-all flex items-center justify-center shrink-0"
        >
          <i className="fas fa-arrow-left text-lg"></i>
        </button>
        <form onSubmit={handleSearchSubmit} className="flex-grow relative flex items-center bg-white rounded-md overflow-hidden h-10 shadow-inner group focus-within:ring-2 focus-within:ring-[#ffe500]">
          <i className="fas fa-search text-gray-400 ml-3"></i>
          <input 
            ref={inputRef}
            type="text" 
            placeholder="Search assets, categories..."
            className="w-full h-full px-3 text-sm text-black outline-none font-medium placeholder-gray-400"
            value={query}
            onChange={handleQueryChange}
            onFocus={() => setIsFocused(true)}
          />
          {query && (
            <button 
              type="button"
              onClick={clearSearch} 
              className="p-2 text-gray-400 hover:text-red-500 mr-1 transition-colors z-10"
            >
              <i className="fas fa-times"></i>
            </button>
          )}
        </form>

        {/* CART ICON ADDED HERE */}
        <Link to="/cart" className="relative p-2 ml-2 hover:bg-white/10 rounded-full transition-all flex items-center justify-center shrink-0">
          <i className="fas fa-shopping-cart text-lg"></i>
          {cartCount > 0 && (
            <span className="absolute top-0 right-0 bg-[#ff9f00] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
              {cartCount}
            </span>
          )}
        </Link>

        {/* Floating Suggestions Dropdown */}
        {isFocused && query.trim() && (
          <div className="absolute top-full left-0 right-0 md:left-14 md:right-14 mt-2 bg-white shadow-2xl rounded-xl border border-gray-100 overflow-hidden z-[100] max-h-[60vh] overflow-y-auto">
            <button 
               type="button"
               onMouseDown={(e) => { e.preventDefault(); handleSearchSubmit(); }} 
               className="w-full flex items-center gap-3 p-4 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors"
            >
               <i className="fas fa-search text-[#2874f0] text-lg"></i>
               <span className="text-sm font-bold text-[#2874f0]">Search for "{query}"</span>
            </button>

            {suggestions.map(p => (
               <button 
                  key={p.id} 
                  type="button"
                  onMouseDown={(e) => {
                      e.preventDefault();
                      handleSuggestionClick(p);
                  }} 
                  className="w-full flex items-center gap-4 p-3 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors"
               >
                   <img src={p.preview_image} loading="lazy" decoding="async" className="w-10 h-10 rounded-md object-contain border border-gray-100 p-1 bg-white shrink-0" alt="" />
                   <div className="flex-grow min-w-0">
                       <p className="text-sm font-bold text-gray-800 truncate">{p.title}</p>
                       <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">{p.category}</p>
                   </div>
                   <i className="fas fa-arrow-up -rotate-45 text-gray-300 shrink-0"></i>
               </button>
            ))}
          </div>
        )}
      </div>

      {/* Backdrop for Dropdown */}
      {isFocused && query.trim() && (
        <div 
          className="absolute inset-0 top-14 md:top-16 z-40 bg-black/40 backdrop-blur-sm" 
          onMouseDown={(e) => { e.preventDefault(); setIsFocused(false); }}
        ></div>
      )}

      {/* Main Body - Scrollable Container */}
      <div 
        ref={scrollContainerRef}
        className="flex-grow overflow-y-auto bg-[#f1f3f6] relative pb-24"
      >
        <div className="max-w-7xl mx-auto p-3 md:py-6 md:px-6 min-h-full flex flex-col">
          {!submittedQuery.trim() && !prioritizedProductId ? (
            <div className="pt-4 bg-white p-6 md:rounded-2xl shadow-sm border border-gray-100 flex-grow md:flex-grow-0">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                 <i className="fas fa-bolt text-[#ffe500]"></i> Discover More
              </h3>
              <div className="flex flex-wrap gap-2">
                {discoverTags.map(tag => (
                  <button 
                    key={tag} 
                    onClick={() => handleDiscoverTagClick(tag)}
                    className="bg-gray-50 border border-gray-200 text-gray-700 px-4 py-2 rounded-full text-xs font-bold hover:bg-blue-50 hover:border-blue-200 hover:text-[#2874f0] transition-colors shadow-sm"
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <AdComponent placement="search" limit={isDesktop ? 8 : 4} impressionScopeKey="discover" />
            </div>
          ) : loading ? (
             <div className="flex flex-col items-center justify-center py-32 text-gray-400 flex-grow">
               <i className="fas fa-circle-notch fa-spin text-3xl text-[#2874f0] mb-4"></i>
               <p className="text-xs font-bold uppercase tracking-widest">Loading Database...</p>
             </div>
          ) : gridResults.length > 0 ? (
            <div className="space-y-4 p-1 md:p-0 flex-grow">
               <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-50">
                 <h2 className="text-sm md:text-lg font-black uppercase tracking-tight text-gray-800 flex items-center gap-2">
                   <i className="fas fa-search text-[#2874f0]"></i>
                   {urlStoreId
                     ? `${selectedStore?.store_name || 'Store'} Products`
                     : (prioritizedProductId ? 'Top Match & Related' : `Results for "${submittedQuery}"`)}
                 </h2>
                 <span className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                   {totalResults} {urlStoreId ? 'Products' : 'Matches Found'}
                 </span>
               </div>

               {!urlStoreId && matchingStores.length > 0 && (
                 <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-500 mb-3">Matching Stores</h3>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                     {matchingStores.map((store) => (
                       <button
                         key={store.id}
                         onClick={() => handleStoreSuggestionClick(store)}
                         className="text-left p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/40 transition-all flex items-center gap-3"
                       >
                         <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 overflow-hidden flex items-center justify-center shrink-0 text-[#2874f0]">
                           {store.store_logo ? (
                             <img src={store.store_logo} loading="lazy" decoding="async" alt={store.store_name || 'Store'} className="w-full h-full object-cover" />
                           ) : (
                             <i className="fas fa-store text-sm"></i>
                           )}
                         </div>
                         <div className="min-w-0">
                           <div className="flex items-center gap-1.5">
                             <p className="text-sm font-black text-gray-800 truncate">{store.store_name}</p>
                             {store.is_verified_seller && (
                               <svg width="12" height="12" className="shrink-0" style={{ fill: '#0073e6' }} viewBox="0 0 24 24"><path d="M23,12L20.56,9.22L20.9,5.54L17.29,4.72L15.4,1.54L12,3L8.6,1.54L6.71,4.72L3.1,5.53L3.44,9.21L1,12L3.44,14.78L3.1,18.47L6.71,19.29L8.6,22.47L12,21L15.4,22.46L17.29,19.28L20.9,18.46L20.56,14.78L23,12M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9L10,17Z"></path></svg>
                             )}
                           </div>
                           <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">View store products</p>
                         </div>
                       </button>
                     ))}
                   </div>
                 </div>
               )}

               {urlStoreId && selectedStore && (
                 <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-50 flex items-center justify-between gap-4">
                   <div className="flex items-center gap-3 min-w-0">
                     <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-100 overflow-hidden flex items-center justify-center shrink-0 text-[#2874f0]">
                       {selectedStore.store_logo ? (
                         <img src={selectedStore.store_logo} loading="lazy" decoding="async" alt={selectedStore.store_name || 'Store'} className="w-full h-full object-cover" />
                       ) : (
                         <i className="fas fa-store"></i>
                       )}
                     </div>
                     <div className="min-w-0">
                       <div className="flex items-center gap-2 flex-wrap">
                         <h3 className="text-sm md:text-base font-black text-gray-900 truncate">{selectedStore.store_name}</h3>
                         {selectedStore.is_verified_seller && (
                           <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.06em] leading-none text-[#2874f0]">
                             Verified
                             <svg width="11" height="11" className="inline-block shrink-0" style={{ fill: '#0073e6' }} viewBox="0 0 24 24"><path d="M23,12L20.56,9.22L20.9,5.54L17.29,4.72L15.4,1.54L12,3L8.6,1.54L6.71,4.72L3.1,5.53L3.44,9.21L1,12L3.44,14.78L3.1,18.47L6.71,19.29L8.6,22.47L12,21L15.4,22.46L17.29,19.28L20.9,18.46L20.56,14.78L23,12M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9L10,17Z"></path></svg>
                           </span>
                         )}
                       </div>
                       <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Store details</p>
                     </div>
                   </div>
                   <button
                     onClick={() => setSearchParams(urlQuery ? { q: urlQuery, p: '1' } : {})}
                     className="shrink-0 text-[10px] font-black uppercase tracking-widest text-[#2874f0] border border-blue-100 bg-blue-50 px-3 py-2 rounded-xl hover:bg-blue-100/60 transition-colors"
                   >
                     Clear Store
                   </button>
                 </div>
               )}
               
               {/* Sponsored Ads in Search Results */}
               <AdComponent
                 key={`search-ads-${submittedQuery}-${currentPage}`}
                 placement="search"
                 limit={isDesktop ? 4 : 2}
                 impressionScopeKey={`${submittedQuery}::p=${currentPage}`}
               />
               
               <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-5">
                 {gridResults.map(product => renderProductCard(product, product.id === prioritizedProductId))}
               </div>

               {/* Pagination Component */}
               {totalPages > 1 && (
                 <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 pb-8 pt-10 border-t border-gray-100 mt-8">
                   <button 
                     onClick={() => handlePageChange(currentPage - 1)} 
                     disabled={currentPage === 1} 
                     className="flex items-center gap-1 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-white border border-gray-200 text-[#2874f0] font-black text-[10px] md:text-[11px] uppercase shadow-sm disabled:opacity-30 active:scale-95 transition-all"
                   >
                     <i className="fas fa-chevron-left"></i> <span className="hidden sm:inline">Prev</span>
                   </button>
                   <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
                     {paginationRange.map((page, idx) => (
                       <React.Fragment key={idx}>
                         {page === '...' ? (
                           <span className="px-1 md:px-2 text-gray-400 font-black text-xs">...</span>
                         ) : (
                           <button 
                             onClick={() => handlePageChange(page as number)} 
                             className={`px-3 py-2 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl font-black text-xs sm:text-sm transition-all active:scale-90 ${currentPage === page ? 'bg-[#2874f0] text-white shadow-lg shadow-blue-500/20' : 'bg-white border border-gray-100 text-gray-600 hover:border-blue-300 hover:text-blue-600'}`}
                           >
                             {page === totalPages && paginationRange[paginationRange.length - 2] === '...' ? `Last Page (${page})` : page}
                           </button>
                         )}
                       </React.Fragment>
                     ))}
                   </div>
                   <button 
                     onClick={() => handlePageChange(currentPage + 1)} 
                     disabled={currentPage === totalPages} 
                     className="flex items-center gap-1 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-white border border-gray-200 text-[#2874f0] font-black text-[10px] md:text-[11px] uppercase shadow-sm disabled:opacity-30 active:scale-95 transition-all"
                   >
                     <span className="hidden sm:inline">Next</span> <i className="fas fa-chevron-right"></i>
                   </button>
                 </div>
               )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center bg-white md:rounded-2xl shadow-sm border border-gray-50 flex-grow">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100 shadow-inner">
                <i className="fas fa-search text-3xl text-gray-300"></i>
              </div>
              <h3 className="text-lg font-black text-gray-900 mb-1">No exact matches found</h3>
              <p className="text-xs text-gray-500 font-medium max-w-xs">
                We couldn't find any products matching "{submittedQuery}". Try checking your spelling or use general terms.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
