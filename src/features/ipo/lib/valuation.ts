import { formatINR } from '@/lib/utils/formatters';

import type { IpoValuation, ValuationConfidence, ValuationZone } from '../types';

import type { Tone } from './format';

/**
 * How an IPO's fair value reads on screen — pure, mirrors the web's ipo/lib/valuation.ts. The
 * numbers come from the server (ipo-valuation.rules.ts); this only words them. The words say
 * where a price stands against the valuation, never an instruction: no buy, sell, apply or avoid.
 */

/** Where a listing price (or the grey-market estimate) sits against the two levels. */
export const ZONE: Record<ValuationZone, { word: string; tone: Tone }> = {
  'below-good': { word: 'Below the good-up-to level', tone: 'ok' },
  between: { word: 'Between good-up-to and fair value', tone: 'warn' },
  'above-fair': { word: 'Above fair value', tone: 'err' },
};

export const CONFIDENCE: Record<ValuationConfidence, { word: string; tone: Tone }> = {
  high: { word: 'High confidence', tone: 'ok' },
  medium: { word: 'Medium confidence', tone: 'warn' },
  low: { word: 'Low confidence', tone: 'neutral' },
};

/** A level as the valuation prints it: whole rupees from ₹50, paise below. */
export function inr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return formatINR(value, value >= 50 ? 0 : 2);
}

/** A whole signed percent with a real minus; zero is plain. */
export function signed(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}%`;
}

/** A record the screens can show as valued: both levels present. */
export function isValued(
  v: IpoValuation | null | undefined,
): v is IpoValuation & { fairValue: number; goodUpTo: number } {
  return v != null && v.status === 'valued' && v.fairValue != null && v.goodUpTo != null;
}

export interface ValueCell {
  valued: boolean;
  /** "₹140", or "—". */
  fair: string;
  /** "₹119", or "—". */
  good: string;
  /** Why there is no value: "Not valued" (the server said so) or "Pending" (nothing read yet). */
  missing: string | null;
  /** The listing price (or its estimate) against fair value; null without one. */
  vs: {
    /** "Est. listing" / "Listing". */
    label: string;
    price: string;
    /** "Above fair value · −37% to fair". */
    text: string;
    word: string;
    tone: Tone;
  } | null;
  /** Everything in one line, for a screen reader. */
  summary: string;
}

/** A list row's fair-value figures. Never a zero for a value that does not exist. */
export function valueCell(v: IpoValuation | null | undefined): ValueCell {
  if (!v) {
    return {
      valued: false,
      fair: '—',
      good: '—',
      missing: 'Pending',
      vs: null,
      summary: 'Fair value pending: the offer document has not been read yet.',
    };
  }
  if (!isValued(v)) {
    return {
      valued: false,
      fair: '—',
      good: '—',
      missing: 'Not valued',
      vs: null,
      summary: `Not valued. ${v.reason ?? v.error ?? ''}`.trim(),
    };
  }
  const ref = v.versusListing;
  const zone = ref ? ZONE[ref.zone] : null;
  const vs =
    ref && zone
      ? {
          label: ref.kind === 'listing' ? 'Listing' : 'Est. listing',
          price: inr(ref.price),
          text: `${zone.word} · ${signed(ref.upsidePct)} to fair`,
          word: zone.word,
          tone: zone.tone,
        }
      : null;
  const parts = [
    `Fair value ${inr(v.fairValue)}`,
    `good up to ${inr(v.goodUpTo)} (${v.marginOfSafetyPct}% margin of safety)`,
    vs ? `${vs.label.toLowerCase()} ${vs.price}, ${vs.word.toLowerCase()}` : null,
    v.confidence ? CONFIDENCE[v.confidence].word.toLowerCase() : null,
  ].filter(Boolean);
  return {
    valued: true,
    fair: inr(v.fairValue),
    good: inr(v.goodUpTo),
    missing: null,
    vs,
    summary: `${parts.join(' · ')}. Model estimate, not investment advice.`,
  };
}

/** "23.3× post-issue earnings vs peers’ 14.8× (+57%)" — the issue priced against its peers. */
export function peerLine(v: IpoValuation): string | null {
  if (v.issuePe == null) return null;
  if (v.peerPe == null) return `${v.issuePe}× post-issue earnings; no meaningful peer P/E`;
  const premium = v.premiumToPeersPct == null ? '' : ` (${signed(v.premiumToPeersPct)})`;
  return `${v.issuePe}× post-issue earnings vs peers’ ${v.peerPe}×${premium}`;
}

/** The line under fair value: "−36% on the ₹220 issue price", or the peers it was set against. */
export function fairSubline(v: IpoValuation): string {
  return v.upsideFromIssuePct == null || v.issuePrice == null
    ? 'Against its listed peers'
    : `${signed(v.upsideFromIssuePct)} on the ${inr(v.issuePrice)} issue price`;
}
