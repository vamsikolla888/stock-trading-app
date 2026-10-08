import { reportSummary } from '@/features/ipo/lib/normalize';

import type {
  AttentionItem,
  BriefIpoListing,
  BriefIndex,
  BriefMover,
  BriefSector,
  DailyBrief,
  DailyBriefAudio,
  DailyBriefPreferences,
  DailyBriefRiskProfile,
  DailyBriefSection,
  DataMeta,
  MarketStatus,
  TechnicalAction,
  TechnicalSignal,
  WatchlistAttention,
} from '../types';

/**
 * The server returns today's brief freshly built, but a past date returns whatever was
 * stored that day — an older payload can be missing whole sections (the web itself guards
 * `technicalRadar ?? …`). Rather than sprinkle optional chaining through every component,
 * each payload is parsed once here into a shape where every field exists: arrays are
 * arrays, numbers are finite or null, and strings are strings.
 */

type Json = Record<string, unknown>;

export const DAILY_BRIEF_SECTIONS: readonly DailyBriefSection[] = [
  'summary',
  'outlook',
  'indices',
  'ipo',
  'breadth',
  'sectors',
  'movers',
  'derivatives',
  'portfolio',
  'watchlist',
  'technical',
  'attention',
  'news',
  'calendar',
];

const RISK_PROFILES: readonly DailyBriefRiskProfile[] = ['conservative', 'moderate', 'aggressive'];
const STATUSES: readonly MarketStatus[] = ['PRE_MARKET', 'OPEN', 'CLOSED'];
const ACTIONS: readonly TechnicalAction[] = ['BUY', 'SELL', 'WATCH'];

