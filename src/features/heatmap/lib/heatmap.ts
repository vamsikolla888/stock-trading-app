import type {
  HeatmapBreadth,
  HeatmapIndexSummary,
  HeatmapStock,
  HeatmapTimeframe,
  IndexCategory,
} from '../types';

import { layoutTreemap, type TreemapRect } from './treemap';

export const TIMEFRAMES: readonly { key: HeatmapTimeframe; label: string }[] = [
  { key: '1D', label: '1D' },
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: '1Y', label: '1Y' },
];

/** Shortcuts shown as chips, in the web's order; the rest live in the index sheet. */
export const QUICK_INDICES = ['nifty50', 'sensex', 'niftybank', 'niftyit'] as const;
export const DEFAULT_INDEX = 'nifty50';

export const CATEGORY_LABELS: Record<IndexCategory, string> = {
  broad: 'Broad market',
  sectoral: 'Sectoral',
  thematic: 'Thematic',
};

export type HeatmapSort = 'marketCap' | 'gainers' | 'losers' | 'alphabetical';

export const SORT_OPTIONS: readonly { key: HeatmapSort; label: string }[] = [
  { key: 'marketCap', label: 'Market cap' },
  { key: 'gainers', label: 'Top gainers' },
  { key: 'losers', label: 'Top losers' },
  { key: 'alphabetical', label: 'Name A–Z' },
];

// ── Colour scale ─────────────────────────────────────────────────────────────────────────

/**
 * Nine steps from ≤ −3% to ≥ +3%, the web's thresholds. `4` is flat or unknown: an unpriced
 * tile must never borrow a gain or loss colour.
 */
export function heatBucket(changePct: number | null | undefined): number {
  if (typeof changePct !== 'number' || !Number.isFinite(changePct) || changePct === 0) return 4;
  if (changePct <= -3) return 0;
  if (changePct <= -2) return 1;
  if (changePct <= -1) return 2;
  if (changePct < 0) return 3;
  if (changePct < 1) return 5;
  if (changePct < 2) return 6;
  if (changePct < 3) return 7;
  return 8;
}

export interface HeatSwatch {
  bg: string;
  fg: string;
}

/**
 * Tile fills, light and dark. Small moves are tints with dark text; large moves are deep
 * fills with white text — every pair keeps its label at ≥ 4.5:1.
 */
export const HEAT_PALETTE: { light: readonly HeatSwatch[]; dark: readonly HeatSwatch[] } = {
  light: [
    { bg: '#b71c1c', fg: '#ffffff' },
    { bg: '#cc3b35', fg: '#ffffff' },
    { bg: '#f07a72', fg: '#171a1f' },
    { bg: '#fbd0cc', fg: '#171a1f' },
    { bg: '#e9ecf1', fg: '#4a4e5a' },
    { bg: '#c8efe0', fg: '#171a1f' },
    { bg: '#6fd3ad', fg: '#171a1f' },
    { bg: '#0b7f5d', fg: '#ffffff' },
    { bg: '#005c41', fg: '#ffffff' },
  ],
  dark: [
    { bg: '#c0392b', fg: '#ffffff' },
    { bg: '#962f2a', fg: '#ffffff' },
    { bg: '#6e2f2c', fg: '#ffffff' },
    { bg: '#4a2c2b', fg: '#eceff3' },
    { bg: '#2d333b', fg: '#a2a8b3' },
    { bg: '#1f3d35', fg: '#eceff3' },
    { bg: '#1d5a47', fg: '#ffffff' },
    { bg: '#117a5b', fg: '#ffffff' },
    { bg: '#0b8562', fg: '#ffffff' },
  ],
};

export function heatSwatch(changePct: number | null | undefined, isDark: boolean): HeatSwatch {
  const palette = isDark ? HEAT_PALETTE.dark : HEAT_PALETTE.light;
  return palette[heatBucket(changePct)] ?? { bg: '#e9ecf1', fg: '#4a4e5a' };
}

// ── Filtering, sorting, breadth ──────────────────────────────────────────────────────────

export function filterAndSortStocks(
  stocks: readonly HeatmapStock[],
  search: string,
  sort: HeatmapSort,
): HeatmapStock[] {
  const term = search.trim().toLowerCase();
  const rows = term
    ? stocks.filter(
        (stock) =>
          stock.symbol.toLowerCase().includes(term) ||
          (stock.companyName ?? '').toLowerCase().includes(term),
      )
    : [...stocks];
  return rows.sort((a, b) => {
    if (sort === 'gainers')
      return (b.changePct ?? Number.NEGATIVE_INFINITY) - (a.changePct ?? Number.NEGATIVE_INFINITY);
    if (sort === 'losers')
      return (a.changePct ?? Number.POSITIVE_INFINITY) - (b.changePct ?? Number.POSITIVE_INFINITY);
    if (sort === 'alphabetical') return a.symbol.localeCompare(b.symbol);
    return (b.marketCap ?? 0) - (a.marketCap ?? 0);
  });
}

