import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import { canReloadIntoApp } from '../lib/siteUrl';

// Nested scrollable lists swallow the touch before it ever reaches the
// document body, so the browser's own native pull-to-refresh never engages on
// this app — this hook is the only pull-to-refresh a web user gets. A normal
// pull (past REFRESH_THRESHOLD) only refetches the current screen's data. A
// longer, deliberate pull (past HARD_RELOAD_THRESHOLD) does a real
// `window.location.reload()`, which is what actually picks up a new deployed
// build — something the in-app data refresh can never do.
//
// The hard reload is skipped on routes the server does not serve the app for —
// in production that is `/`, which is the marketing landing page (see
// `canReloadIntoApp`). Reloading there ejected the user onto the landing page
// instead of refreshing the Providers screen, so those pulls fall through to
// the ordinary data refresh instead.
export const REFRESH_THRESHOLD = 65;
export const HARD_RELOAD_THRESHOLD = 115;
const MAX_PULL_DISTANCE = 140;

export function useWebPullToRefresh(onRefresh: () => void | Promise<void>, isRefreshing?: boolean) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartRef = useRef<number | null>(null);
  const isPullAllowedRef = useRef(true);
  const scrollOffsetRef = useRef(0);

  if (Platform.OS !== 'web') {
    return {
      pullProps: {
        onScroll: undefined,
        onTouchStart: undefined,
        onTouchMove: undefined,
        onTouchEnd: undefined,
        onTouchCancel: undefined,
        scrollEventThrottle: undefined,
      },
      onScroll: undefined,
      onTouchStart: undefined,
      onTouchMove: undefined,
      onTouchEnd: undefined,
      onTouchCancel: undefined,
      scrollEventThrottle: undefined,
      isPulling: false,
      pullDistance: 0,
      refreshing: false,
    };
  }

  const handleScroll = (e: any) => {
    const offset = e.currentTarget?.scrollTop ?? e.nativeEvent?.contentOffset?.y ?? 0;
    scrollOffsetRef.current = offset;
    if (offset > 5) {
      isPullAllowedRef.current = false;
    }
  };

  const handleTouchStart = (e: any) => {
    const touch = e.touches?.[0] || e.nativeEvent?.touches?.[0];
    if (touch) {
      const offset = e.currentTarget?.scrollTop ?? scrollOffsetRef.current ?? 0;
      if (offset <= 5) {
        touchStartRef.current = touch.clientY;
        isPullAllowedRef.current = true;
        setIsPulling(true);
      } else {
        touchStartRef.current = null;
        isPullAllowedRef.current = false;
        setIsPulling(false);
      }
    }
  };

  const handleTouchMove = (e: any) => {
    if (touchStartRef.current === null || !isPullAllowedRef.current) return;
    const touch = e.touches?.[0] || e.nativeEvent?.touches?.[0];
    if (touch) {
      const dist = touch.clientY - touchStartRef.current;
      if (dist > 0 && scrollOffsetRef.current <= 5) {
        // Logarithmic resistance math for natural spring feel
        const dampenedDist = Math.min(Math.pow(dist, 0.85) * 2.2, MAX_PULL_DISTANCE);
        setPullDistance(dampenedDist);
      } else {
        setPullDistance(0);
      }
    }
  };

  const handleTouchEnd = async () => {
    if (touchStartRef.current !== null && isPullAllowedRef.current) {
      if (pullDistance >= HARD_RELOAD_THRESHOLD && canReloadIntoApp()) {
        window.location.reload();
        return;
      }

      if (pullDistance >= REFRESH_THRESHOLD) {
        setPullDistance(REFRESH_THRESHOLD);
        try {
          await onRefresh();
        } finally {
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    }
    touchStartRef.current = null;
    isPullAllowedRef.current = false;
    setIsPulling(false);
  };

  const pullProps = {
    onScroll: handleScroll,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
    scrollEventThrottle: 16,
  };

  return {
    pullProps,
    onScroll: handleScroll,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
    scrollEventThrottle: 16,
    isPulling,
    pullDistance,
    refreshing: !!isRefreshing,
  };
}
