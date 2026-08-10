import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutRectangle,
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

export type Segment<T extends string = string> = {
  key: T;
  label: string;
  renderLabel?: (active: boolean) => React.ReactNode;
  accessibilityLabel?: string;
};

export type SegmentedSliderProps<T extends string = string> = {
  segments: Segment<T>[];
  value: T;
  onChange: (key: T) => void;
  /** Style overrides for the outer container track. */
  trackStyle?: StyleProp<ViewStyle>;
  /** Style overrides for each segment button. */
  segmentStyle?: StyleProp<ViewStyle>;
  /** Style overrides for the sliding active pill. */
  pillStyle?: StyleProp<ViewStyle>;
  /** Text style overrides for the active segment. */
  activeTextStyle?: StyleProp<TextStyle>;
  /** Text style overrides for inactive segments. */
  inactiveTextStyle?: StyleProp<TextStyle>;
  /** Cross-route toggles: index the pill starts at on mount before sliding to `value`. */
  enterFromIndex?: number;
  accessibilityLabel?: string;
};

export function SegmentedSlider<T extends string = string>({
  segments,
  value,
  onChange,
  trackStyle,
  segmentStyle,
  pillStyle,
  activeTextStyle,
  inactiveTextStyle,
  enterFromIndex,
  accessibilityLabel,
}: SegmentedSliderProps<T>) {
  const layoutsRef = useRef<Record<string, LayoutRectangle>>({});
  const isInitialRef = useRef(true);
  const [isReady, setIsReady] = useState(false);

  const pillX = useRef(new Animated.Value(0)).current;
  const pillY = useRef(new Animated.Value(0)).current;
  const pillW = useRef(new Animated.Value(0)).current;
  const pillH = useRef(new Animated.Value(0)).current;

  const activeSegment = segments.find((s) => s.key === value) ?? segments[0];
  const activeKey = activeSegment?.key;

  const updatePosition = useCallback(
    (key: string, forceSnap = false) => {
      const targetLayout = layoutsRef.current[key];
      if (!targetLayout || targetLayout.width <= 0) return;

      if (isInitialRef.current && !forceSnap) {
        if (
          enterFromIndex !== undefined &&
          enterFromIndex >= 0 &&
          enterFromIndex < segments.length
        ) {
          const enterKey = segments[enterFromIndex]?.key;
          const enterLayout = layoutsRef.current[enterKey];
          if (enterLayout && enterLayout.width > 0) {
            pillX.setValue(enterLayout.x);
            pillY.setValue(enterLayout.y);
            pillW.setValue(enterLayout.width);
            pillH.setValue(enterLayout.height);
            setIsReady(true);
            isInitialRef.current = false;

            // Animate from enterLayout to targetLayout
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
            return;
          }
        }

        // Standard initial render: snap without animation
        pillX.setValue(targetLayout.x);
        pillY.setValue(targetLayout.y);
        pillW.setValue(targetLayout.width);
        pillH.setValue(targetLayout.height);
        setIsReady(true);
        isInitialRef.current = false;
        return;
      }

      if (forceSnap) {
        pillX.setValue(targetLayout.x);
        pillY.setValue(targetLayout.y);
        pillW.setValue(targetLayout.width);
        pillH.setValue(targetLayout.height);
        setIsReady(true);
        return;
      }

      // Animated transition on value change
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
    [enterFromIndex, segments, pillX, pillY, pillW, pillH]
  );

  useEffect(() => {
    if (activeKey) {
      updatePosition(activeKey);
    }
  }, [activeKey, updatePosition]);

  const handleLayout = (key: string, layout: LayoutRectangle) => {
    layoutsRef.current[key] = layout;
    if (key === activeKey) {
      updatePosition(key);
    } else if (
      isInitialRef.current &&
      enterFromIndex !== undefined &&
      segments[enterFromIndex]?.key === key &&
      activeKey &&
      layoutsRef.current[activeKey]
    ) {
      updatePosition(activeKey);
    }
  };

  return (
    <View
      style={[styles.track, trackStyle]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {isReady && (
        <Animated.View
          pointerEvents="none"
          aria-hidden={true}
          style={[
            styles.pill,
            segmentStyle,
            pillStyle,
            {
              width: pillW,
              height: pillH,
              transform: [{ translateX: pillX }, { translateY: pillY }],
            },
          ]}
        />
      )}

      {segments.map((segment) => {
        const isSelected = segment.key === value;
        return (
          <TouchableOpacity
            key={segment.key}
            style={[styles.segmentBtn, segmentStyle]}
            onPress={() => onChange(segment.key)}
            onLayout={(e) => handleLayout(segment.key, e.nativeEvent.layout)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={segment.accessibilityLabel || segment.label}
          >
            {segment.renderLabel ? (
              segment.renderLabel(isSelected)
            ) : (
              <Text
                style={[
                  styles.segmentText,
                  inactiveTextStyle,
                  isSelected && [styles.segmentTextActive, activeTextStyle],
                ]}
              >
                {segment.label}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    position: 'relative',
    borderRadius: VerandahRadius.segmented,
    backgroundColor: Verandah.cardMuted,
    padding: 3,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
  },
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.segmentedInner,
    ...Verandah.shadowCard,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: VerandahRadius.segmentedInner,
    zIndex: 1,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: VerandahType.sansFamily,
    color: Verandah.textMuted,
  },
  segmentTextActive: {
    fontWeight: '700',
    color: Verandah.primary,
  },
});
