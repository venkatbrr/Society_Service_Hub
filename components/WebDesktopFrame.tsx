import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

export function WebDesktopFrame({ children }: { children: React.ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const checkWidth = () => {
      setIsDesktop(window.innerWidth >= 768);
    };

    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  if (Platform.OS !== 'web' || !isDesktop) {
    return <>{children}</>;
  }

  return (
    <View style={styles.webOuterContainer}>
      <View style={styles.webInnerContainer}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webOuterContainer: {
    flex: 1,
    width: '100%',
    height: '100vh' as any,
    minHeight: '100vh' as any,
    backgroundColor: '#0A1D1A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    boxSizing: 'border-box' as any,
  },
  webInnerContainer: {
    maxWidth: 460,
    width: '100%',
    height: '90vh' as any,
    maxHeight: 880,
    borderRadius: 28,
    backgroundColor: '#FAF8F4',
    overflow: 'hidden',
    boxShadow: '0 35px 90px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.12)' as any,
    position: 'relative',
    flexDirection: 'column',
    display: 'flex' as any,
  },
});
