import {
  backtestTrade,
  botSettings,
  DEFAULT_NUMBERS,
  normalizeBacktest,
  normalizeDecisions,
  normalizeOverview,
  normalizeRunNow,
  normalizeStatus,
  normalizeTestScan,
  normalizeTrades,
  rawEdge,
  rawRun,
  runRow,
  runStage,
  trace,
  tradeRow,
  tradeStats,
} from '@/features/index-bot/lib/normalize';

const trade = {
  intentId: 'AT-1',
  day: '2026-10-05',
  mode: 'paper',
  underlying: 'NIFTY',
  tradingSymbol: 'NIFTY25OCT25000CE',
  kind: 'CE',
  lots: 1,
  quantity: 75,
  plannedEntry: 120,
  stop: 96,
  target: 156,
  rewardRisk: 1.5,
  entryPrice: 120.5,
  exitPrice: 156.2,
  exitPriceDerived: false,
  status: 'CLOSED',
  phase: 'closed',
  exitReason: 'target',
  gross: 2677.5,
  charges: 92.4,
  net: 2585.1,
  outcome: 'win',
  enteredAt: '2026-10-05T04:35:00.000Z',
  exitedAt: '2026-10-05T05:10:00.000Z',
  holdMinutes: 35,
  pnlSource: 'paper-estimate',
  reason: 'Futures up 0.6% on volume',
  edge: {
    samples: 48,
    wins: 26,
    observedWinRate: 54.17,
    wilsonLower95: 40.3,
    breakEvenRate: 33.1,
    expectedNetAtLowerBound: 210.5,
    allowed: true,
  },
  entryOrder: {
    id: 'O1',
    status: 'FILLED',
    price: 120.5,
    quantity: 75,
    at: '2026-10-05T04:35:00.000Z',
  },
  exitOrder: {
    id: 'O2',
    status: 'FILLED',
    price: 156.2,
    quantity: 75,
    at: '2026-10-05T05:10:00.000Z',
  },
  smartOrderStatus: null,
};

const stats = {
  entries: 3,
  closed: 2,
  open: 1,
  review: 0,
  rejected: 0,
  wins: 1,
  losses: 1,
  winRate: 50,
  gross: 1200,
  charges: 180,
  net: 1020,
  avgWin: 2585.1,
  avgLoss: -1565.1,
  profitFactor: 1.65,
  expectancy: 510,
  best: 2585.1,
  worst: -1565.1,
  maxDrawdown: 1565.1,
  avgHoldMinutes: 41,
  streak: { kind: 'win', length: 1 },
  exits: { target: 1, stop: 1, time: 0 },
};

const run = {
  id: '66f0aa000000000000000001',
  at: '2026-10-05T04:35:00.000Z',
  status: 'HOLD',
  outcome: 'hold',
  stage: 'checked',
  reason: 'Historical lower confidence bound does not clear costs and edge',
  group: { key: 'edge', label: 'No proven historical edge' },
  action: 'BUY_CALL',
  underlying: 'NIFTY',
  confidence: 64,
  edge: { ...trade.edge, allowed: false },
  debate: {
    decision: {
      action: 'BUY_CALL',
      underlying: 'NIFTY',
      stopPct: 20,
      targetPct: 30,
      confidence: 64,
      reason: 'Momentum',
    },
    bullish: {
      side: 'bull',
      underlying: 'NIFTY',
      conviction: 70,
      evidence: ['a', 7, 'b'],
      challenge: '',
      reason: 'Up',
    },
    bearish: null,
    rebuttal: 'junk',
  },
  jobId: null,
  mode: 'paper',
  trace: [
    { step: 'mode', ok: true, detail: 'Test mode', at: '2026-10-05T04:35:00.000Z' },
    { step: 'window', ok: null, detail: 'Outside the entry window' },
    { step: 'bad' },
    'junk',
  ],
};

