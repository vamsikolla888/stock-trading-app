import {
  isHouseStrategyKey,
  normalizeHouseDetail,
  normalizeHouseList,
  normalizeJobResult,
  normalizeRegime,
  normalizeScan,
} from '@/features/strategies/lib/houseNormalize';
import {
  adminActionError,
  checkTally,
  filterReplaySetups,
  formatR,
  funnelWidths,
  groupChecks,
  houseJobMessage,
  lineSummary,
  managementRules,
  methodSteps,
  outcomeShares,
  planSentence,
  regimeView,
  scanDayLabel,
  sectorsByStrength,
  SETUP_STATUS_VIEW,
} from '@/features/strategies/lib/houseView';
import type { ReplaySetup, SwingCheck, SwingConfig } from '@/features/strategies/types';
import { ApiError } from '@/types/api';

/**
 * The platform strategy (Institutional Breakout Swing): its words — ported with the web's pinned
 * cases (server/test/client-house-strategy.test.ts) — and the parser that keeps an older server or
 * an incomplete replay from throwing mid-render.
 */

// The server's DEFAULT_SWING_CONFIG + maxChasePct (SWING_MAX_CHASE_PCT) + lookbackBars.
const config: SwingConfig = {
  minAvgTradedValueCr: 10,
  minPrice: 50,
  minDayMovePct: 2,
  idealMaxDayMovePct: 5,
  maxDayMovePct: 8,
  minCloseLocation: 0.75,
  minVolumeRatio: 1.5,
  strongVolumeRatio: 2,
  breakoutLookback: 20,
  longBreakoutLookback: 50,
  pullbackTolerancePct: 1.5,
  minRiskPct: 1,
  maxRiskPct: 8,
  targetR: 2,
  extendedFromEma20Pct: 10,
  horizonDays: 10,
  maxChasePct: 3,
  lookbackBars: 260,
};

describe('the six steps', () => {
  it('quote the scan’s actual thresholds', () => {
    const text = methodSteps(config)
      .map((s) => s.body)
      .join(' ');
    expect(methodSteps(config)).toHaveLength(6);
    for (const piece of [
      `₹${config.minAvgTradedValueCr} crore`,
      `₹${config.minPrice}`,
      `${config.minDayMovePct}–${config.idealMaxDayMovePct}%`,
      `up to ${config.maxDayMovePct}%`,
      `top ${Math.round((1 - config.minCloseLocation) * 100)}%`,
      `${config.minVolumeRatio}×`,
      `${config.breakoutLookback}- or ${config.longBreakoutLookback}-day high`,
      `${config.extendedFromEma20Pct}% above the 20 EMA`,
      `no more than ${config.maxChasePct}%`,
      `between ${config.minRiskPct}% and ${config.maxRiskPct}%`,
      `target ${config.targetR}R`,
      `${config.horizonDays} sessions`,
    ]) {
      expect(text).toContain(piece);
    }
  });

  it('follow the config when it changes', () => {
    const changed = { ...config, minVolumeRatio: 2, horizonDays: 7 };
    const text = methodSteps(changed)
      .map((s) => s.body)
      .join(' ');
    expect(text).toContain('2× the 20-day average');
    expect(text).toContain('held up to 7 sessions');
    expect(managementRules(changed).join(' ')).toContain('end of session 7');
  });
});

