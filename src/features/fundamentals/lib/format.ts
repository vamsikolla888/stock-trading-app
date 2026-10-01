import type {
  AnalysisView,
  Band,
  Confidence,
  JobStage,
  JobView,
  Verdict,
  ViewState,
} from '../types';

/**
 * Words and numbers for the fundamental analysis — the web's faLabels.ts / faFormat.ts, so the
 * two clients describe a rating identically. Money arrives in ₹ CRORE with Indian grouping;
 * a missing value is "—", never 0.
 */

export const DASH = '—';

/** Printed on every badge, so colour is never the only carrier. */
export const VERDICT_TEXT: Record<Verdict, string> = {
  strong_bullish: 'Strong Bullish',
  bullish: 'Bullish',
  neutral: 'Neutral · watchlist',
  bearish: 'Bearish',
  strong_bearish: 'Strong Bearish · avoid',
  insufficient_data: 'Insufficient data',
};

/** Without the advice suffix — for a chip or a list row, where the long form would wrap. */
export const VERDICT_SHORT: Record<Verdict, string> = {
  strong_bullish: 'Strong Bullish',
  bullish: 'Bullish',
  neutral: 'Neutral',
  bearish: 'Bearish',
  strong_bearish: 'Strong Bearish',
  insufficient_data: 'Insufficient data',
};

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

export const VERDICT_TONE: Record<Verdict, Tone> = {
  strong_bullish: 'success',
  bullish: 'primary',
  neutral: 'neutral',
  bearish: 'warning',
  strong_bearish: 'danger',
  insufficient_data: 'neutral',
};

export const CONFIDENCE_TEXT: Record<Confidence, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  insufficient: 'Insufficient',
};

export const BAND_TEXT: Record<Band, string> = {
  strong: 'Strong',
  average: 'Average',
  weak: 'Weak',
  not_available: 'No data',
};

export const BAND_TONE: Record<Band, Tone> = {
  strong: 'success',
  average: 'warning',
  weak: 'danger',
  not_available: 'neutral',
};

/** Knockout rules in words — shared by the stock page and the list. */
export const KNOCKOUT_TEXT: Record<string, string> = {
  pledge_over_25: 'Promoter pledge above 25%',
  auditor_resigned_or_qualified: 'Auditor resigned or qualified the accounts',
  cfo_below_half_pat: '5-year cash from operations below half of profit',
  debt_equity_over_2: 'Debt to equity above 2',
  regulatory_or_surveillance: 'Regulatory action, fraud allegation or exchange surveillance',
  dilution_with_falling_eps: 'Repeated equity dilution while EPS falls',
};

export const knockoutText = (rule: string) => KNOCKOUT_TEXT[rule] ?? rule.replace(/_/g, ' ');

export const STAGE_TEXT: Record<JobStage, string> = {
  queued: 'Waiting for a worker',
  fetching_data: 'Collecting the financials',
  scoring: 'Scoring against the framework',
  ai_analysis: 'Writing the review',
  saving: 'Saving',
};

export const STAGES: readonly JobStage[] = [
  'queued',
  'fetching_data',
  'scoring',
  'ai_analysis',
  'saving',
];

const grouped = (value: number, dp: number) =>
  value.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** ₹ crore: "₹1,086 Cr", "₹10.86 L Cr" from a lakh crore up. */
export function crore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (abs >= 100_000) return `${sign}₹${grouped(abs / 100_000, 2)} L Cr`;
  if (abs >= 100) return `${sign}₹${grouped(abs, 0)} Cr`;
  return `${sign}₹${grouped(abs, 2)} Cr`;
}

export function rupees(value: number | null | undefined, dp = 2): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  return `${value < 0 ? '−' : ''}₹${grouped(Math.abs(value), dp)}`;
}

export function pct(value: number | null | undefined, dp = 1): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  return `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(dp)}%`;
}

export function signedPct(value: number | null | undefined, dp = 1): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  if (Math.abs(value) < 0.5 * 10 ** -dp) return `${(0).toFixed(dp)}%`;
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(dp)}%`;
}

export function times(value: number | null | undefined, dp = 2): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  return `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(dp)}×`;
}

/** Points: whole numbers bare, the rest to one decimal ("4", "2.5"). */
export const points = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** A check's value with its unit — "18.4%", "0.44×", "+36 days", "3 of 5". */
export function checkValue(value: number | string | null, unit: string | null): string {
  if (value == null) return DASH;
  if (typeof value === 'string') return value;
  if (unit === '%') return pct(value);
  if (unit === '×') return times(value);
  if (unit === 'pp') {
    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)} pp`;
  }
  if (unit === 'days') {
    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value))} days`;
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** "Jun '26" for a quarter end. */
export function quarterLabel(periodEnd: string): string {
  const date = new Date(`${periodEnd.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return periodEnd;
  const month = date.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${month} '${String(date.getUTCFullYear()).slice(2)}`;
}

/** "2026-W40" → "W40". */
export const weekLabel = (weekKey: string) => weekKey.replace(/^\d{4}-/, '');

/** "29 Sep 2026" in IST. */
export function istDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/** Whether a job is still producing the analysis. */
export const isJobActive = (job: Pick<JobView, 'status'> | null | undefined) =>
  job?.status === 'queued' || job?.status === 'running';

/** The states in which a job is (or should be) producing an analysis. */
export const WORKING_STATES: ReadonlySet<ViewState> = new Set([
  'queued',
  'running',
  'scheduled',
  'refreshing',
]);

/** The view state an analysis settles into once its job completes. */
export function stateAfterCompletion(analysis: Pick<AnalysisView, 'status'>): ViewState {
  if (analysis.status === 'partial') return 'partial';
  if (analysis.status === 'insufficient_data') return 'insufficient_data';
  if (analysis.status === 'not_applicable') return 'not_applicable';
  return 'ready';
}

/** "About 2 min" / "Under a minute" / null for a job's ETA. */
export function etaText(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return 'Under a minute';
  const minutes = Math.round(seconds / 60);
  return `About ${minutes} min`;
}

/** A job's progress line: its stage, and where it stands in the queue. */
export function jobProgressText(job: JobView): string {
  if (job.status === 'queued') {
    if (job.scheduled) return 'Scheduled with today’s batch — it runs when the queue gets to it.';
    return job.queuePosition != null && job.queuePosition > 0
      ? `In the queue — ${job.queuePosition} ahead of it.`
      : 'In the queue — starting shortly.';
  }
  return `${STAGE_TEXT[job.stage] ?? 'Working'}…`;
}

/** How long a job is followed before the section stops polling and says so. */
export const JOB_FOLLOW_LIMIT_MS = 10 * 60_000;

/** A job still in flight ten minutes after it was created — "taking longer than usual". */
export function jobTakingLong(
  job: Pick<JobView, 'status' | 'createdAt'> | null | undefined,
  now: number,
): boolean {
  if (!job || !isJobActive(job)) return false;
  const created = Date.parse(job.createdAt);
  return Number.isFinite(created) && now - created > JOB_FOLLOW_LIMIT_MS;
}
