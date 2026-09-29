import {
  DAILY_BRIEF_SECTIONS,
  normalizeAudio,
  normalizeBrief,
  normalizeDates,
  normalizePreferences,
  num,
} from '../lib/normalize';

const meta = {
  source: 'feed',
  timestamp: '2026-09-28T09:40:00.000Z',
  isDelayed: false,
  availability: 'live',
};

/** A brief as today's server builds it (daily-brief.service.ts buildBrief). */
const fullBrief = {
  date: '2026-09-28',
  generatedAt: '2026-09-28T10:00:00.000Z',
  marketStatus: 'OPEN',
  title: 'Live Market Brief',
  riskProfile: 'moderate',
  stale: false,
  partialFailures: [],
  unavailableSources: [{ key: 'calendar', label: 'Economic calendar', reason: 'No provider.' }],
  summary: { bias: 'Positive', text: 'Breadth is firm.', source: 'calculated' },
  sentiment: {
    score: 62,
    label: 'Positive',
    breadthRatio: 1.42,
    factors: [{ label: 'Market breadth', value: '1.42 : 1' }],
    caveat: 'Not a forecast.',
  },
  indices: [
    {
      exchange: 'NSE',
      symbol: 'NIFTY',
      label: 'NIFTY 50',
      ltp: 24815.4,
      change: 120.5,
      changePct: 0.49,
      meta,
    },
  ],
  breadth: { advances: 300, declines: 200, unchanged: 10, unavailable: 0, ratio: 1.5, meta },
  sectors: [
    { name: 'IT', changePct: 1.2, advances: 8, declines: 2, breadthPct: 80, strength: 'Strong' },
  ],
  movers: {
    gainers: [
      {
        symbol: 'TCS',
        companyName: 'Tata Consultancy',
        exchange: 'NSE',
        ltp: 4100,
        changePct: 3.1,
      },
    ],
    losers: [],
    volume: [
      {
        symbol: 'SBIN',
        companyName: null,
        exchange: 'NSE',
        ltp: 800,
        changePct: -0.4,
        volume: 12_000_000,
      },
    ],
  },
  unusualActivity: [{ symbol: 'SBIN', signal: 'Ranked by volume; relative history unavailable.' }],
  derivatives: {
    available: false,
    meta: { ...meta, availability: 'unavailable', message: 'Chain down.' },
  },
  technicalRadar: {
    available: true,
    signals: [
      {
        id: 's1',
        symbol: 'INFY',
        exchange: 'NSE',
        screenerName: 'Breakout',
        action: 'BUY',
        conviction: 4,
        rationale: 'Closed above range.',
        invalidation: 'Close below 1500',
        hitRatePct: 58.2,
        sampleTrades: 41,
        avgReturnPct: 1.3,
        holdDays: 5,
      },
    ],
    meta,
  },
  portfolio: { available: false, contributors: [], meta },
  watchlist: {
    available: true,
    advancing: 3,
    declining: 1,
    averageChangePct: 0.8,
    attention: [],
    meta,
  },
  news: [
    {
      id: 'n1',
      title: 'RBI holds rates',
      source: 'ET',
      link: 'https://example.com/a',
      publishedAt: '2026-09-28T04:00:00.000Z',
      sentiment: 'Positive',
      effectivenessScore: 71,
      symbol: null,
      analysisAvailable: true,
    },
  ],
  ai: null,
  aiStatus: 'not-generated',
  aiStale: false,
};

