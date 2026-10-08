import {
  engineOf,
  isDeployPlatformKey,
  normalizeDeployment,
  normalizeDetail,
  normalizeList,
  normalizeMine,
  normalizeSquareOff,
  normalizeStockRows,
  normalizeTrade,
} from '@/features/deployments/lib/normalize';

// Shapes copied from the server's views: swing-deploy.service.ts (deploymentView, tradeView,
// listSwingDeployments, swingDeploymentDetail) and intraday-strategies/deployment.service.ts.

const swingDeployment = {
  id: '66f1a2b3c4d5e6f708192a3b',
  source: 'strategy',
  strategyKey: 'strategy:66f1a2b3c4d5e6f708192a00',
  strategyId: '66f1a2b3c4d5e6f708192a00',
  strategyName: 'RSI dip',
  mode: 'paper',
  status: 'active',
  symbols: ['RELIANCE', 'TCS'],
  capitalPerTrade: 50000,
  maxOpenPositions: 8,
  maxEntriesPerDay: 4,
  broker: null,
  startedAt: '2026-10-05T10:00:00.000Z',
  stoppedAt: null,
  liveApprovedAt: null,
  lastTickAt: '2026-10-08T05:00:00.000Z',
  lastPlan: {
    barDate: '2026-10-07',
    forSession: '2026-10-08',
    at: '2026-10-07T11:50:00.000Z',
    entries: 2,
    exits: 1,
    skipped: 3,
    signals: 5,
    note: null,
  },
  lastError: null,
  lastErrorAt: null,
  rulesChanged: true,
  runner: { state: 'running', message: null },
};

const intradayDeployment = {
  id: '66f1a2b3c4d5e6f708192a4c',
  strategyKey: 'bb-midband-5m',
  mode: 'live',
  status: 'paused',
  variant: 'base',
  universe: 'nifty500',
  symbols: ['INFY'],
  capitalPerTrade: 20000,
  maxOpenPositions: 3,
  maxEntriesPerDay: 5,
  maxEntriesPerStockPerDay: 1,
  dailyLossLimit: 2000,
  broker: 'groww',
  startedAt: '2026-10-06T04:00:00.000Z',
  stoppedAt: null,
  liveApprovedAt: '2026-10-06T04:00:00.000Z',
  lastTickAt: null,
  haltedToday: true,
  haltReason: 'Daily loss limit reached',
  lastError: 'Broker refused',
  lastErrorAt: '2026-10-08T05:10:00.000Z',
  runner: { state: 'not-running', message: 'Not checked yet' },
};

const openTrade = {
  id: 't1',
  symbol: 'reliance',
  status: 'open',
  signalDate: '2026-10-06',
  signalClose: 2900,
  entryFrom: '2026-10-07',
  lastSession: null,
  trigger: null,
  stop: 2800,
  target: 3100,
  qty: 17,
  refPrice: 2900,
  entryPrice: 2905.5,
  entryAt: '2026-10-07T03:47:00.000Z',
  entryDay: '2026-10-07',
  sessionsHeld: 1,
  exitPlan: { reason: 'target', decidedOn: '2026-10-08', level: 3100 },
  exitReason: null,
  exitPrice: null,
  exitAt: null,
  grossPnl: null,
  charges: null,
  netPnl: null,
  returnPct: null,
  ltp: 2950,
  unrealised: 700.1,
  unrealisedPct: 1.42,
  cancelReason: null,
  error: null,
};

describe('engine and target helpers', () => {
  it('runs the intraday key on its own engine and everything else on the swing one', () => {
    expect(engineOf({ kind: 'platform', key: 'bb-midband-5m' })).toBe('intraday');
    expect(engineOf({ kind: 'platform', key: 'institutional-breakout-swing' })).toBe('swing');
    expect(engineOf({ kind: 'strategy', strategyId: 'abc' })).toBe('swing');
  });

  it('knows the deployable platform keys only', () => {
    expect(isDeployPlatformKey('bb-midband-5m')).toBe(true);
    expect(isDeployPlatformKey('institutional-breakout-swing')).toBe(true);
    expect(isDeployPlatformKey('something-else')).toBe(false);
    expect(isDeployPlatformKey(undefined)).toBe(false);
  });
});

