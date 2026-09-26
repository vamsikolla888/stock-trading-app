import { buildActivity } from '@/features/home/lib/activity';
import {
  CAP_TABS,
  capParam,
  capTabRange,
  formatMarketCapCrore,
  isCapTab,
} from '@/features/home/lib/capBands';
import { dayShapeValues } from '@/features/home/lib/dayShape';
import type { ScreenerSummary } from '@/features/market/types';
import type { NewsRunListItem } from '@/features/news/types';

const screener = (id: string, runAt: string | null, matchCount: number): ScreenerSummary => ({
  id,
  label: id,
  conditions: [],
  timeframe: '1d',
  matchCount,
  universeSize: 500,
  runAt,
});

const newsRun = (
  runId: string,
  status: NewsRunListItem['status'],
  startedAt: string,
  finishedAt: string | null,
  inserted = 0,
  errorMessage: string | null = null,
): NewsRunListItem => ({
  runId,
  status,
  triggeredBy: 'SCHEDULED',
  startedAt,
  finishedAt,
  counts: { fetched: inserted, inserted, duplicatesInRun: 0, alsoSeenInEarlierRuns: 0 },
  errorMessage,
});

describe('buildActivity', () => {
  it('collapses one scan pass into a single screeners row at the latest scan time', () => {
    const items = buildActivity({
      screeners: [
        screener('a', '2026-09-26T04:00:00Z', 3),
        screener('b', '2026-09-26T04:05:00Z', 0),
        screener('c', null, 9), // never scanned: not counted
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'screeners',
      kind: 'screeners',
      at: Date.parse('2026-09-26T04:05:00Z'),
      detail: '2 screens · 1 with matches',
    });
  });

  it('words each news run by its status', () => {
    const items = buildActivity({
      newsRuns: [
        newsRun('1', 'COMPLETED', '2026-09-26T03:00:00Z', '2026-09-26T03:02:00Z', 1),
        newsRun('2', 'FAILED', '2026-09-26T02:00:00Z', null, 0, 'Feed timed out'),
        newsRun('3', 'RUNNING', '2026-09-26T05:00:00Z', null),
      ],
    });
    expect(items.map((item) => [item.title, item.detail])).toEqual([
      ['News refresh running', 'Fetching the latest articles'],
      ['News refreshed', '1 new article'],
      ['News refresh failed', 'Feed timed out'],
    ]);
  });

  it('uses the strong-picks verdict verbatim and skips a run that never finished', () => {
    expect(
      buildActivity({ strongPickRun: { verdict: 'Two held their bands.', finishedAt: null } }),
    ).toEqual([]);
    const [row] = buildActivity({
      strongPickRun: { verdict: 'Two held their bands.', finishedAt: '2026-09-26T04:01:00Z' },
    });
    expect(row).toMatchObject({ kind: 'strong-picks', detail: 'Two held their bands.' });
  });

  it('orders newest first and caps the list', () => {
    const items = buildActivity(
      {
        screeners: [screener('a', '2026-09-26T01:00:00Z', 1)],
        newsRuns: [
          newsRun('1', 'COMPLETED', '2026-09-26T02:00:00Z', '2026-09-26T02:00:00Z', 4),
          newsRun('2', 'COMPLETED', '2026-09-26T03:00:00Z', '2026-09-26T03:00:00Z', 2),
        ],
        strongPickRun: { verdict: 'Published 3.', finishedAt: '2026-09-26T04:00:00Z' },
      },
      3,
    );
    expect(items.map((item) => item.id)).toEqual(['strong-picks', 'news:2', 'news:1']);
  });

  it('is empty with nothing timestamped', () => {
    expect(buildActivity({})).toEqual([]);
    expect(buildActivity({ screeners: null, newsRuns: null, strongPickRun: null })).toEqual([]);
  });
});

describe('cap bands', () => {
  it('maps tabs to the server’s `cap` query', () => {
    expect(CAP_TABS.map((tab) => tab.key)).toEqual(['large', 'mid', 'small', 'all']);
    expect(capParam('all')).toBeUndefined();
    expect(capParam('mid')).toBe('mid');
    expect(capTabRange('all')).toBe('every market cap');
    expect(capTabRange('small')).toBe('₹500 – 5,000 cr');
  });

  it('validates route params', () => {
    expect(isCapTab('large')).toBe(true);
    expect(isCapTab('all')).toBe(true);
    expect(isCapTab('micro')).toBe(false);
    expect(isCapTab(undefined)).toBe(false);
  });

  it('formats paise as crore, and very large caps as lakh crore', () => {
    expect(formatMarketCapCrore(1.7959e15)).toBe('₹17.96L cr');
    expect(formatMarketCapCrore(2.4e13)).toBe('₹24,000 cr');
    expect(formatMarketCapCrore(6.2e11)).toBe('₹620 cr');
    expect(formatMarketCapCrore(0)).toBe('—');
    expect(formatMarketCapCrore(null)).toBe('—');
    expect(formatMarketCapCrore(Number.NaN)).toBe('—');
  });
});

describe('dayShapeValues', () => {
  it('plots open → low → high → price on an up day', () => {
    expect(dayShapeValues({ prevClose: 98, open: 100, high: 110, low: 95, ltp: 108 })).toEqual([
      98, 100, 95, 110, 108,
    ]);
  });

  it('plots open → high → low → price on a down day', () => {
    expect(dayShapeValues({ open: 100, high: 104, low: 90, ltp: 92 })).toEqual([100, 104, 90, 92]);
  });

  it('draws nothing unless every point is a real price', () => {
    expect(dayShapeValues({ open: 100, high: 104, low: null, ltp: 92 })).toBeNull();
    expect(dayShapeValues({ open: 0, high: 104, low: 90, ltp: 92 })).toBeNull();
    // An unusable previous close is simply left off the front.
    expect(dayShapeValues({ prevClose: 0, open: 100, high: 104, low: 90, ltp: 101 })).toEqual([
      100, 90, 104, 101,
    ]);
  });
});
