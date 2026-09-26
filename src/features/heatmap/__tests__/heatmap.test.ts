import {
  breadthShares,
  filterAndSortStocks,
  groupIndices,
  HEAT_PALETTE,
  heatBucket,
  heatSwatch,
  layoutHeatmap,
  tileDetail,
  TREEMAP_MAX_TILES,
  treemapHeight,
  treemapSubset,
} from '@/features/heatmap/lib/heatmap';
import { layoutTreemap } from '@/features/heatmap/lib/treemap';
import type { HeatmapIndexSummary, HeatmapStock } from '@/features/heatmap/types';

function stock(
  symbol: string,
  marketCap: number | null,
  changePct: number | null = 0,
  sector: string | null = 'Energy',
  companyName: string | null = `${symbol} Ltd`,
): HeatmapStock {
  return {
    exchange: 'NSE',
    symbol,
    companyName,
    sector,
    ltp: 100,
    baseline: 100,
    change: 0,
    changePct,
    open: 100,
    high: 100,
    low: 100,
    volume: 1,
    marketCap,
    lastUpdatedAt: null,
  };
}

const area = (rect: { width: number; height: number }) => rect.width * rect.height;

describe('layoutTreemap', () => {
  it('fills the whole space with areas proportional to weight', () => {
    const rects = layoutTreemap(
      [
        { data: 'a', value: 50 },
        { data: 'b', value: 30 },
        { data: 'c', value: 20 },
      ],
      200,
      100,
    );
    expect(rects).toHaveLength(3);
    const total = rects.reduce((sum, rect) => sum + area(rect), 0);
    expect(total).toBeCloseTo(20_000, 6);
    const byData = Object.fromEntries(rects.map((rect) => [rect.data, area(rect)]));
    expect(byData.a).toBeCloseTo(10_000, 6);
    expect(byData.b).toBeCloseTo(6_000, 6);
    expect(byData.c).toBeCloseTo(4_000, 6);
  });

  it('keeps every rectangle inside the bounds', () => {
    const items = Array.from({ length: 25 }, (_, index) => ({ data: index, value: 25 - index }));
    for (const rect of layoutTreemap(items, 320, 400)) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(320 + 1e-6);
      expect(rect.y + rect.height).toBeLessThanOrEqual(400 + 1e-6);
    }
  });

  it('places the heaviest item first and splits along the longer side', () => {
    const [first] = layoutTreemap(
      [
        { data: 'small', value: 1 },
        { data: 'big', value: 3 },
      ],
      400,
      100,
    );
    expect(first).toMatchObject({ data: 'big', x: 0, y: 0, height: 100 });
    expect(first!.width).toBeCloseTo(300, 6);
  });

  it('gives unknown or non-positive weights a small tile rather than dropping them', () => {
    const rects = layoutTreemap(
      [
        { data: 'nan', value: Number.NaN },
        { data: 'zero', value: 0 },
        { data: 'real', value: 8 },
      ],
      100,
      100,
    );
    expect(rects.map((rect) => rect.data).sort()).toEqual(['nan', 'real', 'zero']);
  });

  it('is empty for no items or no space', () => {
    expect(layoutTreemap([], 100, 100)).toEqual([]);
    expect(layoutTreemap([{ data: 'a', value: 1 }], 0, 100)).toEqual([]);
  });
});

describe('heat colours', () => {
  it('buckets moves on the web’s ±1/2/3% steps', () => {
    expect([-5, -3, -2.5, -2, -1.5, -1, -0.2].map(heatBucket)).toEqual([0, 0, 1, 1, 2, 2, 3]);
    expect([0.2, 1, 1.9, 2, 2.9, 3, 7].map(heatBucket)).toEqual([5, 6, 6, 7, 7, 8, 8]);
  });

  it('never gives an unpriced or flat tile a gain or loss colour', () => {
    expect(heatBucket(0)).toBe(4);
    expect(heatBucket(null)).toBe(4);
    expect(heatBucket(undefined)).toBe(4);
    expect(heatBucket(Number.NaN)).toBe(4);
  });

  it('has a light and a dark swatch for every bucket', () => {
    expect(HEAT_PALETTE.light).toHaveLength(9);
    expect(HEAT_PALETTE.dark).toHaveLength(9);
    expect(heatSwatch(4, false)).toBe(HEAT_PALETTE.light[8]);
    expect(heatSwatch(-4, true)).toBe(HEAT_PALETTE.dark[0]);
  });
});

describe('filterAndSortStocks', () => {
  const rows = [
    stock('TCS', 150, 1.2, 'IT', 'Tata Consultancy'),
    stock('INFY', 80, -0.5, 'IT', 'Infosys'),
    stock('ITC', 60, null, 'FMCG', 'ITC Ltd'),
    stock('HDFCBANK', 120, 2.4, 'Banks', 'HDFC Bank'),
  ];

  it('sorts by market cap by default', () => {
    expect(filterAndSortStocks(rows, '', 'marketCap').map((row) => row.symbol)).toEqual([
      'TCS',
      'HDFCBANK',
      'INFY',
      'ITC',
    ]);
  });

  it('puts unpriced stocks last in either direction', () => {
    expect(filterAndSortStocks(rows, '', 'gainers').map((row) => row.symbol)).toEqual([
      'HDFCBANK',
      'TCS',
      'INFY',
      'ITC',
    ]);
    expect(filterAndSortStocks(rows, '', 'losers').map((row) => row.symbol)).toEqual([
      'INFY',
      'TCS',
      'HDFCBANK',
      'ITC',
    ]);
  });

  it('sorts alphabetically by symbol', () => {
    expect(filterAndSortStocks(rows, '', 'alphabetical').map((row) => row.symbol)).toEqual([
      'HDFCBANK',
      'INFY',
      'ITC',
      'TCS',
    ]);
  });

  it('searches symbol and company name, case-insensitively', () => {
    expect(filterAndSortStocks(rows, '  infos ', 'marketCap').map((row) => row.symbol)).toEqual([
      'INFY',
    ]);
    expect(filterAndSortStocks(rows, 'it', 'alphabetical').map((row) => row.symbol)).toEqual([
      'ITC',
    ]);
    expect(filterAndSortStocks(rows, 'zzz', 'marketCap')).toEqual([]);
  });

  it('never reorders the caller’s array', () => {
    const copy = [...rows];
    filterAndSortStocks(rows, '', 'alphabetical');
    expect(rows).toEqual(copy);
  });
});

