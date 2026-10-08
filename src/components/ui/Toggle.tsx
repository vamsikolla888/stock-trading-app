import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';

const MOTION = {
  duration: 190,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;

/**
 * The visual half of a switch. Its parent owns the accessible switch role and the full-row touch
 * target; this piece stays on the UI thread so a busy mutation or theme repaint cannot stall it.
 */
export function Toggle({ value, disabled = false }: { value: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.set(withTiming(value ? 1 : 0, MOTION));
  }, [progress, value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.get(),
      [0, 1],
      [colors.borderStrong, colors.primary],
    ),
  }));
  const thumbStyle = useAnimatedStyle(() => {
    const position = progress.get();
    return {
      transform: [
        { translateX: position * 18 },
        { scale: 0.96 + Math.abs(position * 2 - 1) * 0.04 },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.track, disabled && styles.disabled, trackStyle]}
    >
      <Animated.View
        style={[styles.thumb, shadows.sm, { backgroundColor: colors.primaryText }, thumbStyle]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 46,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
  },
  thumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  disabled: {
    opacity: 0.5,
  },
});
