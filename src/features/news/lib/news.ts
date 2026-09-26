import type { NewsAnalysisJobStatus, NewsRange, NewsSentiment, NewsSort } from '../types';

export const RANGE_OPTIONS: readonly { key: NewsRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7days', label: 'Last 7 days' },
];

export type SentimentFilter = 'all' | NewsSentiment;

export const SENTIMENT_OPTIONS: readonly { key: SentimentFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'Positive', label: 'Positive' },
  { key: 'Neutral', label: 'Neutral' },
  { key: 'Negative', label: 'Negative' },
];

export const SORT_OPTIONS: readonly { key: NewsSort; label: string }[] = [
  { key: 'date', label: 'Newest first' },
  { key: 'impact', label: 'Highest impact' },
];

export const SENTIMENT_BADGE: Record<NewsSentiment, 'success' | 'neutral' | 'danger'> = {
  Positive: 'success',
  Neutral: 'neutral',
  Negative: 'danger',
};

/**
 * Impact tiers for effectivenessScore (0–100). Impact is how much an article should move a
 * decision — not whether the news is good — so a high score reads urgent in either direction.
 */
export type ImpactTier = 'high' | 'medium' | 'low';

export function impactTier(score: number): ImpactTier {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export type ArticleState = 'scored' | 'failed' | 'analyzing' | 'pending';

/** What a row can honestly claim about its analysis. */
export function articleState(item: {
  jobStatus: NewsAnalysisJobStatus | null;
  sentiment: NewsSentiment | null;
}): ArticleState {
  if (item.jobStatus === 'completed' && item.sentiment) return 'scored';
  if (item.jobStatus === 'failed') return 'failed';
  if (item.jobStatus === 'queued' || item.jobStatus === 'processing') return 'analyzing';
  return 'pending';
}

/** Impact is shown only for a completed analysis — a queued row's null is not a zero. */
export function scoredImpact(item: {
  jobStatus: NewsAnalysisJobStatus | null;
  effectivenessScore: number | null;
}): number | null {
  return item.jobStatus === 'completed' && typeof item.effectivenessScore === 'number'
    ? item.effectivenessScore
    : null;
}

/** Only real web links are handed to the OS. */
export function isWebLink(link: string | null | undefined): link is string {
  return typeof link === 'string' && /^https?:\/\//i.test(link.trim());
}

/** "+1.2%" / "−0.8%" / "0.0%" for the model's next-day move estimate. */
export function formatExpectedMove(pct: number | null | undefined): string {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': '’',
  '&apos;': '’',
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
};

/** Feed summaries can carry HTML; show them as plain text (tags dropped, entities decoded). */
export function plainText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<(br|\/p|\/div|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|quot|#39|apos|nbsp|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export const HOUR_MS = 3_600_000;
const NEWS_WINDOW_MS = 30 * 86_400_000;

/**
 * Start of the stock News tab's 30-day window (ISO), floored to the hour so the query key
 * — and its cache entry — stays the same for a whole hour.
 */
export function newsWindowStart(nowMs: number): string {
  return new Date(Math.floor(nowMs / HOUR_MS) * HOUR_MS - NEWS_WINDOW_MS).toISOString();
}

export const EMPTY_COPY: Record<NewsRange, string> = {
  today: 'No analysed news yet today. Articles are scored as they arrive through the day.',
  yesterday: 'No analysed news from yesterday for this filter.',
  last7days: 'No analysed news in the last 7 days for this filter.',
};