describe('normalizeDeployment', () => {
  it('reads a swing deployment with its plan', () => {
    const d = normalizeDeployment(swingDeployment, 'swing')!;
    expect(d).toMatchObject({
      id: swingDeployment.id,
      engine: 'swing',
      source: 'strategy',
      strategyName: 'RSI dip',
      mode: 'paper',
      status: 'active',
      symbols: ['RELIANCE', 'TCS'],
      capitalPerTrade: 50000,
      rulesChanged: true,
      runner: { state: 'running', message: null },
      variant: null,
      dailyLossLimit: null,
      haltedToday: false,
    });
    expect(d.lastPlan).toMatchObject({ barDate: '2026-10-07', entries: 2, exits: 1, signals: 5 });
  });

  it('reads an intraday deployment as a platform one with its own limits', () => {
    const d = normalizeDeployment(intradayDeployment, 'intraday')!;
    expect(d).toMatchObject({
      engine: 'intraday',
      source: 'platform',
      mode: 'live',
      status: 'paused',
      broker: 'groww',
      variant: 'base',
      universe: 'nifty500',
      dailyLossLimit: 2000,
      maxEntriesPerStockPerDay: 1,
      haltedToday: true,
      haltReason: 'Daily loss limit reached',
      lastPlan: null,
      rulesChanged: false,
    });
  });

  it('drops a row without an id and survives junk fields', () => {
    expect(normalizeDeployment({ mode: 'live' }, 'swing')).toBeNull();
    expect(normalizeDeployment(null, 'swing')).toBeNull();
    const d = normalizeDeployment(
      {
        id: 'x',
        mode: 'margin',
        status: 'weird',
        broker: 'zerodha',
        symbols: [1, ' ', 'SBIN'],
        capitalPerTrade: 'lots',
      },
      'swing',
    )!;
    expect(d.mode).toBe('paper');
    expect(d.status).toBe('stopped');
    expect(d.broker).toBeNull();
    expect(d.symbols).toEqual(['SBIN']);
    expect(d.capitalPerTrade).toBe(0);
    expect(d.runner.state).toBe('stopped');
  });

  it('never reads an unknown runner word on a running deployment as running', () => {
    const d = normalizeDeployment(
      { id: 'x', status: 'active', runner: { state: 'zooming' } },
      'swing',
    )!;
    expect(d.runner.state).toBe('market-closed');
  });
});

describe('normalizeTrade', () => {
  it('reads a held position with its exit plan, upper-casing the symbol', () => {
    const t = normalizeTrade(openTrade)!;
    expect(t).toMatchObject({
      symbol: 'RELIANCE',
      status: 'open',
      qty: 17,
      stop: 2800,
      target: 3100,
      ltp: 2950,
      unrealised: 700.1,
      exitPlan: { reason: 'target', decidedOn: '2026-10-08', level: 3100 },
      armed: false,
      day: null,
    });
  });

  it('drops a row without an id or a symbol, and an unknown exit plan', () => {
    expect(normalizeTrade({ symbol: 'TCS' })).toBeNull();
    expect(normalizeTrade({ id: 'x' })).toBeNull();
    expect(normalizeTrade({ ...openTrade, exitPlan: { reason: 'moon' } })!.exitPlan).toBeNull();
    expect(normalizeTrade({ ...openTrade, status: 'teleported' })!.status).toBe('failed');
  });
});

