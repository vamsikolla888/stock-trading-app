import { peakPoint, providerUsage, tokenShares, tokensPerCall } from '../lib/aiProviders';
import type { AiUsageReport, UsageTotals } from '../types';

function totals(over: Partial<UsageTotals> = {}): UsageTotals {
  return {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedPromptTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    unpricedCalls: 0,
    noTokenPriceCalls: 0,
    missingUsageCalls: 0,
    failedCalls: 0,
    avgLatencyMs: null,
    ...over,
  };
}

/** An Ollama row: every call counted as having no per-token price. */
function ollama(calls: number, prompt: number, completion: number, latency: number | null = null) {
  return totals({
    calls,
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
    noTokenPriceCalls: calls,
    avgLatencyMs: latency,
  });
}

function openai(calls: number, prompt: number, completion: number, costUsd: number) {
  return totals({
    calls,
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
    costUsd,
  });
}

function report(over: Partial<AiUsageReport> = {}): AiUsageReport {
  return {
    period: 'week',
    from: '2026-09-27T00:00:00.000Z',
    to: '2026-10-04T00:00:00.000Z',
    totals: totals(),
    series: [],
    byFeature: [],
    byModel: [],
    pricing: { asOf: '2026-09-01', usdToInr: 84, knownModels: [] },
    ...over,
  };
}

describe('providerUsage on a server that filters by provider', () => {
  it('takes the report as it stands and drops groups with no calls', () => {
    const usage = providerUsage(
      report({
        provider: 'ollama',
        totals: ollama(5, 900, 100),
        series: [{ periodStart: '2026-10-03', ...ollama(5, 900, 100) }],
        byFeature: [
          { key: 'small', ...ollama(1, 100, 0) },
          { key: 'idle', ...totals() },
          { key: 'big', ...ollama(4, 800, 100) },
        ],
        byModel: [{ key: 'llama3.1:8b', ...ollama(5, 900, 100) }],
      }),
      'ollama',
      true,
    );
    expect(usage.exact).toBe(true);
    expect(usage.mixedRows).toBe(0);
    expect(usage.totals).toMatchObject({ calls: 5, totalTokens: 1000, costUsd: 0 });
    expect(usage.byFeature.map((row) => row.key)).toEqual(['big', 'small']);
    expect(usage.series).toEqual([
      { periodStart: '2026-10-03', calls: 5, promptTokens: 900, completionTokens: 100, costUsd: 0 },
    ]);
  });
});

describe('providerUsage on an older server (one report for every provider)', () => {
  const mixed = report({
    totals: totals({ calls: 7, totalTokens: 1600, noTokenPriceCalls: 4 }),
    byModel: [
      { key: 'llama3.1:8b', ...ollama(4, 700, 100, 2000) },
      { key: 'gpt-4.1-mini', ...openai(3, 600, 200, 0.12) },
    ],
    byFeature: [
      { key: 'news', ...ollama(4, 700, 100) },
      { key: 'analysis', ...openai(3, 600, 200, 0.12) },
    ],
    series: [
      { periodStart: '2026-10-02', ...ollama(4, 700, 100) },
      { periodStart: '2026-10-03', ...openai(3, 600, 200, 0.12) },
    ],
  });

  it('splits the totals exactly from the model rows', () => {
    const local = providerUsage(mixed, 'ollama', false);
    expect(local.exact).toBe(true);
    expect(local.totals).toMatchObject({
      calls: 4,
      promptTokens: 700,
      completionTokens: 100,
      totalTokens: 800,
      costUsd: 0,
      avgLatencyMs: 2000,
    });
    expect(local.byModel.map((row) => row.key)).toEqual(['llama3.1:8b']);
    expect(local.byFeature.map((row) => row.key)).toEqual(['news']);

    const cloud = providerUsage(mixed, 'openai', false);
    expect(cloud.totals).toMatchObject({ calls: 3, totalTokens: 800, costUsd: 0.12 });
    expect(cloud.totals.avgLatencyMs).toBeNull();
  });

  it('keeps the series, zeroing the buckets that belong to the other provider', () => {
    const local = providerUsage(mixed, 'ollama', false);
    expect(local.series?.map((p) => p.calls)).toEqual([4, 0]);
    const cloud = providerUsage(mixed, 'openai', false);
    expect(cloud.series?.map((p) => p.calls)).toEqual([0, 3]);
  });

  it('leaves out and counts rows that mixed both providers instead of guessing', () => {
    const usage = providerUsage(
      report({
        byModel: [{ key: 'llama3.1:8b', ...ollama(2, 100, 50) }],
        byFeature: [
          { key: 'chat', ...totals({ calls: 3, totalTokens: 400, noTokenPriceCalls: 2 }) },
        ],
        series: [
          {
            periodStart: '2026-10-03',
            ...totals({ calls: 3, totalTokens: 400, noTokenPriceCalls: 2 }),
          },
        ],
      }),
      'ollama',
      false,
    );
    expect(usage.exact).toBe(false);
    expect(usage.mixedRows).toBe(2);
    expect(usage.series).toBeNull();
    expect(usage.byFeature).toEqual([]);
    // The model rows still split exactly.
    expect(usage.totals).toMatchObject({ calls: 2, totalTokens: 150 });
  });
});

describe('usage helpers', () => {
  it('scales token shares against the largest group', () => {
    const shares = tokenShares([
      { key: 'a', ...ollama(1, 200, 0) },
      { key: 'b', ...ollama(1, 50, 0) },
    ]);
    expect(shares.get('a')).toBe(100);
    expect(shares.get('b')).toBe(25);
    expect(tokenShares([{ key: 'none', ...totals() }]).get('none')).toBe(0);
  });

  it('reports tokens per call, or nothing when there were no calls', () => {
    expect(tokensPerCall({ calls: 4, totalTokens: 1000 })).toBe(250);
    expect(tokensPerCall({ calls: 0, totalTokens: 0 })).toBeNull();
  });

  it('finds the busiest bucket by tokens, skipping empty ones', () => {
    const a = { periodStart: 'a', calls: 1, promptTokens: 10, completionTokens: 5, costUsd: 0 };
    const b = { periodStart: 'b', calls: 2, promptTokens: 30, completionTokens: 5, costUsd: 0 };
    const empty = { periodStart: 'c', calls: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 };
    expect(peakPoint([a, b, empty])).toBe(b);
    expect(peakPoint([empty])).toBeNull();
    expect(peakPoint(null)).toBeNull();
  });
});
