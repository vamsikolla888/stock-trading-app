import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { LogoMark } from '@/components/brand/Logo';
import { appConfig } from '@/config/app';
import { brandFont } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

/*
 * The launch screen, kept deliberately quiet: one motion, one typeface, the brand's own colours.
 *
 * The first frame is the native splash, pixel for pixel — the mark at the centre of a plain
 * background — so the handover is invisible. Then the mark glides up and settles into the
 * lockup while the wordmark and its line fade up beneath it; a short hold, and the screen
 * dissolves onto the app, which has been mounted and fetching underneath the whole time (none of
 * this delays startup — it only decides when the curtain lifts).
 *
 *     0 ─ stillness: the native frame, held for a beat
 *   140 ─ the mark lifts and settles to 72 pt (560 ms)
 *   300 ─ "Stocks" fades up (520 ms)
 *   440 ─ the line under it follows (480 ms)
 *  1120 ─ the screen fades out (260 ms) — gone by ~1.4 s
 *
 * With Reduce Motion on nothing moves: the native frame simply dissolves.
 */

/** Must equal the expo-splash-screen plugin's `imageWidth` in app.config.ts. */
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
const WORDMARK_RISE = 10;
const TAGLINE_RISE = 6;

const SETTLE_DELAY_MS = 140;
const SETTLE_MS = 560;
const WORDMARK_DELAY_MS = 300;
const WORDMARK_MS = 520;
const TAGLINE_DELAY_MS = 440;
const TAGLINE_MS = 480;
const OUTRO_DELAY_MS = 1120;
const OUTRO_MS = 260;
const REDUCED_DELAY_MS = 120;
const REDUCED_MS = 200;
/** If the native hide never settles, run the sequence anyway rather than hang on the logo. */
const HIDE_FALLBACK_MS = 300;

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const EASE_IN_OUT = Easing.bezier(0.4, 0, 0.2, 1);

const TAGLINE = 'Invest in stocks, the simple way';

export function BrandSplash({ onFinish }: { onFinish: () => void }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const settle = useSharedValue(0);
  const wordmark = useSharedValue(0);
  const tagline = useSharedValue(0);
  const outro = useSharedValue(0);
  const started = useRef(false);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;

    // Runs even if the outro is interrupted: the overlay must never outlive its sequence
    // and sit over a working app.
    const finish = () => {
      'worklet';
      scheduleOnRN(onFinish);
    };

    if (reduceMotion) {
      outro.set(withDelay(REDUCED_DELAY_MS, withTiming(1, { duration: REDUCED_MS }, finish)));
      return;
    }
    // .set() rather than `.value =`: the React Compiler-safe way to drive shared values.
    settle.set(
      withDelay(SETTLE_DELAY_MS, withTiming(1, { duration: SETTLE_MS, easing: EASE_OUT })),
    );
    wordmark.set(
      withDelay(WORDMARK_DELAY_MS, withTiming(1, { duration: WORDMARK_MS, easing: EASE_OUT })),
    );
    tagline.set(
      withDelay(TAGLINE_DELAY_MS, withTiming(1, { duration: TAGLINE_MS, easing: EASE_OUT })),
    );
    outro.set(
      withDelay(OUTRO_DELAY_MS, withTiming(1, { duration: OUTRO_MS, easing: EASE_IN_OUT }, finish)),
    );
  }, [onFinish, outro, reduceMotion, settle, tagline, wordmark]);

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
  const markStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -LIFT * settle.value },
      { scale: 1 - (1 - SETTLED_SCALE) * settle.value },
    ],
  }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [{ translateY: WORDMARK_RISE * (1 - wordmark.value) }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: tagline.value,
    transform: [{ translateY: TAGLINE_RISE * (1 - tagline.value) }],
  }));

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
      <Animated.View style={markStyle}>
        <LogoMark size={MARK_SIZE} />
      </Animated.View>

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
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  copy: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: COPY_TOP,
    alignItems: 'center',
    paddingHorizontal: 24,
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
