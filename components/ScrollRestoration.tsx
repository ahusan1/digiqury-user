import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Global scroll restoration - Saves and restores scroll on back button
 * Works on desktop and mobile
 */
export const ScrollRestoration: React.FC = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const isRestoringRef = useRef(false);
  const lastSavedUrlRef = useRef('');

  // Disable browser's default scroll restoration
  useEffect(() => {
    window.history.scrollRestoration = 'manual';
  }, []);

  // Save scroll position before ANY navigation
  useEffect(() => {
    const currentUrl = location.pathname + location.search + location.hash;
    let lastHistoryWrite = 0;

    const saveScroll = (persistToHistory = false) => {
      if (isRestoringRef.current) return;

      // Mobile-compatible scroll position (try multiple methods)
      const y = window.pageYOffset || window.scrollY || document.documentElement.scrollTop || 0;
      
      // Always save to sessionStorage
      sessionStorage.setItem(`scroll_${currentUrl}`, String(y));

      if (!persistToHistory) return;

      // Throttled save to history state (important for mobile)
      const now = Date.now();
      if (now - lastHistoryWrite < 250) return;
      lastHistoryWrite = now;

      const state = window.history.state ?? {};
      if (state.__scrollY === y) return;
      
      try {
        window.history.replaceState({ ...state, __scrollY: y }, '');
      } catch (e) {
        // Ignore replaceState limits on some mobile browsers
      }
    };

    // Save continuously on scroll (to sessionStorage only)
    const onScroll = () => saveScroll(false);
    
    // Save to BOTH sessionStorage AND history state on these critical events
    const saveOnPointerDown = () => saveScroll(true);
    const saveOnTouchStart = () => saveScroll(true);
    const saveOnMouseDown = () => saveScroll(true);
    const saveOnClick = () => saveScroll(true);
    const saveOnPageHide = () => saveScroll(true);
    const saveOnVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveScroll(true);
    };
    
    // CRITICAL FOR MOBILE: Save after touch ends (momentum scrolling finished)
    let touchEndTimer: number | null = null;
    const saveOnTouchEnd = () => {
      // Wait for momentum scrolling to finish (usually 300-500ms)
      if (touchEndTimer) clearTimeout(touchEndTimer);
      touchEndTimer = window.setTimeout(() => saveScroll(true), 500);
    };

    // Update the URL we're tracking
    lastSavedUrlRef.current = currentUrl;

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', saveOnPageHide);
    document.addEventListener('visibilitychange', saveOnVisibilityChange);
    document.addEventListener('pointerdown', saveOnPointerDown, true);
    document.addEventListener('touchstart', saveOnTouchStart, true);
    document.addEventListener('touchend', saveOnTouchEnd, true);
    document.addEventListener('mousedown', saveOnMouseDown, true);
    document.addEventListener('click', saveOnClick, true);

    return () => {
      if (touchEndTimer) clearTimeout(touchEndTimer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', saveOnPageHide);
      document.removeEventListener('visibilitychange', saveOnVisibilityChange);
      document.removeEventListener('pointerdown', saveOnPointerDown, true);
      document.removeEventListener('touchstart', saveOnTouchStart, true);
      document.removeEventListener('touchend', saveOnTouchEnd, true);
      document.removeEventListener('mousedown', saveOnMouseDown, true);
      document.removeEventListener('click', saveOnClick, true);
    };
  }, [location.pathname, location.search, location.hash]);

  // Restore scroll on navigation (using Search page's exact mechanism)
  useEffect(() => {
    console.log(`🔍 Navigation type: ${navigationType} | URL: ${location.pathname}`);

    if (navigationType !== 'POP') {
      // Fresh navigation - scroll to top
      console.log(`➕ PUSH/REPLACE - Scrolling to top`);
      window.scrollTo(0, 0);
      isRestoringRef.current = false;
      return;
    }

    // Back button - restore scroll position
    console.log(`🔙 POP detected - Restoring scroll`);
    isRestoringRef.current = true;

    // Get scroll target
    let targetY = 0;

    // Try history state first (most reliable)
    if (window.history.state?.__scrollY !== undefined) {
      targetY = window.history.state.__scrollY;
      console.log(`📍 Getting scroll from history state: ${targetY}px`);
    } else {
      // Fallback to sessionStorage
      const currentUrl = location.pathname + location.search + location.hash;
      const saved = sessionStorage.getItem(`scroll_${currentUrl}`);
      if (saved) {
        targetY = parseInt(saved, 10);
        console.log(`📍 Getting scroll from sessionStorage: ${targetY}px`);
      }
    }

    let attempts = 0;
    const maxAttempts = 60; // 6 seconds max (60 * 100ms)
    let intervalId: number | null = null;
    let lastDocHeight = document.documentElement.scrollHeight;
    let stableHeightCount = 0;

    const restore = () => {
      window.scrollTo(0, targetY);
      // Force reflow on mobile (helps with some mobile browsers)
      document.documentElement.scrollTop = targetY;
      document.body.scrollTop = targetY; // Older mobile browsers
    };

    const restoreWithRetry = () => {
      const currentDocHeight = document.documentElement.scrollHeight;
      
      // Check if document height is still changing (images/content loading)
      if (currentDocHeight !== lastDocHeight) {
        stableHeightCount = 0;
        lastDocHeight = currentDocHeight;
        console.log(`📏 Document height changed to ${currentDocHeight}px, waiting for stability...`);
      } else {
        stableHeightCount++;
      }

      // Only restore if height has been stable for at least 2 checks (200ms)
      if (stableHeightCount >= 2) {
        restore();
      }

      attempts += 1;

      // Mobile-compatible scroll position reading
      const currentY = window.pageYOffset || window.scrollY || document.documentElement.scrollTop || 0;
      const diff = Math.abs(currentY - targetY);
      
      console.log(`🎯 Attempt ${attempts}: Target=${targetY}px, Current=${currentY}px, Diff=${diff}px, Stable=${stableHeightCount}`);

      // Stop if we're within 2px or maxed out attempts (but only if height is stable)
      if (attempts >= maxAttempts || (diff <= 2 && stableHeightCount >= 2)) {
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
        
        isRestoringRef.current = false;
        
        if (diff <= 2) {
          console.log(`✅ Restoration complete! Within 2px (actual diff: ${diff}px)`);
        } else {
          console.log(`⚠️ Max attempts reached. Final diff: ${diff}px`);
        }
      }
    };

    // Disable smooth scrolling during restoration (mobile compatibility)
    const originalScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';

    // Initial restoration attempts (same as Search page)
    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 120);
    setTimeout(restore, 350);

    // CRITICAL: Continuous retry every 100ms until exact (same as Search page)
    intervalId = window.setInterval(restoreWithRetry, 100);

    return () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
      // Restore original scroll behavior
      document.documentElement.style.scrollBehavior = originalScrollBehavior;
    };
  }, [location.pathname, location.search, location.hash, navigationType]);

  return null;
};