describe('how replayed setups ended', () => {
  it('shares every ending of all setups, in a fixed order, leaving out empty ones', () => {
    expect(outcomeShares({ setups: 10, target: 3, stop: 2, time: 1, 'not-triggered': 4 })).toEqual([
      { key: 'target', label: 'Target hit', count: 3, pct: 30 },
      { key: 'stop', label: 'Stop hit', count: 2, pct: 20 },
      { key: 'time', label: 'Time exit', count: 1, pct: 10 },
      { key: 'not-triggered', label: 'Never triggered', count: 4, pct: 40 },
    ]);
  });

  it('counts only a target, a stop or a time exit as a trade', () => {
    const trades = Object.entries(SETUP_STATUS_VIEW)
      .filter(([, v]) => v.trade)
      .map(([k]) => k);
    expect(trades.sort()).toEqual(['stop', 'target', 'time']);
  });

  it('filters the setup list to trades or to the rest', () => {
    const s = (status: ReplaySetup['status']) => ({ status }) as ReplaySetup;
    const all = [s('target'), s('gapped'), s('time'), s('pending')];
    expect(filterReplaySetups(all, 'trades').map((x) => x.status)).toEqual(['target', 'time']);
    expect(filterReplaySetups(all, 'none').map((x) => x.status)).toEqual(['gapped', 'pending']);
    expect(filterReplaySetups(all, 'all')).toHaveLength(4);
  });

  it('sums a group in words, and says when nothing traded', () => {
    expect(
      lineSummary({ setups: 20, trades: 12, winRate: 58.3, expectancyPct: 0.84, avgR: 0.31 }),
    ).toBe('12 trades · 58% win · +0.84% a trade · +0.31R');
    expect(
      lineSummary({ setups: 3, trades: 0, winRate: null, expectancyPct: null, avgR: null }),
    ).toBe('3 setups · none traded');
    expect(
      lineSummary({ setups: 0, trades: 0, winRate: null, expectancyPct: null, avgR: null }),
    ).toBe('No setups');
    expect(formatR(-0.42)).toBe('−0.42R');
    expect(formatR(null)).toBe('—');
  });
});

describe('scan days, plans and checklists', () => {
  it('names a scan day with its setups and market', () => {
    expect(
      scanDayLabel({
        date: '2026-10-02',
        status: 'completed',
        setups: 6,
        gradeA: 2,
        regime: 'risk-on',
      }),
    ).toBe('Fri, 2 Oct · 6 setups (2 A) · Risk-on');
    expect(
      scanDayLabel({
        date: '2026-10-01',
        status: 'completed',
        setups: 1,
        gradeA: 0,
        regime: 'cautious',
      }),
    ).toBe('Thu, 1 Oct · 1 setup · Cautious');
    expect(
      scanDayLabel({
        date: '2026-09-30',
        status: 'failed',
        setups: 0,
        gradeA: 0,
        regime: 'unknown',
      }),
    ).toBe('Wed, 30 Sep · scan failed');
  });

  it('writes the plan as one sentence, naming the high it broke', () => {
    const s = {
      trigger: 'breakout' as const,
      plan: {
        trigger: 'breakout' as const,
        entry: 1470.5,
        stop: 1369.55,
        target: 1672.4,
        target3R: 1773.35,
        riskPerShare: 100.95,
        riskPct: 6.86,
        rewardRisk: 2,
        atr: 30,
        horizonDays: 10,
      },
      metrics: { close: 1468, high50: 1450, high20: 1440 } as never,
    };
    expect(planSentence(s)).toBe(
      'Broke out above its 50-day high. Buy only above ₹1,470.50; exit below ₹1,369.55 (the swing low, 6.9% risk), book at ₹1,672.40 (2R). An order that never triggers is no trade.',
    );
    expect(
      planSentence({ ...s, metrics: { close: 1468, high50: 1500, high20: 1440 } as never }),
    ).toMatch(/^Broke out above its 20-day high/);
    expect(planSentence({ ...s, trigger: 'pullback' })).toMatch(
      /^Bounced off its rising 20\/50 EMA/,
    );
  });

  it('groups checks in the six steps’ order and tallies them', () => {
    const c = (
      key: string,
      group: SwingCheck['group'],
      status: SwingCheck['status'],
    ): SwingCheck => ({
      key,
      label: key,
      group,
      status,
      hard: false,
      detail: '',
    });
    const checks = [
      c('plan', 'plan', 'pass'),
      c('adv', 'liquidity', 'pass'),
      c('event', 'catalyst', 'warn'),
      c('gaps', 'catalyst', 'na'),
    ];
    expect(groupChecks(checks).map((g) => [g.label, g.checks.map((x) => x.key)])).toEqual([
      ['1 · Liquidity', ['adv']],
      ['5 · Catalyst & quality', ['event', 'gaps']],
      ['6 · The trade', ['plan']],
    ]);
    expect(checkTally(checks)).toBe('2 passed · 1 caution · 1 not checked');
  });

  it('never throws on a regime it does not know', () => {
    expect(regimeView('sideways')).toEqual({ label: 'Not measured', tone: 'neutral' });
    expect(regimeView(null).label).toBe('Not measured');
  });

  it('orders sectors strongest first and keeps a funnel step with stocks visible', () => {
    const sector = (key: string, m: number | null) => ({
      key,
      label: key,
      members: 5,
      medianReturn21Pct: m,
      breadthAboveEma50Pct: null,
      state: 'neutral' as const,
    });
    expect(
      sectorsByStrength([sector('a', 1), sector('b', null), sector('c', 4)]).map((s) => s.key),
    ).toEqual(['c', 'a', 'b']);
    expect(
      funnelWidths([{ remaining: 800 }, { remaining: 200 }, { remaining: 2 }, { remaining: 0 }]),
    ).toEqual([100, 25, 1, 0]);
  });
});