/** Shares of advancing / declining / flat constituents, as 0–100 widths. */
export function breadthShares(breadth: HeatmapBreadth | null | undefined): {
  advances: number;
  declines: number;
  unchanged: number;
} {
  const total = breadth ? breadth.advances + breadth.declines + breadth.unchanged : 0;
  if (!breadth || total === 0) return { advances: 0, declines: 0, unchanged: 0 };
  return {
    advances: (breadth.advances / total) * 100,
    declines: (breadth.declines / total) * 100,
    unchanged: (breadth.unchanged / total) * 100,
  };
}

/** Indices grouped for the picker, in category order, keeping the server's order within. */
export function groupIndices(
  indices: readonly HeatmapIndexSummary[],
): { category: IndexCategory; label: string; items: HeatmapIndexSummary[] }[] {
  return (['broad', 'sectoral', 'thematic'] as const)
    .map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      items: indices.filter((index) => index.category === category),
    }))
    .filter((group) => group.items.length > 0);
}

// ── Treemap ──────────────────────────────────────────────────────────────────────────────

/**
 * Beyond this many tiles a phone-sized treemap is unreadable — the smallest names shrink
 * to slivers. The treemap shows the largest by market cap and says so; the grid shows all.
 */
export const TREEMAP_MAX_TILES = 100;

export function treemapSubset(stocks: readonly HeatmapStock[]): HeatmapStock[] {
  if (stocks.length <= TREEMAP_MAX_TILES) return [...stocks];
  return [...stocks]
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, TREEMAP_MAX_TILES);
}

/** Taller than wide on a phone, growing with the tile count, capped so it stays scannable. */
export function treemapHeight(width: number, count: number): number {
  if (width <= 0) return 0;
  return Math.round(Math.min(Math.max(width * 1.15, count * 7), width * 2.6));
}

const SECTOR_HEADER = 18;
const UNCLASSIFIED = 'Unclassified';

export interface SectorLabel {
  sector: string;
  x: number;
  y: number;
  width: number;
}

export interface HeatmapLayout {
  tiles: TreemapRect<HeatmapStock>[];
  labels: SectorLabel[];
}

const weighted = (rows: readonly HeatmapStock[]) =>
  rows.map((stock) => ({ data: stock, value: stock.marketCap ?? 1 }));

/**
 * Size = market cap. Grouped, each sector gets a block sized by its total cap and its
 * stocks are laid out inside it; a block large enough for a heading reserves a strip for
 * one, and only those blocks are labelled.
 */
export function layoutHeatmap(
  stocks: readonly HeatmapStock[],
  width: number,
  height: number,
  groupBySector: boolean,
): HeatmapLayout {
  if (width <= 0 || height <= 0 || stocks.length === 0) return { tiles: [], labels: [] };
  if (!groupBySector) return { tiles: layoutTreemap(weighted(stocks), width, height), labels: [] };

  const groups = new Map<string, HeatmapStock[]>();
  for (const stock of stocks) {
    const sector = stock.sector?.trim() || UNCLASSIFIED;
    const rows = groups.get(sector);
    if (rows) rows.push(stock);
    else groups.set(sector, [stock]);
  }

  const blocks = layoutTreemap(
    [...groups].map(([sector, rows]) => ({
      data: { sector, rows },
      value: rows.reduce((sum, row) => sum + (row.marketCap ?? 1), 0),
    })),
    width,
    height,
  );

  const tiles: TreemapRect<HeatmapStock>[] = [];
  const labels: SectorLabel[] = [];
  for (const block of blocks) {
    const labelled = block.width >= 80 && block.height >= 64;
    const header = labelled ? SECTOR_HEADER : 0;
    if (labelled) {
      labels.push({ sector: block.data.sector, x: block.x, y: block.y, width: block.width });
    }
    for (const rect of layoutTreemap(
      weighted(block.data.rows),
      block.width,
      block.height - header,
    )) {
      tiles.push({ ...rect, x: rect.x + block.x, y: rect.y + block.y + header });
    }
  }
  return { tiles, labels };
}

export type TileDetail = 'none' | 'symbol' | 'compact' | 'full';

/** How much text a tile of this size can carry legibly. */
export function tileDetail(width: number, height: number): TileDetail {
  if (width < 30 || height < 18) return 'none';
  if (width < 56 || height < 34) return 'symbol';
  if (width < 96 || height < 60) return 'compact';
  return 'full';
}
