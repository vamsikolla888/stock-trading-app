import {
  normalizeDeployment,
  normalizeList,
  normalizeTrade,
} from '@/features/deployments/lib/normalize';
import {
  buildDeployInput,
  dayLabel,
  defaultIntradaySymbols,
  deployTabLabel,
  detailPollMs,
  exitLine,
  exposureLine,
  filterEvents,
  formFieldErrors,
  initialForm,
  istDay,
  istTime,
  liveBlocker,
  liveChecklist,
  modeLabel,
  modesByStrategy,
  orderLine,
  outcomeWord,
  phraseMatches,
  pickBroker,
  pickByVerdict,
  planLine,
  provenStocks,
  runnerLabel,
  sendSymbols,
  stopMessage,
  submitState,
  switchFormMode,
  tradeSpan,
  triggerDistance,
  validateDeployForm,
  versusBacktest,
  type DeployForm,
} from '@/features/deployments/lib/view';
import type { DeploymentList, DeployStockRow } from '@/features/deployments/types';

const LIMITS = {
  maxOrderValue: 25_000,
  maxOpenPositions: 3,
  maxDailyLoss: 5_000,
  maxOrdersPerSymbolPerDay: 3,
};

function liveBlock(over: Partial<DeploymentList['live']> = {}): DeploymentList['live'] {
  return {
    limits: LIMITS,
    masterSwitch: true,
    safeMode: false,
    brokers: [{ broker: 'mstock', connected: true, label: null }],
    phrase: 'DEPLOY LIVE',
    needsBacktest: false,
    ...over,
  };
}

function swingList(
  over: { live?: Partial<DeploymentList['live']>; deployments?: unknown[]; ran?: boolean } = {},
): DeploymentList {
  return {
    ...normalizeList(
      {
        deployments: over.deployments ?? [],
        defaults: {
          paper: { capitalPerTrade: 50000, maxOpenPositions: 8, maxEntriesPerDay: 4 },
          live: { capitalPerTrade: 20000, maxOpenPositions: 3, maxEntriesPerDay: 2 },
        },
        strategy: {
          source: 'strategy',
          name: 'RSI dip',
          howItTrades: [],
          universe: 'NSE',
          exits: null,
          backtest: {
            ran: over.ran ?? true,
            current: true,
            avgReturnPct: 1,
            winRate: 50,
            trades: 10,
          },
          stocks: [],
        },
        live: {},
      },
      'swing',
    ),
    live: liveBlock(over.live),
  };
}

function intradayList(deployments: unknown[] = []): DeploymentList {
  return {
    ...normalizeList(
      {
        deployments,
        defaults: {
          paper: {
            capitalPerTrade: 50000,
            maxOpenPositions: 5,
            maxEntriesPerDay: 10,
            dailyLossLimit: 5000,
          },
          live: {
            capitalPerTrade: 20000,
            maxOpenPositions: 3,
            maxEntriesPerDay: 5,
            dailyLossLimit: 2000,
          },
        },
        live: {},
      },
      'intraday',
    ),
    live: liveBlock(),
  };
}

const form = (over: Partial<DeployForm> = {}): DeployForm => ({
  mode: 'paper',
  scope: 'all',
  symbols: [],
  capital: '50000',
  positions: '5',
  entries: '4',
  lossLimit: '',
  variant: 'improved',
  universe: 'nifty50',
  broker: 'mstock',
  confirm: '',
  ...over,
});

const row = (
  symbol: string,
  trades: number,
  avg: number | null,
  verdict: DeployStockRow['verdict'] = null,
): DeployStockRow => ({
  symbol,
  trades,
  winRate: 50,
  avgReturnPct: avg,
  profitFactor: null,
  verdict,
});

