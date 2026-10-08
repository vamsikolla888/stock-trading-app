import {
  eventLine,
  gmpText,
  ipoNextDays,
  listingWhen,
  priceBand,
  researchLine,
  rowResearch,
  scheduleLine,
  scoreChange,
  times,
  verdictOf,
  verifiedCategories,
} from '@/features/ipo/lib/format';
import {
  normalizeGmpHistory,
  normalizeIpo,
  normalizeIpoList,
  normalizeReports,
} from '@/features/ipo/lib/normalize';
import type { IpoRecord } from '@/features/ipo/types';

// 2026-10-03 15:00 IST.
const NOW = new Date('2026-10-03T09:30:00.000Z');
/** An IST calendar day as the server stores it: IST midnight. */
const istMidnight = (day: string) => new Date(`${day}T00:00:00+05:30`).toISOString();

const row = {
  id: '66f0aa',
  companyName: 'Acme Cables Ltd',
  issueType: 'mainboard',
  status: 'open',
  exchange: 'NSE',
  openDate: istMidnight('2026-10-01'),
  closeDate: istMidnight('2026-10-03'),
  allotmentDate: istMidnight('2026-10-06'),
  listingDate: istMidnight('2026-10-08'),
  priceMin: 540,
  priceMax: 568,
  lotSize: 26,
  issueSizeCrore: 1250.5,
  logoUrl: null,
  gmp: 42,
  gmpPercent: 7.39,
  estimatedListingPrice: 610,
  totalSubscription: 12.4,
  rating: 4,
  anchorAvailable: true,
  source: { name: 'InvestorGain', url: 'https://example.com/acme', observedAt: NOW.toISOString() },
  updatedAt: NOW.toISOString(),
  research: null,
};

function ipo(overrides: Partial<IpoRecord> = {}): IpoRecord {
  return { ...normalizeIpo(row)!, ...overrides };
}

describe('normalizeIpo', () => {
  it('reads the server row into the app shape', () => {
    const parsed = normalizeIpo(row)!;
    expect(parsed).toMatchObject({
      id: '66f0aa',
      companyName: 'Acme Cables Ltd',
      issueType: 'mainboard',
      status: 'open',
      priceMax: 568,
      rating: 4,
      sourceUrl: 'https://example.com/acme',
      research: null,
    });
  });

  it('drops a row without an id or a name, and never lets bad numbers through', () => {
    expect(normalizeIpo({ ...row, id: '' })).toBeNull();
    expect(normalizeIpo({ ...row, companyName: null })).toBeNull();
    const parsed = normalizeIpo({
      ...row,
      gmp: 'n/a',
      rating: 0,
      status: 'weird',
      issueType: 'SME',
    })!;
    expect(parsed.gmp).toBeNull();
    expect(parsed.rating).toBeNull();
    expect(parsed.status).toBe('unknown');
    expect(parsed.issueType).toBe('sme');
  });

  it('keeps only report summaries with a known status', () => {
    const parsed = normalizeIpo({
      ...row,
      research: {
        preListing: {
          status: 'ready',
          composite: 72,
          verdict: 'favourable',
          headline: 'H',
          generatedAt: null,
        },
        postListing: { status: 'bogus' },
      },
    })!;
    expect(parsed.research?.preListing?.composite).toBe(72);
    expect(parsed.research?.postListing).toBeNull();
  });
});

describe('normalizeIpoList', () => {
  it('counts what it can and falls back to the rows it kept', () => {
    const list = normalizeIpoList({ items: [row, { id: 'x' }], counts: { open: 1 } });
    expect(list.items).toHaveLength(1);
    expect(list.counts).toMatchObject({ all: 1, open: 1, upcoming: null });
  });

  it('survives a payload with nothing in it', () => {
    expect(normalizeIpoList(null)).toEqual({
      items: [],
      counts: { all: 0, open: null, upcoming: null, closed: null, listed: null },
      updatedAt: null,
    });
  });
});

describe('normalizeGmpHistory', () => {
  it('keeps the observations that have a time', () => {
    expect(
      normalizeGmpHistory({
        history: [{ observedAt: 'a', gmp: 4 }, { gmp: 5 }, { observedAt: 'b', gmp: null }],
      }),
    ).toEqual([
      { observedAt: 'a', gmp: 4 },
      { observedAt: 'b', gmp: null },
    ]);
  });
});

describe('normalizeReports', () => {
  it('fills every array a report body renders, even when the server left them out', () => {
    const reports = normalizeReports({
      ipoId: '66f0aa',
      preListing: {
        status: 'ready',
        trigger: 'scheduled',
        content: {
          kind: 'pre-listing',
          verdict: 'mixed',
          composite: 55,
          quant: {},
          ai: { headline: 'H' },
        },
      },
      postListing: null,
      eligibility: {
        preListing: { available: true },
        postListing: { available: false, reason: 'Not yet' },
      },
      schedule: { schedulerEnabled: true },
    });
    const content = reports.preListing!.content!;
    expect(content.verdict).toBe('mixed');
    expect(content.quant.factors).toEqual([]);
    expect(content.evidence).toEqual([]);
    expect(content.ai?.strengths).toEqual([]);
    expect(content.ai?.redFlags).toEqual([]);
    expect(reports.postListing).toBeNull();
    expect(reports.eligibility.postListing).toEqual({ available: false, reason: 'Not yet' });
  });

  it('treats a body without its score breakdown as no content', () => {
    const reports = normalizeReports({
      preListing: { status: 'running', content: { verdict: 'mixed' } },
    });
    expect(reports.preListing?.status).toBe('running');
    expect(reports.preListing?.content).toBeNull();
  });
});

