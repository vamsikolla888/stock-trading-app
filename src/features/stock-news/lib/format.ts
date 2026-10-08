import { formatIstDate, formatIstTime } from '@/features/home/lib/istTime';

import type {
  NewsEventType,
  NewsRisk,
  NewsScore,
  NewsSentiment,
  StockNewsCoverage,
  StockNewsItem,
} from '../types';

/**
 * Wording for the stock page's News tab — pure, so a label never differs between the list, the
 * filter and the summary. Mirrors the web's stock-analysis/lib/newsFormat.ts.
 */

export const EVENT_LABEL: Record<NewsEventType, string> = {
  earnings: 'Results',
  guidance: 'Outlook',
  order_win: 'Order / contract',
  corporate_action: 'Corporate action',
  deal: 'Deal',
  management: 'Management',
  regulatory: 'Regulatory',
  legal: 'Legal',
  rating: 'Broker / rating',
  capital: 'Capital',
  operations: 'Operations',
  price_move: 'Price move',
  sector_macro: 'Sector / macro',
  other: 'Other',
};

/** The model rated it this material or more — the same line the server's prompt draws. */
export const HIGH_IMPACT = 60;

export type SentimentTone = 'pos' | 'neg' | 'neutral' | 'pending';

/** The chip a story shows: its sentiment, or why it has none. */
export function chipFor(item: Pick<StockNewsItem, 'sentiment' | 'analysisStatus'>): {
  label: string;
  tone: SentimentTone;
} {
  if (item.sentiment) {
    return {
      label: item.sentiment,
      tone:
        item.sentiment === 'Positive' ? 'pos' : item.sentiment === 'Negative' ? 'neg' : 'neutral',
    };
  }
  return { label: item.analysisStatus === 'failed' ? 'Not analysed' : 'Pending', tone: 'pending' };
}

/** "3 h ago" / "2 d ago", then a date. */
export function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return formatIstDate(iso) ?? '';
}

/**
 * When a story is from, as precisely as it is KNOWN: an exact time reads "3 h ago"; a relative
 * one ("2 days ago" from the search engine) reads "~2 d ago"; a date-only reads "8 Sep"; nothing
 * reads "found 1 h ago" — never a published time the source did not give.
 */
export function newsWhen(
  item: Pick<StockNewsItem, 'publishedAt' | 'publishedPrecision' | 'foundAt'>,
  now: number = Date.now(),
): string {
  if (!item.publishedAt) return item.foundAt ? `found ${ago(item.foundAt, now)}` : '';
  if (item.publishedPrecision === 'day') return formatIstDate(item.publishedAt) ?? '';
  if (item.publishedPrecision === 'relative') return `~${ago(item.publishedAt, now)}`;
  return ago(item.publishedAt, now);
}

/** "+8", "−3", "0" — a real minus sign. */
export const signedInt = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

export const SCORE_WORD: Record<NewsSentiment, string> = {
  Positive: 'Positive news flow',
  Neutral: 'Mixed news flow',
  Negative: 'Negative news flow',
};

export const RISK_WORD: Record<NonNullable<NewsRisk['level']>, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

export const EVIDENCE_TEXT: Record<NewsScore['evidence'], string> = {
  thin: 'few stories — read with care',
  moderate: 'a fair number of stories',
  solid: 'plenty of stories',
};

/**
 * How the score moved over the week, in words. The two ends alone can hide the week (69 a week
 * ago and 69 today, but 48 in between), so when the ends agree a swing of 10+ is what is said.
 */
export function scoreProgress(
  score: Pick<NewsScore, 'value' | 'change7d' | 'series'>,
): string | null {
  if (score.value == null || score.change7d == null) return null;
  const c = score.change7d;
  if (Math.abs(c) >= 3) {
    return `${c > 0 ? 'Improved' : 'Worsened'} by ${Math.abs(c)} point${Math.abs(c) === 1 ? '' : 's'} over the past week`;
  }
  const week = score.series
    .slice(-8)
    .filter((p): p is { date: string; value: number; stories: number } => p.value != null);
  const low = week.reduce<(typeof week)[number] | null>(
    (m, p) => (!m || p.value < m.value ? p : m),
    null,
  );
  const high = week.reduce<(typeof week)[number] | null>(
    (m, p) => (!m || p.value > m.value ? p : m),
    null,
  );
  const day = (date: string) => formatIstDate(`${date}T12:00:00Z`) ?? date;
  if (low && score.value - low.value >= 10)
    return `Recovered from ${low.value} on ${day(low.date)}`;
  if (high && high.value - score.value >= 10)
    return `Back down from ${high.value} on ${day(high.date)}`;
  return 'Steady over the past week';
}

/** Whether, when and how this company's news is searched. */
export function coverageLine(c: StockNewsCoverage, now: number = Date.now()): string {
  if (!c.tracked) {
    return 'Searched daily for index companies only — this one is in no tracked index, so only stories from the market news feed appear.';
  }
  const parts = ['Searched daily for every index company'];
  if (c.lastCheckedAt) {
    const outcome =
      c.lastOutcome === 'outage'
        ? ' (the search engines did not answer)'
        : c.lastOutcome === 'failed'
          ? ' (the search failed)'
          : '';
    parts.push(`last checked ${ago(c.lastCheckedAt, now)}${outcome}`);
  } else {
    parts.push('not searched yet');
  }
  const next = formatIstTime(c.nextRunAt);
  if (next) parts.push(`next at ${next} IST`);
  return `${parts.join(' · ')}.`;
}