describe('live readiness (which requirement blocks live)', () => {
  it('passes when the switch is on, Safe Mode off, a broker connected and the rules backtested', () => {
    const checks = liveChecklist(swingList(), false);
    expect(checks.map((c) => c.key)).toEqual(['master', 'safe', 'broker', 'backtest']);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(liveBlocker(checks)).toBeNull();
  });

  it('blocks on the platform master switch', () => {
    expect(liveBlocker(liveChecklist(swingList({ live: { masterSwitch: false } }), false))).toBe(
      'Live trading is off for the platform',
    );
  });

  it('blocks on Safe Mode — the server’s word or this device’s', () => {
    const server = liveChecklist(swingList({ live: { safeMode: true } }), false);
    const device = liveChecklist(swingList(), true);
    for (const checks of [server, device]) {
      expect(checks.find((c) => c.key === 'safe')!.ok).toBe(false);
      expect(liveBlocker(checks)).toMatch(/^Safe Mode is on/);
    }
  });

  it('blocks without a connected broker', () => {
    const checks = liveChecklist(
      swingList({ live: { brokers: [{ broker: 'groww', connected: false, label: null }] } }),
      false,
    );
    expect(liveBlocker(checks)).toMatch(/^No broker connected/);
  });

  it('blocks a user strategy whose current rules have no finished backtest', () => {
    const changed = liveChecklist(swingList({ live: { needsBacktest: true } }), false);
    expect(liveBlocker(changed)).toBe('Rules changed since the last backtest — run it again');
    const never = liveChecklist(swingList({ live: { needsBacktest: true }, ran: false }), false);
    expect(liveBlocker(never)).toBe('Not backtested yet — run the backtest first');
  });

  it('has no backtest check for the intraday strategy, and blocks when no phrase was sent', () => {
    const list = intradayList();
    expect(liveChecklist(list, false).map((c) => c.key)).toEqual(['master', 'safe', 'broker']);
    const noPhrase = { ...list, live: { ...list.live, phrase: null } };
    expect(liveBlocker(liveChecklist(noPhrase, false))).toBe(
      'The server sent no confirmation phrase',
    );
  });

  it('lists the platform’s blockers in the server’s order', () => {
    const checks = liveChecklist(
      swingList({ live: { masterSwitch: false, safeMode: true, brokers: [] } }),
      false,
    );
    expect(checks.filter((c) => !c.ok).map((c) => c.key)).toEqual(['master', 'safe', 'broker']);
  });
});

describe('the typed phrase', () => {
  it('matches as the server compares it — trimmed and upper-cased', () => {
    expect(phraseMatches(' deploy live ', 'DEPLOY LIVE')).toBe(true);
    expect(phraseMatches('DEPLOY', 'DEPLOY LIVE')).toBe(false);
    expect(phraseMatches('DEPLOY LIVE', null)).toBe(false);
  });
});

describe('submitState', () => {
  const list = swingList();
  const checks = liveChecklist(list, false);
  const state = (f: DeployForm, l = list, c = checks) =>
    submitState({
      form: f,
      errors: validateDeployForm(f, l.engine, l.live.limits),
      checks: c,
      phrase: l.live.phrase,
      brokers: l.live.brokers,
    });

  it('lets a valid paper form through without a phrase or broker', () => {
    expect(state(form())).toEqual({ ok: true, reason: null, kind: null });
  });

  it('never lets a blocked live form through, and says why first', () => {
    const blocked = swingList({ live: { safeMode: true } });
    const s = state(
      form({ mode: 'live', capital: '20000', positions: '3', confirm: 'DEPLOY LIVE' }),
      blocked,
      liveChecklist(blocked, false),
    );
    expect(s.ok).toBe(false);
    expect(s.kind).toBe('blocked');
    expect(s.reason).toMatch(/^Live is blocked: Safe Mode is on/);
  });

  it('holds live inside the caps, then needs the chosen broker connected, then the phrase', () => {
    expect(state(form({ mode: 'live', capital: '50000', positions: '3' })).kind).toBe('field');
    expect(
      state(form({ mode: 'live', capital: '20000', positions: '3', broker: 'groww' })).kind,
    ).toBe('broker');
    const noPhrase = state(form({ mode: 'live', capital: '20000', positions: '3' }));
    expect(noPhrase).toEqual({
      ok: false,
      reason: 'Type DEPLOY LIVE to send real orders.',
      kind: 'phrase',
    });
    expect(
      state(form({ mode: 'live', capital: '20000', positions: '3', confirm: 'deploy live' })).ok,
    ).toBe(true);
  });
});