describe('normalizeDetail', () => {
  it('reads a swing detail: money, stats, expectation, orders and the log', () => {
    const d = normalizeDetail(
      {
        deployment: swingDeployment,
        money: { invested: 49393.5, unrealised: 700.1, unpriced: 0 },
        stats: {
          trades: 4,
          wins: 3,
          losses: 1,
          winRate: 75,
          grossPnl: 2100,
          charges: 120,
          netPnl: 1980,
          avgReturnPct: 1.1,
          best: 1200,
          worst: -300,
          avgSessionsHeld: 3.5,
          failed: 1,
          cancelled: 2,
          byExit: { target: 3, stop: 1 },
        },
        expected: { avgReturnPct: 0.9, winRate: 58, trades: 120, current: true },
        positions: [openTrade],
        orders: [{ ...openTrade, id: 'o1', status: 'planned', entryPrice: null }],
        trades: [],
        events: [
          { at: '2026-10-07T11:50:00.000Z', kind: 'plan', symbol: null, message: 'Plan made' },
          { at: '2026-10-07T11:51:00.000Z', kind: 'teleport', symbol: 'TCS', message: 'Odd' },
          { at: '', kind: 'info', symbol: null, message: 'no time' },
        ],
        quotesAsOf: '2026-10-08T05:00:00.000Z',
      },
      'swing',
    )!;
    expect(d.money).toEqual({ invested: 49393.5, unrealised: 700.1, unpriced: 0 });
    expect(d.today).toBeNull();
    expect(d.stats).toMatchObject({
      trades: 4,
      failed: 1,
      cancelled: 2,
      avgSessionsHeld: 3.5,
      sessions: null,
    });
    expect(d.stats.byExit).toEqual({ target: 3, stop: 1 });
    expect(d.expected).toEqual({
      avgReturnPct: 0.9,
      winRate: 58,
      trades: 120,
      current: true,
      stocks: null,
    });
    expect(d.positions).toHaveLength(1);
    expect(d.orders[0]!.status).toBe('planned');
    expect(d.events).toHaveLength(2);
    expect(d.events[1]!.kind).toBe('info');
  });

  it('reads an intraday detail: today, sessions and failed entries', () => {
    const d = normalizeDetail(
      {
        deployment: intradayDeployment,
        today: {
          realised: 120,
          unrealised: -40,
          total: 80,
          openPositions: 1,
          closedToday: 2,
          entries: 3,
          refused: 1,
        },
        stats: {
          trades: 10,
          wins: 6,
          losses: 4,
          winRate: 60,
          netPnl: 900,
          sessions: 4,
          failedEntries: 2,
          byExit: {},
        },
        expected: { trades: 80, avgReturnPct: 0.12, winRate: 55, stocks: 6 },
        positions: [],
        trades: [],
        events: [],
        quotesAsOf: null,
      },
      'intraday',
    )!;
    expect(d.money).toBeNull();
    expect(d.today).toEqual({
      realised: 120,
      unrealised: -40,
      total: 80,
      openPositions: 1,
      closedToday: 2,
      entries: 3,
      refused: 1,
    });
    expect(d.stats).toMatchObject({ sessions: 4, failed: 2, avgSessionsHeld: null });
    expect(d.expected).toMatchObject({ stocks: 6, current: null });
    expect(d.orders).toEqual([]);
  });

  it('returns null without a deployment, and no expectation without a figure', () => {
    expect(normalizeDetail({ stats: {} }, 'swing')).toBeNull();
    const d = normalizeDetail({ deployment: swingDeployment, expected: { trades: 3 } }, 'swing')!;
    expect(d.expected).toBeNull();
    expect(d.money).toEqual({ invested: 0, unrealised: 0, unpriced: 0 });
  });
});

