import { DIRECTORY, FLOWS, SCHEDULES } from '@/features/agents/lib/docs';
import { mobileHrefFor } from '@/features/agents/lib/links';
import {
  countsOf,
  hostOf,
  normalizeAskResult,
  normalizeBook,
  normalizeHolding,
  normalizePortfolioReview,
  normalizeResearchDetail,
  normalizeResearchPage,
  normalizeReviewResult,
  normalizeRunResult,
  normalizeSummary,
} from '@/features/agents/lib/normalize';
import {
  answerBlocks,
  bookLine,
  bookView,
  BROKER_WORD,
  brokersLabel,
  canToggleReview,
  credibilityWord,
  detailSources,
  duration,
  holdingReturnPct,
  holdingState,
  indexStatus,
  inlineParts,
  isActiveJob,
  jobView,
  levelsOf,
  outcomeView,
  portfolioStatus,
  proposalLabel,
  recentChanges,
  researchStatus,
  runNowMessage,
  signedRupees,
  summaryPollMs,
  toneOf,
  trailCells,
  validateResearch,
  VERDICT,
  visibleHoldings,
} from '@/features/agents/lib/view';
import type { HoldingSummary } from '@/features/agents/types';

const AT = '2026-10-05T08:00:00.000Z';

/** A review as the current server writes it — with the analyst note. */
const fullResult = {
  action: 'CONSIDER_ADD',
  exchange: 'NSE',
  symbol: 'INFY',
  asOf: AT,
  thesis: 'Margins are recovering on large deal wins.',
  bullCase: ['Deal pipeline at a record', ''],
  bearCase: ['Discretionary spend still soft'],
  whatWouldChangeMind: ['A guidance cut'],
  riskNotes: ['Currency'],
  horizon: 'months',
  evidenceQuality: 'adequate',
  research: {
    summary: 'Three filings and two news reports agree.',
    sources: [
      { url: 'https://www.nseindia.com/a', title: 'Filing', publishedAt: AT },
      { url: 'javascript:alert(1)', title: 'Bad', publishedAt: null },
    ],
    findings: [
      { claim: 'Q2 revenue grew 4%', confidence: 'high', urls: ['https://x.com/1', 'ftp://no'] },
      { claim: '', confidence: 'high', urls: [] },
    ],
    openQuestions: ['Attrition trend'],
  },
  limitations: ['No transcript read'],
  conviction: 'medium',
  riskLevel: 'moderate',
  executiveSummary: 'Accumulate on dips.',
  technicalView: { stance: 'bullish', summary: 'Above both averages.' },
  fundamentalView: { summary: 'Cash-rich.' },
  newsFlow: { tone: 'mixed', summary: 'Mixed.' },
  positionView: 'A 12% weight — already large.',
  actionPlan: ['Add below ₹1,400'],
  catalysts: ['Results on 16 Oct'],
  levels: {
    lastPrice: 1480,
    averagePrice: 1300,
    support: 1420,
    resistance: 1520,
    sma20: 1460,
    sma50: 1440,
  },
};

const evidence = {
  companyName: 'Infosys Ltd',
  holding: {
    quantity: 10,
    averagePrice: 1300,
    lastPrice: 1480,
    invested: 13000,
    value: 14800,
    portfolioWeightPct: 12,
  },
  technical: {
    trend: 'up',
    rsi14: 61.2,
    sma20: 1460,
    sma50: 1440,
    return20dPct: 3.1,
    volumeRatio20: 1.2,
    high20: 1520,
    low20: 1420,
    patternNotes: ['Higher lows'],
  },
  news: [
    { title: 'Deal win', url: 'https://news.example/x', publishedAt: AT, sentiment: 'Positive' },
  ],
  dataWarnings: [],
};

const holdingRow = {
  key: 'NSE:INFY',
  exchange: 'NSE',
  symbol: 'INFY',
  companyName: 'Infosys Ltd',
  current: { id: 'r1', at: AT, asOf: AT, action: 'CONSIDER_ADD', result: fullResult, evidence },
  inFlight: null,
  lastFailure: null,
  lastChange: { from: 'HOLD', to: 'CONSIDER_ADD', at: AT },
  changed: true,
  history: [
    { slot: 3, at: AT, status: 'COMPLETED', action: 'CONSIDER_ADD' },
    { slot: 2, at: AT, status: 'FAILED', action: null },
    { slot: 1, at: AT, status: 'COMPLETED', action: 'HOLD' },
  ],
};

