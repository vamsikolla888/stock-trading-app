import { isRunActive, tradeReturnPercent } from '@/features/strategies/lib/backtest';
import { settingsIssues } from '@/features/strategies/lib/rules';
import { isGenerationActive } from '@/features/strategies/types';

describe('tradeReturnPercent', () => {
  it('takes the server’s whole percent as-is — never scaled a second time', () => {
    // The detail response converts stored fractions: 3.1 means +3.1%, not +310%.
    expect(tradeReturnPercent({ returnPct: 3.1 })).toBe(3.1);
    expect(tradeReturnPercent({ returnPct: -0.45 })).toBe(-0.45);
  });

  it('refuses a missing or broken value', () => {
    expect(tradeReturnPercent({ returnPct: Number.NaN })).toBeNull();
  });
});

describe('isRunActive', () => {
  it('trusts runState, which is read with the queue consulted', () => {
    expect(
      isRunActive({
        status: 'queued',
        runState: { phase: 'stalled', message: 'lost', active: false },
      }),
    ).toBe(false);
    expect(
      isRunActive({
        status: 'running',
        runState: { phase: 'running', message: null, active: true },
      }),
    ).toBe(true);
  });

  it('falls back to status on an older server', () => {
    expect(isRunActive({ status: 'queued' })).toBe(true);
    expect(isRunActive({ status: 'complete' })).toBe(false);
    expect(isRunActive(undefined)).toBe(false);
  });
});

describe('settingsIssues', () => {
  it('mirrors the server’s bounds', () => {
    expect(settingsIssues({ costBps: 15, maxOpenPositions: 8 })).toEqual({});
    expect(settingsIssues({ costBps: 101, maxOpenPositions: 8 }).costBps).toBeDefined();
    expect(settingsIssues({ costBps: 0, maxOpenPositions: 0 }).maxOpenPositions).toBeDefined();
    expect(settingsIssues({ costBps: 0, maxOpenPositions: 2.5 }).maxOpenPositions).toBeDefined();
  });
});

describe('isGenerationActive', () => {
  it('treats a run parked behind the AI breaker as still going', () => {
    expect(isGenerationActive('waiting')).toBe(true);
    expect(isGenerationActive('validating')).toBe(true);
    expect(isGenerationActive('complete')).toBe(false);
    expect(isGenerationActive('failed')).toBe(false);
  });
});