describe('normalizeList', () => {
  const live = {
    limits: {
      maxOrderValue: 25000,
      maxOpenPositions: 3,
      maxDailyLoss: 5000,
      maxOrdersPerSymbolPerDay: 3,
    },
    masterSwitch: true,
    safeMode: false,
    brokers: [
      { broker: 'mstock', connected: true, label: 'Main' },
      { broker: 'groww', connected: false, label: null },
      { broker: 'zerodha', connected: true, label: null },
    ],
    phrase: 'DEPLOY LIVE',
    needsBacktest: true,
  };

  it('reads a swing list with its strategy block and live readiness', () => {
    const l = normalizeList(
      {
        deployments: [swingDeployment, { status: 'active' }],
        defaults: {
          paper: { capitalPerTrade: 50000, maxOpenPositions: 8, maxEntriesPerDay: 4 },
          live: { capitalPerTrade: 20000, maxOpenPositions: 3, maxEntriesPerDay: 2 },
        },
        strategy: {
          source: 'strategy',
          name: 'RSI dip',
          howItTrades: ['Buys when RSI < 30.', ''],
          universe: 'NSE · Nifty 500',
          exits: ['Stop 5%'],
          backtest: { ran: true, current: false, avgReturnPct: 0.8, winRate: 55, trades: 300 },
          stocks: [
            { symbol: 'tcs', trades: 12, winRate: 60, avgReturnPct: 1.2, profitFactor: 1.8 },
          ],
        },
        live,
      },
      'swing',
    );
    expect(l.engine).toBe('swing');
    expect(l.deployments).toHaveLength(1);
    expect(l.defaults.live).toEqual({
      capitalPerTrade: 20000,
      maxOpenPositions: 3,
      maxEntriesPerDay: 2,
      dailyLossLimit: null,
    });
    expect(l.strategy).toMatchObject({
      name: 'RSI dip',
      howItTrades: ['Buys when RSI < 30.'],
      backtest: { ran: true, current: false },
    });
    expect(l.strategy!.stocks[0]).toEqual({
      symbol: 'TCS',
      trades: 12,
      winRate: 60,
      avgReturnPct: 1.2,
      profitFactor: 1.8,
      verdict: null,
    });
    expect(l.live.brokers.map((b) => b.broker)).toEqual(['mstock', 'groww']);
    expect(l.live).toMatchObject({
      masterSwitch: true,
      safeMode: false,
      phrase: 'DEPLOY LIVE',
      needsBacktest: true,
    });
  });

  it('reads an intraday list without a strategy block, with loss-limit defaults', () => {
    const l = normalizeList(
      {
        deployments: [intradayDeployment],
        defaults: {
          paper: {
            capitalPerTrade: 50000,
            maxOpenPositions: 5,
            maxEntriesPerDay: 10,
            dailyLossLimit: 5000,
          },
        },
        live: { ...live, needsBacktest: undefined },
      },
      'intraday',
    );
    expect(l.strategy).toBeNull();
    expect(l.defaults.paper.dailyLossLimit).toBe(5000);
    expect(l.defaults.live).toEqual({
      capitalPerTrade: 0,
      maxOpenPositions: 0,
      maxEntriesPerDay: 0,
      dailyLossLimit: null,
    });
    expect(l.live.needsBacktest).toBe(false);
  });

  it('reads a missing live block in the safe direction: switch off, Safe Mode on, no phrase', () => {
    const l = normalizeList({ deployments: [], defaults: {} }, 'swing');
    expect(l.live).toMatchObject({
      masterSwitch: false,
      safeMode: true,
      phrase: null,
      brokers: [],
    });
    expect(l.strategy).toBeNull();
  });
});

describe('small payloads', () => {
  it('reads my deployments, dropping rows without an id', () => {
    expect(
      normalizeMine({
        deployments: [
          { id: 'a', strategyKey: 'strategy:s1', strategyId: 's1', mode: 'live', status: 'paused' },
          {
            id: 'b',
            strategyKey: 'institutional-breakout-swing',
            strategyId: null,
            mode: 'paper',
            status: 'active',
          },
          { strategyId: 's2' },
        ],
      }),
    ).toEqual([
      { id: 'a', strategyKey: 'strategy:s1', strategyId: 's1', mode: 'live', status: 'paused' },
      {
        id: 'b',
        strategyKey: 'institutional-breakout-swing',
        strategyId: null,
        mode: 'paper',
        status: 'active',
      },
    ]);
    expect(normalizeMine(null)).toEqual([]);
  });

  it('reads a square-off answer from either engine', () => {
    expect(normalizeSquareOff({ squaredOff: 0, atNextOpen: 2 })).toEqual({
      squaredOff: 0,
      atNextOpen: 2,
    });
    expect(normalizeSquareOff({ squaredOff: 1 })).toEqual({ squaredOff: 1, atNextOpen: 0 });
  });

  it('reads the page’s own intraday stock rows with their verdicts', () => {
    expect(
      normalizeStockRows([
        {
          symbol: 'infy',
          trades: 30,
          wins: 18,
          winRate: 60,
          avgReturnPct: 0.2,
          profitFactor: null,
          verdict: 'works',
        },
        { symbol: 'X', verdict: 'maybe' },
        { trades: 3 },
      ]),
    ).toEqual([
      {
        symbol: 'INFY',
        trades: 30,
        winRate: 60,
        avgReturnPct: 0.2,
        profitFactor: null,
        verdict: 'works',
      },
      {
        symbol: 'X',
        trades: 0,
        winRate: null,
        avgReturnPct: null,
        profitFactor: null,
        verdict: null,
      },
    ]);
  });
});
