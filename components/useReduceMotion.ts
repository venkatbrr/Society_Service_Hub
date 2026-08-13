import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True when the user has asked the OS to reduce motion (iOS/Android
 * accessibility setting, `prefers-reduced-motion` on web).
 *
 * Any **always-on** animation must check this and render a static state
 * instead — a perpetual loop is precisely what the setting exists to stop.
 * One-shot transitions (a highlight sliding to the tab you just tapped) are
 * not the target and need no guard.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      sub?.remove();
    };
  }, []);

  return reduceMotion;
}