describe('validateDeployForm — the server’s bounds', () => {
  it('holds a swing form to 1,000–10 lakh, 1–20 positions and 1–20 a day', () => {
    expect(validateDeployForm(form(), 'swing', LIMITS)).toEqual({});
    const bad = validateDeployForm(
      form({ capital: '999', positions: '0', entries: '21' }),
      'swing',
      LIMITS,
    );
    expect(bad.capitalPerTrade).toBe('Capital per trade must be between ₹1,000 and ₹10 lakh.');
    expect(bad.maxOpenPositions).toBe('Open positions must be 1–20.');
    expect(bad.maxEntriesPerDay).toBe('New positions a day must be 1–20.');
    expect(
      validateDeployForm(form({ positions: '2.5', capital: '' }), 'swing', LIMITS),
    ).toMatchObject({
      maxOpenPositions: expect.any(String),
      capitalPerTrade: expect.any(String),
    });
  });

  it('needs chosen stocks only when the swing scope is a list, and caps it at 200', () => {
    expect(validateDeployForm(form({ scope: 'list' }), 'swing', LIMITS).symbols).toMatch(
      /^Pick at least one stock/,
    );
    const many = Array.from({ length: 201 }, (_, i) => `S${i}`);
    expect(
      validateDeployForm(form({ scope: 'list', symbols: many }), 'swing', LIMITS).symbols,
    ).toMatch(/^At most 200/);
    expect(
      validateDeployForm(form({ scope: 'list', symbols: ['BAD SYMBOL'] }), 'swing', LIMITS).symbols,
    ).toBe('A stock symbol is not valid.');
  });

  it('holds an intraday form to its own bounds: 1–50 stocks, 1–100 a day, a ₹100–10 lakh loss limit', () => {
    const f = form({ scope: 'list', symbols: ['INFY'], entries: '100', lossLimit: '5000' });
    expect(validateDeployForm(f, 'intraday', LIMITS)).toEqual({});
    const bad = validateDeployForm(
      form({ symbols: [], entries: '101', lossLimit: '99' }),
      'intraday',
      LIMITS,
    );
    expect(bad.symbols).toBe('Pick at least one stock.');
    expect(bad.maxEntriesPerDay).toBe('Entries a day must be 1–100.');
    expect(bad.dailyLossLimit).toBe('Daily loss limit must be between ₹100 and ₹10 lakh.');
    const many = Array.from({ length: 51 }, (_, i) => `S${i}`);
    expect(
      validateDeployForm(form({ symbols: many, lossLimit: '500' }), 'intraday', LIMITS).symbols,
    ).toMatch(/^At most 50/);
  });

  it('adds the platform’s live caps', () => {
    const swing = validateDeployForm(
      form({ mode: 'live', capital: '30000', positions: '4' }),
      'swing',
      LIMITS,
    );
    expect(swing.capitalPerTrade).toBe('Live orders are capped at ₹25,000 each on this platform.');
    expect(swing.maxOpenPositions).toBe('Live allows at most 3 open positions.');
    const intraday = validateDeployForm(
      form({
        mode: 'live',
        symbols: ['INFY'],
        capital: '20000',
        positions: '3',
        lossLimit: '6000',
      }),
      'intraday',
      LIMITS,
    );
    expect(intraday).toEqual({ dailyLossLimit: "The platform's live daily loss cap is ₹5,000." });
  });
});

describe('buildDeployInput — only the fields each strict schema accepts', () => {
  it('sends a swing paper deploy without intraday fields, broker or phrase', () => {
    const input = buildDeployInput(
      form({ capital: '50,000', positions: '5', entries: '4' }),
      'swing',
    );
    expect(input).toEqual({
      mode: 'paper',
      symbols: [],
      capitalPerTrade: 50000,
      maxOpenPositions: 5,
      maxEntriesPerDay: 4,
    });
  });

  it('sends the chosen list (deduped, upper-cased) and, live, the broker and phrase', () => {
    const input = buildDeployInput(
      form({
        mode: 'live',
        scope: 'list',
        symbols: ['tcs', 'TCS', 'infy'],
        confirm: ' DEPLOY LIVE ',
        broker: 'groww',
      }),
      'swing',
    );
    expect(input).toMatchObject({
      mode: 'live',
      symbols: ['TCS', 'INFY'],
      broker: 'groww',
      confirm: 'DEPLOY LIVE',
    });
    expect(input).not.toHaveProperty('variant');
  });

  it('sends the intraday variant, universe and loss limit, always with its list', () => {
    const input = buildDeployInput(
      form({
        scope: 'all',
        symbols: ['INFY'],
        variant: 'base',
        universe: 'nifty500',
        lossLimit: '3000',
      }),
      'intraday',
    );
    expect(input).toMatchObject({
      symbols: ['INFY'],
      variant: 'base',
      universe: 'nifty500',
      dailyLossLimit: 3000,
    });
    expect(sendSymbols({ scope: 'all', symbols: ['INFY'] }, 'intraday')).toEqual(['INFY']);
  });
});

