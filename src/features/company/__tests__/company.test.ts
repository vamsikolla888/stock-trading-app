import {
  cagr,
  change,
  companyInsights,
  formatCr,
  holderRows,
  median,
  netMargin,
  priceReturns,
  seriesGrowth,
  shortCr,
  sourceCaption,
  statementTable,
} from '@/features/company/lib/insights';
import { normalizeCompanyProfile } from '@/features/company/lib/normalize';
import type { FinancialStatements, ShareholdingPeriod } from '@/features/company/types';
import type { Candle } from '@/features/market/types';

const fy = (year: number, value: number) => ({
  period: String(year),
  label: `FY${String(year).slice(2)}`,
  value,
});
const q = (period: string, label: string, value: number) => ({ period, label, value });

const statements: FinancialStatements = {
  revenue: {
    yearly: [fy(2023, 100), fy(2024, 110), fy(2025, 121), fy(2026, 133.1)],
    quarterly: [
      q('2025-06-30', "Jun '25", 30),
      q('2025-09-30', "Sep '25", 31),
      q('2025-12-31', "Dec '25", 32),
      q('2026-03-31', "Mar '26", 33),
      q('2026-06-30', "Jun '26", 36),
    ],
  },
  profit: {
    yearly: [fy(2023, 10), fy(2024, 12), fy(2025, 13), fy(2026, 15)],
    quarterly: [
      q('2025-06-30', "Jun '25", 3),
      q('2025-09-30', "Sep '25", 3),
      q('2025-12-31', "Dec '25", 4),
      q('2026-03-31', "Mar '26", 4),
      q('2026-06-30', "Jun '26", 4.5),
    ],
  },
  netWorth: { yearly: [fy(2025, 80), fy(2026, 90)], quarterly: [] },
};

const quarter = (
  periodEnd: string,
  label: string,
  over: Partial<ShareholdingPeriod> = {},
): ShareholdingPeriod => ({
  periodEnd,
  label,
  promoters: 50,
  foreignInstitutions: 20,
  domesticInstitutions: 15,
  mutualFunds: 10,
  otherDomestic: 5,
  retail: 15,
  promoterSplit: null,
  ...over,
});

describe('company figures', () => {
  it('formats crore the Indian way', () => {
    expect(formatCr(1621874)).toBe('₹16,21,874 Cr');
    expect(formatCr(45.25)).toBe('₹45.25 Cr');
    expect(formatCr(-12)).toBe('−₹12 Cr');
    expect(formatCr(null)).toBe('—');
    expect(shortCr(1086181)).toBe('10.86L Cr');
    expect(shortCr(45210)).toBe('45,210');
    expect(shortCr(12.34)).toBe('12.3');
  });

  it('only measures growth between positive figures', () => {
    expect(change(100, 110)).toBeCloseTo(0.1);
    expect(change(-5, 10)).toBeNull();
    expect(cagr(100, 133.1, 3)).toBeCloseTo(0.1);
    expect(cagr(0, 10, 3)).toBeNull();
  });

  it('reads 1-year, 3-year and same-quarter growth', () => {
    const g = seriesGrowth(statements.revenue.yearly, statements.revenue.quarterly);
    expect(g.oneYear?.pct).toBeCloseTo(0.1);
    expect(g.threeYear).toMatchObject({ from: 'FY23', to: 'FY26' });
    expect(g.threeYear?.pct).toBeCloseTo(0.1);
    expect(g.quarterYoY).toMatchObject({ from: "Jun '25", to: "Jun '26" });
    expect(g.quarterYoY?.pct).toBeCloseTo(0.2);
  });

  it('refuses a quarter comparison across a gap in the list', () => {
    const gapped = [
      q('2025-03-31', "Mar '25", 30),
      q('2025-09-30', "Sep '25", 31),
      q('2025-12-31', "Dec '25", 32),
      q('2026-03-31', "Mar '26", 33),
      q('2026-06-30', "Jun '26", 36),
    ];
    expect(seriesGrowth([], gapped).quarterYoY).toBeNull();
  });

  it('takes the net margin from the latest year both lines know', () => {
    expect(netMargin(statements)).toEqual({ pct: 15 / 133.1, label: 'FY26' });
  });

  it('builds the statement table with margins and yearly growth', () => {
    const t = statementTable(statements, 'yearly');
    expect(t.periods.map((p) => p.label)).toEqual(['FY23', 'FY24', 'FY25', 'FY26']);
    expect(t.rows.map((r) => r.key)).toEqual([
      'revenue',
      'profit',
      'margin',
      'netWorth',
      'revenueGrowth',
      'profitGrowth',
    ]);
    expect(t.rows.find((r) => r.key === 'revenueGrowth')!.values[0]).toBeNull();
    expect(statementTable(statements, 'quarterly').rows).toHaveLength(3);
  });

  it('never counts mutual funds twice in the shareholding rows', () => {
    const detailed = holderRows(
      quarter('2026-06-30', "Jun '26"),
      quarter('2026-03-31', "Mar '26", { promoters: 49.5 }),
    );
    expect(detailed.map((r) => r.key)).toEqual([
      'promoters',
      'foreignInstitutions',
      'mutualFunds',
      'otherDomestic',
      'retail',
    ]);
    expect(detailed[0]!.delta).toBe(0.5);
    const summary = holderRows(
      quarter('2026-06-30', "Jun '26", { mutualFunds: null, otherDomestic: null }),
      null,
    );
    expect(summary.map((r) => r.key)).toContain('domesticInstitutions');
    expect(summary[0]!.delta).toBeNull();
  });

  it('measures returns only as far back as the bars reach', () => {
    const day = 86_400;
    const now = 400 * day;
    const daily: Candle[] = Array.from({ length: 200 }, (_, i) => ({
      time: (200 + i) * day,
      open: 100,
      high: 100,
      low: 100,
      close: 100 + i,
      volume: 0,
    }));
    const returns = Object.fromEntries(priceReturns(daily, 300, now).map((r) => [r.key, r.pct]));
    expect(returns['1W']).toBeCloseTo(300 / 292 - 1);
    expect(returns['1Y']).toBeNull();
    expect(priceReturns(daily, null, now).every((r) => r.pct == null)).toBe(true);
  });

  it('takes a median of positive values only', () => {
    expect(median([10, null, 30, -5, 20])).toBe(20);
    expect(median([10, 20])).toBe(15);
    expect(median([null, -1])).toBeNull();
  });
});

