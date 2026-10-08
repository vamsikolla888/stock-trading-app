import type { StatusTone } from '@/features/settings/lib/status';
import { EMPTY_VALUE, formatSignedINR } from '@/lib/utils/formatters';
import type { ColorTokens } from '@/theme/tokens';

import type {
  AgentKey,
  AgentsSummary,
  AgentTone,
  Confidence,
  HoldingHistoryEntry,
  HoldingSummary,
  IndexRunBrief,
  NewsTone,
  ResearchDetail,
  ResearchRequest,
  ResearchSource,
  ReviewAction,
  ReviewBookStatus,
  ReviewBroker,
  ReviewEvidence,
  ReviewLevels,
  ReviewResult,
  ReviewRunResult,
  RunOutcome,
  TechnicalStance,
} from '../types';

/**
 * Words, tones and small decisions for the Agents screens, free of React so every one is pinned
 * by a test (web: client/src/features/agents/lib/agentsView.ts).
 */

/* ───────────────────────── shared ───────────────────────── */

/** The server's tone in the app's status palette. HOLD-like states are neutral, never red. */
export function toneOf(tone: AgentTone): StatusTone {
  switch (tone) {
    case 'ok':
      return 'ok';
    case 'warn':
      return 'warn';
    case 'err':
      return 'bad';
    case 'run':
      return 'info';
    default:
      return 'neutral';
  }
}

export const AGENT_NAME: Record<AgentKey, string> = {
  'index-trading': 'Index trading',
  portfolio: 'Portfolio review',
  'web-research': 'Web research',
};

