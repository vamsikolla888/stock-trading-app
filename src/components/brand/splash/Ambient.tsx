import React, { memo, useId, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { LogoMark, MARK_ARROW, MARK_TREND } from '@/components/brand/Logo';

import { EASE_GRAPH as EASE_IN_OUT, EASE_OUT } from './easing';
import {
  chevronPath,
  GLYPH_DRIFT,
  GLYPHS,
  type GlyphKind,
  type GlyphSpec,
  leanToward,
  linePath,
  pointAlong,
  progressIn,
  TIMELINE,
} from './timeline';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/*
 * The splash's back layer: texture that says "markets" without asking to be read. A few faint
 * glyphs — the logo small, the logo in outline, candles both ways, an arrow, a sparkline, volume
 * bars — drift upward and fade, and one long market line climbs the lower screen with an
 * arrowhead riding its tip. All of it sits far under the lockup in contrast; none of it carries
 * meaning.
 */

export interface AmbientTones {
  /** Rising things: the brand green for the theme. */
  up: string;
  /** The one falling candle — markets dip too. */
  down: string;
  /** How strongly the market line shows. */
  lineOpacity: number;
}

interface AmbientProps {
  clock: SharedValue<number>;
  width: number;
  height: number;
  tones: AmbientTones;
}

export const Ambient = memo(function Ambient({ clock, width, height, tones }: AmbientProps) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <RisingLine clock={clock} width={width} height={height} tones={tones} />
      {GLYPHS.map((spec) => (
        <FloatingGlyph
          key={`${spec.kind}-${spec.x}-${spec.y}`}
          clock={clock}
          spec={spec}
          width={width}
          height={height}
          tones={tones}
        />
      ))}
    </View>
  );
});