describe('IPO wording', () => {
  it('formats the issue figures', () => {
    expect(priceBand({ priceMin: 540, priceMax: 568 })).toBe('₹540–568');
    expect(priceBand({ priceMin: null, priceMax: 100 })).toBe('₹100');
    expect(priceBand({ priceMin: null, priceMax: null })).toBe('—');
    expect(gmpText(42)).toBe('+₹42');
    expect(gmpText(-6)).toBe('−₹6');
    expect(times(12.4)).toBe('12.40×');
    expect(times(null)).toBe('—');
  });

  it('says listing day in IST', () => {
    expect(listingWhen(istMidnight('2026-10-03'), NOW)).toBe('today');
    expect(listingWhen(istMidnight('2026-10-04'), NOW)).toBe('tomorrow');
    expect(listingWhen(istMidnight('2026-10-08'), NOW)).toBeNull();
    expect(listingWhen(null, NOW)).toBeNull();
  });

  it('words verdicts as a setup, never an instruction', () => {
    expect(verdictOf('pre-listing', 'favourable')).toEqual({
      word: 'Favourable setup',
      tone: 'ok',
    });
    expect(verdictOf('post-listing', 'wait').word).toBe('Wait for confirmation');
    expect(verdictOf('pre-listing', 'nonsense').word).toBe('Not enough data');
  });

  it('describes a row’s research, preferring the after-listing report', () => {
    expect(researchLine('pre-listing', null)).toBeNull();
    expect(
      researchLine('pre-listing', {
        status: 'running',
        composite: null,
        verdict: null,
        headline: null,
        generatedAt: null,
      }),
    ).toEqual({ text: 'Report being prepared…', tone: 'info' });
    const both = ipo({
      research: {
        preListing: {
          status: 'ready',
          composite: 70,
          verdict: 'favourable',
          headline: null,
          generatedAt: null,
        },
        postListing: {
          status: 'ready',
          composite: 41,
          verdict: 'wait',
          headline: null,
          generatedAt: null,
        },
      },
    });
    expect(rowResearch(both)?.text).toBe('Entry 41 · Wait for confirmation');
  });

  it('reports how the score moved since the last report', () => {
    const previous = { composite: 60, generatedAt: '2026-10-03T12:02:00.000Z' };
    expect(scoreChange(64, previous)).toBe('+4 since 17:32 IST');
    expect(scoreChange(60, previous)).toBe('Unchanged since 17:32 IST');
    expect(scoreChange(null, previous)).toBeNull();
  });

  it('explains when each report is prepared', () => {
    const reports = {
      schedule: {
        preListingDueBy: '2026-10-07T15:30:00.000Z',
        postListingFrom: '2026-10-08T04:35:00.000Z',
        schedulerEnabled: true,
      },
    };
    expect(scheduleLine(reports, 'pre-listing', NOW)).toBe(
      'Prepared automatically on the listing eve — ready by 21:00 IST, Wed, 7 Oct.',
    );
    expect(scheduleLine(reports, 'post-listing', NOW)).toMatch(
      /^Prepared automatically on listing day/,
    );
  });
});

describe('ipoNextDays', () => {
  it('puts each issue on the IST day it lists, closes or opens — listings first', () => {
    const closing = ipo({ id: 'a', companyName: 'Beta', closeDate: istMidnight('2026-10-03') });
    const listing = ipo({
      id: 'b',
      companyName: 'Zeta',
      openDate: null,
      closeDate: null,
      listingDate: istMidnight('2026-10-03'),
    });
    const opening = ipo({
      id: 'c',
      companyName: 'Alpha',
      openDate: istMidnight('2026-10-05'),
      closeDate: null,
      listingDate: null,
    });
    const days = ipoNextDays([closing, listing, opening], NOW);
    expect(days.map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Monday']);
    expect(days[0]!.events.map((e) => `${e.kind}:${e.ipo.id}`)).toEqual(['lists:b', 'closes:a']);
    expect(days[2]!.events.map((e) => e.ipo.id)).toEqual(['c']);
    expect(eventLine('opens', 'Monday')).toBe('Opens on Monday');
    expect(eventLine('lists', 'Today')).toBe('Lists today');
  });
});

describe('verifiedCategories', () => {
  it('shows only the figures a report verified against a source', () => {
    const sub = {
      qib: 112.4,
      nii: 61.2,
      retail: 9.4,
      employee: 4.1,
      total: 48.2,
      verified: ['qib', 'nii', 'retail', 'total'],
      unverified: ['employee'],
      stale: ['nii'],
    };
    expect(verifiedCategories(sub)).toEqual([
      ['QIB', 112.4],
      ['Retail', 9.4],
      ['Total', 48.2],
    ]);
    expect(verifiedCategories(sub, false).map(([label]) => label)).toEqual(['QIB', 'Retail']);
    expect(verifiedCategories(null)).toEqual([]);
  });
});
