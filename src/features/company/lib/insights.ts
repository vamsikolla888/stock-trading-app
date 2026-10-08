import { formatIstDate } from '@/features/home/lib/istTime';
import type { Candle } from '@/features/market/types';
import { holderPalette, type HolderTone } from '@/theme/tokens';

import type {
  CompanyProfile,
  CompanyProfileResponse,
  FinancialStatements,
  ShareholdingPeriod,
  StatementPoint,
} from '../types';

/**
 * What the stock page derives from the company profile — growth, margin, ownership moves, price
 * returns — and the plain-language lines it states them in. Pure; mirrors the web's
 * stock-analysis/lib/companyInsights.ts.
 *
 * THE RULE FOR EVERY LINE: a fact computed from figures on the same screen, worded as a fact.
 * "Revenue grew 7.0% a year over three years", never "strong growth"; "P/E above the industry's",
 * never "overvalued". A growth figure is computed only when both ends are positive and known — a
 * CAGR across a loss is not a number, and an unknown is left out rather than shown as zero.
 */

export type InsightTone = 'pos' | 'neg' | 'neutral';

export interface Insight {
  key: string;
  tone: InsightTone;
  text: string;
}

const MINUS = '−';

/** ₹ crore, grouped the Indian way: 1621874 → "₹16,21,874 Cr", 45.25 → "₹45.25 Cr". */
export function formatCr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : 2;
  return `${n < 0 ? MINUS : ''}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: digits })} Cr`;
}

/** A half-width cell's crore: lakh crore and up collapse to "₹18.75L Cr"; smaller stay whole. */
export function compactCr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e5) return `${n < 0 ? MINUS : ''}₹${(Math.abs(n) / 1e5).toFixed(2)}L Cr`;
  return formatCr(n);
}

