import { useRef, useState } from 'react';
import { Platform } from 'react-native';

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
        const dampenedDist = Math.min(Math.pow(dist, 0.85) * 2.2, 120);
        setPullDistance(dampenedDist);
      } else {
        setPullDistance(0);
      }
    }
  };

  const handleTouchEnd = async () => {
    if (touchStartRef.current !== null && isPullAllowedRef.current) {
      if (pullDistance >= 65) {
        setPullDistance(65);
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
