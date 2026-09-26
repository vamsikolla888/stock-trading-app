import {
  filterBySegment,
  formatRewardRisk,
  groupRejections,
  monitorSampleNote,
  progressPercent,
  stageLabel,
} from '@/features/strong-picks/lib/strongPicks';
import type { MarketSegment, StrongPick, StrongPickRejection } from '@/features/strong-picks/types';

function pick(symbol: string, suitable: Partial<Record<MarketSegment, boolean>>): StrongPick {
  const segments = (['equity', 'intraday', 'fno'] as const).map((segment) => ({
    segment,
    suitable: suitable[segment] ?? false,
    reason: `${segment} reason`,
    confidence: segment === 'intraday' ? ('inferred' as const) : ('exact' as const),
  }));
  return {
    symbol,
    exchange: 'NSE',
    name: symbol,
    rank: 1,
    segments: segments.filter((verdict) => verdict.suitable).map((verdict) => verdict.segment),
    segmentVerdicts: segments,
    openPrice: null,
    priceAtDecision: null,
    windowHigh: null,
    windowLow: null,
    gapPct: null,
    openMovePct: null,
    volumeShareOfTypicalDay: null,
    structure: 'holding',
    observationSummary: '',
    source: 'news',
    entryLow: null,
    entryHigh: null,
    targetPrice: null,
    stopPrice: null,
    rewardRisk: null,
    atr: null,
    stopClamped: 'none',
    monitor: null,
    modelSetupScore: 60,
    winProbability: null,
    probabilitySampleSize: 0,
    probabilityBasis: 'insufficient-history',
    conviction: 3,
    rationale: '',
    invalidation: '',
    caveat: '',
  };
}

describe('filterBySegment', () => {
  const picks = [
    pick('A', { equity: true, intraday: true }),
    pick('B', { equity: true, fno: true }),
    pick('C', { equity: true }),
  ];

  it('keeps everything for “All”', () => {
    expect(filterBySegment(picks, 'all').map((p) => p.symbol)).toEqual(['A', 'B', 'C']);
  });

  it('keeps only picks SUITABLE for the segment, not merely listed for it', () => {
    // Every pick lists all three verdicts; only the suitable ones count.
    expect(filterBySegment(picks, 'intraday').map((p) => p.symbol)).toEqual(['A']);
    expect(filterBySegment(picks, 'fno').map((p) => p.symbol)).toEqual(['B']);
    expect(filterBySegment(picks, 'equity')).toHaveLength(3);
  });
});

describe('rejections', () => {
  const rejection = (symbol: string, stage: string): StrongPickRejection => ({
    symbol,
    exchange: 'NSE',
    stage,
    reason: `${symbol} failed`,
  });

  it('labels known stages and passes unknown ones through', () => {
    expect(stageLabel('probability-floor')).toBe('Under the probability floor');
    expect(stageLabel('open-filter')).toBe('Failed the opening filter');
    expect(stageLabel('something-new')).toBe('something-new');
  });

  it('groups by stage in first-seen order', () => {
    const groups = groupRejections([
      rejection('A', 'open-filter'),
      rejection('B', 'score-floor'),
      rejection('C', 'open-filter'),
    ]);
    expect(groups.map((group) => [group.stage, group.items.map((item) => item.symbol)])).toEqual([
      ['open-filter', ['A', 'C']],
      ['score-floor', ['B']],
    ]);
    expect(groups[1]!.label).toBe('Under the setup-score floor');
    expect(groupRejections([])).toEqual([]);
  });
});

describe('monitorSampleNote', () => {
  it('says so when the per-minute watch has never sampled', () => {
    expect(monitorSampleNote(null)).toEqual({
      tone: 'faint',
      text: 'Not sampled yet — the per-minute watch runs while the market is open.',
    });
  });

  it('warns once the last sample is more than three minutes old', () => {
    expect(monitorSampleNote(3)).toBeNull();
    expect(monitorSampleNote(0)).toBeNull();
    expect(monitorSampleNote(4)).toEqual({
      tone: 'warning',
      text: 'Last sampled 4 minutes ago — the monitor may not be running.',
    });
  });
});

describe('formatting', () => {
  it('prints reward:risk to two decimals', () => {
    expect(formatRewardRisk(2.1)).toBe('2.10:1');
    expect(formatRewardRisk(0.234)).toBe('0.23:1');
    expect(formatRewardRisk(null)).toBe('—');
    expect(formatRewardRisk(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('turns the 0–1 progress into a clamped whole percent', () => {
    expect(progressPercent(0.456)).toBe(46);
    expect(progressPercent(1.4)).toBe(100);
    expect(progressPercent(-0.2)).toBe(0);
    expect(progressPercent(null)).toBeNull();
  });
});