function obj(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.map(obj) : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Finite number or null. Numeric strings are accepted — Mongo decimals can arrive as text. */
export function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function count(value: unknown): number {
  const parsed = num(value);
  return parsed === null ? 0 : Math.max(0, Math.round(parsed));
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function meta(value: unknown, fallbackSource: string): DataMeta {
  const raw = obj(value);
  return {
    source: text(raw.source, fallbackSource),
    timestamp: textOrNull(raw.timestamp),
    isDelayed: raw.isDelayed === true,
    availability: oneOf(
      raw.availability,
      ['live', 'cached', 'unavailable'] as const,
      'unavailable',
    ),
    message: textOrNull(raw.message) ?? undefined,
  };
}

function mover(raw: Json): BriefMover {
  return {
    symbol: text(raw.symbol),
    companyName: textOrNull(raw.companyName),
    exchange: text(raw.exchange, 'NSE'),
    ltp: num(raw.ltp),
    changePct: num(raw.changePct),
    volume: num(raw.volume),
  };
}

function movers(value: unknown): BriefMover[] {
  return list(value)
    .map(mover)
    .filter((row) => row.symbol !== '');
}

function index(raw: Json): BriefIndex {
  const symbol = text(raw.symbol);
  return {
    exchange: text(raw.exchange, 'NSE'),
    symbol,
    name: textOrNull(raw.label) ?? symbol,
    ltp: num(raw.ltp),
    change: num(raw.change),
    changePct: num(raw.changePct),
    meta: meta(raw.meta, 'Index feed'),
  };
}

function sector(raw: Json): BriefSector | null {
  const name = textOrNull(raw.name);
  const changePct = num(raw.changePct);
  if (!name || changePct === null) return null;
  return {
    name,
    changePct,
    advances: count(raw.advances),
    declines: count(raw.declines),
    breadthPct: num(raw.breadthPct),
    strength: text(raw.strength),
  };
}

function signal(raw: Json, position: number): TechnicalSignal | null {
  const symbol = textOrNull(raw.symbol);
  if (!symbol) return null;
  return {
    id: textOrNull(raw.id) ?? `${symbol}:${position}`,
    symbol,
    exchange: text(raw.exchange, 'NSE'),
    screenerName: text(raw.screenerName),
    action: oneOf(raw.action, ACTIONS, 'WATCH'),
    conviction: num(raw.conviction),
    rationale: text(raw.rationale),
    invalidation: textOrNull(raw.invalidation),
    hitRatePct: num(raw.hitRatePct),
    sampleTrades: num(raw.sampleTrades),
    avgReturnPct: num(raw.avgReturnPct),
    holdDays: num(raw.holdDays),
  };
}

function attention(raw: Json): AttentionItem | null {
  const title = textOrNull(raw.title);
  if (!title) return null;
  return {
    symbol: textOrNull(raw.symbol),
    title,
    whatHappened: text(raw.whatHappened),
    whyItMatters: text(raw.whyItMatters),
    risk: text(raw.risk),
  };
}

function watchRow(raw: Json): WatchlistAttention | null {
  const symbol = textOrNull(raw.symbol);
  if (!symbol) return null;
  return {
    symbol,
    exchange: text(raw.exchange, 'NSE'),
    watchlist: text(raw.watchlist, 'Watchlist'),
    changePct: num(raw.changePct),
    note: textOrNull(raw.note),
  };
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

export function normalizeBrief(payload: unknown): DailyBrief {
  const raw = obj(payload);
  const summary = obj(raw.summary);
  const sentiment = obj(raw.sentiment);
  const breadth = obj(raw.breadth);
  const moverGroups = obj(raw.movers);
  const derivatives = obj(raw.derivatives);
  const radar = obj(raw.technicalRadar);
  const portfolio = obj(raw.portfolio);
  const watchlist = obj(raw.watchlist);
  const ai = raw.ai === null || raw.ai === undefined ? null : obj(raw.ai);

  const signals = list(radar.signals).map(signal).filter(notNull);

  return {
    date: text(raw.date),
    generatedAt: textOrNull(raw.generatedAt),
    marketStatus: oneOf(raw.marketStatus, STATUSES, 'CLOSED'),
    title: text(raw.title, 'Daily Brief'),
    riskProfile: oneOf(raw.riskProfile, RISK_PROFILES, 'moderate'),
    stale: raw.stale === true,
    partialFailures: strings(raw.partialFailures),
    unavailableSources: list(raw.unavailableSources)
      .map((item) => ({
        key: text(item.key),
        label: text(item.label),
        reason: text(item.reason),
      }))
      .filter((item) => item.label !== ''),
    summary: {
      bias: text(summary.bias, 'Unavailable'),
      text: text(summary.text),
      source: summary.source === 'ai-with-evidence' ? 'ai-with-evidence' : 'calculated',
    },
    sentiment: {
      score: num(sentiment.score),
      label: text(sentiment.label, 'Unavailable'),
      breadthRatio: num(sentiment.breadthRatio),
      factors: list(sentiment.factors)
        .map((item) => ({ label: text(item.label), value: text(item.value) }))
        .filter((item) => item.label !== ''),
      caveat: text(sentiment.caveat),
    },
    indices: list(raw.indices)
      .map(index)
      .filter((row) => row.symbol !== ''),
    breadth: {
      advances: count(breadth.advances),
      declines: count(breadth.declines),
      unchanged: count(breadth.unchanged),
      unavailable: count(breadth.unavailable),
      ratio: num(breadth.ratio),
      meta: meta(breadth.meta, 'NIFTY 500 constituents'),
    },
    sectors: list(raw.sectors).map(sector).filter(notNull),
    movers: {
      gainers: movers(moverGroups.gainers),
      losers: movers(moverGroups.losers),
      volume: movers(moverGroups.volume),
    },
    volumeNote: textOrNull(list(raw.unusualActivity)[0]?.signal),
    derivatives: {
      available: derivatives.available === true,
      underlying: textOrNull(derivatives.underlying),
      expiry: textOrNull(derivatives.expiry),
      spot: num(derivatives.spot),
      spotSource: textOrNull(derivatives.spotSource),
      atmStrike: num(derivatives.atmStrike),
      premiumRatio: num(derivatives.premiumRatio),
      futuresBasis: num(derivatives.futuresBasis),
      caveats: strings(derivatives.caveats),
      meta: meta(derivatives.meta, 'Derivatives chain'),
    },
    technicalRadar: {
      available: radar.available === true && signals.length > 0,
      signals,
      meta: meta(radar.meta, 'Technical signal engine'),
    },
    portfolio: {
      available: portfolio.available === true,
      value: num(portfolio.value),
      todayPnl: num(portfolio.todayPnl),
      todayPct: num(portfolio.todayPct),
      unrealizedPnl: num(portfolio.unrealizedPnl),
      contributors: list(portfolio.contributors)
        .map((item) => ({
          symbol: text(item.symbol),
          exchange: text(item.exchange, 'NSE'),
          contribution: num(item.contribution) ?? 0,
          changePct: num(item.changePct),
        }))
        .filter((item) => item.symbol !== ''),
      meta: meta(portfolio.meta, 'Connected broker'),
    },
    watchlist: {
      available: watchlist.available === true,
      listCount: num(watchlist.listCount),
      stockCount: num(watchlist.stockCount),
      advancing: num(watchlist.advancing),
      declining: num(watchlist.declining),
      averageChangePct: num(watchlist.averageChangePct),
      attention: list(watchlist.attention).map(watchRow).filter(notNull),
      meta: meta(watchlist.meta, 'Watchlists'),
    },
    news: list(raw.news)
      .map((item, position) => ({
        id: textOrNull(item.id) ?? `news:${position}`,
        title: text(item.title),
        source: text(item.source),
        link: textOrNull(item.link),
        publishedAt: textOrNull(item.publishedAt),
        sentiment: textOrNull(item.sentiment),
        effectivenessScore: num(item.effectivenessScore),
        symbol: textOrNull(item.symbol),
        analysisAvailable: item.analysisAvailable === true,
      }))
      .filter((item) => item.title !== ''),
    ipoListings: {
      available: obj(raw.ipoListings).available === true,
      items: list(obj(raw.ipoListings).items).map(ipoListing).filter(notNull),
    },
    ai: ai
      ? {
          marketBias: text(ai.marketBias, 'NEUTRAL'),
          conviction: num(ai.conviction),
          summary: text(ai.summary),
          supportingFactors: list(ai.supportingFactors)
            .map((item) => ({ factor: text(item.factor), explanation: text(item.explanation) }))
            .filter((item) => item.factor !== ''),
          riskFactors: strings(ai.riskFactors),
          attention: list(ai.attention).map(attention).filter(notNull),
          provider: text(ai.provider),
          model: text(ai.model),
          caveat: text(ai.caveat),
        }
      : null,
    aiStatus: oneOf(
      raw.aiStatus,
      ['ready', 'not-generated', 'unavailable'] as const,
      'not-generated',
    ),
    aiStale: raw.aiStale === true,
  };
}

function ipoListing(value: unknown): BriefIpoListing | null {
  const raw = obj(value);
  const id = textOrNull(raw.id);
  const companyName = textOrNull(raw.companyName);
  if (!id || !companyName) return null;
  return {
    id,
    companyName,
    issueType: raw.issueType === 'sme' ? 'sme' : 'mainboard',
    exchange: textOrNull(raw.exchange),
    issuePrice: num(raw.issuePrice),
    gmpPercent: num(raw.gmpPercent),
    estimatedListingPrice: num(raw.estimatedListingPrice),
    totalSubscription: num(raw.totalSubscription),
    preListing: reportSummary(raw.preListing),
    postListing: reportSummary(raw.postListing),
  };
}

function sections(value: unknown): DailyBriefSection[] {
  const seen = new Set<DailyBriefSection>();
  for (const item of strings(value)) {
    if ((DAILY_BRIEF_SECTIONS as readonly string[]).includes(item)) {
      seen.add(item as DailyBriefSection);
    }
  }
  return [...seen];
}

/** The server's own defaults (getDailyBriefPreferences) — used until preferences load. */
export const DEFAULT_PREFERENCES: DailyBriefPreferences = {
  riskProfile: 'moderate',
  audioEnabled: true,
  visibleSections: [...DAILY_BRIEF_SECTIONS],
  sectionOrder: [...DAILY_BRIEF_SECTIONS],
  preferredIndices: ['NIFTY 50', 'SENSEX', 'BANK NIFTY', 'FINNIFTY'],
  preferredSectors: [],
};

/**
 * The server lists every section it knows in `sectionOrder` (getDailyBriefPreferences fills a
 * stored order up), so that list is also exactly what it will accept back. It is kept as sent: an
 * older server has no IPO section, and a saved order naming one would be refused. Only an empty or
 * garbled answer falls back to the app's own list.
 */
export function normalizePreferences(payload: unknown): DailyBriefPreferences {
  const raw = obj(payload);
  const stored = sections(raw.sectionOrder);
  const order = stored.length > 0 ? stored : [...DAILY_BRIEF_SECTIONS];
  const visible = (
    Array.isArray(raw.visibleSections) ? sections(raw.visibleSections) : [...order]
  ).filter((section) => order.includes(section));
  return {
    riskProfile: oneOf(raw.riskProfile, RISK_PROFILES, 'moderate'),
    audioEnabled: raw.audioEnabled !== false,
    visibleSections: visible.length > 0 ? visible : [...order],
    sectionOrder: order,
    preferredIndices: strings(raw.preferredIndices),
    preferredSectors: strings(raw.preferredSectors),
  };
}

export function normalizeDates(payload: unknown): string[] {
  return strings(obj(payload).dates).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
}

export function normalizeAudio(payload: unknown): DailyBriefAudio {
  const raw = obj(payload);
  return {
    date: text(raw.date),
    version: text(raw.version),
    transcript: text(raw.transcript).trim(),
  };
}