function holding(overrides: Partial<HoldingSummary> = {}): HoldingSummary {
  return { ...normalizeHolding(holdingRow)!, ...overrides };
}

describe('normalizeReviewResult', () => {
  it('reads the analyst note and drops unusable sources, findings and blanks', () => {
    const r = normalizeReviewResult(fullResult)!;
    expect(r.action).toBe('CONSIDER_ADD');
    expect(r.bullCase).toEqual(['Deal pipeline at a record']);
    expect(r.research.sources).toHaveLength(1);
    expect(r.research.findings).toEqual([
      { claim: 'Q2 revenue grew 4%', confidence: 'high', urls: ['https://x.com/1'] },
    ]);
    expect(r.conviction).toBe('medium');
    expect(r.technicalView).toEqual({ stance: 'bullish', summary: 'Above both averages.' });
    expect(r.levels?.support).toBe(1420);
  });

  it('leaves the analyst-note sections empty on an older review', () => {
    const old = normalizeReviewResult({
      action: 'HOLD',
      thesis: 'Fine.',
      bullCase: [],
      bearCase: [],
      whatWouldChangeMind: [],
      riskNotes: [],
      horizon: 'weeks',
      evidenceQuality: 'limited',
      research: { summary: '', sources: [], findings: [], openQuestions: [] },
      limitations: [],
    })!;
    expect(old.executiveSummary).toBeNull();
    expect(old.technicalView).toBeNull();
    expect(old.newsFlow).toBeNull();
    expect(old.actionPlan).toEqual([]);
    expect(old.levels).toBeNull();
    expect(old.research.summary).toBeNull();
  });

  it('refuses a result without a known verdict', () => {
    expect(normalizeReviewResult({ action: 'BUY' })).toBeNull();
    expect(normalizeReviewResult(null)).toBeNull();
  });
});

describe('normalizePortfolioReview', () => {
  it('reads the response and keeps the server counts', () => {
    const data = normalizePortfolioReview({
      settings: { enabled: true, lastError: null },
      ready: true,
      readinessReason: null,
      cadenceMinutes: 60,
      broker: 'groww',
      windowDays: 14,
      pendingDeadlineMinutes: 60,
      holdings: [holdingRow, { symbol: '' }, null],
      counts: {
        holdings: 1,
        withVerdict: 1,
        byAction: { CONSIDER_ADD: 1 },
        changed: 1,
        inFlight: 0,
        failed: 0,
        adequateEvidencePct: 100,
        latestAt: AT,
      },
      note: 'Research only.',
    });
    expect(data.enabled).toBe(true);
    expect(data.holdings).toHaveLength(1);
    expect(data.counts.byAction).toEqual({
      CONSIDER_ADD: 1,
      HOLD: 0,
      CONSIDER_SELL: 0,
      NEEDS_REVIEW: 0,
    });
    expect(data.pendingDeadlineMinutes).toBe(60);
  });

  it('computes counts when an older server sends none, and survives an empty body', () => {
    const data = normalizePortfolioReview({ settings: {}, holdings: [holdingRow] });
    expect(data.counts.withVerdict).toBe(1);
    expect(data.counts.changed).toBe(1);
    expect(data.counts.adequateEvidencePct).toBe(100);
    expect(data.pendingDeadlineMinutes).toBeNull();
    const empty = normalizePortfolioReview(undefined);
    expect(empty.holdings).toEqual([]);
    expect(empty.enabled).toBe(false);
    expect(empty.counts).toEqual(countsOf([]));
  });

  it('derives the key and company name when missing', () => {
    const h = normalizeHolding({ symbol: 'TCS', exchange: 'BSE', current: null })!;
    expect(h.key).toBe('BSE:TCS');
    expect(h.current).toBeNull();
    expect(holding().companyName).toBe('Infosys Ltd');
  });
});

