import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutRectangle,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';

export const SLIDER_SPRING = Easing.bezier(0.34, 1.5, 0.5, 1);
export const SLIDER_DURATION = 460;

export type ChipItem<T extends string = string> = {
  key: T;
  label: string;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
};

export type ChipRowSliderProps<T extends string = string> = {
  chips: ChipItem<T>[];
  value: T | null;
  onChange: (key: T) => void;
  scrollable?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  chipStyle?: StyleProp<ViewStyle>;
  inactiveChipStyle?: StyleProp<ViewStyle>;
  pillStyle?: StyleProp<ViewStyle>;
  activeColor: string;
  inactiveColor: string;
  textStyle?: StyleProp<TextStyle>;
  activeTextStyle?: StyleProp<TextStyle>;
  leading?: React.ReactNode;
  accessibilityLabel?: string;
};

export function ChipRowSlider<T extends string = string>({
  chips,
  value,
  onChange,
  scrollable = true,
  containerStyle,
  contentContainerStyle,
  chipStyle,
  inactiveChipStyle,
  pillStyle,
  activeColor,
  inactiveColor,
  textStyle,
  activeTextStyle,
  leading,
  accessibilityLabel,
}: ChipRowSliderProps<T>) {
  const internalScrollRef = useRef<ScrollView | null>(null);
  const scrollOffsetRef = useRef(0);
  const dragStateRef = useRef<{ active: boolean; startX: number; startOffset: number }>({
    active: false,
    startX: 0,
    startOffset: 0,
  });
  const suppressPressRef = useRef(false);

  const layoutsRef = useRef<Record<string, LayoutRectangle>>({});
  const isInitialRef = useRef(true);
  const shouldSnapRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  const pillX = useRef(new Animated.Value(0)).current;
  const pillY = useRef(new Animated.Value(0)).current;
  const pillW = useRef(new Animated.Value(0)).current;
  const pillH = useRef(new Animated.Value(0)).current;

  const resolvedValue = value ?? (chips.length > 0 ? chips[0].key : null);

  const prevChipsSigRef = useRef('');
  const currentChipsSig = chips.map((c) => c.key).join('|');
  if (prevChipsSigRef.current !== currentChipsSig) {
    if (prevChipsSigRef.current !== '') {
      // Chip set changed — snap the pill to the new position instead of gliding across.
      shouldSnapRef.current = true;
    }
    prevChipsSigRef.current = currentChipsSig;
  }

  const updatePosition = useCallback(
    (key: string | null) => {
      if (!key) return;
      const targetLayout = layoutsRef.current[key];
      if (!targetLayout || targetLayout.width <= 0) return;

      if (isInitialRef.current || shouldSnapRef.current) {
        pillX.setValue(targetLayout.x);
        pillY.setValue(targetLayout.y);
        pillW.setValue(targetLayout.width);
        pillH.setValue(targetLayout.height);
        setIsReady(true);
        isInitialRef.current = false;
        shouldSnapRef.current = false;
        return;
      }

      Animated.parallel([
        Animated.timing(pillX, {
          toValue: targetLayout.x,
          duration: SLIDER_DURATION,
          easing: SLIDER_SPRING,
          useNativeDriver: false,
        }),
        Animated.timing(pillY, {
          toValue: targetLayout.y,
          duration: SLIDER_DURATION,
          easing: SLIDER_SPRING,
          useNativeDriver: false,
        }),
        Animated.timing(pillW, {
          toValue: targetLayout.width,
          duration: SLIDER_DURATION,
          easing: SLIDER_SPRING,
          useNativeDriver: false,
        }),
        Animated.timing(pillH, {
          toValue: targetLayout.height,
          duration: SLIDER_DURATION,
          easing: SLIDER_SPRING,
          useNativeDriver: false,
        }),
      ]).start();
    },
    [pillX, pillY, pillW, pillH]
  );

  useEffect(() => {
    if (resolvedValue) {
      updatePosition(resolvedValue);
    }
  }, [resolvedValue, updatePosition]);

  const handleLayout = (key: string, layout: LayoutRectangle) => {
    layoutsRef.current[key] = layout;
    if (key === resolvedValue) {
      updatePosition(key);
    }
  };

  const handlePress = (key: T) => {
    if (suppressPressRef.current) return;
    onChange(key);
  };

  const buildWebDragHandlers = () => {
    if (Platform.OS !== 'web' || !scrollable) return {};
    return {
      onMouseDown: (event: any) => {
        dragStateRef.current = {
          active: true,
          startX: event.nativeEvent.pageX,
          startOffset: scrollOffsetRef.current,
        };
      },
      onMouseMove: (event: any) => {
        if (!dragStateRef.current.active) return;
        const delta = event.nativeEvent.pageX - dragStateRef.current.startX;
        if (Math.abs(delta) > 4) {
          suppressPressRef.current = true;
        }
        const nextX = Math.max(0, dragStateRef.current.startOffset - delta);
        internalScrollRef.current?.scrollTo({ x: nextX, animated: false });
      },
      onMouseUp: () => {
        dragStateRef.current.active = false;
        if (suppressPressRef.current) {
          setTimeout(() => {
            suppressPressRef.current = false;
          }, 0);
        }
      },
      onMouseLeave: () => {
        dragStateRef.current.active = false;
      },
    };
  };

  const content = (
    <View style={[styles.contentRow, !scrollable && styles.contentRowNonScroll, contentContainerStyle]}>
      {leading}

      {/* Pill — rendered first so it sits behind the chips */}
      {isReady && resolvedValue && layoutsRef.current[resolvedValue] && (
        <Animated.View
          pointerEvents="none"
          aria-hidden={true}
          style={[
            styles.pill,
            chipStyle,
            pillStyle,
            {
              width: pillW,
              height: pillH,
              transform: [{ translateX: pillX }, { translateY: pillY }],
            },
          ]}
        />
      )}

      {/* Chips — transparent backgrounds so the pill shows through */}
      {chips.map((chip) => {
        const isSelected = chip.key === resolvedValue;

        return (
          <TouchableOpacity
            key={chip.key}
            style={[
              styles.chipBase,
              inactiveChipStyle,
              chipStyle,
              // Force transparent background so the pill behind is always visible
              { backgroundColor: 'transparent' },
            ]}
            onPress={() => handlePress(chip.key)}
            onLayout={(e) => handleLayout(chip.key, e.nativeEvent.layout)}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={chip.accessibilityLabel || chip.label}
          >
            <View style={styles.chipInner}>
              {chip.icon ? <View style={styles.iconWrap}>{chip.icon}</View> : null}
              <Text
                style={[
                  styles.chipText,
                  textStyle,
                  { color: isSelected ? activeColor : inactiveColor },
                  isSelected && activeTextStyle,
                ]}
              >
                {chip.label}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        ref={internalScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.scrollContainer, containerStyle]}
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={16}
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        {...(buildWebDragHandlers() as any)}
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <View
      style={[styles.container, containerStyle]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  scrollContainer: {
    cursor: (Platform.OS === 'web' ? 'grab' : undefined) as any,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    gap: 6,
  },
  contentRowNonScroll: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipBase: {
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: 'transparent',
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '500',
    fontFamily: VerandahType.sansFamily,
    color: Verandah.textPrimary,
  },
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: Verandah.primary,
    borderRadius: VerandahRadius.pill,
    borderWidth: 0.5,
    borderColor: Verandah.primary,
  },
});
