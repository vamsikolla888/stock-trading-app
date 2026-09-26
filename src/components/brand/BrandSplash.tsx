import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { LogoMark } from '@/components/brand/Logo';
import { appConfig } from '@/config/app';
import { useTheme } from '@/theme/ThemeProvider';

/** Must equal the expo-splash-screen plugin's `imageWidth` in app.config.ts. */
const NATIVE_MARK_SIZE = 96;
/** The mark rises this far and shrinks to this scale to make room for the wordmark. */
const LIFT = 30;
const SETTLED_SCALE = 0.75;

const INTRO_MS = 360;
const HOLD_MS = 160;
const OUTRO_MS = 220;
/** If the native hide never settles, run the animation anyway rather than hang on the logo. */
const HIDE_FALLBACK_MS = 300;

/**
 * Takes over from the native splash on cold start: its first frame is pixel-identical
 * to the native one (the same tile, same size, same centre, same background), so hiding
 * the native splash under it is invisible. The mark then lifts, the wordmark fades in,
 * and the overlay fades out — about 0.75 s in total, during which the app underneath is
 * already mounting and fetching. With Reduce Motion on it simply fades.
 */
export function BrandSplash({ onFinish }: { onFinish: () => void }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);
  const started = useRef(false);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;

    const finish = () => {
      'worklet';
      scheduleOnRN(onFinish);
    };

    if (reduceMotion) {
      opacity.set(withTiming(0, { duration: 150 }, finish));
      return;
    }
    // .set() rather than `.value =`: the React Compiler-safe way to drive shared values.
    progress.set(withTiming(1, { duration: INTRO_MS, easing: Easing.out(Easing.cubic) }));
    opacity.set(
      withDelay(
        INTRO_MS + HOLD_MS,
        withTiming(0, { duration: OUTRO_MS, easing: Easing.in(Easing.quad) }, finish),
      ),
    );
  }, [onFinish, opacity, progress, reduceMotion]);

  const onLayout = useCallback(() => {
    const fallback = setTimeout(start, HIDE_FALLBACK_MS);
    void SplashScreen.hideAsync()
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(fallback);
        start();
      });
  }, [start]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -LIFT * progress.value },
      { scale: 1 - (1 - SETTLED_SCALE) * progress.value },
    ],
  }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.3, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: 10 * (1 - progress.value) }],
  }));

  return (
    <Animated.View
      accessible
      accessibilityLabel={appConfig.name}
      onLayout={onLayout}
      style={[
        StyleSheet.absoluteFill,
        styles.center,
        { backgroundColor: colors.background },
        containerStyle,
      ]}
    >
      <Animated.View style={markStyle}>
        <LogoMark size={NATIVE_MARK_SIZE} />
      </Animated.View>
      <Animated.View style={[styles.wordmark, wordmarkStyle]}>
        <Text
          className="text-[26px] font-bold text-ink dark:text-ink-dark"
          style={{ letterSpacing: -0.8 }}
        >
          {appConfig.name}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  // Anchored just under where the lifted, shrunk mark ends (centre − LIFT + 36 px).
  wordmark: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: 18,
    alignItems: 'center',
  },
});
