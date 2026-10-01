import {
  checkValue,
  crore,
  etaText,
  isJobActive,
  jobProgressText,
  jobTakingLong,
  knockoutText,
  pct,
  quarterLabel,
  signedPct,
  stateAfterCompletion,
  times,
  weekLabel,
} from '@/features/fundamentals/lib/format';
import type { JobView } from '@/features/fundamentals/types';

function job(overrides: Partial<JobView>): JobView {
  return {
    id: 'j1',
    isin: 'INE002A01018',
    status: 'running',
    stage: 'scoring',
    priority: 'HIGH',
    queuePosition: null,
    etaSeconds: null,
    scheduled: false,
    requestCount: 1,
    attempts: 1,
    maxAttempts: 3,
    message: null,
    retryable: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    analysisId: null,
    ...overrides,
  };
}

describe('money in crore', () => {
  it('groups the Indian way and collapses lakh crore', () => {
    expect(crore(1086.4)).toBe('₹1,086 Cr');
    expect(crore(1_086_181)).toBe('₹10.86 L Cr');
    expect(crore(42.5)).toBe('₹42.50 Cr');
    expect(crore(-250)).toBe('−₹250 Cr');
    expect(crore(null)).toBe('—');
  });
});

describe('percentages and multiples', () => {
  it('never prints a missing value as zero', () => {
    expect(pct(null)).toBe('—');
    expect(times(undefined)).toBe('—');
  });

  it('signs a change, and treats a rounding-zero as flat', () => {
    expect(signedPct(3.14)).toBe('+3.1%');
    expect(signedPct(-0.04)).toBe('0.0%');
    expect(signedPct(-2)).toBe('−2.0%');
  });
});

describe('checkValue', () => {
  it('formats a check’s value by its unit', () => {
    expect(checkValue(18.43, '%')).toBe('18.4%');
    expect(checkValue(0.44, '×')).toBe('0.44×');
    expect(checkValue(2.35, 'pp')).toBe('+2.4 pp');
    expect(checkValue(-36.2, 'days')).toBe('−36 days');
    expect(checkValue('3 of 5', null)).toBe('3 of 5');
    expect(checkValue(null, '%')).toBe('—');
  });
});

describe('labels', () => {
  it('words a knockout rule, and falls back to the rule itself', () => {
    expect(knockoutText('pledge_over_25')).toBe('Promoter pledge above 25%');
    expect(knockoutText('some_new_rule')).toBe('some new rule');
  });

  it('shortens week and quarter keys', () => {
    expect(weekLabel('2026-W40')).toBe('W40');
    expect(quarterLabel('2026-06-30')).toBe("Jun '26");
  });
});

describe('jobs', () => {
  const now = Date.parse('2026-10-01T10:05:00.000Z');

  it('knows an active job', () => {
    expect(isJobActive(job({ status: 'queued' }))).toBe(true);
    expect(isJobActive(job({ status: 'succeeded' }))).toBe(false);
    expect(isJobActive(null)).toBe(false);
  });

  it('stops following a job ten minutes after it was created', () => {
    expect(jobTakingLong(job({}), now)).toBe(false);
    expect(jobTakingLong(job({}), Date.parse('2026-10-01T10:11:00.000Z'))).toBe(true);
    expect(
      jobTakingLong(job({ status: 'succeeded' }), Date.parse('2026-10-01T11:00:00.000Z')),
    ).toBe(false);
  });

  it('describes where a job stands', () => {
    expect(jobProgressText(job({ status: 'queued', queuePosition: 4 }))).toMatch(/4 ahead/);
    expect(jobProgressText(job({ status: 'queued', scheduled: true }))).toMatch(/batch/);
    expect(jobProgressText(job({ stage: 'ai_analysis' }))).toBe('Writing the review…');
    expect(etaText(40)).toBe('Under a minute');
    expect(etaText(150)).toBe('About 3 min');
    expect(etaText(null)).toBeNull();
  });

  it('maps a finished analysis to the state it settles in', () => {
    expect(stateAfterCompletion({ status: 'completed' })).toBe('ready');
    expect(stateAfterCompletion({ status: 'partial' })).toBe('partial');
    expect(stateAfterCompletion({ status: 'insufficient_data' })).toBe('insufficient_data');
  });
});