describe('admin actions', () => {
  it('words a queued job, and a 403 as “Administrators only”', () => {
    expect(houseJobMessage('scan', false).title).toBe('Scan queued');
    expect(houseJobMessage('replay', false).title).toBe('Replay queued');
    expect(houseJobMessage('replay', true).title).toBe('Already queued');
    expect(
      adminActionError(new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Forbidden' })),
    ).toBe('Administrators only.');
    expect(adminActionError(new ApiError({ status: 500, code: 'X', message: 'Server down' }))).toBe(
      'Server down',
    );
  });
});

describe('the parser', () => {
  const summary = {
    key: 'institutional-breakout-swing',
    name: 'Institutional Breakout Swing',
    short: 'IBS',
    description: 'Volume-backed breakouts.',
    owner: 'platform',
    schedule: 'Scans every trading day at 16:30 IST',
    universe: 'Nifty 500 + F&O stocks',
    latestScan: {
      date: '2026-10-02',
      status: 'completed',
      setups: 6,
      gradeA: 2,
      regime: 'risk-on',
    },
    backtest: {
      status: 'completed',
      ranAt: '2026-10-02T12:00:00.000Z',
      from: '2025-10-01',
      to: '2026-10-02',
      sessions: 250,
      metrics: {
        totalTrades: 120,
        winRate: 52.5,
        profitFactor: null,
        maxDrawdownPct: 12.4,
        cagrPct: null,
        totalReturnPct: 18,
        expectancyPct: 0.84,
        wins: 63,
        losses: 57,
        symbolsWithTrades: 80,
      },
      equitySpark: [100, 101, 'x', 104],
      verdict: { tone: 'good', text: 'Held up out of sample.' },
    },
  };

  it('keeps the platform strategies it knows and drops the rest', () => {
    const list = normalizeHouseList({ strategies: [summary, { key: 'something-new' }, null] });
    expect(list).toHaveLength(1);
    expect(list[0]?.backtest?.metrics).toMatchObject({
      totalTrades: 120,
      profitFactor: null,
      wins: 63,
    });
    expect(list[0]?.backtest?.equitySpark).toEqual([100, 101, 104]);
    expect(list[0]?.latestScan).toEqual({
      date: '2026-10-02',
      status: 'completed',
      setups: 6,
      gradeA: 2,
      regime: 'risk-on',
    });
    expect(normalizeHouseList(null)).toEqual([]);
    expect(isHouseStrategyKey('institutional-breakout-swing')).toBe(true);
    expect(isHouseStrategyKey('bb-midband-5m')).toBe(true);
    expect(isHouseStrategyKey('house')).toBe(false);
  });

  it('fills the card fields an older server does not send, without inventing any', () => {
    const [s] = normalizeHouseList({ strategies: [summary] });
    expect(s).toMatchObject({
      kind: 'daily-swing',
      timeframe: '',
      holding: '',
      worksOn: [],
      stocks: null,
      deployments: [],
    });
  });

  it('reads both platform strategies with their works-on stocks and deployments', () => {
    const list = normalizeHouseList({
      strategies: [
        {
          key: 'bb-midband-5m',
          kind: 'intraday',
          timeframe: '5 min',
          holding: 'Intraday',
          latestScan: null,
          backtest: null,
          worksOn: [
            { symbol: 'TCS', trades: 22, winRate: 59.1, avgReturnPct: 0.12, profitFactor: 1.6 },
            { symbol: 'BROKEN' },
          ],
          stocks: { tested: 50, traded: 48, works: 9, avoid: 20 },
          deployments: [
            { id: 'a', mode: 'live', status: 'paused' },
            { id: 'b', mode: 'margin', status: 'active' },
            { id: 'c', mode: 'paper', status: 'weird' },
          ],
        },
        {
          ...summary,
          kind: 'daily-swing',
          timeframe: 'Daily',
          holding: 'Swing · up to 10 sessions',
        },
      ],
    });
    expect(list.map((s) => s.key)).toEqual(['bb-midband-5m', 'institutional-breakout-swing']);
    const bb = list[0]!;
    expect(bb.name).toBe('Bollinger Mid-Band Thrust');
    expect(bb.worksOn).toEqual([
      { symbol: 'TCS', trades: 22, winRate: 59.1, avgReturnPct: 0.12, profitFactor: 1.6 },
    ]);
    expect(bb.stocks).toEqual({ tested: 50, traded: 48, works: 9, avoid: 20 });
    // An unknown mode is no chip; an unknown status is treated as running.
    expect(bb.deployments).toEqual([
      { id: 'a', mode: 'live', status: 'paused' },
      { id: 'c', mode: 'paper', status: 'active' },
    ]);
    expect(list[1]?.holding).toBe('Swing · up to 10 sessions');
  });

  it('never reads the intraday strategy as a swing detail', () => {
    expect(normalizeHouseDetail({ strategy: { ...summary, key: 'bb-midband-5m' } })).toBeNull();
  });

  it('reads a detail before the first replay and with an incomplete config', () => {
    const d = normalizeHouseDetail({
      strategy: {
        ...summary,
        backtest: null,
        config: { ...config, targetR: undefined },
        scanDays: [{ date: '2026-10-02' }, {}],
        replay: null,
        caveats: ['One.', 3],
      },
    });
    expect(d?.replay).toBeNull();
    expect(d?.backtest).toBeNull();
    expect(d?.config).toBeNull();
    expect(d?.scanDays).toEqual([
      { date: '2026-10-02', status: 'failed', setups: 0, gradeA: 0, regime: 'unknown' },
    ]);
    expect(d?.caveats).toEqual(['One.']);
    expect(normalizeHouseDetail({ strategy: { key: 'nope' } })).toBeNull();
  });

  it('reads a replay whose run is in a saved strategy’s shape', () => {
    const d = normalizeHouseDetail({
      strategy: {
        ...summary,
        config,
        replay: {
          status: 'completed',
          runAt: '2026-10-02T12:00:00.000Z',
          durationMs: 182000,
          sessions: 250,
          universe: { label: 'Nifty 500 + F&O', size: 560, withBars: 540 },
          counts: { setups: 10, triggered: 6, target: 3, stop: 2 },
          byGrade: { A: { setups: 4, trades: 3, winRate: 66.7, expectancyPct: 1.2, avgR: 0.5 } },
          byTrigger: {},
          error: null,
          run: {
            runId: 'r1',
            ranAt: '2026-10-02T12:00:00.000Z',
            metrics: {
              totalTrades: 5,
              winRate: 60,
              profitFactor: 1.8,
              maxDrawdownPct: 3,
              cagrPct: null,
              totalReturnPct: 4,
              expectancyPct: 0.8,
              wins: 3,
              losses: 2,
            },
            analysis: null,
            trades: [
              {
                exchange: 'NSE',
                symbol: 'A',
                entryTime: 1,
                exitTime: 2,
                entryPrice: 10,
                exitPrice: 11,
                barsHeld: 3,
                returnPct: 9.7,
                exitReason: 'target',
              },
              { symbol: 'BROKEN' },
            ],
            equityCurve: [{ t: 1, v: 100 }, { t: 2 }, { t: 3, v: 104 }],
            symbolStats: [],
          },
          setups: [
            {
              symbol: 'A',
              date: '2026-09-01',
              grade: 'A',
              trigger: 'breakout',
              status: 'target',
              entry: 10,
              returnPct: 9.7,
            },
            { symbol: 'B' },
          ],
        },
      },
    });
    const rp = d!.replay!;
    expect(rp.counts).toMatchObject({
      setups: 10,
      triggered: 6,
      target: 3,
      stop: 2,
      time: 0,
      pending: 0,
    });
    expect(rp.byGrade.B).toEqual({
      setups: 0,
      trades: 0,
      winRate: null,
      expectancyPct: null,
      avgR: null,
    });
    expect(rp.byTrigger.breakout.setups).toBe(0);
    expect(rp.run?.trades.map((t) => t.symbol)).toEqual(['A']);
    expect(rp.run?.equityCurve).toEqual([
      { t: 1, v: 100 },
      { t: 3, v: 104 },
    ]);
    expect(rp.run?.costBps).toBe(15);
    expect(rp.setups.map((s) => s.symbol)).toEqual(['A']);
    expect(d?.config).toEqual(config);
  });

  it('reads a scan, null before the first one, and an unknown regime as “unknown”', () => {
    expect(normalizeScan({ scan: null })).toBeNull();
    const scan = normalizeScan({
      scan: {
        date: '2026-10-02',
        status: 'completed',
        runAt: '2026-10-02T11:00:00.000Z',
        regime: { state: 'sideways' },
        universe: { label: 'Nifty 500', size: 560, withBars: 540, current: 530 },
        funnel: [{ key: 'liq', label: 'Liquid', remaining: 400 }, { remaining: 3 }],
        setups: [
          {
            symbol: 'TMPV',
            grade: 'A',
            trigger: 'pullback',
            fno: true,
            plan: { entry: 1042, stop: 1008, target: 1110 },
            checks: [
              {
                key: 'adv',
                label: 'Liquid',
                group: 'liquidity',
                status: 'pass',
                hard: true,
                detail: '₹120 cr',
              },
              { label: '' },
            ],
          },
        ],
        nearMisses: [{ symbol: 'X', score: 61, failedOn: 'Volume below 1.5×' }],
        sectors: [{ key: 'auto', label: 'Auto', state: 'strong', medianReturn21Pct: 3.2 }],
      },
    })!;
    expect(scan.regime.state).toBe('unknown');
    expect(scan.funnel).toEqual([{ key: 'liq', label: 'Liquid', remaining: 400 }]);
    expect(scan.setups[0]).toMatchObject({
      exchange: 'NSE',
      fno: true,
      trigger: 'pullback',
      plan: { trigger: 'pullback', entry: 1042, target3R: null },
      metrics: { close: null },
    });
    expect(scan.setups[0]?.checks).toHaveLength(1);
    expect(scan.sectors[0]).toMatchObject({ key: 'auto', members: 0, breadthAboveEma50Pct: null });
  });

  it('reads the regime the strong-picks read carries, with its as-of day', () => {
    expect(
      normalizeRegime({ state: 'cautious', detail: 'Between averages.', asOf: '2026-10-02' }),
    ).toMatchObject({
      state: 'cautious',
      asOf: '2026-10-02',
      vix: null,
    });
    expect(normalizeRegime(null)).toBeNull();
    expect(normalizeJobResult({ jobId: 'swing-scan', alreadyQueued: true })).toEqual({
      jobId: 'swing-scan',
      alreadyQueued: true,
    });
  });
});