describe('breadthShares', () => {
  it('splits advances, declines and flat into widths', () => {
    expect(breadthShares({ advances: 30, declines: 15, unchanged: 5, unavailable: 2 })).toEqual({
      advances: 60,
      declines: 30,
      unchanged: 10,
    });
  });

  it('is all zero with nothing counted', () => {
    const zero = { advances: 0, declines: 0, unchanged: 0 };
    expect(breadthShares({ advances: 0, declines: 0, unchanged: 0, unavailable: 4 })).toEqual(zero);
    expect(breadthShares(null)).toEqual(zero);
  });
});

describe('groupIndices', () => {
  const index = (key: string, category: HeatmapIndexSummary['category']): HeatmapIndexSummary => ({
    key,
    label: key,
    shortLabel: key,
    category,
    exchange: 'NSE',
    constituentCount: 50,
    caveat: null,
    unavailable: false,
  });

  it('groups in category order and keeps the server’s order within', () => {
    const groups = groupIndices([
      index('niftyit', 'sectoral'),
      index('nifty50', 'broad'),
      index('niftybank', 'sectoral'),
    ]);
    expect(groups.map((group) => [group.label, group.items.map((item) => item.key)])).toEqual([
      ['Broad market', ['nifty50']],
      ['Sectoral', ['niftyit', 'niftybank']],
    ]);
  });
});

describe('treemap sizing', () => {
  it('keeps the largest names when an index is too big to read on a phone', () => {
    const many = Array.from({ length: TREEMAP_MAX_TILES + 20 }, (_, index) =>
      stock(`S${index}`, index),
    );
    const subset = treemapSubset(many);
    expect(subset).toHaveLength(TREEMAP_MAX_TILES);
    expect(subset[0]!.symbol).toBe(`S${TREEMAP_MAX_TILES + 19}`);
    expect(subset.some((row) => row.symbol === 'S0')).toBe(false);
    expect(treemapSubset(many.slice(0, 5))).toHaveLength(5);
  });

  it('grows with the tile count between a floor and a cap', () => {
    expect(treemapHeight(0, 50)).toBe(0);
    expect(treemapHeight(300, 10)).toBe(345); // 1.15 × width
    expect(treemapHeight(300, 60)).toBe(420); // 7 px a tile
    expect(treemapHeight(300, 500)).toBe(780); // 2.6 × width
  });

  it('matches the amount of text to the tile size', () => {
    expect(tileDetail(20, 40)).toBe('none');
    expect(tileDetail(40, 40)).toBe('symbol');
    expect(tileDetail(80, 40)).toBe('compact');
    expect(tileDetail(120, 80)).toBe('full');
  });
});

describe('layoutHeatmap', () => {
  const rows = [
    stock('RELIANCE', 600, 1, 'Energy'),
    stock('ONGC', 200, -1, 'Energy'),
    stock('TCS', 400, 2, 'IT'),
    stock('MYSTERY', 100, 0, null),
  ];

  it('lays every stock out once, inside the bounds', () => {
    const layout = layoutHeatmap(rows, 300, 400, true);
    expect(layout.tiles.map((tile) => tile.data.symbol).sort()).toEqual(
      ['MYSTERY', 'ONGC', 'RELIANCE', 'TCS'].sort(),
    );
    for (const tile of layout.tiles) {
      expect(tile.x + tile.width).toBeLessThanOrEqual(300 + 1e-6);
      expect(tile.y + tile.height).toBeLessThanOrEqual(400 + 1e-6);
    }
  });

  it('labels sector blocks big enough to carry a heading, and files unknowns as Unclassified', () => {
    const layout = layoutHeatmap(rows, 300, 400, true);
    const sectors = layout.labels.map((label) => label.sector);
    expect(sectors).toContain('Energy');
    expect(sectors.every((sector) => ['Energy', 'IT', 'Unclassified'].includes(sector))).toBe(true);
    // A labelled block's tiles start below its heading strip.
    const energy = layout.labels.find((label) => label.sector === 'Energy')!;
    const reliance = layout.tiles.find((tile) => tile.data.symbol === 'RELIANCE')!;
    expect(reliance.y).toBeGreaterThanOrEqual(energy.y + 18);
  });

  it('draws a flat treemap without labels when not grouped', () => {
    const layout = layoutHeatmap(rows, 300, 400, false);
    expect(layout.labels).toEqual([]);
    expect(layout.tiles).toHaveLength(4);
  });

  it('is empty before it has been measured', () => {
    expect(layoutHeatmap(rows, 0, 400, true)).toEqual({ tiles: [], labels: [] });
    expect(layoutHeatmap([], 300, 400, true)).toEqual({ tiles: [], labels: [] });
  });
});