describe('companyInsights', () => {
  const profile = normalizeCompanyProfile({
    state: 'ready',
    profile: {
      isin: 'INE000A01010',
      companyName: 'Acme',
      source: 'groww',
      fetchedAt: '2026-10-02T06:00:00.000Z',
      ratios: { peTtm: 30, industryPe: 25, debtToEquity: 0.05 },
      financials: { consolidated: statements, standalone: null },
      shareholding: [
        quarter('2026-06-30', "Jun '26"),
        quarter('2026-03-31', "Mar '26", { promoters: 50 }),
      ],
    },
  }).profile!;

  it('states facts in reading order and says nothing about missing figures', () => {
    const lines = companyInsights(profile, { price: 90, yearHigh: 100 });
    expect(lines.map((l) => l.key)).toEqual([
      'rev-cagr',
      'pat-cagr',
      'pat-q',
      'margin',
      'pe',
      'de',
      'sh-promoters',
      'sh-foreignInstitutions',
      'sh-mutualFunds',
      '52w',
    ]);
    expect(lines.find((l) => l.key === 'pe')!.text).toBe(
      "P/E 30.0 is 20.0% above the industry's 25.0.",
    );
    expect(lines.find((l) => l.key === 'sh-promoters')!.text).toMatch(/unchanged from Mar '26/);
    expect(lines.find((l) => l.key === '52w')!.text).toMatch(/^Trading 10.0% below/);
  });
});

describe('normalizeCompanyProfile', () => {
  it('keeps the server’s reason when there is no profile', () => {
    expect(
      normalizeCompanyProfile({ state: 'not_applicable', message: 'An ETF', profile: null }),
    ).toEqual({
      state: 'not_applicable',
      message: 'An ETF',
      profile: null,
      stale: false,
    });
  });

  it('fills every list a card renders and drops unusable rows', () => {
    const r = normalizeCompanyProfile({
      state: 'ready',
      stale: true,
      profile: {
        isin: 'X',
        source: 'snapshot',
        financials: { consolidated: { revenue: { yearly: [{ period: '2026', value: 'NaN' }] } } },
        peers: [{ name: 'Beta', exchange: 'NSE', symbol: 'BETA' }, { symbol: 'NONAME' }],
        mutualFunds: 'oops',
      },
    });
    expect(r.stale).toBe(true);
    expect(r.profile?.source).toBe('snapshot');
    expect(r.profile?.financials.consolidated).toBeNull();
    expect(r.profile?.peers.map((p) => p.name)).toEqual(['Beta']);
    expect(r.profile?.mutualFunds).toEqual([]);
    expect(r.profile?.shareholding).toEqual([]);
    expect(sourceCaption(r)).toBe('Stored copy');
  });
});
