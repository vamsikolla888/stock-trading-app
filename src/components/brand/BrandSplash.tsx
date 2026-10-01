import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useId, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { Ambient, type AmbientTones } from '@/components/brand/splash/Ambient';
import { AnimatedMark } from '@/components/brand/splash/AnimatedMark';
import { EASE_GRAPH, EASE_OUT, EASE_SOFT } from '@/components/brand/splash/easing';
import { progressIn, SETTLED_AT, SPLASH_MS, TIMELINE } from '@/components/brand/splash/timeline';
import { appConfig } from '@/config/app';
import { brandFont } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';
import { palette } from '@/theme/tokens';

/*
 * The launch screen — three seconds, one clock, the brand's own colours on the theme's ground
 * (white, or the dark canvas in dark mode; the native splash has both).
 *
 * The first frame is the native splash, pixel for pixel: the theme's plain ground — no logo, so
 * the whole logo arrives animated. The tile springs in, and the mark builds itself inside it
 * (splash/AnimatedMark.tsx): volume bars from zero, then the rise graph drawing 0 → 100 % with
 * its arrowhead riding the tip, landing as the logo's arrow and lifting — while the count under
 * it runs 0 % → 100 % in step, over a soft glow, with faint market glyphs drifting up around it
 * and a long market line climbing the lower screen (splash/Ambient.tsx). The finished mark
 * glides up into the lockup; "Stocks" (Inter Display) and its line (Inter) rise in beneath; a
 * beat; and the whole screen dissolves onto the app, which has been mounted and fetching
 * underneath the whole time — signed out, that is the sign-in screen. The score is in
 * splash/timeline.ts.
 *
 * Every frame runs on the UI thread, so the app booting underneath cannot make it stutter. With
 * Reduce Motion on, nothing moves: the finished lockup shows, holds, and dissolves.
 */

/** The mark's size as it builds, before it settles into the lockup. */
const MARK_SIZE = 96;
const SETTLED_SCALE = 0.75;
const SETTLED_SIZE = MARK_SIZE * SETTLED_SCALE;

const WORDMARK_SIZE = 36;
const WORDMARK_LINE = 44;
/** −2.5 %: Inter Display is drawn to be set tight at display sizes. */
const WORDMARK_TRACKING = -0.9;
const TAGLINE_SIZE = 14;
const TAGLINE_LINE = 20;
const MARK_GAP = 20;
const TAGLINE_GAP = 6;
/** A lockup centred exactly reads low; lift it to the optical centre. */
const OPTICAL_RAISE = 12;

// The finished lockup, measured from the screen's centre (negative = above it).
const LOCKUP_HEIGHT = SETTLED_SIZE + MARK_GAP + WORDMARK_LINE + TAGLINE_GAP + TAGLINE_LINE;
const LOCKUP_TOP = -LOCKUP_HEIGHT / 2 - OPTICAL_RAISE;
/** How far the mark's centre travels: from the screen's centre to its place in the lockup. */
const LIFT = -(LOCKUP_TOP + SETTLED_SIZE / 2);
const COPY_TOP = LOCKUP_TOP + SETTLED_SIZE + MARK_GAP;

/** Rising text travels only this far — enough to read as arriving, not as moving. */
const WORDMARK_RISE = 12;
const TAGLINE_RISE = 8;
/** The glow behind the mark, at the mark's starting size. */
const GLOW_SIZE = 320;
/** On the way out the lockup comes forward a touch as it fades. */
const OUTRO_GROW = 0.04;

/** The reduced sequence: the finished lockup, held, then a plain dissolve (no movement). */
const REDUCED_HOLD_MS = 900;
const REDUCED_FADE_MS = 300;
/** If the native hide never settles, run the sequence anyway rather than hang on the logo. */
const HIDE_FALLBACK_MS = 300;

/** The count sits this far under the building mark. */
const COUNT_GAP = 18;

const TAGLINE = 'Invest in stocks, the simple way';