describe('server field errors', () => {
  it('maps 422 paths onto the form, first message per field', () => {
    expect(
      formFieldErrors({
        'symbols.3': 'Invalid',
        capitalPerTrade: 'Too big',
        confirm: 'Type DEPLOY LIVE to send real orders.',
        'body.maxOpenPositions': 'Live allows at most 3',
        somethingElse: 'ignored',
      }),
    ).toEqual({
      symbols: 'Invalid',
      capitalPerTrade: 'Too big',
      confirm: 'Type DEPLOY LIVE to send real orders.',
      maxOpenPositions: 'Live allows at most 3',
    });
    expect(formFieldErrors(undefined)).toEqual({});
  });
});

describe('the form’s starting values', () => {
  const running = {
    id: 'd1',
    mode: 'live',
    status: 'active',
    symbols: ['TCS'],
    capitalPerTrade: 15000,
    maxOpenPositions: 2,
    maxEntriesPerDay: 1,
    broker: 'groww',
    startedAt: '2026-10-01T00:00:00Z',
    runner: { state: 'running' },
  };

  it('defaults a new swing deployment to paper, every stock, the server’s defaults', () => {
    const f = initialForm({ mode: 'paper', list: swingList(), stocks: [row('TCS', 10, 1)] });
    expect(f).toMatchObject({
      mode: 'paper',
      scope: 'all',
      symbols: ['TCS'],
      capital: '50000',
      positions: '8',
      entries: '4',
      confirm: '',
    });
  });

  it('loads the running deployment of that mode, keeping its broker only while connected', () => {
    const list = swingList({ deployments: [running] });
    expect(initialForm({ mode: 'live', list, stocks: [] })).toMatchObject({
      scope: 'list',
      symbols: ['TCS'],
      capital: '15000',
      broker: 'mstock',
    });
    const both = swingList({
      deployments: [running],
      live: {
        brokers: [
          { broker: 'mstock', connected: true, label: null },
          { broker: 'groww', connected: true, label: null },
        ],
      },
    });
    expect(initialForm({ mode: 'live', list: both, stocks: [] }).broker).toBe('groww');
  });

  it('prefills the intraday sheet from the page (universe, variant) and the backtest’s verdicts', () => {
    const list = intradayList();
    const f = initialForm({
      mode: 'paper',
      list,
      stocks: [row('A', 10, 0.1, 'works'), row('B', 10, 0.1, 'mixed')],
      variant: 'base',
      universe: 'nifty500',
    });
    expect(f).toMatchObject({
      scope: 'list',
      symbols: ['A'],
      variant: 'base',
      universe: 'nifty500',
      lossLimit: '5000',
    });
  });

  it('switching to live loads live’s defaults and clears the typed phrase', () => {
    const list = swingList();
    const f = switchFormMode(
      form({ confirm: 'DEPLOY LIVE', scope: 'list', symbols: ['TCS'] }),
      'live',
      list,
    );
    expect(f).toMatchObject({
      mode: 'live',
      capital: '20000',
      positions: '3',
      entries: '2',
      confirm: '',
      symbols: ['TCS'],
    });
  });

  it('picks a connected broker', () => {
    const brokers = [
      { broker: 'mstock' as const, connected: false, label: null },
      { broker: 'groww' as const, connected: true, label: null },
    ];
    expect(pickBroker('mstock', brokers)).toBe('groww');
    expect(pickBroker(null, [])).toBe('mstock');
  });
});

describe('stock picks', () => {
  it('“made money”: enough trades and a positive average, strongest first', () => {
    const rows = [
      row('A', 4, 5),
      row('B', 10, 1),
      row('C', 40, 1),
      row('D', 20, -1),
      row('E', 10, null),
    ];
    expect(provenStocks(rows)).toEqual(['C', 'B']);
  });

  it('intraday: works, else works + mixed, at most 50', () => {
    expect(defaultIntradaySymbols([row('A', 1, 0, 'mixed'), row('B', 1, 0, 'avoid')])).toEqual([
      'A',
    ]);
    expect(defaultIntradaySymbols([row('A', 1, 0, 'mixed'), row('B', 1, 0, 'works')])).toEqual([
      'B',
    ]);
    const many = Array.from({ length: 60 }, (_, i) => row(`S${i}`, 1, 0, 'works'));
    expect(pickByVerdict(many, ['works'])).toHaveLength(50);
  });
});