describe('tradeRow', () => {
  it('keeps every field of a well-formed row', () => {
    const row = tradeRow(trade);
    expect(row).toMatchObject({
      intentId: 'AT-1',
      mode: 'paper',
      phase: 'closed',
      exitReason: 'target',
      net: 2585.1,
      pnlSource: 'paper-estimate',
      edge: { samples: 48, wilsonLower95: 40.3, allowed: true },
      entryOrder: { price: 120.5, status: 'FILLED' },
    });
  });

  it('drops a row without an id or a contract', () => {
    expect(tradeRow({ ...trade, intentId: '' })).toBeNull();
    expect(tradeRow({ ...trade, tradingSymbol: undefined })).toBeNull();
    expect(tradeRow('nope')).toBeNull();
  });

  it('reads unknown figures as null and an unknown phase as needing review', () => {
    const row = tradeRow({
      intentId: 'AT-2',
      tradingSymbol: 'BANKNIFTY25OCT52000PE',
      phase: 'weird',
      net: 'NaN',
      lots: Infinity,
      mode: 'something',
    });
    expect(row).toMatchObject({
      phase: 'review',
      net: null,
      lots: null,
      mode: 'paper',
      exitReason: null,
      edge: null,
      entryOrder: null,
      enteredAt: null,
    });
  });
});

describe('tradeStats', () => {
  it('reads a full stats block', () => {
    expect(tradeStats(stats)).toMatchObject({
      closed: 2,
      winRate: 50,
      net: 1020,
      streak: { kind: 'win', length: 1 },
      exits: { target: 1, stop: 1, time: 0 },
    });
  });

  it('defaults counts to zero and rates to null on an empty block', () => {
    const empty = tradeStats(undefined);
    expect(empty.closed).toBe(0);
    expect(empty.winRate).toBeNull();
    expect(empty.net).toBeNull();
    expect(empty.streak).toBeNull();
    expect(empty.exits).toEqual({ target: 0, stop: 0, time: 0 });
  });
});

describe('trace', () => {
  it('keeps well-formed steps; ok is true, false or null (noted)', () => {
    expect(trace(run.trace)).toEqual([
      { step: 'mode', ok: true, detail: 'Test mode', at: '2026-10-05T04:35:00.000Z' },
      { step: 'window', ok: null, detail: 'Outside the entry window', at: null },
    ]);
    expect(trace('nope')).toEqual([]);
  });
});

describe('runRow (agents analytics shape)', () => {
  it('reads the debate, edge and trace, dropping malformed arguments', () => {
    const view = runRow(run)!;
    expect(view.outcome).toBe('hold');
    expect(view.stage).toBe('checked');
    expect(view.group).toEqual({ key: 'edge', label: 'No proven historical edge' });
    expect(view.debate?.decision).toMatchObject({ action: 'BUY_CALL', stopPct: 20, targetPct: 30 });
    expect(view.debate?.bullish?.evidence).toEqual(['a', 'b']);
    expect(view.debate?.bearish).toBeNull();
    expect(view.debate?.rebuttal).toBeNull();
    expect(view.trace).toHaveLength(2);
    expect(view.dryRun).toBe(false);
  });

  it('derives the outcome from the status when the field is missing', () => {
    expect(runRow({ id: 'r', status: 'running' })?.outcome).toBe('running');
    expect(runRow({ id: 'r', status: 'ERROR' })?.outcome).toBe('error');
    expect(runRow({ id: 'r', status: 'HOLD' })?.outcome).toBe('hold');
    expect(runRow({ status: 'HOLD' })).toBeNull();
  });
});

