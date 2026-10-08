import type {
  NewsEventType,
  NewsRisk,
  NewsRiskDriver,
  NewsScore,
  NewsSentiment,
  StockNewsItem,
  StockNewsPage,
} from '../types';

/** Every /stocks/:symbol/news page is parsed once here, so a missing field never throws mid-render. */

type Json = Record<string, unknown>;

const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
const isObj = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const count = (value: unknown): number => num(value) ?? 0;

const EVENT_TYPES: readonly NewsEventType[] = [
  'earnings',
  'guidance',
  'order_win',
  'corporate_action',
  'deal',
  'management',
  'regulatory',
  'legal',
  'rating',
  'capital',
  'operations',
  'price_move',
  'sector_macro',
  'other',
];

const eventType = (value: unknown): NewsEventType | null =>
  (EVENT_TYPES as readonly unknown[]).includes(value) ? (value as NewsEventType) : null;

const sentiment = (value: unknown): NewsSentiment | null =>
  value === 'Positive' || value === 'Neutral' || value === 'Negative' ? value : null;

const evidence = (value: unknown): 'thin' | 'moderate' | 'solid' =>
  value === 'moderate' || value === 'solid' ? value : 'thin';

/** "/news/analysis/<id>" → "<id>": a feed row opens the in-app article. */
export function newsIdFromPath(path: unknown): string | null {
  const match = typeof path === 'string' ? /^\/news\/analysis\/([^/?#]+)$/.exec(path) : null;
  return match ? decodeURIComponent(match[1]!) : null;
}

function item(value: unknown): StockNewsItem | null {
  const raw = obj(value);
  const id = text(raw.id);
  const title = text(raw.title);
  const url = text(raw.url);
  if (!id || !title || !url) return null;
  const precision = raw.publishedPrecision;
  const status = raw.analysisStatus;
  return {
    id,
    origin: raw.origin === 'feed' ? 'feed' : 'search',
    title,
    url,
    publisher: text(raw.publisher) ?? text(raw.domain) ?? '',
    publishedAt: text(raw.publishedAt),
    publishedPrecision:
      precision === 'exact' || precision === 'day' || precision === 'relative' ? precision : null,
    foundAt: text(raw.foundAt) ?? text(raw.publishedAt) ?? '',
    snippet: text(raw.snippet) ?? '',
    analysisStatus: status === 'analyzed' || status === 'failed' ? status : 'pending',
    relevance: raw.relevance === 'about' || raw.relevance === 'mentions' ? raw.relevance : null,
    sentiment: sentiment(raw.sentiment),
    sentimentScore: num(raw.sentimentScore),
    impactScore: num(raw.impactScore),
    eventType: eventType(raw.eventType),
    reason: text(raw.reason),
    newsId: newsIdFromPath(raw.analysisPath),
  };
}

function score(value: unknown): NewsScore {
  const raw = obj(value);
  return {
    value: num(raw.value),
    label: sentiment(raw.label),
    change7d: num(raw.change7d),
    series: list(raw.series).flatMap((point) => {
      const p = obj(point);
      const date = text(p.date);
      return date ? [{ date, value: num(p.value), stories: count(p.stories) }] : [];
    }),
    stories: count(raw.stories),
    evidence: evidence(raw.evidence),
  };
}

function driver(value: unknown): NewsRiskDriver | null {
  const raw = obj(value);
  const id = text(raw.id);
  const title = text(raw.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    url: text(raw.url) ?? '',
    eventType: eventType(raw.eventType),
    impact: num(raw.impact),
    at: text(raw.at) ?? '',
  };
}

function risk(value: unknown): NewsRisk {
  const raw = obj(value);
  const components = isObj(raw.components) ? raw.components : null;
  const level = raw.level;
  return {
    value: num(raw.value),
    level: level === 'low' || level === 'moderate' || level === 'high' ? level : null,
    components: components
      ? {
          adverseShare: count(components.adverseShare),
          adverseEvents: count(components.adverseEvents),
          conflict: count(components.conflict),
        }
      : null,
    drivers: list(raw.drivers)
      .map(driver)
      .filter((d): d is NewsRiskDriver => d !== null),
    stories: count(raw.stories),
    evidence: evidence(raw.evidence),
  };
}

export function normalizeStockNews(payload: unknown): StockNewsPage {
  const raw = obj(payload);
  const coverage = obj(raw.coverage);
  const summary = obj(raw.summary);
  const signals = obj(raw.signals);
  const outcome = coverage.lastOutcome;
  return {
    coverage: {
      tracked: coverage.tracked === true,
      lastCheckedAt: text(coverage.lastCheckedAt),
      lastOutcome:
        outcome === 'ok' || outcome === 'empty' || outcome === 'outage' || outcome === 'failed'
          ? outcome
          : null,
      nextRunAt: text(coverage.nextRunAt),
    },
    summary: {
      total: count(summary.total),
      analyzed: count(summary.analyzed),
      pending: count(summary.pending),
      positive: count(summary.positive),
      neutral: count(summary.neutral),
      negative: count(summary.negative),
      highImpact: count(summary.highImpact),
      models: list(summary.models).filter((m): m is string => typeof m === 'string'),
      latestAt: text(summary.latestAt),
    },
    signals: { score: score(signals.score), risk: risk(signals.risk) },
    items: list(raw.items)
      .map(item)
      .filter((i): i is StockNewsItem => i !== null),
    page: num(raw.page) ?? 1,
    totalFiltered: count(raw.totalFiltered),
    hasMore: raw.hasMore === true,
  };
}