/** Compact crore for a bar's cap label: 1086181 → "10.86L Cr", 45210 → "45,210", 312.4 → "312". */
export function shortCr(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? MINUS : '';
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)}L Cr`;
  if (abs >= 100) return `${sign}${Math.round(abs).toLocaleString('en-IN')}`;
  return `${sign}${abs.toFixed(abs >= 10 ? 1 : 2)}`;
}

/** A fraction as a signed percent with a real minus: 0.073 → "+7.3%". */
export function signedPctOf(fraction: number, digits = 1): string {
  return `${fraction >= 0 ? '+' : MINUS}${Math.abs(fraction * 100).toFixed(digits)}%`;
}

/** a → b as a fraction, only when both are positive (a change from or to a loss is not a %). */
export function change(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !(a > 0) || !(b > 0)) return null;
  return b / a - 1;
}

/** Compound annual growth from `from` to `to` over `years`, both positive. */
export function cagr(
  from: number | null | undefined,
  to: number | null | undefined,
  years: number,
): number | null {
  if (from == null || to == null || !(from > 0) || !(to > 0) || years <= 0) return null;
  return Math.pow(to / from, 1 / years) - 1;
}

export interface Growth {
  pct: number;
  from: string;
  to: string;
}

export interface SeriesGrowth {
  /** Latest fiscal year vs the one before. */
  oneYear: Growth | null;
  /** Latest fiscal year vs three years earlier, annualised. */
  threeYear: Growth | null;
  /** Latest quarter vs the same quarter a year earlier. */
  quarterYoY: Growth | null;
}

function byPeriodBack(
  points: StatementPoint[],
  back: number,
): [StatementPoint, StatementPoint] | null {
  if (points.length <= back) return null;
  return [points[points.length - 1 - back]!, points[points.length - 1]!];
}

export function seriesGrowth(yearly: StatementPoint[], quarterly: StatementPoint[]): SeriesGrowth {
  const one = byPeriodBack(yearly, 1);
  const three = byPeriodBack(yearly, 3);
  // Same quarter a year earlier = four quarter-ends back, checked by date, not index alone: a gap
  // in the list would otherwise compare Jun '26 with Mar '25.
  const q = byPeriodBack(quarterly, 4);
  const qOk =
    q != null &&
    Number(q[1].period.slice(0, 4)) - Number(q[0].period.slice(0, 4)) === 1 &&
    q[1].period.slice(5) === q[0].period.slice(5);
  const g1 = one ? change(one[0].value, one[1].value) : null;
  const g3 =
    three && Number(three[1].period) - Number(three[0].period) === 3
      ? cagr(three[0].value, three[1].value, 3)
      : null;
  const gq = q && qOk ? change(q[0].value, q[1].value) : null;
  return {
    oneYear: one && g1 != null ? { pct: g1, from: one[0].label, to: one[1].label } : null,
    threeYear: three && g3 != null ? { pct: g3, from: three[0].label, to: three[1].label } : null,
    quarterYoY: q && gq != null ? { pct: gq, from: q[0].label, to: q[1].label } : null,
  };
}

/** Net profit ÷ revenue for the latest fiscal year both are known for. */
export function netMargin(s: FinancialStatements): { pct: number; label: string } | null {
  const revenue = new Map(s.revenue.yearly.map((p) => [p.period, p]));
  for (let i = s.profit.yearly.length - 1; i >= 0; i--) {
    const p = s.profit.yearly[i]!;
    const r = revenue.get(p.period);
    if (r && r.value > 0) return { pct: p.value / r.value, label: p.label };
  }
  return null;
}

export type HolderKey =
  | 'promoters'
  | 'foreignInstitutions'
  | 'mutualFunds'
  | 'otherDomestic'
  | 'domesticInstitutions'
  | 'retail';

/**
 * Each holder category's colour (theme/tokens.ts holderPalette, web HOLDER_COLOR). The colour
 * follows the CATEGORY, never its rank or position: the two ways of splitting domestic
 * institutions share olive, and mutual funds — split out only in the detailed pattern — take the
 * fifth hue, so "Promoters" is the same lilac on every stock and every quarter.
 */
export const HOLDER_TONE: Record<HolderKey, HolderTone> = {
  promoters: 'promoters',
  foreignInstitutions: 'fii',
  mutualFunds: 'mf',
  otherDomestic: 'dii',
  domesticInstitutions: 'dii',
  retail: 'retail',
};

export function holderColor(key: HolderKey, isDark: boolean): string {
  return holderPalette[isDark ? 'dark' : 'light'][HOLDER_TONE[key]];
}

export interface HolderRow {
  key: HolderKey;
  label: string;
  value: number | null;
  /** Percentage POINTS vs the previous quarter; null when either quarter lacks the figure. */
  delta: number | null;
}

/**
 * The categories a quarter is shown in — five when the detailed split exists (mutual funds apart
 * from other domestic institutions), the four-way DII total otherwise. Never both: the DII total
 * contains mutual funds, and showing both would count them twice.
 */
export function holderRows(curr: ShareholdingPeriod, prev: ShareholdingPeriod | null): HolderRow[] {
  const detailed = curr.mutualFunds != null || curr.otherDomestic != null;
  const keys: { key: HolderKey; label: string }[] = detailed
    ? [
        { key: 'promoters', label: 'Promoters' },
        { key: 'foreignInstitutions', label: 'Foreign institutions' },
        { key: 'mutualFunds', label: 'Mutual funds' },
        { key: 'otherDomestic', label: 'Other domestic institutions' },
        { key: 'retail', label: 'Retail and others' },
      ]
    : [
        { key: 'promoters', label: 'Promoters' },
        { key: 'foreignInstitutions', label: 'Foreign institutions' },
        { key: 'domesticInstitutions', label: 'Domestic institutions' },
        { key: 'retail', label: 'Retail and others' },
      ];
  return keys.map(({ key, label }) => {
    const value = curr[key];
    const before = prev ? prev[key] : null;
    const delta = value != null && before != null ? Math.round((value - before) * 100) / 100 : null;
    return { key, label, value, delta };
  });
}

export type ReturnKey = '1W' | '1M' | '3M' | '6M' | '1Y';

export interface PriceReturn {
  key: ReturnKey;
  /** A fraction (0.12 = +12%), or null when the bars don't reach back that far. */
  pct: number | null;
}

const RETURN_DAYS: Record<ReturnKey, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 91,
  '6M': 182,
  '1Y': 365,
};

/**
 * Price return over each window: `price` now vs the CLOSE of the last daily bar on or before that
 * many calendar days ago. Null when the bars do not reach back that far — a recent listing's 1Y
 * is unknown, not zero.
 */
export function priceReturns(
  daily: readonly Candle[],
  price: number | null,
  nowSec: number,
): PriceReturn[] {
  return (Object.keys(RETURN_DAYS) as ReturnKey[]).map((key) => {
    if (price == null || !(price > 0) || daily.length < 2) return { key, pct: null };
    const cutoff = nowSec - RETURN_DAYS[key] * 86_400;
    if (daily[0]!.time > cutoff) return { key, pct: null };
    let base: Candle | null = null;
    for (const candle of daily) {
      if (candle.time <= cutoff) base = candle;
      else break;
    }
    return { key, pct: base && base.close > 0 ? price / base.close - 1 : null };
  });
}

const pct1 = (f: number) => `${Math.abs(f * 100).toFixed(1)}%`;
const pts = (d: number) => `${Math.abs(d).toFixed(2)} pts`;

/** Statements on the basis asked for, falling back to whichever exists. */
export function statementsOf(
  profile: CompanyProfile,
  basis: 'consolidated' | 'standalone' = 'consolidated',
): FinancialStatements | null {
  return (
    profile.financials[basis] ?? profile.financials.consolidated ?? profile.financials.standalone
  );
}

/**
 * The "what the numbers say" lines under the ratios, in reading order: growth, profitability,
 * valuation, balance sheet, ownership, price. At most one line per fact; nothing is said about a
 * figure that is missing.
 */
export function companyInsights(
  profile: CompanyProfile,
  opts: { price: number | null; yearHigh: number | null },
): Insight[] {
  const out: Insight[] = [];
  const s = statementsOf(profile);
  if (s) {
    const rev = seriesGrowth(s.revenue.yearly, s.revenue.quarterly);
    const pat = seriesGrowth(s.profit.yearly, s.profit.quarterly);
    if (rev.threeYear) {
      out.push({
        key: 'rev-cagr',
        tone: rev.threeYear.pct >= 0 ? 'pos' : 'neg',
        text: `Revenue ${rev.threeYear.pct >= 0 ? 'grew' : 'fell'} ${pct1(rev.threeYear.pct)} a year over three years (${rev.threeYear.from}–${rev.threeYear.to}).`,
      });
    }
    if (pat.threeYear) {
      out.push({
        key: 'pat-cagr',
        tone: pat.threeYear.pct >= 0 ? 'pos' : 'neg',
        text: `Net profit ${pat.threeYear.pct >= 0 ? 'grew' : 'fell'} ${pct1(pat.threeYear.pct)} a year over the same period.`,
      });
    }
    if (pat.quarterYoY) {
      out.push({
        key: 'pat-q',
        tone: pat.quarterYoY.pct >= 0 ? 'pos' : 'neg',
        text: `${pat.quarterYoY.to} quarter profit ${pat.quarterYoY.pct >= 0 ? 'up' : 'down'} ${pct1(pat.quarterYoY.pct)} from ${pat.quarterYoY.from}.`,
      });
    }
    const m = netMargin(s);
    if (m) {
      out.push({
        key: 'margin',
        tone: 'neutral',
        text: `Net profit margin ${(m.pct * 100).toFixed(1)}% in ${m.label}.`,
      });
    }
  }

  const { peTtm, industryPe, debtToEquity } = profile.ratios;
  if (peTtm != null && peTtm > 0 && industryPe != null && industryPe > 0) {
    const rel = peTtm / industryPe - 1;
    out.push({
      key: 'pe',
      tone: 'neutral',
      text:
        Math.abs(rel) < 0.05
          ? `P/E ${peTtm.toFixed(1)} is in line with the industry's ${industryPe.toFixed(1)}.`
          : `P/E ${peTtm.toFixed(1)} is ${pct1(rel)} ${rel > 0 ? 'above' : 'below'} the industry's ${industryPe.toFixed(1)}.`,
    });
  } else if (peTtm != null && peTtm <= 0) {
    out.push({
      key: 'pe',
      tone: 'neg',
      text: 'P/E is not meaningful: trailing earnings are negative.',
    });
  }
  // Debt only when it says something the ratio row does not: next to nothing, or more than equity.
  if (debtToEquity != null && (debtToEquity < 0.1 || debtToEquity > 1)) {
    out.push({
      key: 'de',
      tone: 'neutral',
      text:
        debtToEquity < 0.1
          ? `Almost no debt (debt to equity ${debtToEquity.toFixed(2)}).`
          : `Debt exceeds equity (debt to equity ${debtToEquity.toFixed(2)}).`,
    });
  }

  const [curr, prev] = profile.shareholding;
  if (curr && prev) {
    const moves: { label: string; key: HolderKey }[] = [
      { label: 'Promoters', key: 'promoters' },
      { label: 'Foreign institutions', key: 'foreignInstitutions' },
      curr.mutualFunds != null
        ? { label: 'Mutual funds', key: 'mutualFunds' }
        : { label: 'Domestic institutions', key: 'domesticInstitutions' },
    ];
    for (const { label, key } of moves) {
      const a = prev[key];
      const b = curr[key];
      if (a == null || b == null) continue;
      const d = Math.round((b - a) * 100) / 100;
      out.push({
        key: `sh-${key}`,
        tone: d === 0 ? 'neutral' : d > 0 ? 'pos' : 'neg',
        text:
          d === 0
            ? `${label} held ${b.toFixed(2)}% in ${curr.label}, unchanged from ${prev.label}.`
            : `${label} ${d > 0 ? 'raised' : 'cut'} their holding by ${pts(d)} to ${b.toFixed(2)}% in ${curr.label}.`,
      });
    }
  }

  if (opts.price != null && opts.price > 0 && opts.yearHigh != null && opts.yearHigh > 0) {
    const off = opts.price / opts.yearHigh - 1;
    out.push({
      key: '52w',
      tone: 'neutral',
      text:
        off >= -0.005
          ? 'Trading at its 52-week high.'
          : `Trading ${pct1(off)} below its 52-week high of ₹${opts.yearHigh.toLocaleString('en-IN', { maximumFractionDigits: 2 })}.`,
    });
  }
  return out;
}

