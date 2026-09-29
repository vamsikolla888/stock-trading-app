import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { LogoMark } from '@/components/brand/Logo';
import { appConfig } from '@/config/app';
import { useTheme } from '@/theme/ThemeProvider';
import { palette } from '@/theme/tokens';

/** Must equal the expo-splash-screen plugin's `imageWidth` in app.config.ts. */
const NATIVE_MARK_SIZE = 96;
/** The mark's corner radius — the 30-unit tile's rx={9}, scaled. */
const MARK_RADIUS = NATIVE_MARK_SIZE * 0.3;
/** The mark rises this far and settles to this scale to make room for the wordmark. */
const LIFT = 34;
const SETTLED_SCALE = 0.78;

// Timeline, in ms from the moment the native splash is gone. ~1.1 s end to end, and the
// app underneath is mounting and fetching the whole time, so none of it delays startup.
const LIFT_MS = 480;
const RIPPLE_DELAY_MS = 60;
const RIPPLE_MS = 760;
const SHEEN_DELAY_MS = 220;
const SHEEN_MS = 560;
const TEXT_DELAY_MS = 180;
const TEXT_MS = 520;
const OUTRO_DELAY_MS = 820;
const OUTRO_MS = 280;
/** If the native hide never settles, run the animation anyway rather than hang on the logo. */
const HIDE_FALLBACK_MS = 300;

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Takes over from the native splash on cold start. Its first frame is pixel-identical to
 * the native one (same tile, size, centre and background), so hiding the native splash
 * under it is invisible. Then, in one calm motion: the mark lifts and settles while a soft
 * brand-green ripple spreads behind it, a light sheen crosses the tile, the wordmark and
 * tagline rise in, and the overlay fades out with a slight zoom onto the app. With Reduce
 * Motion on it simply fades.
 */
export function BrandSplash({ onFinish }: { onFinish: () => void }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const lift = useSharedValue(0);
  const ripple = useSharedValue(0);
  const sheen = useSharedValue(0);
  const text = useSharedValue(0);
  const outro = useSharedValue(0);
  const started = useRef(false);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;

    // Unconditional, even if the outro were interrupted: the overlay must never outlive
    // its animation and sit over a working app.
    const finish = () => {
      'worklet';
      scheduleOnRN(onFinish);
    };

    if (reduceMotion) {
      outro.set(withTiming(1, { duration: 180 }, finish));
      return;
    }
    // .set() rather than `.value =`: the React Compiler-safe way to drive shared values.
    lift.set(withTiming(1, { duration: LIFT_MS, easing: EASE_OUT }));
    ripple.set(
      withDelay(
        RIPPLE_DELAY_MS,
        withTiming(1, { duration: RIPPLE_MS, easing: Easing.out(Easing.quad) }),
      ),
    );
    sheen.set(
      withDelay(
        SHEEN_DELAY_MS,
        withTiming(1, { duration: SHEEN_MS, easing: Easing.inOut(Easing.cubic) }),
      ),
    );
    text.set(withDelay(TEXT_DELAY_MS, withTiming(1, { duration: TEXT_MS, easing: EASE_OUT })));
    outro.set(
      withDelay(
        OUTRO_DELAY_MS,
        withTiming(1, { duration: OUTRO_MS, easing: Easing.in(Easing.quad) }, finish),
      ),
    );
  }, [lift, onFinish, outro, reduceMotion, ripple, sheen, text]);

  const onLayout = useCallback(() => {
    const fallback = setTimeout(start, HIDE_FALLBACK_MS);
    void SplashScreen.hideAsync()
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(fallback);
        start();
      });
  }, [start]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: 1 - outro.value }));
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.04 * outro.value }],
  }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -LIFT * lift.value },
      { scale: 1 - (1 - SETTLED_SCALE) * lift.value },
    ],
  }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ripple.value, [0, 0.15, 1], [0, 0.32, 0], Extrapolation.CLAMP),
    transform: [{ scale: 1 + 0.9 * ripple.value }],
  }));
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          sheen.value,
          [0, 1],
          [-NATIVE_MARK_SIZE * 1.1, NATIVE_MARK_SIZE * 1.1],
        ),
      },
      { rotate: '20deg' },
    ],
  }));
  // The wordmark leads and the tagline follows a beat behind — one stagger, no bounce.
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(text.value, [0, 0.7], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(text.value, [0, 0.7], [12, 0], Extrapolation.CLAMP) }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(text.value, [0.3, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(text.value, [0.3, 1], [8, 0], Extrapolation.CLAMP) }],
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
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, contentStyle]}>
        <Animated.View style={markStyle}>
          <Animated.View
            pointerEvents="none"
            style={[styles.ripple, { borderColor: colors.accent }, rippleStyle]}
          />
          <View style={styles.markClip}>
            <LogoMark size={NATIVE_MARK_SIZE} />
            <Animated.View pointerEvents="none" style={[styles.sheen, sheenStyle]}>
              <Sheen />
            </Animated.View>
          </View>
        </Animated.View>

        <View style={styles.copy} pointerEvents="none">
          <Animated.View style={wordmarkStyle}>
            <Text
              className="text-[28px] font-bold text-ink dark:text-ink-dark"
              style={{ letterSpacing: -0.8 }}
            >
              {appConfig.name}
            </Text>
          </Animated.View>
          <Animated.View style={taglineStyle}>
            <Text className="mt-1.5 text-[13px] text-ink-muted dark:text-ink-dark-muted">
              Invest in stocks, the simple way
            </Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/** A soft vertical band of light, clear at both edges — the tile's sheen. */
function Sheen() {
  return (
    <Svg width={SHEEN_WIDTH} height={SHEEN_HEIGHT} accessible={false}>
      <Defs>
        <LinearGradient id="splash-sheen" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={palette.white} stopOpacity={0} />
          <Stop offset="0.5" stopColor={palette.white} stopOpacity={0.38} />
          <Stop offset="1" stopColor={palette.white} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width={SHEEN_WIDTH} height={SHEEN_HEIGHT} fill="url(#splash-sheen)" />
    </Svg>
  );
}

const SHEEN_WIDTH = NATIVE_MARK_SIZE * 0.42;
const SHEEN_HEIGHT = NATIVE_MARK_SIZE * 1.8;

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  markClip: {
    width: NATIVE_MARK_SIZE,
    height: NATIVE_MARK_SIZE,
    borderRadius: MARK_RADIUS,
    overflow: 'hidden',
  },
  ripple: {
    position: 'absolute',
    width: NATIVE_MARK_SIZE,
    height: NATIVE_MARK_SIZE,
    borderRadius: MARK_RADIUS,
    borderWidth: 2,
  },
  sheen: {
    position: 'absolute',
    top: -(SHEEN_HEIGHT - NATIVE_MARK_SIZE) / 2,
    left: (NATIVE_MARK_SIZE - SHEEN_WIDTH) / 2,
  },
  // Anchored just under where the lifted, settled mark ends:
  // centre − LIFT + (96 × 0.78) / 2 ≈ centre + 3, plus a 15 px gap.
  copy: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: 18,
    alignItems: 'center',
  },
});