/** One glyph's life: fades in as it starts to rise, drifts up, fades out before the dissolve. */
function FloatingGlyph({
  clock,
  spec,
  width,
  height,
  tones,
}: {
  clock: SharedValue<number>;
  spec: GlyphSpec;
  width: number;
  height: number;
  tones: AmbientTones;
}) {
  const window = { start: spec.start, duration: spec.life };
  const style = useAnimatedStyle(() => {
    const p = progressIn(clock.get(), window);
    // In over the first 30 %, out over the last 35 %: never a hard edge.
    const fade = p < 0.3 ? EASE_OUT(p / 0.3) : p > 0.65 ? 1 - EASE_IN_OUT((p - 0.65) / 0.35) : 1;
    const drift = GLYPH_DRIFT.from + (GLYPH_DRIFT.to - GLYPH_DRIFT.from) * EASE_OUT(p);
    return {
      opacity: p > 0 && p < 1 ? spec.peak * fade : 0,
      transform: [
        { translateY: drift },
        { scale: 0.9 + 0.1 * EASE_OUT(Math.min(1, p / 0.4)) },
        { rotate: `${spec.tilt}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: spec.x * width - spec.size / 2,
          top: spec.y * height - spec.size / 2,
          width: spec.size,
          height: spec.size,
        },
        style,
      ]}
    >
      <Glyph kind={spec.kind} size={spec.size} tones={tones} />
    </Animated.View>
  );
}

/** The glyph drawings, each on a 24-unit grid (the logos on the brand's 30-unit tile). */
function Glyph({ kind, size, tones }: { kind: GlyphKind; size: number; tones: AmbientTones }) {
  switch (kind) {
    case 'mark':
      return <LogoMark size={size} />;
    case 'outlineMark':
      return (
        <Svg width={size} height={size} viewBox="0 0 30 30">
          <Rect
            x={1}
            y={1}
            width={28}
            height={28}
            rx={8.5}
            fill="none"
            stroke={tones.up}
            strokeWidth={1.8}
          />
          {[MARK_TREND, MARK_ARROW].map((d) => (
            <Path
              key={d}
              d={d}
              fill="none"
              stroke={tones.up}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
      );
    case 'candleUp':
    case 'candleDown': {
      const up = kind === 'candleUp';
      const color = up ? tones.up : tones.down;
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Line
            x1={12}
            x2={12}
            y1={2.5}
            y2={21.5}
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <Rect x={8} y={up ? 6.5 : 9} width={8} height={up ? 11 : 8} rx={1.6} fill={color} />
        </Svg>
      );
    }
    case 'arrow':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M5 19L19 5M10.5 5H19v8.5"
            fill="none"
            stroke={tones.up}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'spark':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M2 17l5-5 4 3 7-8"
            fill="none"
            stroke={tones.up}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={18} cy={7} r={2.2} fill={tones.up} />
        </Svg>
      );
    case 'bars':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          {[
            { x: 3, h: 6 },
            { x: 10, h: 10 },
            { x: 17, h: 15 },
          ].map((bar) => (
            <Rect
              key={bar.x}
              x={bar.x}
              y={21 - bar.h}
              width={4.5}
              height={bar.h}
              rx={1.4}
              fill={tones.up}
            />
          ))}
        </Svg>
      );
  }
}

/** The market line's arrowhead: arms this long, this far off the line's heading. */
const HEAD_ARM = 11;
const HEAD_SPREAD = 0.62;
/** How far ahead/behind the rider looks to turn through the curve (points). */
const TURN_SMOOTHING = 6;
/** The rider leans this much from the line's overall rise towards the curve's own heading. */
const LEAN = 0.5;

/**
 * The long market line: drawn from the left edge, climbing through a couple of dips, fading in
 * along its length so it starts from nothing — its arrowhead riding the tip the whole way.
 */
function RisingLine({
  clock,
  width,
  height,
  tones,
}: {
  clock: SharedValue<number>;
  width: number;
  height: number;
  tones: AmbientTones;
}) {
  const gradientId = `splash-line-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const { d, track } = useMemo(() => linePath(width, height), [width, height]);
  const length = track.length;
  // The way the whole line rises, start to end — what its arrowhead leans from.
  const last = track.xs.length - 1;
  const rise = Math.atan2(track.ys[last]! - track.ys[0]!, track.xs[last]! - track.xs[0]!);

  const lineProps = useAnimatedProps(() => {
    const p = EASE_IN_OUT(progressIn(clock.get(), TIMELINE.line));
    return { strokeDashoffset: length * (1 - p), strokeOpacity: p > 0 ? 1 : 0 };
  });
  // The arrowhead at the tip, facing along the curve; it fades in as the line leaves the edge
  // (the line itself starts from nothing there).
  const headProps = useAnimatedProps(() => {
    const raw = progressIn(clock.get(), TIMELINE.line);
    const [x, y, heading] = pointAlong(track, EASE_IN_OUT(raw) * length, TURN_SMOOTHING);
    return {
      d: chevronPath(x, y, leanToward(heading, rise, LEAN), HEAD_ARM, HEAD_SPREAD),
      strokeOpacity: raw <= 0 ? 0 : Math.min(1, 0.25 + raw * 1.5),
    };
  });

  if (width <= 0 || height <= 0) return null;

  return (
    <Svg
      width={width}
      height={height}
      style={[StyleSheet.absoluteFill, { opacity: tones.lineOpacity }]}
    >
      <Defs>
        <LinearGradient
          id={gradientId}
          x1={0}
          y1={0}
          x2={width}
          y2={0}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={tones.up} stopOpacity={0} />
          <Stop offset="0.4" stopColor={tones.up} stopOpacity={0.55} />
          <Stop offset="1" stopColor={tones.up} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <AnimatedPath
        d={d}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${length + 1} ${length + 1}`}
        animatedProps={lineProps}
      />
      <AnimatedPath
        d="M0 0"
        fill="none"
        stroke={tones.up}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        animatedProps={headProps}
      />
    </Svg>
  );
}