describe('normalizeRunResult / normalizeAskResult', () => {
  it('reads counts and the reason', () => {
    expect(normalizeRunResult({ submitted: 3, skipped: 1, reason: null })).toEqual({
      submitted: 3,
      skipped: 1,
      failed: 0,
      reason: null,
    });
  });

  it('needs a job id', () => {
    expect(normalizeAskResult({ jobId: 'JOB-1', status: 'PENDING' })).toEqual({
      jobId: 'JOB-1',
      status: 'PENDING',
    });
    expect(() => normalizeAskResult({})).toThrow();
  });
});

describe('research normalizers', () => {
  it('reads a page, defaulting the requester and dropping rows without a job id', () => {
    const page = normalizeResearchPage({
      ready: true,
      items: [
        { jobId: 'JOB-A', status: 'completed', query: 'q', findings: 3, sources: 5, createdAt: AT },
        { status: 'RUNNING' },
      ],
      stats: { runs: 1, completed: 1, medianDurationMs: 48000 },
      nextBefore: AT,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.status).toBe('COMPLETED');
    expect(page.items[0]?.requester).toEqual({
      kind: 'api',
      label: 'API client',
      detail: null,
      to: null,
    });
    expect(page.stats.medianDurationMs).toBe(48000);
    expect(page.nextBefore).toBe(AT);
  });

  it('reads a detail with its result and pages read', () => {
    const detail = normalizeResearchDetail(
      {
        jobId: 'JOB-A',
        query: 'q',
        status: 'COMPLETED',
        progress: { stage: 'done', percent: 100 },
        error: null,
        result: {
          answer: 'A [S1].',
          summary: 'S',
          keyFindings: [
            {
              claim: 'C',
              confidence: 'medium',
              modelConfidence: 'high',
              corroboration: 2,
              unverifiedNumbers: ['4%'],
              sources: [{ ref: 'S1', url: 'https://a.com/x', title: null, domain: 'a.com' }],
            },
          ],
          rejectedClaims: [{ claim: 'R', reason: 'no source' }],
          sources: [
            {
              ref: 'S1',
              url: 'https://a.com/x',
              title: 'A',
              domain: 'a.com',
              credibility: 80,
              cited: true,
            },
            {
              ref: 'S2',
              url: 'https://b.com/y',
              title: 'B',
              domain: 'b.com',
              credibility: 90,
              cited: false,
            },
          ],
          openQuestions: [],
          stats: {
            modelTurns: 5,
            searches: 2,
            pagesFetched: 4,
            pagesFailed: 1,
            durationMs: 60000,
            model: 'm',
          },
          generatedAt: AT,
        },
        sources: [
          {
            ref: 'S2',
            url: 'https://b.com/y',
            domain: 'b.com',
            excerpt: 'Excerpt',
            credibility: 90,
          },
        ],
        requester: { kind: 'ipo', label: 'IPO report', detail: 'Acme', to: '/ipo/66f#research' },
      },
      'JOB-A',
    );
    expect(detail.result?.keyFindings[0]?.unverifiedNumbers).toEqual(['4%']);
    expect(detail.result?.stats?.pagesFailed).toBe(1);
    expect(detail.requester.kind).toBe('ipo');
    const sources = detailSources(detail);
    expect(sources.map((s) => s.ref)).toEqual(['S1', 'S2']);
    expect(sources[1]?.excerpt).toBe('Excerpt');
  });

  it('survives a failed run with no result', () => {
    const detail = normalizeResearchDetail(
      { status: 'FAILED', error: { message: 'boom' } },
      'JOB-X',
    );
    expect(detail.jobId).toBe('JOB-X');
    expect(detail.result).toBeNull();
    expect(detail.error?.message).toBe('boom');
  });
});

describe('normalizeSummary', () => {
  it('reads an admin hub', () => {
    const s = normalizeSummary({
      admin: true,
      indexTrading: {
        settings: { enabled: true, mode: 'live', cadenceMinutes: 5 },
        today: { entries: 2, net: -310.4 },
        month: { closed: 9, net: 1240, winRate: 55.5 },
        open: 1,
        attention: 0,
        latestRun: { at: AT, outcome: 'hold', reason: 'outside the entry window', action: null },
        scansToday: 40,
      },
      portfolio: { enabled: false, lastError: null, ready: true, counts: { holdings: 3 } },
      research: {
        ready: true,
        error: null,
        stats: { runs: 4, running: 1 },
        latest: { query: 'q', at: AT },
      },
      activity: [
        {
          agent: 'portfolio',
          at: AT,
          title: 'Reviewed 3 holdings',
          detail: null,
          tone: 'ok',
          to: '/agents/portfolio',
        },
        { agent: 'unknown', at: AT, title: 'x', tone: 'ok', to: '/' },
      ],
    });
    expect(s.indexTrading?.mode).toBe('live');
    expect(s.indexTrading?.today.net).toBe(-310.4);
    expect(s.indexTrading?.latestRun?.outcome).toBe('hold');
    expect(s.portfolio.counts.holdings).toBe(3);
    expect(s.research?.stats.running).toBe(1);
    expect(s.activity).toHaveLength(1);
  });

  it('leaves the admin-only parts null for everyone else', () => {
    const s = normalizeSummary({ admin: false, indexTrading: null, research: null, portfolio: {} });
    expect(s.indexTrading).toBeNull();
    expect(s.research).toBeNull();
    expect(s.activity).toEqual([]);
  });
});

describe('mobileHrefFor', () => {
  it.each([
    [
      '/agents/index-trading?tab=decisions',
      { pathname: '/agents/index-trading', params: { tab: 'decisions' } },
    ],
    [
      '/agents/index-trading?tab=trades',
      { pathname: '/agents/index-trading', params: { tab: 'trades' } },
    ],
    ['/agents/index-trading?tab=nonsense', '/agents/index-trading'],
    ['/agents/index-trading', '/agents/index-trading'],
    ['/agents/portfolio', '/agents/portfolio'],
    [
      '/agents/portfolio?holding=NSE%3AINFY',
      { pathname: '/holding-review/[key]', params: { key: 'NSE:INFY' } },
    ],
    [
      '/agents/web-research?run=JOB-01ABCDEF2',
      { pathname: '/research/[jobId]', params: { jobId: 'JOB-01ABCDEF2' } },
    ],
    [
      '/agents/web-research?job=JOB-9',
      { pathname: '/research/[jobId]', params: { jobId: 'JOB-9' } },
    ],
    ['/agents/web-research', '/agents/web-research'],
    ['/agents/docs', '/agents/docs'],
    ['/agents', '/agents'],
    ['/ipo/66f0aa#research', { pathname: '/ipo/[id]', params: { id: '66f0aa' } }],
    ['/ipo/a%20b', { pathname: '/ipo/[id]', params: { id: 'a b' } }],
  ])('%s', (to, expected) => {
    expect(mobileHrefFor(to)).toEqual(expected);
  });

  it.each([
    null,
    undefined,
    '',
    '/analysis/INFY',
    '/agents/unknown',
    '/agents/portfolio/extra',
    'https://evil.example/agents/portfolio',
    '//evil.example/agents',
    '/ipo',
    '/ipo/%E0%A4%A',
  ])('%s → not tappable', (to) => {
    expect(mobileHrefFor(to)).toBeNull();
  });
});

describe('portfolio view helpers', () => {
  it('words and colours every verdict; Hold is never red', () => {
    expect(VERDICT.CONSIDER_ADD.label).toBe('Accumulate');
    expect(VERDICT.CONSIDER_SELL.label).toBe('Reduce');
    expect(VERDICT.HOLD.color).not.toBe('danger');
    expect(VERDICT.NEEDS_REVIEW.outlined).toBe(true);
  });

  it('says why a holding has no verdict', () => {
    expect(holdingState(holding())).toEqual({ kind: 'verdict', action: 'CONSIDER_ADD' });
    expect(
      holdingState(holding({ current: null, inFlight: { status: 'PENDING', at: AT } })),
    ).toEqual({
      kind: 'reviewing',
    });
    expect(holdingState(holding({ current: null, lastFailure: { at: AT, error: null } }))).toEqual({
      kind: 'failed',
    });
    expect(holdingState(holding({ current: null }))).toEqual({ kind: 'none' });
  });

  it('sorts by weight and filters by verdict or change', () => {
    const big = holding();
    const small = holding({ key: 'NSE:ABB', symbol: 'ABB', changed: false, current: null });
    expect(visibleHoldings([small, big], 'all').map((h) => h.symbol)).toEqual(['INFY', 'ABB']);
    expect(visibleHoldings([small, big], 'changed').map((h) => h.symbol)).toEqual(['INFY']);
    expect(visibleHoldings([small, big], 'HOLD')).toEqual([]);
    expect(recentChanges([small, big]).map((h) => h.symbol)).toEqual(['INFY']);
  });

  it('falls back to measured levels on an older review', () => {
    const r = normalizeReviewResult({ ...fullResult, levels: undefined })!;
    const ev = holding().current?.evidence ?? null;
    expect(levelsOf(r, ev)).toEqual({
      lastPrice: 1480,
      averagePrice: 1300,
      support: 1420,
      resistance: 1520,
      sma20: 1460,
      sma50: 1440,
    });
    expect(levelsOf(r, null)).toBeNull();
  });

  it('computes the return on cost', () => {
    expect(holdingReturnPct(1300, 1480)).toBe(13.85);
    expect(holdingReturnPct(0, 10)).toBeNull();
    expect(holdingReturnPct(null, 10)).toBeNull();
  });

  it('draws the trail oldest first with gaps for no verdict', () => {
    expect(trailCells(holding().history).map((c) => c.label)).toEqual([
      'Hold',
      'Failed',
      'Accumulate',
    ]);
  });

  it('turns the run result into a toast', () => {
    expect(runNowMessage({ submitted: 3, skipped: 0, failed: 0, reason: null }).tone).toBe(
      'success',
    );
    expect(runNowMessage({ submitted: 2, skipped: 0, failed: 1, reason: null }).message).toMatch(
      /1 holding could not be submitted/,
    );
    expect(runNowMessage({ submitted: 0, skipped: 0, failed: 2, reason: null }).tone).toBe('error');
    expect(
      runNowMessage({
        submitted: 0,
        skipped: 0,
        failed: 0,
        reason: 'No Groww equity holdings found',
      }),
    ).toEqual({
      tone: 'info',
      title: 'Nothing new to review',
      message: 'No Groww equity holdings found',
    });
    expect(runNowMessage({ submitted: 0, skipped: 4, failed: 0, reason: null }).message).toMatch(
      /4 holdings already being reviewed/,
    );
  });

  it('only turns the switch on while ready, and never while saving', () => {
    expect(canToggleReview(false, false, false)).toBe(false);
    expect(canToggleReview(false, true, false)).toBe(true);
    expect(canToggleReview(true, false, false)).toBe(true);
    expect(canToggleReview(true, true, true)).toBe(false);
  });
});

describe('research view helpers', () => {
  it('labels job states', () => {
    expect(jobView('RUNNING')).toEqual({ label: 'Researching', tone: 'info' });
    expect(jobView('FAILED').tone).toBe('bad');
    expect(jobView('WEIRD').label).toBe('Weird');
    expect(isActiveJob('PENDING')).toBe(true);
    expect(isActiveJob('COMPLETED')).toBe(false);
    expect(credibilityWord(72)).toBe('High');
    expect(credibilityWord(50)).toBe('Medium');
    expect(credibilityWord(10)).toBe('Low');
    expect(credibilityWord(null)).toBe('—');
  });

  it('mirrors the server validation', () => {
    const base = {
      query: '  ab ',
      depth: 'standard' as const,
      timeRange: '' as const,
      instructions: '',
    };
    expect(validateResearch(base)).toMatchObject({ ok: false, field: 'query' });
    expect(validateResearch({ ...base, query: 'x'.repeat(501) })).toMatchObject({ ok: false });
    expect(
      validateResearch({ ...base, query: 'What changed?', instructions: 'y'.repeat(1001) }),
    ).toMatchObject({ ok: false, field: 'instructions' });
    expect(validateResearch({ ...base, query: ' What changed? ', timeRange: 'week' })).toEqual({
      ok: true,
      payload: { query: 'What changed?', depth: 'standard', timeRange: 'week' },
    });
    expect(
      validateResearch({ ...base, query: 'What changed?', instructions: '  prefer filings ' }),
    ).toEqual({
      ok: true,
      payload: { query: 'What changed?', depth: 'standard', instructions: 'prefer filings' },
    });
  });

  it('splits an answer into blocks with references', () => {
    expect(inlineParts('Up 4% [S1] and 【2†L3】 **bold**')).toEqual([
      { text: 'Up 4% ' },
      { ref: 'S1' },
      { text: ' and ' },
      { ref: 'S2' },
      { text: ' bold' },
    ]);
    const blocks = answerBlocks('# Title\n\nPara one\nstill one [S1]\n\n- a\n- b\n1. c');
    expect(blocks.map((b) => b.kind)).toEqual(['h', 'p', 'ul', 'ol']);
    expect(blocks[1]).toEqual({
      kind: 'p',
      parts: [{ text: 'Para one still one ' }, { ref: 'S1' }],
    });
  });

  it('reads a host from a URL', () => {
    expect(hostOf('https://www.Example.com/a?b')).toBe('example.com');
    expect(hostOf('not a url')).toBe('not a url');
  });
});

describe('hub helpers', () => {
  const index = normalizeSummary({
    indexTrading: {
      settings: { enabled: true, mode: 'paper', cadenceMinutes: 5 },
      today: {},
      month: {},
      attention: 0,
    },
  }).indexTrading!;

  it('gives each agent card a status', () => {
    expect(indexStatus(index)).toEqual({ tone: 'ok', label: 'Armed · paper' });
    expect(indexStatus({ ...index, attention: 2 })).toEqual({
      tone: 'bad',
      label: '2 entries need review',
    });
    expect(indexStatus({ ...index, enabled: false })).toEqual({ tone: 'neutral', label: 'Off' });
    const portfolio = { enabled: true, lastError: null, ready: true, counts: countsOf([]) };
    expect(portfolioStatus(portfolio).tone).toBe('ok');
    expect(portfolioStatus({ ...portfolio, lastError: 'x' }).tone).toBe('warn');
    const research = {
      ready: true,
      error: null,
      stats: normalizeResearchPage({}).stats,
      latest: null,
    };
    expect(researchStatus(research)).toEqual({ tone: 'ok', label: 'Ready' });
    expect(researchStatus({ ...research, error: 'down' }).label).toBe('Unreachable');
    expect(researchStatus({ ...research, ready: false }).label).toBe('Not configured');
  });

  it('maps tones and outcomes; HOLD is neutral', () => {
    expect(toneOf('err')).toBe('bad');
    expect(toneOf('run')).toBe('info');
    expect(toneOf('idle')).toBe('neutral');
    expect(outcomeView('hold').tone).toBe('neutral');
    expect(proposalLabel({ action: 'BUY_PUT', underlying: 'BANKNIFTY' })).toBe(
      'Buy put · BANKNIFTY',
    );
    expect(proposalLabel({ action: null, underlying: null })).toBeNull();
  });

  it('formats money and spans', () => {
    expect(signedRupees(1240.4)).toBe('+₹1,240');
    expect(signedRupees(-310)).toBe('−₹310');
    expect(signedRupees(-0.4)).toBe('₹0');
    expect(signedRupees(null)).toBe('—');
    expect(duration(48_000)).toBe('48 s');
    expect(duration(190_000)).toBe('3 min 10 s');
    expect(duration(3_840_000)).toBe('1 h 4 min');
    expect(duration(-1)).toBe('—');
  });

  it('polls faster only while something runs', () => {
    const idle = normalizeSummary({});
    expect(summaryPollMs(idle)).toBe(120_000);
    expect(
      summaryPollMs({
        ...idle,
        portfolio: { ...idle.portfolio, counts: { ...idle.portfolio.counts, inFlight: 1 } },
      }),
    ).toBe(30_000);
    expect(summaryPollMs(undefined)).toBe(120_000);
  });
});

describe('docs content', () => {
  it('documents every workflow and agent', () => {
    expect(FLOWS.map((f) => f.key)).toEqual(['options', 'holdings', 'research']);
    expect(FLOWS.every((f) => f.steps.length > 0)).toBe(true);
    expect(new Set(DIRECTORY.map((d) => d.id)).size).toBe(5);
    expect(SCHEDULES).toHaveLength(3);
  });
});

describe('portfolio review across Groww and mStock', () => {
  it('reads each holding’s books, known ones only, Groww first', () => {
    expect(holding().brokers).toEqual([]);
    expect(
      normalizeHolding({ ...holdingRow, brokers: ['mstock', 'groww', 'zerodha'] })?.brokers,
    ).toEqual(['groww', 'mstock']);
    expect(normalizeHolding({ ...holdingRow, brokers: 'groww' })?.brokers).toEqual([]);
    expect(brokersLabel(['groww', 'mstock'])).toBe('Groww + mStock');
    expect(brokersLabel([])).toBeNull();
  });

  it('reads each book’s read status', () => {
    const data = normalizePortfolioReview({
      settings: {},
      holdings: [{ ...holdingRow, brokers: ['groww', 'mstock'] }],
      books: [
        { broker: 'groww', label: 'Groww', state: 'ok', error: null, holdings: 12, asOf: AT },
        {
          broker: 'mstock',
          label: 'mStock',
          state: 'error',
          error: 'mStock: session expired',
          holdings: 4,
          asOf: null,
        },
        { broker: 'kite', state: 'ok' },
        null,
      ],
      portfolioAsOf: AT,
      portfolioStale: true,
      portfolioError: 'mStock: session expired',
    });
    expect(data.books).toHaveLength(2);
    expect(data.books?.[0]).toEqual({
      broker: 'groww',
      label: 'Groww',
      state: 'ok',
      error: null,
      holdings: 12,
      asOf: AT,
    });
    // A book that was not read has no holding count, whatever was sent.
    expect(data.books?.[1]).toMatchObject({ state: 'error', holdings: null });
    expect(data.portfolioStale).toBe(true);
    expect(data.portfolioError).toBe('mStock: session expired');
    expect(data.holdings[0]?.brokers).toEqual(['groww', 'mstock']);
    expect(normalizeBook({ broker: 'MSTOCK', state: 'weird' })).toMatchObject({
      broker: 'mstock',
      label: 'mStock',
      state: 'error',
    });
  });

  it('tells an older (Groww-only) server apart from one with no books', () => {
    const older = normalizePortfolioReview({ settings: {}, holdings: [] });
    expect(older.books).toBeNull();
    expect(older.portfolioStale).toBe(false);
    expect(bookLine(older.books)).toBe('Groww equity holdings');
    expect(bookLine([])).toBe('No Groww or mStock account connected');
  });

  it('words the books line and each book', () => {
    const groww = {
      broker: 'groww',
      label: 'Groww',
      state: 'ok',
      error: null,
      holdings: 12,
      asOf: AT,
    } as const;
    const mstock = {
      broker: 'mstock',
      label: 'mStock',
      state: 'ok',
      error: null,
      holdings: 8,
      asOf: AT,
    } as const;
    expect(bookLine([groww, mstock])).toBe('Groww 12 · mStock 8 holdings');
    expect(bookLine([groww, { ...mstock, state: 'error', holdings: null }])).toBe(
      'Groww 12 · mStock unavailable holdings',
    );
    expect(bookLine([groww, { ...mstock, state: 'not-connected', holdings: null }])).toBe(
      'Groww 12 holdings',
    );
    expect(bookView(groww)).toEqual({ tone: 'ok', label: '12 holdings' });
    expect(bookView({ ...mstock, state: 'error' })).toEqual({
      tone: 'warn',
      label: 'Couldn’t be read',
    });
    expect(bookView({ ...mstock, state: 'not-connected' }).tone).toBe('neutral');
  });
});

describe('book names', () => {
  it('names both books', () => {
    expect(BROKER_WORD).toEqual({ groww: 'Groww', mstock: 'mStock' });
  });
});

describe('links into the backtest', () => {
  it('opens the Backtest tab', () => {
    expect(mobileHrefFor('/agents/index-trading?tab=backtest')).toEqual({
      pathname: '/agents/index-trading',
      params: { tab: 'backtest' },
    });
  });
});
