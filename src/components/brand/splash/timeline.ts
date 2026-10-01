/**
 * The launch sequence, as one score: every motion is a window on a single clock (0 → SPLASH_MS,
 * linear, on the UI thread), so nothing can drift out of step and the whole piece is readable
 * here at a glance. Times are milliseconds from the moment the native splash hands over.
 *
 *      0  a plain screen — the native splash is the theme's ground alone, no logo
 *    120  the brand tile springs in: grows from small, turning upright, settling with a give
 *    460  the three volume bars grow up from zero, one after another
 *    640  the rise graph draws from 0 to 100 % — the arrowhead riding its tip, leaning into each
 *         climb and dip (never pointing down) — while the count under the logo runs 0 % → 100 %
 *   1600  the arrow has landed as the logo's own; it lifts, up and to the right — the "rise"
 *   1700  a soft light sweeps across the finished mark
 *   1820  the count, held at 100 %, gives way; the mark glides up into the lockup
 *   2020  "Stocks" rises in; 2140 its line follows
 *   2650  the screen dissolves onto the app (mounted and fetching underneath all along)
 *   3000  gone
 *
 * Behind it, a long market line climbs the lower screen with its own arrowhead riding the tip,
 * and a few faint glyphs — small logos, candles, arrows — drift upward and fade.
 */

export const SPLASH_MS = 3000;

export interface Window {
  start: number;
  duration: number;
}

export const TIMELINE = {
  tile: { start: 120, duration: 560 },
  glow: { start: 220, duration: 900 },
  bars: [
    { start: 460, duration: 380 },
    { start: 530, duration: 380 },
    { start: 600, duration: 380 },
  ],
  line: { start: 300, duration: 1500 },
  trend: { start: 640, duration: 960 },
  countIn: { start: 600, duration: 160 },
  rise: { start: 1600, duration: 420 },
  shine: { start: 1700, duration: 600 },
  countOut: { start: 1820, duration: 220 },
  lift: { start: 1860, duration: 540 },
  wordmark: { start: 2020, duration: 480 },
  tagline: { start: 2140, duration: 480 },
  outro: { start: 2650, duration: 350 },
} as const satisfies Record<string, Window | readonly Window[]>;

/** Where the clock stands once everything has arrived and nothing is leaving yet. */
export const SETTLED_AT = TIMELINE.outro.start;

/** 0 before the window, 1 after it, linear inside. */
export function progressIn(t: number, window: Window): number {
  'worklet';
  if (t <= window.start) return 0;
  if (t >= window.start + window.duration) return 1;
  return (t - window.start) / window.duration;
}

// ─── Moving along a path ────────────────────────────────────────────────────────────────────

type Point = readonly [number, number];

/** A path sampled as a polyline, with the distance to every sample — what a rider follows. */
export interface Track {
  xs: number[];
  ys: number[];
  /** Distance along the path to each sample; the last is the path's length. */
  cum: number[];
  length: number;
}

export function trackOf(points: readonly Point[]): Track {
  const xs: number[] = [];
  const ys: number[] = [];
  const cum: number[] = [];
  let length = 0;
  points.forEach(([x, y], i) => {
    if (i > 0) length += Math.hypot(x - xs[i - 1]!, y - ys[i - 1]!);
    xs.push(x);
    ys.push(y);
    cum.push(length);
  });
  return { xs, ys, cum, length };
}

/** The point `s` along the track (clamped to its ends). */
function positionAt(track: Track, s: number): [number, number] {
  'worklet';
  const { xs, ys, cum, length } = track;
  const d = Math.max(0, Math.min(length, s));
  let i = 1;
  while (i < cum.length - 1 && cum[i]! < d) i += 1;
  const span = cum[i]! - cum[i - 1]! || 1;
  const k = (d - cum[i - 1]!) / span;
  return [xs[i - 1]! + (xs[i]! - xs[i - 1]!) * k, ys[i - 1]! + (ys[i]! - ys[i - 1]!) * k];
}

/**
 * Where a rider `s` along the track is, and which way it faces (radians, screen axes — y down).
 * The heading looks a little behind and ahead (`smoothing`, in track units), so at a corner the
 * rider turns through it instead of snapping round.
 */
export function pointAlong(track: Track, s: number, smoothing: number): [number, number, number] {
  'worklet';
  const [x, y] = positionAt(track, s);
  const back = positionAt(track, Math.min(s, track.length - smoothing * 2) - smoothing);
  const ahead = positionAt(track, Math.max(s, smoothing * 2) + smoothing);
  return [x, y, Math.atan2(ahead[1] - back[1], ahead[0] - back[0])];
}

/**
 * A rider's facing, leaned rather than turned: `amount` of the way from `base` (the way the whole
 * path rises) towards the path's own heading. A rise arrow leans into a dip but never points
 * down, and on a climb along `base` it is exactly `base`.
 */
export function leanToward(heading: number, base: number, amount: number): number {
  'worklet';
  return base + (heading - base) * amount;
}