export interface StatementRow {
  key: string;
  label: string;
  /** 'cr' = ₹ crore, 'pct' = a fraction shown as a percent. */
  kind: 'cr' | 'pct';
  values: (number | null)[];
}

export interface StatementTable {
  periods: { period: string; label: string }[];
  rows: StatementRow[];
}

/**
 * The statement under the Financials chart: one column per period drawn (oldest first), revenue,
 * profit and margin side by side — and, yearly, net worth and growth against the year before.
 */
export function statementTable(
  s: FinancialStatements,
  period: 'quarterly' | 'yearly',
): StatementTable {
  const lines = {
    revenue: s.revenue[period],
    profit: s.profit[period],
    netWorth: s.netWorth[period],
  };
  const labels = new Map<string, string>();
  for (const line of Object.values(lines)) for (const p of line) labels.set(p.period, p.label);
  const periods = [...labels.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, label]) => ({ period: p, label }));
  const at = (line: StatementPoint[]) => {
    const byPeriod = new Map(line.map((p) => [p.period, p.value]));
    return periods.map((p) => byPeriod.get(p.period) ?? null);
  };
  const revenue = at(lines.revenue);
  const profit = at(lines.profit);
  const rows: StatementRow[] = [
    { key: 'revenue', label: 'Revenue', kind: 'cr', values: revenue },
    { key: 'profit', label: 'Net profit', kind: 'cr', values: profit },
    {
      key: 'margin',
      label: 'Net margin',
      kind: 'pct',
      values: periods.map((_, i) => {
        const r = revenue[i];
        const p = profit[i];
        return r != null && r > 0 && p != null ? p / r : null;
      }),
    },
  ];
  if (period === 'yearly') {
    const netWorth = at(lines.netWorth);
    if (netWorth.some((v) => v != null)) {
      rows.push({ key: 'netWorth', label: 'Net worth', kind: 'cr', values: netWorth });
    }
    const yoy = (values: (number | null)[]) =>
      values.map((x, i) =>
        i === 0 || Number(periods[i]!.period) - Number(periods[i - 1]!.period) !== 1
          ? null
          : change(values[i - 1], x),
      );
    rows.push({ key: 'revenueGrowth', label: 'Revenue growth', kind: 'pct', values: yoy(revenue) });
    rows.push({ key: 'profitGrowth', label: 'Profit growth', kind: 'pct', values: yoy(profit) });
  }
  return { periods, rows };
}

/** The median of the positive, finite values — a peer group's typical P/E without one outlier. */
export function median(values: (number | null)[]): number | null {
  const v = values
    .filter((x): x is number => x != null && Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/** "Groww · 30 Sep" — where the figures came from and when. */
export function sourceCaption(response: CompanyProfileResponse | undefined): string | undefined {
  const p = response?.profile;
  if (!p) return undefined;
  const when = formatIstDate(p.fetchedAt);
  const from = p.source === 'snapshot' ? 'Stored copy' : 'Groww';
  return when ? `${from} · ${when}` : from;
}
