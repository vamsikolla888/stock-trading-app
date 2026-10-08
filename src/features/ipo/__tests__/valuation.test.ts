import { ipoCall } from '@/features/ipo/lib/format';
import { normalizeIpo, normalizeValuation } from '@/features/ipo/lib/normalize';
import {
  CONFIDENCE,
  ZONE,
  fairSubline,
  inr,
  isValued,
  peerLine,
  signed,
  valueCell,
} from '@/features/ipo/lib/valuation';
import type { IpoValuation } from '@/features/ipo/types';

// The fair value on screen (web: client/src/features/ipo/lib/valuation.ts, pinned by the web's
// server/test/client-ipo-valuation.test.ts). The server computes; the app words it without
// inventing anything, and never as an instruction.

const VALUED = {
  status: 'valued',
  reason: null,
  issuePrice: 220,
  epsPost: 9.46,
  epsAnnualised: false,
  periodMonths: 12,
  issuePe: 23.3,
  peerPe: 14.8,
  peerPb: 2.05,
  peerRonw: 13.9,
  peersUsed: 1,
  postIssueRonw: 10.8,
  qualityFactor: 1.25,
  bookValuePost: 87.66,
  fairValuePe: 140,
  fairValuePb: 139,
  fairValue: 140,
  goodUpTo: 119,
  marginOfSafetyPct: 15,
  confidence: 'low',
  premiumToPeersPct: 57.4,
  upsideFromIssuePct: -36.4,
  versusListing: { price: 222, kind: 'estimated', upsidePct: -37, zone: 'above-fair' },
  method: ['step one', 'step two'],
  caveats: ['Only one peer P/E — a thin comparison.'],
  source: {
    url: 'https://www.investorgain.com/ipo/x/1602/',
    fetchedAt: '2026-10-07T10:00:00.000Z',
  },
  error: null,
};

const v = normalizeValuation(VALUED) as IpoValuation;

describe('normalizeValuation', () => {
  it('keeps a well-formed record as sent', () => {
    expect(v.status).toBe('valued');
    expect(v.fairValue).toBe(140);
    expect(v.goodUpTo).toBe(119);
    expect(v.confidence).toBe('low');
    expect(v.versusListing).toEqual({
      price: 222,
      kind: 'estimated',
      upsidePct: -37,
      zone: 'above-fair',
    });
    expect(v.method).toEqual(['step one', 'step two']);
    expect(v.source).toEqual({
      url: 'https://www.investorgain.com/ipo/x/1602/',
      fetchedAt: '2026-10-07T10:00:00.000Z',
    });
  });

  it('a "valued" record without both levels is not valued; unknown shapes are null', () => {
    expect(normalizeValuation({ ...VALUED, goodUpTo: null })!.status).toBe('not-valued');
    expect(normalizeValuation({ ...VALUED, fairValue: 'n/a' })!.status).toBe('not-valued');
    expect(normalizeValuation({ ...VALUED, status: 'maybe' })).toBeNull();
    expect(normalizeValuation(null)).toBeNull();
    expect(normalizeValuation([VALUED])).toBeNull();
  });

  it('drops a malformed comparison, stray steps and an unknown confidence', () => {
    const parsed = normalizeValuation({
      ...VALUED,
      versusListing: { price: 222, kind: 'rumour', upsidePct: 1, zone: 'between' },
      method: ['ok', 3, null, ''],
      confidence: 'certain',
      source: { fetchedAt: '2026-10-07' },
      marginOfSafetyPct: undefined,
    })!;
    expect(parsed.versusListing).toBeNull();
    expect(parsed.method).toEqual(['ok']);
    expect(parsed.confidence).toBeNull();
    expect(parsed.source).toBeNull();
    expect(parsed.marginOfSafetyPct).toBe(0);
  });

  it('keeps a not-valued reason', () => {
    const parsed = normalizeValuation({
      status: 'not-valued',
      reason: 'The company made a loss in its latest period.',
      marginOfSafetyPct: 25,
    })!;
    expect(parsed).toMatchObject({
      status: 'not-valued',
      reason: 'The company made a loss in its latest period.',
      fairValue: null,
      method: [],
      caveats: [],
    });
  });

  it('rides on the IPO record; an older server without it gives null', () => {
    expect(
      normalizeIpo({ id: 'a', companyName: 'A', valuation: VALUED })!.valuation?.fairValue,
    ).toBe(140);
    expect(normalizeIpo({ id: 'a', companyName: 'A' })!.valuation).toBeNull();
  });
});