describe('normalizeBrief', () => {
  it('keeps a well-formed brief intact', () => {
    const brief = normalizeBrief(fullBrief);
    expect(brief.title).toBe('Live Market Brief');
    expect(brief.marketStatus).toBe('OPEN');
    expect(brief.indices[0]).toMatchObject({ name: 'NIFTY 50', ltp: 24815.4, changePct: 0.49 });
    expect(brief.movers.volume[0]?.volume).toBe(12_000_000);
    expect(brief.movers.gainers[0]?.volume).toBeNull();
    expect(brief.volumeNote).toBe('Ranked by volume; relative history unavailable.');
    expect(brief.technicalRadar.available).toBe(true);
    expect(brief.derivatives).toMatchObject({ available: false, spot: null });
    expect(brief.derivatives.meta.message).toBe('Chain down.');
    expect(brief.news[0]).toMatchObject({ id: 'n1', analysisAvailable: true, symbol: null });
  });

  it('fills every section when a stored snapshot predates them', () => {
    const brief = normalizeBrief({ date: '2026-09-20', title: 'Closing Brief' });
    expect(brief.indices).toEqual([]);
    expect(brief.sectors).toEqual([]);
    expect(brief.movers).toEqual({ gainers: [], losers: [], volume: [] });
    expect(brief.technicalRadar).toMatchObject({ available: false, signals: [] });
    expect(brief.portfolio.contributors).toEqual([]);
    expect(brief.watchlist.attention).toEqual([]);
    expect(brief.news).toEqual([]);
    expect(brief.ai).toBeNull();
    expect(brief.sentiment).toMatchObject({ score: null, label: 'Unavailable', factors: [] });
    expect(brief.breadth).toMatchObject({ advances: 0, declines: 0, ratio: null });
    expect(brief.marketStatus).toBe('CLOSED');
  });

  it('survives a null or non-object payload', () => {
    expect(normalizeBrief(null).title).toBe('Daily Brief');
    expect(normalizeBrief('oops').indices).toEqual([]);
  });

  it('reports a radar with no signals as unavailable', () => {
    const brief = normalizeBrief({
      ...fullBrief,
      technicalRadar: { available: true, signals: [], meta },
    });
    expect(brief.technicalRadar.available).toBe(false);
  });

  it('drops rows it cannot show and coerces bad numbers to null', () => {
    const brief = normalizeBrief({
      ...fullBrief,
      indices: [{ symbol: '' }, { symbol: 'SENSEX', ltp: 'NaN', changePct: '0.31' }],
      sectors: [
        { name: 'Bank', changePct: null },
        { name: 'Auto', changePct: -0.5 },
      ],
    });
    expect(brief.indices).toHaveLength(1);
    expect(brief.indices[0]).toMatchObject({ name: 'SENSEX', ltp: null, changePct: 0.31 });
    expect(brief.sectors.map((row) => row.name)).toEqual(['Auto']);
  });

  it('parses an AI analysis and keeps unknown actions safe', () => {
    const brief = normalizeBrief({
      ...fullBrief,
      aiStatus: 'ready',
      ai: {
        marketBias: 'POSITIVE',
        conviction: 3,
        summary: 'Evidence suggests a firm session.',
        supportingFactors: [{ factor: 'Breadth', explanation: 'Advances lead.' }],
        riskFactors: ['Global cues are unavailable.'],
        attention: [
          {
            symbol: null,
            title: 'Breadth widening',
            whatHappened: 'x',
            whyItMatters: 'y',
            risk: 'z',
          },
        ],
        provider: 'openai',
        model: 'gpt',
        caveat: 'Ordinal.',
      },
      technicalRadar: { available: true, signals: [{ symbol: 'X', action: 'HOLD' }], meta },
    });
    expect(brief.ai?.conviction).toBe(3);
    expect(brief.ai?.attention[0]?.symbol).toBeNull();
    expect(brief.technicalRadar.signals[0]).toMatchObject({ action: 'WATCH', id: 'X:0' });
  });
});

describe('normalizePreferences', () => {
  it('appends sections a stored order predates, as the server does', () => {
    const prefs = normalizePreferences({
      riskProfile: 'aggressive',
      audioEnabled: false,
      visibleSections: ['news', 'summary'],
      sectionOrder: ['news', 'summary'],
      preferredIndices: ['NIFTY 50'],
      preferredSectors: [],
    });
    expect(prefs.riskProfile).toBe('aggressive');
    expect(prefs.audioEnabled).toBe(false);
    expect(prefs.visibleSections).toEqual(['news', 'summary']);
    expect(prefs.sectionOrder.slice(0, 2)).toEqual(['news', 'summary']);
    expect(prefs.sectionOrder).toHaveLength(DAILY_BRIEF_SECTIONS.length);
  });

  it('ignores unknown sections and never leaves nothing visible', () => {
    const prefs = normalizePreferences({ visibleSections: ['bogus'], sectionOrder: ['bogus'] });
    expect(prefs.visibleSections).toEqual([...DAILY_BRIEF_SECTIONS]);
    expect(prefs.riskProfile).toBe('moderate');
    expect(prefs.audioEnabled).toBe(true);
  });
});

describe('small parsers', () => {
  it('num accepts finite numbers and numeric strings only', () => {
    expect(num(1.5)).toBe(1.5);
    expect(num('2.25')).toBe(2.25);
    expect(num('')).toBeNull();
    expect(num(Infinity)).toBeNull();
    expect(num(null)).toBeNull();
  });

  it('normalizeDates keeps valid day keys only', () => {
    expect(normalizeDates({ dates: ['2026-09-27', 'nope', 5] })).toEqual(['2026-09-27']);
    expect(normalizeDates(null)).toEqual([]);
  });

  it('normalizeAudio trims the transcript', () => {
    expect(normalizeAudio({ date: 'd', version: 'v', transcript: '  Hi.  ' }).transcript).toBe(
      'Hi.',
    );
  });
});