/**
 * An arrowhead at a tip facing `heading`: two arms of `arm` reaching back at ±`spread`, as an
 * SVG path (arm · tip · arm). Facing up-and-right (−45°) with a quarter-turn spread it is exactly
 * the logo's arrowhead: one arm left, one arm down.
 */
export function chevronPath(
  x: number,
  y: number,
  heading: number,
  arm: number,
  spread: number,
): string {
  'worklet';
  const back = heading + Math.PI;
  const ax = x + arm * Math.cos(back + spread);
  const ay = y + arm * Math.sin(back + spread);
  const bx = x + arm * Math.cos(back - spread);
  const by = y + arm * Math.sin(back - spread);
  return `M${ax.toFixed(2)} ${ay.toFixed(2)} L${x.toFixed(2)} ${y.toFixed(2)} L${bx.toFixed(2)} ${by.toFixed(2)}`;
}

/** The logo's rise graph (Logo.tsx MARK_TREND) as points, in the 30-unit tile. */
export const TREND_POINTS: readonly Point[] = [
  [6.8, 19.2],
  [12, 14],
  [15.6, 17.2],
  [23.2, 9.6],
];

export const TREND_TRACK = trackOf(TREND_POINTS);

// ─── The ambient layer ──────────────────────────────────────────────────────────────────────

/**
 * The ambient glyphs: what each one is, where it floats (fractions of the screen, clear of the
 * lockup in the middle and of the market line low down), when it lives, and how strongly it
 * shows at its peak. Faint by design — texture, not content.
 */
export type GlyphKind =
  'mark' | 'outlineMark' | 'candleUp' | 'candleDown' | 'arrow' | 'spark' | 'bars';

export interface GlyphSpec {
  kind: GlyphKind;
  /** Centre, as fractions of the screen's width and height. */
  x: number;
  y: number;
  size: number;
  /** Its life on the clock: fade in, drift up, fade out. */
  start: number;
  life: number;
  /** Peak opacity. */
  peak: number;
  /** A slight tilt, degrees — nothing sits perfectly square. */
  tilt: number;
}

export const GLYPHS: readonly GlyphSpec[] = [
  { kind: 'mark', x: 0.17, y: 0.2, size: 28, start: 300, life: 2000, peak: 0.42, tilt: -8 },
  { kind: 'candleUp', x: 0.84, y: 0.17, size: 26, start: 440, life: 1950, peak: 0.34, tilt: 0 },
  { kind: 'spark', x: 0.76, y: 0.3, size: 30, start: 900, life: 1800, peak: 0.3, tilt: 0 },
  { kind: 'outlineMark', x: 0.12, y: 0.42, size: 24, start: 760, life: 1900, peak: 0.34, tilt: 6 },
  { kind: 'arrow', x: 0.88, y: 0.46, size: 22, start: 620, life: 1900, peak: 0.36, tilt: 0 },
  { kind: 'candleDown', x: 0.15, y: 0.66, size: 24, start: 560, life: 1900, peak: 0.28, tilt: 0 },
  { kind: 'mark', x: 0.4, y: 0.13, size: 20, start: 1000, life: 1800, peak: 0.3, tilt: 10 },
  { kind: 'bars', x: 0.66, y: 0.9, size: 26, start: 1080, life: 1750, peak: 0.3, tilt: 0 },
];

/** How far a glyph drifts over its life (points; negative = up). */
export const GLYPH_DRIFT = { from: 18, to: -30 };

/**
 * The faint market line across the lower screen: points as fractions of width and height — a
 * climb with honest dips in it, drawn as one smooth curve through them, ending in an arrowhead
 * well below the tagline.
 */
export const LINE_POINTS: readonly Point[] = [
  [-0.02, 0.92],
  [0.18, 0.86],
  [0.3, 0.88],
  [0.48, 0.79],
  [0.6, 0.81],
  [0.78, 0.71],
  [0.9, 0.655],
];

/** Samples per curve segment — enough that the rider and the measured length follow the curve. */
const SAMPLES = 24;

function cubicAt(p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1],
  ];
}

/**
 * The line in screen points: a Catmull-Rom curve through the points (as cubic Béziers) for the
 * SVG, the same curve sampled as a track for its arrowhead to ride, and its length (what the
 * draw animates over).
 */
export function linePath(width: number, height: number): { d: string; track: Track } {
  const points: Point[] = LINE_POINTS.map(([x, y]) => [x * width, y * height]);
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]!;
  const f = (n: number) => n.toFixed(1);

  let d = `M${f(points[0]![0])} ${f(points[0]![1])}`;
  const samples: Point[] = [points[0]!];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = at(i);
    const p1 = at(i + 1);
    const before = at(i - 1);
    const after = at(i + 2);
    const c1: Point = [p0[0] + (p1[0] - before[0]) / 6, p0[1] + (p1[1] - before[1]) / 6];
    const c2: Point = [p1[0] - (after[0] - p0[0]) / 6, p1[1] - (after[1] - p0[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p1[0])} ${f(p1[1])}`;
    for (let k = 1; k <= SAMPLES; k += 1) samples.push(cubicAt(p0, c1, c2, p1, k / SAMPLES));
  }
  return { d, track: trackOf(samples) };
}
