import {
  buildOverviewServices,
  errorRate,
  errorRateTone,
  trafficSplit,
  verdictInputs,
  type OverviewInputs,
} from '../lib/overview';
import type { ServiceHealthRow } from '../types';

const base: OverviewInputs = {
  liveness: { ok: true, data: { status: 'ok', uptimeSeconds: 3700 } },
  readiness: { ok: true, data: { checks: { mongo: true, redis: true }, breakers: {} } },
  workflows: { total: 5, active: 4, failedLast24h: 0, lastSuccessAt: null },
  mstock: { loaded: true, connection: undefined },
  recService: { connected: true, lastRefreshedAt: null, lastError: null },
  formatTime: (iso) => iso,
};

const byName = (inputs: OverviewInputs) =>
  Object.fromEntries(buildOverviewServices(inputs).map((c) => [c.name, c]));

function row(over: Partial<ServiceHealthRow> = {}): ServiceHealthRow {
  return {
    service: 'redis',
    ok: true,
    latencyMs: 1,
    detail: null,
    uptimePct: 100,
    checks: 60,
    failures: 0,
    avgLatencyMs: 1,
    lastFailureAt: null,
    series: [],
    ...over,
  };
}

describe('buildOverviewServices', () => {
  it('reads every check when all is well', () => {
    const checks = byName(base);
    expect(checks.API).toEqual({ name: 'API', tone: 'ok', detail: 'Up 1h 1m' });
    expect(checks.MongoDB?.tone).toBe('ok');
    expect(checks['Circuit breakers']?.detail).toBe('All closed');
    expect(checks['n8n workflows']?.detail).toBe('0 failed in 24h · 4 active');
    // Not having a session of your own is a choice, not an outage.
    expect(checks['mStock · your session']).toMatchObject({
      tone: 'neutral',
      detail: 'Not connected',
    });
  });

  it('says "checking" before anything answered, never green', () => {
    const checks = byName({
      ...base,
      liveness: undefined,
      readiness: undefined,
      workflows: undefined,
      recService: undefined,
      mstock: { loaded: false, connection: undefined },
    });
    for (const check of Object.values(checks)) {
      expect(check.tone).toBe('neutral');
      expect(check.detail).toBe('Checking…');
    }
  });

  it('separates an unreachable n8n from a loading one', () => {
    expect(byName({ ...base, workflows: null })['n8n workflows']).toMatchObject({
      tone: 'warn',
      detail: 'Unreachable',
    });
  });

  it('drops the datastores the uptime checker already reports', () => {
    const names = buildOverviewServices({ ...base, probed: new Set(['mongo']) }).map((c) => c.name);
    expect(names).not.toContain('MongoDB');
    expect(names).toContain('Redis');
  });

  it('counts open breakers and reads an unreachable API as down', () => {
    const checks = byName({
      ...base,
      liveness: { ok: false, data: null },
      readiness: {
        ok: false,
        data: { checks: { mongo: false }, breakers: { a: 'open', b: { state: 'closed' } } },
      },
    });
    expect(checks.API?.tone).toBe('bad');
    expect(checks.MongoDB).toMatchObject({ tone: 'bad', detail: 'Not connected' });
    expect(checks.Redis).toMatchObject({ tone: 'neutral', detail: 'Unknown' });
    expect(checks['Circuit breakers']).toMatchObject({ tone: 'bad', detail: '1 open of 2' });
  });
});

describe('verdictInputs', () => {
  it('calls only the API and its datastores an outage', () => {
    const checks = buildOverviewServices({
      ...base,
      liveness: { ok: false, data: null },
      workflows: { total: 5, active: 4, failedLast24h: 1, lastSuccessAt: null },
    });
    expect(verdictInputs(checks, [])).toEqual({ down: ['API'], warnings: 1 });
  });

  it('names failed probes once and ignores unsampled ones', () => {
    const checks = buildOverviewServices(base);
    const services = [
      row({ service: 'redis', ok: false }),
      row({ service: 'worker', ok: false, checks: 0, detail: 'no checks yet' }),
    ];
    expect(verdictInputs(checks, services)).toEqual({ down: ['Redis'], warnings: 0 });
  });
});

describe('traffic', () => {
  it('states an error rate only when there was traffic', () => {
    expect(errorRate(null)).toBeNull();
    expect(errorRate({ requests: 0, errors4xx: 0, errors5xx: 0 })).toBeNull();
    expect(errorRate({ requests: 200, errors4xx: 3, errors5xx: 1 })).toBe(2);
    expect(errorRateTone(null)).toBeUndefined();
    expect(errorRateTone(0.5)).toBe('ok');
    expect(errorRateTone(2)).toBe('warn');
    expect(errorRateTone(5)).toBe('bad');
  });

  it('stacks handled and errors to the real request count', () => {
    expect(
      trafficSplit([
        {
          periodStart: 'a',
          count: 12,
          byClass: { '2xx': 8, '3xx': 1, '4xx': 1, '5xx': 1 },
          avgLatencyMs: null,
          maxLatencyMs: 0,
        },
        { periodStart: 'b', count: 0, byClass: {}, avgLatencyMs: null, maxLatencyMs: 0 },
      ]),
    ).toEqual({ ok: [10, 0], errors: [2, 0] });
  });
});
