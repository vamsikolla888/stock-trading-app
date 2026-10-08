import { istDayKey } from '@/features/home/lib/istTime';
import type { CircuitLimits, CircuitResponse } from '@/features/market/lib/circuit';

/**
 * The stock page's circuit limits, as Performance shows them. Pure; mirrors the web client's
 * stock-analysis/lib/circuit.ts.
 *
 * The exchange sets each session's band around the PREVIOUS close (SEBI price bands: 2%, 5%, 10%
 * or 20%; stocks with derivatives get a wider band the exchange can flex). No trade prints outside
 * it: at the upper limit only buyers are left queued, at the lower only sellers, which is why a
 * stock at its limit is said in words, not only in a number.
 *
 * Two sources, freshest first: the live tick (the broker's full-mode feed carries the limits) and
 * GET /market/circuit (Groww's quote, cached per session).
 */

export type CircuitSide = 'upper' | 'lower';

export interface CircuitView {
  lower: number | null;
  upper: number | null;
  /** "±5%" when both sides sit on one standard band; "+4.8% / −5.1%" otherwise; null when the
   *  previous close is unknown or the limits do not straddle it (another session's figures). */
  band: string | null;
  /** The price is AT a limit: no trade can print beyond it today. */
  at: CircuitSide | null;
  /** Within NEAR_LIMIT_PCT of a limit but not at it: a heads-up, not an exchange rule. */
  near: CircuitSide | null;
  /** How far each limit is from the price, in words ("3.40% below the price"). */
  lowerNote: string | null;
  upperNote: string | null;
  source: 'live' | 'quote' | null;
}

export const STANDARD_BANDS = [2, 5, 10, 20] as const;
/** A limit is a price rounded to the tick, so a 5% band can read 4.98% or 5.02%. */
const BAND_TOLERANCE = 0.35;
/** "At the limit": the last price equals it, to within half a paisa of float noise. */
const AT_LIMIT_EPSILON = 0.005;
/** "Near": the price is within this percentage of a limit. */
export const NEAR_LIMIT_PCT = 0.5;

const EMPTY: CircuitView = {
  lower: null,
  upper: null,
  band: null,
  at: null,
  near: null,
  lowerNote: null,
  upperNote: null,
  source: null,
};

const pct = (n: number) => `${n.toFixed(n >= 10 ? 1 : 2)}%`;

export function bandText(limits: CircuitLimits, prevClose: number | null): string | null {
  if (prevClose == null || !(prevClose > 0)) return null;
  if (!(limits.lower <= prevClose && prevClose <= limits.upper)) return null;
  const up = (limits.upper / prevClose - 1) * 100;
  const down = (1 - limits.lower / prevClose) * 100;
  const standard = STANDARD_BANDS.find(
    (b) => Math.abs(up - b) <= BAND_TOLERANCE && Math.abs(down - b) <= BAND_TOLERANCE,
  );
  return standard != null ? `±${standard}%` : `+${up.toFixed(1)}% / −${down.toFixed(1)}%`;
}

/**
 * The quote's limits when they belong to today's session (IST). A cache restored from an earlier
 * day must not pose as today's band; a reply without a read time is taken as current.
 */
export function sessionLimits(
  response: CircuitResponse | null | undefined,
  todayIst: string,
): CircuitLimits | null {
  if (!response?.limits) return null;
  const day = response.asOf ? istDayKey(response.asOf) : null;
  if (day && todayIst && day !== todayIst) return null;
  return response.limits;
}

export function circuitView(input: {
  live: CircuitLimits | null | undefined;
  quote: CircuitLimits | null | undefined;
  prevClose: number | null;
  ltp: number | null;
}): CircuitView {
  const limits = input.live ?? input.quote ?? null;
  if (!limits) return EMPTY;
  const base: CircuitView = {
    ...EMPTY,
    lower: limits.lower,
    upper: limits.upper,
    band: bandText(limits, input.prevClose),
    source: input.live ? 'live' : 'quote',
  };
  const { ltp } = input;
  if (ltp == null || !(ltp > 0)) return base;
  // A price outside the band cannot print in the band's session: these limits are another
  // session's, so nothing is said about where the price sits against them.
  if (ltp > limits.upper + AT_LIMIT_EPSILON || ltp < limits.lower - AT_LIMIT_EPSILON) return base;

  const at: CircuitSide | null =
    ltp >= limits.upper - AT_LIMIT_EPSILON
      ? 'upper'
      : ltp <= limits.lower + AT_LIMIT_EPSILON
        ? 'lower'
        : null;
  const toUpper = ((limits.upper - ltp) / ltp) * 100;
  const toLower = ((ltp - limits.lower) / ltp) * 100;
  const near: CircuitSide | null = at
    ? null
    : toUpper <= NEAR_LIMIT_PCT && toUpper <= toLower
      ? 'upper'
      : toLower <= NEAR_LIMIT_PCT
        ? 'lower'
        : null;
  return {
    ...base,
    at,
    near,
    lowerNote:
      at === 'lower' ? 'At the limit — only sellers queued' : `${pct(toLower)} below the price`,
    upperNote:
      at === 'upper' ? 'At the limit — only buyers queued' : `${pct(toUpper)} above the price`,
  };
}

/** The badge by the price: only when the price is at, or near, a limit. */
export function circuitBadge(
  view: Pick<CircuitView, 'at' | 'near'>,
): { label: string; tone: 'success' | 'danger' | 'neutral' } | null {
  if (view.at === 'upper') return { label: 'Upper circuit', tone: 'success' };
  if (view.at === 'lower') return { label: 'Lower circuit', tone: 'danger' };
  if (view.near === 'upper') return { label: 'Near upper circuit', tone: 'neutral' };
  if (view.near === 'lower') return { label: 'Near lower circuit', tone: 'neutral' };
  return null;
}
