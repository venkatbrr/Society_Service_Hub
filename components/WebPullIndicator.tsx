import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { HARD_RELOAD_THRESHOLD, REFRESH_THRESHOLD } from './useWebPullToRefresh';

interface WebPullIndicatorProps {
  pullDistance: number;
  refreshing: boolean;
  isPulling?: boolean;
  threshold?: number;
  hardReloadThreshold?: number;
}

export function WebPullIndicator({
  pullDistance,
  refreshing,
  isPulling = false,
  threshold = REFRESH_THRESHOLD,
  hardReloadThreshold = HARD_RELOAD_THRESHOLD,
}: WebPullIndicatorProps) {
  if (Platform.OS !== 'web') {
    return null;
  }

  if (!refreshing && pullDistance <= 0) {
    return null;
  }

  const height = refreshing ? 50 : Math.min(pullDistance, 60);
  const opacity = refreshing ? 1 : Math.min(pullDistance / 30, 1);
  const isPastHardReload = pullDistance >= hardReloadThreshold;
  const isPastThreshold = pullDistance >= threshold;

  return (
    <View style={[styles.container, { height, opacity }]}>
      {refreshing ? (
        <View style={styles.content}>
          <ActivityIndicator size="small" color={Verandah.accent} />
          <Text style={styles.text}>Refreshing...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={styles.iconText}>{isPastThreshold ? '↑' : '↓'}</Text>
          <Text style={styles.text}>
            {isPastHardReload
              ? 'Release to reload app'
              : isPastThreshold
                ? 'Release to refresh'
                : 'Pull down to refresh'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  iconText: {
    fontSize: 14,
    fontWeight: '700',
    color: Verandah.accent,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
});