/** "48 s", "3 min 10 s", "1 h 4 min"; a dash for anything that is not a real span. */
export function duration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return EMPTY_VALUE;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m} min ${r} s` : `${m} min`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** P&L in whole rupees, signed: "+₹1,240", "−₹310", and "₹0" for a sub-rupee loss (no "−₹0"). */
export function signedRupees(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EMPTY_VALUE;
  return formatSignedINR(Math.round(value) || 0, 0);
}

/** A gain/loss sign for colouring; 0 for zero or unknown. */
export function signOf(value: number | null | undefined): -1 | 0 | 1 {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.005) return 0;
  return value > 0 ? 1 : -1;
}

/** "1 holding" / "3 holdings". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
}

/** First letter up: "bullish" → "Bullish". */
export function capitalise(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/* ───────────────────────── portfolio review ───────────────────────── */

/**
 * The rating words an Indian research desk uses — a research label for review, never an order.
 * Colours are categorical, not health: green → blue → amber, with a neutral for "the evidence was
 * not enough for a view". Hold is never red.
 */
export const VERDICT: Record<
  ReviewAction,
  { label: string; color: keyof ColorTokens; outlined: boolean }
> = {
  CONSIDER_ADD: { label: 'Accumulate', color: 'accent', outlined: false },
  HOLD: { label: 'Hold', color: 'info', outlined: false },
  CONSIDER_SELL: { label: 'Reduce', color: 'warning', outlined: false },
  NEEDS_REVIEW: { label: 'Under review', color: 'textFaint', outlined: true },
};

export const VERDICT_ORDER: readonly ReviewAction[] = [
  'CONSIDER_ADD',
  'HOLD',
  'CONSIDER_SELL',
  'NEEDS_REVIEW',
];

export const TREND_WORD: Record<string, string> = {
  up: 'Uptrend',
  down: 'Downtrend',
  mixed: 'Mixed',
  unknown: 'Not enough history',
};

/** Technical stance / news tone as a status colour — a quality, so calm: bearish is amber. */
export function stanceTone(value: TechnicalStance | NewsTone | null): StatusTone {
  if (value === 'bullish' || value === 'positive') return 'ok';
  if (value === 'bearish' || value === 'negative') return 'warn';
  return 'neutral';
}

/** Confidence is a quality: high → ok, medium → warn, low → bad. */
export function confidenceTone(value: Confidence | null | undefined): StatusTone {
  return value === 'high'
    ? 'ok'
    : value === 'medium'
      ? 'warn'
      : value === 'low'
        ? 'bad'
        : 'neutral';
}

/** Unrealised return on the holding, percent, two decimals. */
export function holdingReturnPct(
  avg: number | null | undefined,
  last: number | null | undefined,
): number | null {
  if (avg == null || last == null || !(avg > 0) || !Number.isFinite(last)) return null;
  return Math.round((last / avg - 1) * 10_000) / 100;
}

/** What a holding row shows on the right: its verdict, or why it has none. */
export type HoldingState =
  | { kind: 'verdict'; action: ReviewAction }
  | { kind: 'reviewing' }
  | { kind: 'failed' }
  | { kind: 'none' };

export function holdingState(holding: HoldingSummary): HoldingState {
  if (holding.current) return { kind: 'verdict', action: holding.current.action };
  if (holding.inFlight) return { kind: 'reviewing' };
  if (holding.lastFailure) return { kind: 'failed' };
  return { kind: 'none' };
}

/** "Collecting data" while the server gathers evidence, "In the AI queue" once submitted. */
export function inFlightLabel(status: string): string {
  return status === 'COLLECTING' ? 'Collecting data' : 'In the AI queue';
}

export type HoldingFilter = 'all' | 'changed' | ReviewAction;

/** Largest position first (by portfolio weight), then A→Z; filtered by verdict or "changed". */
export function visibleHoldings(
  holdings: readonly HoldingSummary[],
  filter: HoldingFilter,
): HoldingSummary[] {
  const weight = (h: HoldingSummary) => h.current?.evidence?.holding?.portfolioWeightPct ?? -1;
  return holdings
    .filter((h) =>
      filter === 'all' ? true : filter === 'changed' ? h.changed : h.current?.action === filter,
    )
    .sort((a, b) => weight(b) - weight(a) || a.symbol.localeCompare(b.symbol));
}

/** Verdict flips in the last 24 hours, newest first. */
export function recentChanges(holdings: readonly HoldingSummary[]): HoldingSummary[] {
  return holdings
    .filter((h) => h.changed && h.lastChange)
    .sort((a, b) => (b.lastChange?.at ?? '').localeCompare(a.lastChange?.at ?? ''));
}

/**
 * The key levels: the note's own when it has them, else the ones its evidence measured (older
 * reviews), else none.
 */
export function levelsOf(
  result: ReviewResult | null,
  evidence: ReviewEvidence | null,
): ReviewLevels | null {
  if (result?.levels) return result.levels;
  if (!evidence?.holding && !evidence?.technical) return null;
  return {
    lastPrice: evidence.holding?.lastPrice ?? null,
    averagePrice: evidence.holding?.averagePrice ?? null,
    support: evidence.technical?.low20 ?? null,
    resistance: evidence.technical?.high20 ?? null,
    sma20: evidence.technical?.sma20 ?? null,
    sma50: evidence.technical?.sma50 ?? null,
  };
}

/** The verdict trail, oldest → newest, one cell per review; a gap where no verdict was reached. */
export function trailCells(
  history: readonly HoldingHistoryEntry[],
): { key: string; action: ReviewAction | null; label: string }[] {
  return [...history].reverse().map((entry, index) => ({
    key: `${entry.slot}-${index}`,
    action: entry.action,
    label: entry.action
      ? VERDICT[entry.action].label
      : entry.status === 'FAILED'
        ? 'Failed'
        : 'In progress',
  }));
}

/** The toast after "Run now" — what was submitted, what could not be, or why nothing was. */
export function runNowMessage(result: ReviewRunResult): {
  tone: 'success' | 'info' | 'error';
  title: string;
  message?: string;
} {
  const failed = result.failed
    ? `${plural(result.failed, 'holding')} could not be submitted — fix the reported issue and run again.`
    : undefined;
  if (result.submitted > 0) {
    return {
      tone: 'success',
      title: `${plural(result.submitted, 'review')} submitted`,
      message: failed ?? 'Each note appears here as it finishes — usually within a few minutes.',
    };
  }
  if (result.failed > 0) return { tone: 'error', title: 'Nothing was submitted', message: failed };
  return {
    tone: 'info',
    title: 'Nothing new to review',
    message:
      result.reason ??
      (result.skipped
        ? `${plural(result.skipped, 'holding')} already being reviewed.`
        : 'Every holding already has a current review or is being reviewed.'),
  };
}

/** The switch can turn off at any time; it turns on only while the agent is ready. */
export function canToggleReview(enabled: boolean, ready: boolean, pending: boolean): boolean {
  return !pending && (enabled || ready);
}

/* ───────────────────────── the books ───────────────────────── */

export const BROKER_WORD: Record<ReviewBroker, string> = { groww: 'Groww', mstock: 'mStock' };

/** "Groww + mStock" — the books that hold a holding; null when the server did not say. */
export function brokersLabel(brokers: readonly ReviewBroker[]): string | null {
  return brokers.length ? brokers.map((b) => BROKER_WORD[b]).join(' + ') : null;
}

/** The app's own portfolio screen for a book. */
export const BOOK_ROUTE = { groww: '/trade/groww', mstock: '/trade/mstock' } as const;

/**
 * "Groww 12 · mStock 8 holdings" — the books read on this request. An older server sends no
 * `books` (it reviewed Groww only); a book that failed reads "unavailable", one not connected is
 * left out.
 */
export function bookLine(books: readonly ReviewBookStatus[] | null): string {
  if (!books) return 'Groww equity holdings';
  const read = books.filter((b) => b.state !== 'not-connected');
  if (!read.length) return 'No Groww or mStock account connected';
  return `${read
    .map((b) => (b.state === 'error' ? `${b.label} unavailable` : `${b.label} ${b.holdings ?? 0}`))
    .join(' · ')} holdings`;
}

/** One book's read as a status row: its tone and a short line. */
export function bookView(book: ReviewBookStatus): { tone: StatusTone; label: string } {
  if (book.state === 'ok') {
    return { tone: 'ok', label: plural(book.holdings ?? 0, 'holding') };
  }
  if (book.state === 'error') return { tone: 'warn', label: 'Couldn’t be read' };
  return { tone: 'neutral', label: 'Not connected' };
}

/* ───────────────────────── web research ───────────────────────── */

const JOB_VIEW: Record<string, { label: string; tone: StatusTone }> = {
  PENDING: { label: 'Queued', tone: 'info' },
  RUNNING: { label: 'Researching', tone: 'info' },
  COMPLETED: { label: 'Answered', tone: 'ok' },
  FAILED: { label: 'Failed', tone: 'bad' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export function jobView(status: string): { label: string; tone: StatusTone } {
  return JOB_VIEW[status] ?? { label: capitalise(status.toLowerCase()), tone: 'neutral' };
}

export const isActiveJob = (status: string) => status === 'PENDING' || status === 'RUNNING';

/** The verification heuristic's 0–100 page score in a word. */
export function credibilityWord(score: number | null): string {
  if (score == null) return EMPTY_VALUE;
  return score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low';
}

/** "IPO report · Acme Cables" — who asked. */
export function requesterLine(requester: { label: string; detail: string | null }): string {
  return requester.detail ? `${requester.label} · ${requester.detail}` : requester.label;
}

/**
 * Every page the run read: the verified result's list (credibility, cited) when there is one,
 * each with the excerpt the sources read carries; the pages read so far while it runs. Cited
 * pages first, then by credibility.
 */
export function detailSources(detail: ResearchDetail): ResearchSource[] {
  const excerpts = new Map(detail.sources.map((s) => [s.ref, s.excerpt]));
  const base = detail.result?.sources.length
    ? detail.result.sources.map((s) => ({
        ...s,
        excerpt: s.excerpt ?? excerpts.get(s.ref) ?? null,
      }))
    : detail.sources;
  return [...base].sort(
    (a, b) => Number(b.cited) - Number(a.cited) || (b.credibility ?? -1) - (a.credibility ?? -1),
  );
}

export const RESEARCH_LIMITS = { queryMin: 3, queryMax: 500, instructionsMax: 1000 } as const;

export interface ResearchDraft {
  query: string;
  depth: 'quick' | 'standard' | 'deep';
  timeRange: '' | 'day' | 'week' | 'month' | 'year';
  instructions: string;
}

/** The server's zod rules (agents.routes.ts researchInput), checked before a request is sent. */
export function validateResearch(
  draft: ResearchDraft,
):
  | { ok: true; payload: ResearchRequest }
  | { ok: false; field: 'query' | 'instructions'; error: string } {
  const query = draft.query.trim();
  const instructions = draft.instructions.trim();
  if (query.length < RESEARCH_LIMITS.queryMin) {
    return { ok: false, field: 'query', error: 'Ask a question of at least 3 characters.' };
  }
  if (query.length > RESEARCH_LIMITS.queryMax) {
    return { ok: false, field: 'query', error: 'Keep the question under 500 characters.' };
  }
  if (instructions.length > RESEARCH_LIMITS.instructionsMax) {
    return { ok: false, field: 'instructions', error: 'Keep the guidance under 1,000 characters.' };
  }
  return {
    ok: true,
    payload: {
      query,
      depth: draft.depth,
      ...(draft.timeRange ? { timeRange: draft.timeRange } : {}),
      ...(instructions ? { instructions } : {}),
    },
  };
}

/**
 * The research answer as plain blocks — no markup is ever rendered. Paragraphs split on blank
 * lines, "- " / "* " / "1. " lines become list items, "#" lines headings, and every citation
 * ([S1], [2], 【S2†L3】) becomes a reference the screen links to the source it names.
 */
export type AnswerInline = { text: string } | { ref: string };
export type AnswerBlock =
  { kind: 'p' | 'h'; parts: AnswerInline[] } | { kind: 'ul' | 'ol'; items: AnswerInline[][] };

const REF_RE = /(?:\[|【)\s*(S?\d+)\s*(?:†[^\]】]*)?(?:\]|】)/g;

export function inlineParts(text: string): AnswerInline[] {
  const out: AnswerInline[] = [];
  let last = 0;
  for (const match of text.matchAll(REF_RE)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    const raw = match[1] ?? '';
    out.push({ ref: raw.startsWith('S') ? raw : `S${raw}` });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  // Markdown emphasis markers carry no meaning once the text is plain.
  return out.map((p) => ('text' in p ? { text: p.text.replace(/\*\*|__/g, '') } : p));
}

export function answerBlocks(answer: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  for (const chunk of answer.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    let listBlock = null as { kind: 'ul' | 'ol'; items: AnswerInline[][] } | null;
    let para: string[] = [];
    const flushPara = () => {
      if (para.length) blocks.push({ kind: 'p', parts: inlineParts(para.join(' ')) });
      para = [];
    };
    const flushList = () => {
      if (listBlock) blocks.push(listBlock);
      listBlock = null;
    };
    for (const line of lines) {
      const bullet = /^[-*•]\s+(.*)$/.exec(line);
      const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (heading) {
        flushPara();
        flushList();
        blocks.push({ kind: 'h', parts: inlineParts(heading[1] ?? '') });
      } else if (bullet || numbered) {
        flushPara();
        const kind = bullet ? 'ul' : 'ol';
        if (!listBlock || listBlock.kind !== kind) {
          flushList();
          listBlock = { kind, items: [] };
        }
        listBlock.items.push(inlineParts((bullet ?? numbered)?.[1] ?? ''));
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara();
    flushList();
  }
  return blocks;
}

/* ───────────────────────── the hub ───────────────────────── */

/** HOLD is the normal, safe outcome of a scan — neutral, never red. */
const OUTCOME_VIEW: Record<RunOutcome, { label: string; tone: StatusTone }> = {
  ordered: { label: 'Order placed', tone: 'ok' },
  hold: { label: 'Held', tone: 'neutral' },
  error: { label: 'Error', tone: 'bad' },
  running: { label: 'Running', tone: 'info' },
};

export function outcomeView(outcome: RunOutcome): { label: string; tone: StatusTone } {
  return OUTCOME_VIEW[outcome];
}

/** "Buy call · NIFTY", "Hold", or null when the scan never reached the trader. */
export function proposalLabel(run: Pick<IndexRunBrief, 'action' | 'underlying'>): string | null {
  if (!run.action) return null;
  if (run.action === 'HOLD') return 'Hold';
  const side = run.action === 'BUY_CALL' ? 'Buy call' : 'Buy put';
  return run.underlying ? `${side} · ${run.underlying}` : side;
}

/** Each agent card's status pill. */
export function indexStatus(index: NonNullable<AgentsSummary['indexTrading']>): {
  tone: StatusTone;
  label: string;
} {
  if (index.attention > 0) {
    return {
      tone: 'bad',
      label: `${index.attention} ${index.attention === 1 ? 'entry needs' : 'entries need'} review`,
    };
  }
  if (!index.enabled) return { tone: 'neutral', label: 'Off' };
  return index.mode === 'live'
    ? { tone: 'warn', label: 'Armed · live' }
    : { tone: 'ok', label: 'Armed · paper' };
}

export function portfolioStatus(portfolio: AgentsSummary['portfolio']): {
  tone: StatusTone;
  label: string;
} {
  if (portfolio.lastError) {
    return {
      tone: 'warn',
      label: portfolio.enabled ? 'On · last run had a problem' : 'Off · last run had a problem',
    };
  }
  if (portfolio.enabled) return { tone: 'ok', label: 'Hourly review on' };
  return { tone: 'neutral', label: portfolio.ready ? 'Off · ready' : 'Off' };
}

export function researchStatus(research: NonNullable<AgentsSummary['research']>): {
  tone: StatusTone;
  label: string;
} {
  if (research.error) return { tone: 'bad', label: 'Unreachable' };
  if (!research.ready) return { tone: 'warn', label: 'Not configured' };
  if (research.stats.running > 0) {
    return { tone: 'info', label: `${research.stats.running} researching` };
  }
  return { tone: 'ok', label: 'Ready' };
}

/** Poll the hub while any agent is mid-run, slowly otherwise. */
export function summaryPollMs(summary: AgentsSummary | undefined): number {
  const busy =
    (summary?.portfolio.counts.inFlight ?? 0) > 0 || (summary?.research?.stats.running ?? 0) > 0;
  return busy ? 30_000 : 120_000;
}
