import { MARK_ARROW } from '@/components/brand/Logo';

import {
  chevronPath,
  GLYPHS,
  leanToward,
  LINE_POINTS,
  linePath,
  pointAlong,
  progressIn,
  SETTLED_AT,
  SPLASH_MS,
  TIMELINE,
  trackOf,
  TREND_TRACK,
} from '../splash/timeline';

const end = (w: { start: number; duration: number }) => w.start + w.duration;

describe('splash timeline', () => {
  it('lasts three seconds, ending exactly as the dissolve does', () => {
    expect(SPLASH_MS).toBe(3000);
    expect(end(TIMELINE.outro)).toBe(SPLASH_MS);
    expect(SETTLED_AT).toBe(TIMELINE.outro.start);
  });

  it('has everything arrived before the dissolve starts', () => {
    const { outro, bars, ...rest } = TIMELINE;
    for (const w of [...bars, ...Object.values(rest)]) {
      expect(end(w)).toBeLessThanOrEqual(outro.start);
    }
  });

  it('builds the logo in order: tile, bars, graph, rise — then lifts it and sets the type', () => {
    expect(TIMELINE.tile.start).toBeLessThan(TIMELINE.bars[0].start);
    expect(TIMELINE.bars[0].start).toBeLessThan(TIMELINE.trend.start);
    expect(TIMELINE.rise.start).toBeGreaterThanOrEqual(end(TIMELINE.trend));
    expect(TIMELINE.lift.start).toBeGreaterThan(TIMELINE.rise.start);
    expect(TIMELINE.wordmark.start).toBeGreaterThan(TIMELINE.lift.start);
    expect(TIMELINE.tagline.start).toBeGreaterThan(TIMELINE.wordmark.start);
  });

  it('holds the native frame for a beat before anything moves', () => {
    const first = Math.min(TIMELINE.tile.start, TIMELINE.glow.start, TIMELINE.line.start);
    expect(first).toBeGreaterThanOrEqual(120);
  });

  it('counts 0 → 100 over exactly the graph, and clears before the name arrives', () => {
    expect(TIMELINE.countIn.start).toBeLessThanOrEqual(TIMELINE.trend.start);
    expect(TIMELINE.countOut.start).toBeGreaterThanOrEqual(end(TIMELINE.trend));
    expect(end(TIMELINE.countOut)).toBeLessThanOrEqual(TIMELINE.wordmark.start + 40);
  });
});

describe('the rider on the rise graph', () => {
  const at = (s: number) => pointAlong(TREND_TRACK, s, 0.8);

  it('starts at the graph’s first point and lands on its tip', () => {
    const [x0, y0] = at(0);
    expect([x0, y0]).toEqual([6.8, 19.2]);
    const [x1, y1] = at(TREND_TRACK.length);
    expect(x1).toBeCloseTo(23.2);
    expect(y1).toBeCloseTo(9.6);
  });

  it('lands as exactly the logo’s arrowhead', () => {
    const [x, y, heading] = at(TREND_TRACK.length);
    const d = chevronPath(x, y, heading, 4.6, Math.PI / 4);
    // MARK_ARROW is M18.6 9.6h4.6v4.6 — left arm, tip, down arm.
    expect(MARK_ARROW).toBe('M18.6 9.6h4.6v4.6');
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(nums[0]).toBeCloseTo(18.6, 1);
    expect(nums[1]).toBeCloseTo(9.6, 1);
    expect(nums[2]).toBeCloseTo(23.2, 1);
    expect(nums[3]).toBeCloseTo(9.6, 1);
    expect(nums[4]).toBeCloseTo(23.2, 1);
    expect(nums[5]).toBeCloseTo(14.2, 1);
  });

  it('follows the graph up the climbs and down through the dip…', () => {
    const [, , climbing] = at(3);
    const [, , dipping] = at(9.5);
    expect(climbing).toBeCloseTo(-Math.PI / 4);
    expect(dipping).toBeGreaterThan(0);
  });

  it('…but the arrow it carries leans into the dip and never points down', () => {
    const lean = (s: number) => leanToward(at(s)[2], -Math.PI / 4, 0.35);
    for (let s = 0; s <= TREND_TRACK.length; s += 0.5) expect(lean(s)).toBeLessThanOrEqual(0);
    expect(lean(3)).toBeCloseTo(-Math.PI / 4);
    expect(lean(TREND_TRACK.length)).toBeCloseTo(-Math.PI / 4);
  });

  it('measures a track as the sum of its segments', () => {
    const track = trackOf([
      [0, 0],
      [3, 4],
      [3, 10],
    ]);
    expect(track.length).toBe(11);
    expect(track.cum).toEqual([0, 5, 11]);
    const [x, y] = pointAlong(track, 8, 0.5);
    expect(x).toBeCloseTo(3);
    expect(y).toBeCloseTo(7);
  });
});

describe('ambient glyphs', () => {
  it('are all gone before the dissolve', () => {
    for (const glyph of GLYPHS) {
      expect(glyph.start + glyph.life).toBeLessThanOrEqual(SPLASH_MS);
    }
  });

  it('stay on screen, clear of the status bar and of the lockup in the middle', () => {
    for (const { x, y } of GLYPHS) {
      expect(x).toBeGreaterThan(0.05);
      expect(x).toBeLessThan(0.95);
      expect(y).toBeGreaterThan(0.1);
      expect(y).toBeLessThan(0.95);
      const inLockup = x > 0.25 && x < 0.75 && y > 0.32 && y < 0.62;
      expect(inLockup).toBe(false);
    }
  });

  it('are faint — texture, never content', () => {
    for (const glyph of GLYPHS) expect(glyph.peak).toBeLessThanOrEqual(0.45);
  });
});

describe('market line', () => {
  it('climbs from the left edge to the right, below the lockup', () => {
    const first = LINE_POINTS[0]!;
    const last = LINE_POINTS[LINE_POINTS.length - 1]!;
    expect(first[0]).toBeLessThanOrEqual(0);
    expect(last[1]).toBeLessThan(first[1]);
    for (const [, y] of LINE_POINTS) expect(y).toBeGreaterThan(0.6);
  });

  it('samples its curve as a track for the arrowhead to ride, ending at the last point', () => {
    const { d, track } = linePath(390, 844);
    expect(d.startsWith('M')).toBe(true);
    expect(track.length).toBeGreaterThan(390);
    const [x, y, heading] = pointAlong(track, track.length, 6);
    expect(x).toBeCloseTo(0.9 * 390);
    expect(y).toBeCloseTo(0.655 * 844);
    expect(heading).toBeLessThan(0); // pointing up the screen
  });
});

describe('progressIn', () => {
  it('is 0 before, linear within, 1 after', () => {
    const w = { start: 100, duration: 200 };
    expect(progressIn(0, w)).toBe(0);
    expect(progressIn(100, w)).toBe(0);
    expect(progressIn(200, w)).toBeCloseTo(0.5);
    expect(progressIn(300, w)).toBe(1);
    expect(progressIn(5000, w)).toBe(1);
  });
});