describe('raw runs (the bot’s own rows, in fractions)', () => {
  const raw = {
    _id: '66f0aa000000000000000009',
    slot: -1,
    status: 'DRY_RUN',
    decision: {
      decision: {
        action: 'BUY_PUT',
        underlying: 'BANKNIFTY',
        stopPct: 0.2,
        targetPct: 0.3,
        confidence: 58,
        reason: 'Down',
      },
      bullish: { conviction: 40, evidence: [], challenge: '', reason: '' },
    },
    probability: {
      samples: 60,
      wins: 30,
      observedWinRate: 0.5,
      wilsonLower95: 0.3742,
      breakEvenRate: 0.31,
      expectedNetAtLowerBound: 88.456,
      allowed: true,
    },
    reason: 'Would buy 1 lot of BANKNIFTY…',
    mode: 'paper',
    dryRun: true,
    trace: [{ step: 'edge', ok: true, detail: 'ok', at: '2026-10-05T04:36:00.000Z' }],
    createdAt: '2026-10-05T04:35:00.000Z',
  };

  it('scales fractions to percent like the server’s analytics', () => {
    expect(rawEdge(raw.probability)).toEqual({
      samples: 60,
      wins: 30,
      observedWinRate: 50,
      wilsonLower95: 37.42,
      breakEvenRate: 31,
      expectedNetAtLowerBound: 88.46,
      allowed: true,
    });
  });

  it('derives stage and outcome, and keeps the test-scan flag', () => {
    const view = rawRun(raw)!;
    expect(view.id).toBe(raw._id);
    expect(view.at).toBe(raw.createdAt);
    expect(view.debate?.decision).toMatchObject({ stopPct: 20, targetPct: 30, action: 'BUY_PUT' });
    // Edge cleared, but a DRY_RUN is not an order.
    expect(view.stage).toBe('edge');
    expect(view.outcome).toBe('hold');
    expect(view.dryRun).toBe(true);
    expect(view.group).toBeNull();
  });

  it('places an order stage only for an intent status', () => {
    expect(rawRun({ ...raw, status: 'OPEN', dryRun: false })?.outcome).toBe('ordered');
    expect(rawRun({ ...raw, status: 'RUNNING' })?.outcome).toBe('running');
    expect(rawRun({ ...raw, status: 'ERROR' })?.outcome).toBe('error');
  });

  it('runStage narrows like the funnel', () => {
    expect(runStage('HOLD', null, null)).toBe('scanned');
    const hold = rawRun({ ...raw, decision: { decision: { action: 'HOLD' } } })!;
    expect(hold.stage).toBe('debated');
    const noEdge = rawRun({ ...raw, probability: null })!;
    expect(noEdge.stage).toBe('proposed');
    const notCleared = rawRun({ ...raw, probability: { ...raw.probability, allowed: false } })!;
    expect(notCleared.stage).toBe('checked');
  });
});