describe('words', () => {
  const swing = { engine: 'swing' as const, source: 'strategy' as const };
  const platform = { engine: 'swing' as const, source: 'platform' as const };
  const intraday = { engine: 'intraday' as const, source: 'platform' as const };
  const base = normalizeTrade({
    id: 't',
    symbol: 'TCS',
    status: 'open',
    qty: 10,
    entryFrom: '2026-10-13',
    lastSession: '2026-10-20',
  })!;

  it('labels modes the same everywhere', () => {
    expect(modeLabel('paper')).toBe('PAPER');
    expect(modeLabel('live', 'groww')).toBe('LIVE · Groww');
    expect(modeLabel('live', null)).toBe('LIVE');
  });

  it('dates in IST', () => {
    expect(dayLabel('2026-10-13')).toBe('13 Oct');
    expect(dayLabel(null)).toBe('—');
    expect(istDay('2026-10-13T20:00:00.000Z')).toBe('2026-10-14');
    expect(istTime('2026-10-13T04:35:00.000Z')).toBe('10:05');
  });

  it('says what a planned order or a trigger will do', () => {
    expect(orderLine({ ...base, status: 'planned' })).toBe('Buy ~10 at the 13 Oct open');
    expect(orderLine({ ...base, status: 'waiting', trigger: 1250 })).toBe(
      'Buy above ₹1,250.00 · 13 Oct–20 Oct',
    );
    expect(triggerDistance({ status: 'waiting', trigger: 100, ltp: 98.8 })).toBe('1.20% below');
    expect(triggerDistance({ status: 'waiting', trigger: 100, ltp: 101 })).toBe('1.00% above');
    expect(triggerDistance({ status: 'planned', trigger: 100, ltp: 98 })).toBeNull();
  });

  it('says what happens next to a position, by engine', () => {
    expect(exitLine(base, swing)).toBe('Judged on each close');
    expect(exitLine(base, platform)).toBe('Stop, target, or the 20 Oct close');
    expect(
      exitLine({ ...base, exitPlan: { reason: 'stop', decidedOn: null, level: null } }, swing),
    ).toBe('Sell at the next open — stop');
    expect(exitLine({ ...base, armed: true }, intraday)).toBe('Sell on the next red candle');
    expect(exitLine({ ...base, armed: false }, intraday)).toBe('Waiting for the upper band');
    expect(exitLine({ ...base, status: 'pending-exit' }, intraday)).toBe('Selling…');
  });

  it('says what the last plan decided', () => {
    const p = {
      barDate: '2026-10-13',
      forSession: '2026-10-14',
      at: null,
      entries: 2,
      exits: 1,
      skipped: 3,
      signals: 5,
      note: null,
    };
    expect(planLine(p)).toBe('13 Oct close → 14 Oct open: 2 buys, 1 sell · 5 signals, 3 not taken');
    expect(planLine({ ...p, entries: 0, exits: 0, signals: 0 })).toBe(
      '13 Oct close → 14 Oct open: nothing to do',
    );
    expect(planLine({ ...p, entries: 1 }, 'platform')).toBe(
      '13 Oct scan → from 14 Oct: 1 new trigger · 5 setups, 3 not taken',
    );
    expect(planLine(null)).toBeNull();
  });

  it('words outcomes, spans and money', () => {
    expect(outcomeWord({ status: 'failed', exitReason: null })).toBe('Refused');
    expect(outcomeWord({ status: 'cancelled', exitReason: null })).toBe('Not taken');
    expect(outcomeWord({ status: 'closed', exitReason: 'upper-band' })).toBe(
      'Upper band → red candle',
    );
    expect(
      tradeSpan({ ...base, entryDay: '2026-10-13', exitAt: '2026-10-16T09:00:00Z' }, 'swing'),
    ).toBe('13 Oct → 16 Oct');
    expect(
      tradeSpan(
        {
          ...base,
          day: '2026-10-13',
          entryAt: '2026-10-13T04:35:00Z',
          exitAt: '2026-10-13T05:50:00Z',
        },
        'intraday',
      ),
    ).toBe('13 Oct 10:05–11:20');
    expect(exposureLine(50000, 5)).toBe('Up to 5 positions × ₹50,000 = ₹2,50,000 at work at once');
    expect(exposureLine(20000, 1)).toBe('Up to 1 position × ₹20,000 = ₹20,000 at work at once');
    expect(versusBacktest(0.5, 0.8)).toBe(
      '+0.50% a trade vs +0.80% in the backtest (behind by 0.30 pts)',
    );
    expect(versusBacktest(null, 0.8)).toBeNull();
  });

  it('names paper or real money when stopping', () => {
    expect(stopMessage({ mode: 'live', engine: 'swing', broker: 'mstock' })).toMatch(
      /at mStock — real money/,
    );
    expect(stopMessage({ mode: 'paper', engine: 'intraday', broker: null })).toMatch(
      /in your paper wallet/,
    );
  });

  it('labels the runner', () => {
    const d = normalizeDeployment(
      {
        id: 'x',
        status: 'active',
        lastTickAt: '2026-10-13T04:35:00Z',
        runner: { state: 'running' },
      },
      'swing',
    )!;
    expect(runnerLabel(d, () => '2m ago')).toBe('Checked 2m ago');
    expect(runnerLabel({ ...d, runner: { state: 'not-running', message: null } }, () => '')).toBe(
      'Not running',
    );
  });
});

