import { useRef, useState } from 'react';
import { Platform } from 'react-native';

export function useWebPullToRefresh(onRefresh: () => void) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [isPullAllowed, setIsPullAllowed] = useState(true);
  const scrollOffsetRef = useRef(0);

  if (Platform.OS !== 'web') {
    return {
      onScroll: undefined,
      onTouchStart: undefined,
      onTouchMove: undefined,
      scrollEventThrottle: undefined,
    };
  }

  const handleScroll = (e: any) => {
    const offset = e.currentTarget?.scrollTop ?? e.nativeEvent?.contentOffset?.y ?? 0;
    scrollOffsetRef.current = offset;
  };

  const handleTouchStart = (e: any) => {
    const touch = e.touches?.[0] || e.nativeEvent?.touches?.[0];
    if (touch) {
      setTouchStart(touch.clientY);
      const offset = e.currentTarget?.scrollTop ?? scrollOffsetRef.current ?? 0;
      // Allow pull-to-refresh only if scroll is at the very top
      setIsPullAllowed(offset <= 5);
    }
  };

  const handleTouchMove = (e: any) => {
    if (touchStart === null || !isPullAllowed) return;
    const touch = e.touches?.[0] || e.nativeEvent?.touches?.[0];
    if (touch) {
      const pullDistance = touch.clientY - touchStart;
      // Trigger if pulled down by more than 80px
      if (pullDistance > 80) {
        setTouchStart(null); // Reset
        setIsPullAllowed(false);
        onRefresh();
      }
    }
  };

  return {
    onScroll: handleScroll,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    scrollEventThrottle: 16,
  };
}