describe('normalizeOverview', () => {
  it('reads a full overview', () => {
    const overview = normalizeOverview({
      mode: 'paper',
      range: '7d',
      settings: { enabled: true, mode: 'live', cadenceMinutes: 5, configured: true },
      aiConfigured: true,
      stats,
      today: { entries: 1, net: 120 },
      daily: [
        { day: '2026-10-02', net: -200, trades: 1, cumulative: -200 },
        { day: 'x', net: 'bad', trades: 0, cumulative: 0 },
        { day: '2026-10-05', net: 1220, trades: 1, cumulative: 1020 },
      ],
      byUnderlying: [{ key: 'NIFTY', label: 'NIFTY', trades: 2, wins: 1, winRate: 50, net: 1020 }],
      funnel: {
        stages: [
          { key: 'scanned', label: 'Scans', hint: 'h', count: 40, ofPrevious: null },
          { key: 'nope', count: 3 },
          { key: 'ordered', count: 2, ofPrevious: 50 },
        ],
        running: 1,
      },
      reasons: [
        {
          key: 'closed',
          label: 'Market closed',
          count: 12,
          share: 60,
          latest: { reason: 'Outside', at: '2026-10-05T04:35:00.000Z' },
        },
      ],
      latestRun: run,
      open: [trade, { junk: true }],
      attention: [],
      caveat: 'Paper P&L uses simulated fills.',
    });
    expect(overview.mode).toBe('paper');
    expect(overview.settings).toMatchObject({ enabled: true, mode: 'live', cadenceMinutes: 5 });
    expect(overview.daily.map((d) => d.day)).toEqual(['2026-10-02', '2026-10-05']);
    expect(overview.funnel.stages.map((s) => s.key)).toEqual(['scanned', 'ordered']);
    expect(overview.funnel.stages[1]?.label).toBe('Order placed');
    expect(overview.funnel.running).toBe(1);
    expect(overview.latestRun?.id).toBe(run.id);
    expect(overview.open).toHaveLength(1);
    expect(overview.caveat).toBe('Paper P&L uses simulated fills.');
  });

  it('reads whether the AI service answers now', () => {
    const down = normalizeOverview({
      aiConfigured: true,
      aiReady: false,
      aiReason: 'The AI service could not be reached.',
    });
    expect(down.aiReady).toBe(false);
    expect(down.aiReason).toBe('The AI service could not be reached.');
    // An older server says nothing: unknown, not "down".
    expect(normalizeOverview({ aiConfigured: true }).aiReady).toBeNull();
  });

  it('never throws on an empty payload', () => {
    const overview = normalizeOverview(null);
    expect(overview.aiReady).toBeNull();
    expect(overview.mode).toBe('all');
    expect(overview.range).toBe('30d');
    expect(overview.settings.enabled).toBe(false);
    expect(overview.latestRun).toBeNull();
    expect(overview.daily).toEqual([]);
    expect(overview.caveat).toBeNull();
  });
});

describe('normalizeTrades and normalizeDecisions', () => {
  it('reads the statement', () => {
    const trades = normalizeTrades({
      mode: 'live',
      range: 'all',
      rows: [trade],
      stats,
      truncated: true,
      caveat: 'c',
    });
    expect(trades.rows).toHaveLength(1);
    expect(trades.truncated).toBe(true);
    expect(trades.range).toBe('all');
  });

  it('reads a page of the log with its cursor', () => {
    const page = normalizeDecisions({
      runs: [run, { nope: 1 }],
      nextBefore: '2026-10-05T04:35:00.000Z',
      counts: { all: 10, ordered: 1, hold: 8, error: 1, running: 0 },
      reasons: [],
    });
    expect(page.runs).toHaveLength(1);
    expect(page.nextBefore).toBe('2026-10-05T04:35:00.000Z');
    expect(page.counts.hold).toBe(8);
    expect(normalizeDecisions({ runs: [], nextBefore: 'not a date' }).nextBefore).toBeNull();
  });
});