describe('lists, labels and polling', () => {
  it('labels the tab by what runs', () => {
    expect(deployTabLabel([])).toBe('Deployment');
    expect(deployTabLabel([{ mode: 'live', status: 'paused' }])).toBe('Deployment · live');
    expect(
      deployTabLabel([
        { mode: 'live', status: 'active' },
        { mode: 'paper', status: 'active' },
      ]),
    ).toBe('Deployment · both');
    expect(deployTabLabel([{ mode: 'paper', status: 'stopped' }])).toBe('Deployment');
  });

  it('groups my deployments by strategy, paper first, skipping platform ones', () => {
    const map = modesByStrategy([
      { id: '1', strategyKey: 'strategy:s1', strategyId: 's1', mode: 'live', status: 'active' },
      { id: '2', strategyKey: 'strategy:s1', strategyId: 's1', mode: 'paper', status: 'paused' },
      {
        id: '3',
        strategyKey: 'institutional-breakout-swing',
        strategyId: null,
        mode: 'paper',
        status: 'active',
      },
    ]);
    expect([...map.entries()]).toEqual([['s1', ['paper', 'live']]]);
  });

  it('polls a running deployment every 30 s in market hours only, and never a stopped one', () => {
    const open = new Date('2026-10-08T05:00:00.000Z'); // Thu 10:30 IST
    const night = new Date('2026-10-08T15:00:00.000Z'); // Thu 20:30 IST
    const sunday = new Date('2026-10-11T05:00:00.000Z');
    expect(detailPollMs({ status: 'active' }, open)).toBe(30_000);
    expect(detailPollMs({ status: 'paused' }, open)).toBe(30_000);
    expect(detailPollMs({ status: 'stopped' }, open)).toBe(false);
    expect(detailPollMs({ status: 'active' }, night)).toBe(false);
    expect(detailPollMs({ status: 'active' }, sunday)).toBe(false);
    expect(detailPollMs(undefined, open)).toBe(false);
  });

  it('filters the log by engine', () => {
    const events = (['plan', 'skip', 'cancel', 'fill', 'error', 'halt', 'info'] as const).map(
      (kind, i) => ({
        at: `2026-10-08T05:0${i}:00Z`,
        kind,
        symbol: null,
        message: kind,
      }),
    );
    expect(filterEvents(events, 'all', 'swing')).toHaveLength(7);
    expect(filterEvents(events, 'plans', 'swing').map((e) => e.kind)).toEqual([
      'plan',
      'skip',
      'cancel',
    ]);
    expect(filterEvents(events, 'plans', 'intraday').map((e) => e.kind)).toEqual(['skip']);
    expect(filterEvents(events, 'problems', 'intraday').map((e) => e.kind)).toEqual([
      'error',
      'halt',
    ]);
    expect(filterEvents(events, 'trades', 'swing').map((e) => e.kind)).toEqual(['fill']);
  });
});
