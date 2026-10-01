import React, { memo, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { MARK_BARS, MARK_GRADIENT, MARK_TREND } from '@/components/brand/Logo';
import { palette } from '@/theme/tokens';

import { BACK_OUT, EASE_GRAPH as EASE_IN_OUT, EASE_OUT } from './easing';
import { chevronPath, leanToward, pointAlong, progressIn, TIMELINE, TREND_TRACK } from './timeline';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/*
 * The brand mark, built whole on the splash's clock — the same geometry as Logo.tsx, in the same
 * 30-unit tile, nothing of it on screen before it starts:
 *
 *   the tile springs in (small → full, turning upright, a slight give as it settles);
 *   the volume bars grow up from zero;
 *   the rise graph draws 0 → 100 % with the arrowhead RIDING its tip — climbing, leaning into
 *   the dip without ever pointing down, climbing again, growing as it goes — until it lands as
 *   the logo's own arrowhead;
 *   the landed arrow lifts, up and to the right; a light passes over the finished mark.
 */

const STROKE = 2.6;
/** The arrowhead's arms (MARK_ARROW: 4.6 units, a quarter-turn apart). */
const ARM = 4.6;
const SPREAD = Math.PI / 4;
/** How far ahead/behind the rider looks to turn through corners (tile units). */
const TURN_SMOOTHING = 0.8;
/** The logo's arrow faces up and to the right; the rider leans this much towards the graph. */
const RISE_HEADING = -Math.PI / 4;
const LEAN = 0.35;
/** The arrowhead starts at this share of its size and grows to full as the graph completes. */
const HEAD_START_SCALE = 0.7;
/** The tile's floor the bars stand on (every bar's y + height). */
const BAR_FLOOR = 23;
/** How far the arrow lifts at the top of its nudge, in tile units — up and to the right. */
const RISE_UNITS = 0.9;
/** The tile's entrance: from this scale and this turn. */
const ENTER_SCALE = 0.35;
const ENTER_TURN_DEG = -14;

interface AnimatedMarkProps {
  clock: SharedValue<number>;
  size: number;
}

export const AnimatedMark = memo(function AnimatedMark({ clock, size }: AnimatedMarkProps) {
  const gradientId = `splash-mark-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const unit = size / 30;
  const length = TREND_TRACK.length;

  const enterStyle = useAnimatedStyle(() => {
    const p = progressIn(clock.get(), TIMELINE.tile);
    return {
      opacity: Math.min(1, p / 0.35),
      transform: [
        { scale: ENTER_SCALE + (1 - ENTER_SCALE) * BACK_OUT(p) },
        { rotate: `${ENTER_TURN_DEG * (1 - EASE_OUT(p))}deg` },
      ],
    };
  });

  const trendProps = useAnimatedProps(() => {
    const p = EASE_IN_OUT(progressIn(clock.get(), TIMELINE.trend));
    return { strokeDashoffset: length * (1 - p), strokeOpacity: p > 0 ? 1 : 0 };
  });
  // The arrowhead at the graph's tip, facing the way the graph is going right now.
  const headProps = useAnimatedProps(() => {
    const raw = progressIn(clock.get(), TIMELINE.trend);
    const p = EASE_IN_OUT(raw);
    const [x, y, heading] = pointAlong(TREND_TRACK, p * length, TURN_SMOOTHING);
    const facing = leanToward(heading, RISE_HEADING, LEAN);
    const arm = ARM * (HEAD_START_SCALE + (1 - HEAD_START_SCALE) * p);
    return {
      d: chevronPath(x, y, facing, arm, SPREAD),
      // In over the first stretch of the climb, so it never shows without a line behind it.
      strokeOpacity: Math.min(1, raw / 0.15),
    };
  });
  // The rise: out and back along a half sine, so it settles exactly where the logo has it.
  const arrowStyle = useAnimatedStyle(() => {
    const p = progressIn(clock.get(), TIMELINE.rise);
    const lift = Math.sin(Math.PI * EASE_IN_OUT(p)) * RISE_UNITS * unit;
    return { transform: [{ translateX: lift }, { translateY: -lift }] };
  });
  const shineStyle = useAnimatedStyle(() => {
    const p = progressIn(clock.get(), TIMELINE.shine);
    return {
      opacity: p > 0 && p < 1 ? 1 : 0,
      transform: [{ translateX: -size + EASE_IN_OUT(p) * size * 2.2 }, { rotate: '18deg' }],
    };
  });

  return (
    <Animated.View style={[{ width: size, height: size }, enterStyle]}>
      <Svg width={size} height={size} viewBox="0 0 30 30">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={MARK_GRADIENT.from} />
            <Stop offset="1" stopColor={MARK_GRADIENT.to} />
          </LinearGradient>
        </Defs>
        <Rect width={30} height={30} rx={9} fill={`url(#${gradientId})`} />
        {MARK_BARS.map((bar, index) => (
          <GrowingBar key={bar.x} clock={clock} index={index} />
        ))}
      </Svg>

      {/* The graph and its arrow on their own layer, so the rise moves them together. */}
      <Animated.View style={[StyleSheet.absoluteFill, arrowStyle]} pointerEvents="none">
        <Svg width={size} height={size} viewBox="0 0 30 30">
          <AnimatedPath
            d={MARK_TREND}
            fill="none"
            stroke={palette.white}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${length + 0.5} ${length + 0.5}`}
            animatedProps={trendProps}
          />
          <AnimatedPath
            d={chevronPath(6.8, 19.2, -Math.PI / 4, ARM, SPREAD)}
            fill="none"
            stroke={palette.white}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            animatedProps={headProps}
          />
        </Svg>
      </Animated.View>

      {/* The light: a soft diagonal band crossing once, clipped to the tile's corners. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: 9 * unit, overflow: 'hidden' }]}
      >
        <Animated.View
          style={[
            { position: 'absolute', top: -size * 0.3, width: size * 0.42, height: size * 1.6 },
            shineStyle,
          ]}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`${gradientId}-shine`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={palette.white} stopOpacity={0} />
                <Stop offset="0.5" stopColor={palette.white} stopOpacity={0.32} />
                <Stop offset="1" stopColor={palette.white} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${gradientId}-shine)`} />
          </Svg>
        </Animated.View>
      </View>
    </Animated.View>
  );
});

/** One volume bar, growing up from zero at the tile's floor on its own window. */
function GrowingBar({ clock, index }: { clock: SharedValue<number>; index: number }) {
  const bar = MARK_BARS[index]!;
  const window = TIMELINE.bars[index]!;
  const animatedProps = useAnimatedProps(() => {
    const h = bar.height * EASE_OUT(progressIn(clock.get(), window));
    return { y: BAR_FLOOR - h, height: h };
  });
  return (
    <AnimatedRect
      x={bar.x}
      width={bar.width}
      rx={1}
      fill={palette.white}
      fillOpacity={0.3}
      animatedProps={animatedProps}
    />
  );
}