describe('normalizeStatus', () => {
  it('reads the controls payload', () => {
    const status = normalizeStatus({
      settings: { ...DEFAULT_NUMBERS, enabled: true, mode: 'paper', maxLots: 2 },
      readiness: { aiConfigured: true, liveAvailable: false, note: 'Live mode requires…' },
      mode: 'paper',
      storedLiveUnapproved: true,
      liveApproved: null,
      testStartedAt: '2026-10-01T03:00:00.000Z',
      testResults: { since: '2026-10-01T03:00:00.000Z', stats, lastEntryAt: null },
      deployPhrase: 'DEPLOY LIVE',
      month: '2026-10',
      monthEstimatedNet: 1020,
      afterAssumedApiFee: 521,
      assumedMonthlyGrowwApiFee: 499,
      pnlCaveat: 'Estimated charges…',
      recent: [
        {
          intentId: 'AT-1',
          tradingSymbol: 'NIFTY25OCT25000CE',
          status: 'unknown',
          mode: 'paper',
          entry: 120,
          stop: 96,
          target: 156,
          netPnl: null,
          createdAt: '2026-10-05T04:35:00.000Z',
        },
        { intentId: '', tradingSymbol: 'X' },
      ],
      runs: [
        {
          _id: 'r1',
          status: 'HOLD',
          reason: 'Outside exchange hours',
          createdAt: '2026-10-05T03:00:00.000Z',
        },
      ],
      dryRuns: [
        {
          _id: 'd1',
          status: 'RUNNING',
          dryRun: true,
          reason: 'Test scan',
          createdAt: '2026-10-05T04:00:00.000Z',
        },
      ],
    });
    expect(status.settings.maxLots).toBe(2);
    expect(status.settings.enabled).toBe(true);
    expect(status.readiness).toEqual({
      aiConfigured: true,
      aiReady: null,
      aiReason: null,
      liveAvailable: false,
      paperOnly: false,
      note: 'Live mode requires…',
    });
    expect(status.deployPhrase).toBe('DEPLOY LIVE');
    expect(status.afterAssumedApiFee).toBe(521);
    expect(status.recent).toHaveLength(1);
    expect(status.recent[0]?.status).toBe('UNKNOWN');
    expect(status.runs[0]?.outcome).toBe('hold');
    expect(status.dryRuns[0]).toMatchObject({ id: 'd1', outcome: 'running', dryRun: true });
  });

  it('falls back to the server defaults and never invents the deploy phrase', () => {
    const status = normalizeStatus({});
    expect(status.settings).toEqual({ ...DEFAULT_NUMBERS, enabled: false, mode: 'paper' });
    expect(status.deployPhrase).toBeNull();
    expect(status.monthEstimatedNet).toBeNull();
    expect(status.mode).toBe('paper');
  });

  it('reads the AI readiness and the paper lock', () => {
    const status = normalizeStatus({
      readiness: {
        aiConfigured: true,
        aiReady: false,
        aiReason: ' The AI worker is not running. ',
        liveAvailable: false,
        paperOnly: true,
        note: 'Paper trading only.',
      },
      settings: { ...DEFAULT_NUMBERS, maxStopLossPct: 7.5 },
    });
    expect(status.readiness).toMatchObject({
      aiReady: false,
      aiReason: 'The AI worker is not running.',
      paperOnly: true,
    });
    expect(status.settings.maxStopLossPct).toBe(7.5);
    // A settings row saved before the stop cap existed reads the server's default.
    expect(normalizeStatus({ settings: { maxLots: 2 } }).settings.maxStopLossPct).toBe(10);
    expect(normalizeStatus({ readiness: { aiReady: 'yes' } }).readiness.aiReady).toBeNull();
  });

  it('botSettings ignores non-numeric values', () => {
    expect(botSettings({ maxPremium: '5000', minRewardRisk: 2 })).toMatchObject({
      maxPremium: DEFAULT_NUMBERS.maxPremium,
      minRewardRisk: 2,
    });
  });
});