export function BrandSplash({ onFinish }: { onFinish: () => void }) {
  const { colors, isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const glowId = `splash-glow-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const clock = useSharedValue(0);
  const started = useRef(false);

  // Dark mode lifts the greens so they read on the dark canvas, and lets the texture show a
  // little more — dark grounds swallow faint colour.
  const tones: AmbientTones = isDark
    ? { up: palette.darkGreenText, down: palette.darkRedText, lineOpacity: 0.3 }
    : { up: palette.green, down: palette.red, lineOpacity: 0.22 };
  const glowOpacity = isDark ? 0.22 : 0.14;

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;

    // Runs even if the clock is interrupted: the overlay must never outlive its sequence and
    // sit over a working app.
    const finish = () => {
      'worklet';
      scheduleOnRN(onFinish);
    };

    if (reduceMotion) {
      clock.set(SETTLED_AT);
      clock.set(
        withDelay(
          REDUCED_HOLD_MS,
          withTiming(
            SPLASH_MS,
            { duration: REDUCED_FADE_MS, reduceMotion: ReduceMotion.Never },
            finish,
          ),
          ReduceMotion.Never,
        ),
      );
      return;
    }
    // .set() rather than `.value =`: the React Compiler-safe way to drive shared values.
    clock.set(withTiming(SPLASH_MS, { duration: SPLASH_MS, easing: Easing.linear }, finish));
  }, [clock, onFinish, reduceMotion]);

  const onLayout = useCallback(() => {
    const fallback = setTimeout(start, HIDE_FALLBACK_MS);
    void SplashScreen.hideAsync()
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(fallback);
        start();
      });
  }, [start]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: 1 - EASE_SOFT(progressIn(clock.get(), TIMELINE.outro)),
  }));
  const lockupStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + OUTRO_GROW * EASE_OUT(progressIn(clock.get(), TIMELINE.outro)) }],
  }));
  const markStyle = useAnimatedStyle(() => {
    const p = EASE_OUT(progressIn(clock.get(), TIMELINE.lift));
    return {
      transform: [{ translateY: -LIFT * p }, { scale: 1 - (1 - SETTLED_SCALE) * p }],
    };
  });
  const glowStyle = useAnimatedStyle(() => {
    const p = EASE_OUT(progressIn(clock.get(), TIMELINE.glow));
    return { opacity: p, transform: [{ scale: 0.6 + 0.4 * p }] };
  });
  const wordmarkStyle = useAnimatedStyle(() => {
    const p = EASE_OUT(progressIn(clock.get(), TIMELINE.wordmark));
    return { opacity: p, transform: [{ translateY: WORDMARK_RISE * (1 - p) }] };
  });
  const taglineStyle = useAnimatedStyle(() => {
    const p = EASE_OUT(progressIn(clock.get(), TIMELINE.tagline));
    return { opacity: p, transform: [{ translateY: TAGLINE_RISE * (1 - p) }] };
  });

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={appConfig.name}
      onLayout={onLayout}
      style={[
        StyleSheet.absoluteFill,
        styles.center,
        { backgroundColor: colors.background },
        containerStyle,
      ]}
    >
      {/* Texture first, far under everything; no movement at all under Reduce Motion. */}
      {reduceMotion ? null : <Ambient clock={clock} width={width} height={height} tones={tones} />}

      <Animated.View style={[StyleSheet.absoluteFill, styles.center, lockupStyle]}>
        <Animated.View style={markStyle}>
          <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]}>
            <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
              <Defs>
                <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={tones.up} stopOpacity={glowOpacity} />
                  <Stop offset="0.55" stopColor={tones.up} stopOpacity={glowOpacity * 0.35} />
                  <Stop offset="1" stopColor={tones.up} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle
                cx={GLOW_SIZE / 2}
                cy={GLOW_SIZE / 2}
                r={GLOW_SIZE / 2}
                fill={`url(#${glowId})`}
              />
            </Svg>
          </Animated.View>
          <AnimatedMark clock={clock} size={MARK_SIZE} />
        </Animated.View>

        <RiseCounter clock={clock} color={isDark ? palette.darkGreenText : palette.greenText} />

        <View style={styles.copy} pointerEvents="none">
          <Animated.View style={wordmarkStyle}>
            {/* A logo, not text to read: it keeps its size under large accessibility type. */}
            <Text
              allowFontScaling={false}
              style={[styles.wordmark, { color: colors.text }, brandFont('display')]}
            >
              {appConfig.name}
            </Text>
          </Animated.View>
          <Animated.View style={taglineStyle}>
            <Text
              maxFontSizeMultiplier={1.3}
              style={[styles.tagline, { color: colors.textMuted }, brandFont('text')]}
            >
              {TAGLINE}
            </Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The rise in numbers: 0 % → 100 % under the logo, reading exactly the share of the rise graph
 * that is drawn (same window, same curve), then giving way to the name. Only this small text
 * re-renders as it counts — at most a hundred times, and only when the number changes.
 */
function RiseCounter({ clock, color }: { clock: SharedValue<number>; color: string }) {
  const [value, setValue] = useState(0);
  useAnimatedReaction(
    () => Math.round(100 * EASE_GRAPH(progressIn(clock.get(), TIMELINE.trend))),
    (next, previous) => {
      if (next !== previous) scheduleOnRN(setValue, next);
    },
  );
  const style = useAnimatedStyle(() => {
    const t = clock.get();
    const shown = EASE_OUT(progressIn(t, TIMELINE.countIn));
    const gone = EASE_SOFT(progressIn(t, TIMELINE.countOut));
    return {
      opacity: shown * (1 - gone),
      transform: [{ translateY: 6 * (1 - shown) - 8 * gone }],
    };
  });

  return (
    <Animated.View style={[styles.counter, style]} pointerEvents="none">
      <Text allowFontScaling={false} style={[styles.count, { color }, brandFont('display')]}>
        {value}%
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    left: (MARK_SIZE - GLOW_SIZE) / 2,
    top: (MARK_SIZE - GLOW_SIZE) / 2,
    width: GLOW_SIZE,
    height: GLOW_SIZE,
  },
  copy: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: COPY_TOP,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  counter: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: MARK_SIZE / 2 + COUNT_GAP,
    alignItems: 'center',
  },
  count: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  wordmark: {
    fontSize: WORDMARK_SIZE,
    lineHeight: WORDMARK_LINE,
    letterSpacing: WORDMARK_TRACKING,
    includeFontPadding: false,
  },
  tagline: {
    marginTop: TAGLINE_GAP,
    fontSize: TAGLINE_SIZE,
    lineHeight: TAGLINE_LINE,
    letterSpacing: 0.1,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