describe('valueCell', () => {
  it('fair value, good-up-to, and the listing estimate against fair', () => {
    const cell = valueCell(v);
    expect(cell).toMatchObject({ valued: true, fair: '₹140', good: '₹119', missing: null });
    expect(cell.vs).toEqual({
      label: 'Est. listing',
      price: '₹222',
      text: 'Above fair value · −37% to fair',
      word: 'Above fair value',
      tone: 'err',
    });
    expect(cell.summary).toMatch(
      /^Fair value ₹140 · good up to ₹119 \(15% margin of safety\) · est\. listing ₹222, above fair value · low confidence\. Model estimate, not investment advice\.$/,
    );
  });

  it('a listed share compares with its listing price', () => {
    const cell = valueCell({
      ...v,
      versusListing: { price: 100, kind: 'listing', upsidePct: 40, zone: 'below-good' },
    });
    expect(cell.vs).toMatchObject({
      label: 'Listing',
      text: 'Below the good-up-to level · +40% to fair',
      tone: 'ok',
    });
  });

  it('not valued says why; nothing yet says pending — never a zero', () => {
    const none = valueCell({
      ...v,
      status: 'not-valued',
      fairValue: null,
      goodUpTo: null,
      reason: 'The company made a loss.',
    });
    expect(none).toEqual({
      valued: false,
      fair: '—',
      good: '—',
      missing: 'Not valued',
      vs: null,
      summary: 'Not valued. The company made a loss.',
    });
    expect(valueCell(null)).toMatchObject({ valued: false, fair: '—', missing: 'Pending' });
    expect(valueCell(undefined).missing).toBe('Pending');
  });

  it('isValued needs both levels', () => {
    expect(isValued(v)).toBe(true);
    expect(isValued({ ...v, goodUpTo: null })).toBe(false);
    expect(isValued(null)).toBe(false);
  });
});

describe('valuation words', () => {
  it('describe where a price stands — never buy, sell, apply or avoid', () => {
    const words = [
      ...Object.values(ZONE).map((z) => z.word),
      ...Object.values(CONFIDENCE).map((c) => c.word),
    ];
    for (const w of words) expect(w).not.toMatch(/\b(buy|sell|apply|subscribe|avoid)\b/i);
  });

  it('prices and percents', () => {
    expect(inr(1234)).toBe('₹1,234');
    expect(inr(123456)).toBe('₹1,23,456');
    expect(inr(45.61)).toBe('₹45.61');
    expect(inr(null)).toBe('—');
    expect(signed(31.6)).toBe('+32%');
    expect(signed(-36.4)).toBe('−36%');
    expect(signed(0.3)).toBe('0%');
  });

  it('the issue against its peers, and fair value against the issue price', () => {
    expect(peerLine(v)).toBe('23.3× post-issue earnings vs peers’ 14.8× (+57%)');
    expect(peerLine({ ...v, peerPe: null })).toBe(
      '23.3× post-issue earnings; no meaningful peer P/E',
    );
    expect(peerLine({ ...v, issuePe: null })).toBeNull();
    expect(fairSubline(v)).toBe('−36% on the ₹220 issue price');
    expect(fairSubline({ ...v, upsideFromIssuePct: null })).toBe('Against its listed peers');
  });
});

describe('ipoCall (Today)', () => {
  const ready = (composite: number | null, verdict: string, headline: string | null = null) => ({
    status: 'ready' as const,
    composite,
    verdict,
    headline,
    generatedAt: null,
  });

  it('no report is no call — never a made-up score', () => {
    expect(ipoCall(null, 'lists')).toBeNull();
    expect(ipoCall({ preListing: null, postListing: null }, 'opens')).toBeNull();
  });

  it('a listing reads the entry report once it exists, otherwise the setup report', () => {
    const research = {
      preListing: ready(72, 'favourable', '  Strong anchor book  '),
      postListing: ready(48, 'wait'),
    };
    expect(ipoCall(research, 'lists')).toEqual({
      label: 'Entry',
      state: 'ready',
      score: 48,
      verdict: 'Wait for confirmation',
      tone: 'warn',
      headline: null,
    });
    expect(ipoCall(research, 'closes')).toMatchObject({
      label: 'Setup',
      score: 72,
      verdict: 'Favourable setup',
      tone: 'ok',
      headline: 'Strong anchor book',
    });
    expect(
      ipoCall({ preListing: null, postListing: ready(60, 'favourable') }, 'opens'),
    ).toMatchObject({ label: 'Entry', score: 60 });
  });

  it('a report in progress or failed says so, with no score', () => {
    const running = {
      status: 'running' as const,
      composite: null,
      verdict: null,
      headline: null,
      generatedAt: null,
    };
    expect(ipoCall({ preListing: running, postListing: null }, 'closes')).toMatchObject({
      state: 'preparing',
      score: null,
      verdict: 'Report being prepared',
    });
    expect(
      ipoCall({ preListing: { ...running, status: 'failed' }, postListing: null }, 'closes'),
    ).toMatchObject({ state: 'failed', verdict: 'Report unavailable' });
  });
});