describe('normalizeBacktest', () => {
  const asked = { underlying: 'NIFTY' as const, days: 30 as const };
  const btTrade = {
    day: '2026-09-15',
    signalTime: 1,
    entryTime: 2,
    exitTime: 3,
    signalAt: '2026-09-15T04:45:00.000Z',
    entryAt: '2026-09-15T05:00:00.000Z',
    exitAt: '2026-09-15T06:00:00.000Z',
    movePct: 0.42,
    spot: 25010.5,
    kind: 'CE',
    expiry: '2026-09-16',
    strike: 25000,
    growwSymbol: 'NSE-NIFTY-16Sep26-25000-CE',
    entry: 120,
    exit: 150,
    exitReason: 'target',
    returnPct: 25,
    volumeAtEntry: 50000,
  };
  const payload = {
    underlying: 'BANKNIFTY',
    requestedDays: 60,
    period: { from: '2026-08-10', to: '2026-10-07', sessions: 41 },
    source: {
      name: 'Groww',
      url: 'https://groww.in/trade-api/docs/curl/backtesting',
      generatedAt: '2026-10-08T05:00:00.000Z',
      cached: true,
    },
    rules: {
      scanTimes: ['09:30', '10:30'],
      signal: 'First hourly move of at least 0.30%',
      entry: 'Nearest-expiry ATM option',
      stopPct: 15,
      targetPct: 25,
      maxHoldMinutes: 60,
      minOptionVolume: 100,
    },
    coverage: { setups: 3, trades: 1, noSignal: 38, missingContract: 0, missingOptionData: 2 },
    summary: {
      trades: 1,
      wins: 1,
      losses: 0,
      flats: 0,
      winRate: 100,
      averageReturnPct: 25,
      grossReturnPct: 25,
      maxDrawdownPct: 0,
      profitFactor: null,
      exits: { target: 1, stop: 0, time: 0 },
    },
    curve: [{ day: '2026-09-15', returnPct: 25, equity: 125 }, { day: 'bad' }],
    trades: [btTrade, { ...btTrade, entry: 'x' }, { ...btTrade, kind: 'FUT' }, null],
    caveats: ['Gross option-premium returns.', '', 3],
  };

  it('reads a full replay', () => {
    const bt = normalizeBacktest(payload, asked);
    expect(bt.underlying).toBe('BANKNIFTY');
    expect(bt.requestedDays).toBe(60);
    expect(bt.period).toEqual({ from: '2026-08-10', to: '2026-10-07', sessions: 41 });
    expect(bt.source).toMatchObject({ name: 'Groww', cached: true });
    expect(bt.rules.scanTimes).toEqual(['09:30', '10:30']);
    expect(bt.rules.stopPct).toBe(15);
    expect(bt.coverage.missingOptionData).toBe(2);
    expect(bt.summary).toMatchObject({ trades: 1, winRate: 100, profitFactor: null });
    expect(bt.curve).toEqual([{ day: '2026-09-15', returnPct: 25, equity: 125 }]);
    expect(bt.trades).toHaveLength(1);
    expect(bt.trades[0]).toMatchObject({ kind: 'CE', strike: 25000, exitReason: 'target' });
    expect(bt.caveats).toEqual(['Gross option-premium returns.']);
  });

  it('drops trades it cannot show honestly and keeps unknown exits unknown', () => {
    expect(backtestTrade({ ...btTrade, returnPct: null })).toBeNull();
    expect(backtestTrade({ ...btTrade, day: '15 Sep' })).toBeNull();
    expect(backtestTrade({ ...btTrade, exitReason: 'trail' })?.exitReason).toBeNull();
    expect(backtestTrade({ ...btTrade, expiry: 'soon' })?.expiry).toBeNull();
  });

  it('never throws, and falls back to what was asked and to the curve', () => {
    const empty = normalizeBacktest(null, asked);
    expect(empty.underlying).toBe('NIFTY');
    expect(empty.requestedDays).toBe(30);
    expect(empty.summary.grossReturnPct).toBe(0);
    expect(empty.trades).toEqual([]);
    expect(empty.source.url).toBeNull();
    const noSummary = normalizeBacktest(
      { curve: [{ day: '2026-09-15', returnPct: -10, equity: 90 }], source: { url: 'ftp://x' } },
      { underlying: 'BANKNIFTY', days: 90 },
    );
    expect(noSummary.summary.grossReturnPct).toBe(-10);
    expect(noSummary.requestedDays).toBe(90);
    expect(noSummary.source.url).toBeNull();
  });
});

describe('mutation answers', () => {
  it('reads /run and /test-scan', () => {
    expect(
      normalizeRunNow({ status: 'already_running', reason: 'This time slot was already checked' }),
    ).toEqual({
      status: 'ALREADY_RUNNING',
      reason: 'This time slot was already checked',
    });
    expect(normalizeTestScan({ runId: 'abc', status: 'RUNNING' })).toBe('abc');
    expect(normalizeTestScan(null)).toBeNull();
  });
});
