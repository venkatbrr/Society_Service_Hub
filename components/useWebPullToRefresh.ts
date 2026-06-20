import { useState } from 'react';
import { Platform } from 'react-native';

export function useWebPullToRefresh(onRefresh: () => void) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [isAtTop, setIsAtTop] = useState(true);

  if (Platform.OS !== 'web') {
    return {
      onScroll: undefined,
      onTouchStart: undefined,
      onTouchMove: undefined,
      scrollEventThrottle: undefined,
    };
  }

  const handleScroll = (e: any) => {
    const offset = e.nativeEvent?.contentOffset?.y ?? 0;
    setIsAtTop(offset <= 0);
  };

  const handleTouchStart = (e: any) => {
    const touch = e.touches?.[0] || e.nativeEvent?.touches?.[0];
    if (touch) {
      setTouchStart(touch.clientY);
    }
  };

  const handleTouchMove = (e: any) => {
    if (touchStart === null || !isAtTop) return;
    const touch = e.touches?.[0] || e.nativeEvent?.touches?.[0];
    if (touch) {
      const pullDistance = touch.clientY - touchStart;
      // If pulled down by more than 100px
      if (pullDistance > 100) {
        setTouchStart(null); // Reset to prevent multiple triggers
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
