import React, { useState, useEffect, useContext, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../App.tsx';
import { supabase, robustFetch } from '../lib/supabase.ts';

interface AdProps {
  placement: 'home' | 'search' | 'product_details' | 'related_products' | 'dashboard' | 'category';
  limit?: number;
  category?: string; // Optional category targeting
  impressionScopeKey?: string; // Optional key to scope impressions (e.g., per search)
}

interface AdCampaign {
  id: string;
  product_id: string;
  placements: string[];
  campaign_name: string;
  product: {
    id: string;
    title: string;
    description: string;
    preview_image: string;
    price: number;
    original_price: number;
    category: string;
  };
}

export const AdComponent: React.FC<AdProps> = ({ placement, limit = 1, category, impressionScopeKey }) => {
  const { user, isPurchased, toggleWishlist, isInWishlist } = useContext(AuthContext);
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const safeStorageGet = (key: string): string | null => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const safeStorageSet = (key: string, value: string) => {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Ignore storage failures on restrictive browsers/private modes.
    }
  };
  const [sessionId] = useState(() => {
    let sid = safeStorageGet('ad_session_id');
    if (!sid) {
      sid = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      safeStorageSet('ad_session_id', sid);
    }
    return sid;
  });

  // Track which ads have been seen to avoid duplicate impressions (using sessionStorage for persistence)
  const normalizedScope = impressionScopeKey?.trim();
  const storageKey = normalizedScope
    ? `ad_impressions_${placement}_${encodeURIComponent(normalizedScope.toLowerCase())}`
    : `ad_impressions_${placement}`;

  const getTrackedImpressions = (): Set<string> => {
    try {
      const stored = safeStorageGet(storageKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  };

  const saveTrackedImpressions = (tracked: Set<string>) => {
    try {
      safeStorageSet(storageKey, JSON.stringify([...tracked]));
    } catch {
      console.error('Failed to save tracked impressions');
    }
  };

  const recentKey = normalizedScope
    ? `ad_recent_${placement}_${encodeURIComponent(normalizedScope.toLowerCase())}`
    : `ad_recent_${placement}`;

  const getRecentAds = (): string[] => {
    try {
      const stored = safeStorageGet(recentKey);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  };

  const updateRecentAds = (ids: string[]) => {
    try {
      const recent = getRecentAds();
      const merged = [...ids, ...recent.filter((id) => !ids.includes(id))];
      const capped = merged.slice(0, 50);
      safeStorageSet(recentKey, JSON.stringify(capped));
    } catch {
      console.error('Failed to save recent ads');
    }
  };

  // DEBUG: Log that component loaded
  useEffect(() => {
    console.log('🎬 AdComponent initialized for placement:', placement, 'Session ID:', sessionId);
  }, []);

  useEffect(() => {
    fetchAds();
  }, [placement, category, impressionScopeKey, limit]);

  const fetchAds = async () => {
    setLoading(true);
    try {
      // Fetch active campaigns and filter placements client-side (handles jsonb/array quirks)
      // NOTE: end_date is NOT used as a hard DB filter — budget-first delivery:
      //   - If total_budget > 0 and budget is remaining → keep showing regardless of end_date
      //   - If total_budget = 0 (admin/unlimited) → respect end_date as the stop condition
      let query = supabase
        .from('ads_campaigns')
        .select(`
          id,
          product_id,
          placements,
          campaign_name,
          spent_amount,
          total_budget,
          end_date,
          product:products(id, title, description, preview_image, price, original_price, category)
        `)
        .eq('status', 'active')
        .eq('approval_status', 'approved')
        .limit(limit * 6); // Fetch extra for placement/category filtering

      const { data, error } = await robustFetch<any[]>(query);

      if (error) throw error;

      if (data) {
        const normalizePlacements = (value: unknown): string[] => {
          if (Array.isArray(value)) return value as string[];
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value);
              if (Array.isArray(parsed)) return parsed as string[];
            } catch {
              return value.split(',').map(v => v.trim()).filter(Boolean);
            }
          }
          return [];
        };

        // Filter out null products, and apply budget-first delivery logic:
        //   - Paid campaigns (total_budget > 0): show as long as budget is remaining, ignore end_date
        //   - Unlimited/admin campaigns (total_budget = 0): show as long as within end_date
        const now = new Date();
        let filtered = data.filter(campaign => {
          if (!campaign.product || !campaign.product.id) return false;
          const hasBudget = campaign.total_budget > 0;
          if (hasBudget) {
            // Budget-first: keep running until budget is exhausted regardless of date
            return campaign.spent_amount < campaign.total_budget;
          } else {
            // No budget limit (admin campaign): respect end_date
            return new Date(campaign.end_date) >= now;
          }
        });
        filtered = filtered.filter(campaign =>
          normalizePlacements(campaign.placements).includes(placement)
        );
        
        if (category) {
          filtered = filtered.filter(campaign => 
            !campaign.target_categories || 
            campaign.target_categories.length === 0 ||
            campaign.target_categories.includes(category)
          );
        }

        const shuffled = filtered.sort(() => 0.5 - Math.random());
        const recentIds = getRecentAds();
        const freshAds = shuffled.filter((ad) => !recentIds.includes(ad.id));

        const selectedAds: AdCampaign[] = [];
        selectedAds.push(...freshAds.slice(0, limit));

        if (selectedAds.length < limit) {
          const remaining = shuffled.filter((ad) => !selectedAds.some((s) => s.id === ad.id));
          selectedAds.push(...remaining.slice(0, limit - selectedAds.length));
        }

        // If repeats are necessary, reshuffle order so placement changes
        const reshuffled = selectedAds.sort(() => 0.5 - Math.random());
        setAds(reshuffled);
        updateRecentAds(reshuffled.map((ad) => ad.id));

        // DO NOT track impressions here - wait for Intersection Observer
        console.log('📊 Loaded', selectedAds.length, 'ads for placement:', placement, '(tracking when visible)');
      }
    } catch (err) {
      console.error('Failed to fetch ads:', err);
      setAds([]);
    } finally {
      setLoading(false);
    }
  };

  // Intersection Observer: Track impression when ad becomes visible
  useEffect(() => {
    if (ads.length === 0) return;

    const trackedImpressions = getTrackedImpressions();
    let fallbackTimer: number | undefined;

    const isElementInViewport = (el: Element): boolean => {
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

      if (rect.width <= 0 || rect.height <= 0) return false;

      const visibleX = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
      const visibleY = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      const visibleArea = visibleX * visibleY;
      const totalArea = rect.width * rect.height;

      return totalArea > 0 && visibleArea / totalArea >= 0.15;
    };

    if (typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') {
      // Fallback for restrictive/older mobile browsers.
      const scopedElements = containerRef.current?.querySelectorAll(
        `[data-campaign-id][data-ad-placement="${placement}"]`
      ) ?? [];

      scopedElements.forEach((el) => {
        const campaignId = el.getAttribute('data-campaign-id');
        if (campaignId && !trackedImpressions.has(campaignId) && isElementInViewport(el)) {
          trackedImpressions.add(campaignId);
          saveTrackedImpressions(trackedImpressions);
          const uniqueSessionId = `${sessionId}_${Date.now()}_${Math.random()}`;
          trackImpression(campaignId, uniqueSessionId);
        }
      });
      return;
    }
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const campaignId = entry.target.getAttribute('data-campaign-id');
            if (campaignId && !trackedImpressions.has(campaignId)) {
              // Mark as tracked in sessionStorage
              trackedImpressions.add(campaignId);
              saveTrackedImpressions(trackedImpressions);
              
              // Create unique session ID for this impression
              const uniqueSessionId = `${sessionId}_${Date.now()}_${Math.random()}`;
              console.log('👁️ Ad became visible:', campaignId, 'at placement:', placement);
              trackImpression(campaignId, uniqueSessionId);
            }
          }
        });
      },
      {
        threshold: 0.25, // Require meaningful visibility before counting.
        rootMargin: '0px'
      }
    );

    // Observe all ad elements
    const adElements = containerRef.current?.querySelectorAll(
      `[data-campaign-id][data-ad-placement="${placement}"]`
    ) ?? [];
    adElements.forEach((el) => observer.observe(el));

    // Fallback: some layouts/browsers may not reliably trigger observer callbacks.
    fallbackTimer = window.setTimeout(() => {
      adElements.forEach((el) => {
        const campaignId = el.getAttribute('data-campaign-id');
        if (campaignId && !trackedImpressions.has(campaignId) && isElementInViewport(el)) {
          trackedImpressions.add(campaignId);
          saveTrackedImpressions(trackedImpressions);
          const uniqueSessionId = `${sessionId}_${Date.now()}_${Math.random()}`;
          console.log('⏱️ Fallback impression trigger for campaign:', campaignId, 'placement:', placement);
          trackImpression(campaignId, uniqueSessionId);
        }
      });
    }, 1800);

    // Cleanup
    return () => {
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
      adElements.forEach((el) => observer.unobserve(el));
      observer.disconnect();
    };
  }, [ads, placement, storageKey]);

  const trackImpression = async (campaignId: string, uniqueSessionId: string): Promise<boolean> => {
    try {
      console.log('👁️ Ad VISIBLE - Tracking impression for campaign:', campaignId);
      
      const { data, error } = await supabase.rpc('record_ad_impression', {
        p_campaign_id: campaignId,
        p_user_id: user?.id || null,
        p_session_id: uniqueSessionId,
        p_placement: placement
      });

      if (error) {
        console.error('❌ RPC error tracking impression:', error);
        const trackedImpressions = getTrackedImpressions();
        trackedImpressions.delete(campaignId);
        saveTrackedImpressions(trackedImpressions);
        return false;
      }

      if (data?.success) {
        console.log('✅ Impression recorded! Campaign:', campaignId, 'Total impressions:', data.impressions);
        return true;
      } else if (data?.error) {
        console.warn('⚠️ Function error:', data.error);
        const trackedImpressions = getTrackedImpressions();
        trackedImpressions.delete(campaignId);
        saveTrackedImpressions(trackedImpressions);
        return false;
      }
      return false;
    } catch (err) {
      console.error('❌ Exception tracking impression:', err);
      const trackedImpressions = getTrackedImpressions();
      trackedImpressions.delete(campaignId);
      saveTrackedImpressions(trackedImpressions);
      return false;
    }
  };

  const trackClick = async (campaignId: string) => {
    try {
      // Create unique session ID for this click
      const uniqueClickId = `click_${Date.now()}_${Math.random()}`;
      console.log('👆 Tracking click - Campaign:', campaignId, 'Click ID:', uniqueClickId);
      
      const { data, error } = await supabase.rpc('record_ad_click', {
        p_campaign_id: campaignId,
        p_user_id: user?.id || null,
        p_session_id: uniqueClickId,  // Create unique ID for each click
        p_placement: placement
      });

      if (error) {
        console.error('❌ RPC error tracking click:', error);
        return;
      }

      if (data?.success) {
        console.log('✅ Click recorded! Campaign:', campaignId, 'Total clicks:', data.clicks, 'Spend:', data.spent_amount);
      } else if (data?.error) {
        console.warn('⚠️ Function error:', data.error);
      }
    } catch (err) {
      console.error('❌ Exception tracking click:', err);
    }
  };

  if (loading || ads.length === 0) {
    return null; // Don't show anything if loading or no ads
  }

  // Reusable product card renderer for ads
  const renderAdCard = (ad: AdCampaign) => {
    const owned = isPurchased(ad.product.id);
    const wishlisted = isInWishlist(ad.product.id);
    
    return (
      <div 
        key={ad.id} 
        data-campaign-id={ad.id}
        data-ad-placement={placement}
        className="group flex flex-col bg-white border rounded-[1.5rem] hover:shadow-2xl transition-all duration-500 relative overflow-visible border-gray-200"
      >
        <Link 
          to={`/product/${ad.product.id}`}
          onClick={() => trackClick(ad.id)}
          className="p-3 md:p-4"
        >
          {/* Ad badge */}
          <div className="absolute top-2 left-2 z-20">
            <span className="inline-flex items-center bg-white text-gray-500 text-[8px] md:text-[9px] font-semibold px-2 py-1 rounded-md border border-gray-200 leading-none">
              Ad
            </span>
          </div>

          <div className="h-32 md:h-44 w-full mb-4 bg-gray-50 rounded-2xl flex items-center justify-center p-3 relative overflow-hidden min-h-[128px]">
            {ad.product.preview_image && ad.product.preview_image.trim() ? (
              <img 
                src={normalizeImageUrl(ad.product.preview_image)} 
                alt={ad.product.title} 
                loading="eager"
                decoding="sync"
                width="300"
                height="200"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 150%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22200%22 height=%22150%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2214%22 fill=%22%239ca3af%22%3ENo Image%3C/text%3E%3C/svg%3E';
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
            
            {/* Wishlist Button */}
            <button 
              onClick={(e) => { 
                e.preventDefault(); 
                toggleWishlist(ad.product as any); 
              }} 
              className={`absolute top-2 right-2 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center transition-all active:scale-75 z-10 ${wishlisted ? 'text-red-500' : 'text-gray-300 hover:text-red-400'}`}
            >
              <i className={`${wishlisted ? 'fas' : 'far'} fa-heart text-sm`}></i>
            </button>
            {owned && <div className="absolute top-2 left-2 bg-[#388e3c] text-white text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter shadow-sm z-10">Owned</div>}
          </div>
          
          <h3 className="text-[12px] md:text-sm font-black text-gray-800 line-clamp-1 mb-1 group-hover:text-[#2874f0]">
            {ad.product.title}
          </h3>
          
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[9px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-tighter italic">
              {ad.product.category}
            </span>
          </div>
          
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base md:text-xl font-black text-gray-900">₹{ad.product.price}</span>
            {ad.product.original_price > ad.product.price && (
              <>
                <span className="text-[10px] md:text-xs text-gray-400 line-through">
                  ₹{ad.product.original_price}
                </span>
                <span className="text-[10px] md:text-xs text-[#388e3c] font-black">
                  {Math.round(((ad.product.original_price - ad.product.price) / ad.product.original_price) * 100)}% off
                </span>
              </>
            )}
          </div>
        </Link>
      </div>
    );
  };

  // Different layouts based on placement
  if (placement === 'home' && ads.length > 0) {
    return (
      <div ref={containerRef} className="bg-white p-3 md:p-4 fk-shadow rounded-2xl relative border border-gray-200/80 my-8">
        <div className="flex items-center justify-between gap-3 mb-4 px-1">
          <h2 className="text-base md:text-lg font-black text-gray-900 tracking-tight">
            Featured Products
          </h2>
          <span className="inline-flex items-center bg-gray-50 text-gray-500 text-[9px] md:text-[10px] font-semibold px-2.5 py-1 rounded-full border border-gray-200 uppercase tracking-[0.08em]">Sponsored</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-5">
          {ads.map(ad => renderAdCard(ad))}
        </div>
      </div>
    );
  }

  if (placement === 'search' || placement === 'category') {
    return (
      <div ref={containerRef} className="bg-white p-3 md:p-4 fk-shadow rounded-2xl relative border border-gray-200/80 my-6">
        <div className="flex items-center justify-between gap-3 mb-4 px-1">
          <h2 className="text-sm md:text-base font-black text-gray-900 tracking-tight">
            Sponsored Results
          </h2>
          <span className="inline-flex items-center bg-gray-50 text-gray-500 text-[9px] md:text-[10px] font-semibold px-2.5 py-1 rounded-full border border-gray-200 uppercase tracking-[0.08em]">Ads</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
          {ads.map(ad => renderAdCard(ad))}
        </div>
      </div>
    );
  }

  if (placement === 'product_details' || placement === 'related_products') {
    return (
      <div ref={containerRef} className="bg-white p-3 md:p-4 fk-shadow rounded-2xl relative border border-gray-200/80 my-6">
        <div className="flex items-center justify-between gap-3 mb-4 px-1">
          <h2 className="text-sm md:text-base font-black text-gray-900 tracking-tight">
            Recommended For You
          </h2>
          <span className="inline-flex items-center bg-gray-50 text-gray-500 text-[9px] md:text-[10px] font-semibold px-2.5 py-1 rounded-full border border-gray-200 uppercase tracking-[0.08em]">Sponsored</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
          {ads.map(ad => renderAdCard(ad))}
        </div>
      </div>
    );
  }

  if (placement === 'dashboard') {
    return (
      <div ref={containerRef} className="bg-white p-3 md:p-4 fk-shadow rounded-2xl relative border border-gray-200/80 my-6">
        <div className="flex items-center justify-between gap-3 mb-4 px-1">
          <h2 className="text-sm md:text-base font-black text-gray-900 tracking-tight">
            Personalized For You
          </h2>
          <span className="inline-flex items-center bg-gray-50 text-gray-500 text-[9px] md:text-[10px] font-semibold px-2.5 py-1 rounded-full border border-gray-200 uppercase tracking-[0.08em]">Sponsored</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
          {ads.map(ad => renderAdCard(ad))}
        </div>
      </div>
    );
  }

  return null;
};
