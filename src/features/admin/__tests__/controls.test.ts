import { tokensPerCall } from '../lib/aiProviders';
import { researchSummary } from '../lib/browserResearch';
import { dataSourceRows } from '../lib/dataSources';
import { healthSummary } from '../lib/services';
import { killReasonError, liveOrderGate, normalizeKillSwitch } from '../lib/trading';
import { APPROVAL, describeUserChange } from '../lib/users';
import { adminSection } from '../sections';
import type { ServiceHealthRow } from '../types';

describe('admin sections', () => {
  it('opens the renamed API usage section from its old id', () => {
    expect(adminSection('api-usage')?.title).toBe('Third-party API usage');
    expect(adminSection('broker-usage')?.id).toBe('api-usage');
    expect(adminSection('API-USAGE')?.id).toBe('api-usage');
    expect(adminSection('flags')).toBeUndefined();
    expect(adminSection(undefined)).toBeUndefined();
  });
});

describe('kill switch', () => {
  it('reads a confirmed engage and release', () => {
    expect(
      normalizeKillSwitch({
        engaged: true,
        reason: 'Broker outage',
        engagedAt: '2026-10-05T03:00:00Z',
        engagedBy: 'u1',
      }),
    ).toEqual({
      engaged: true,
      reason: 'Broker outage',
      engagedAt: '2026-10-05T03:00:00Z',
      engagedBy: 'u1',
    });
    expect(normalizeKillSwitch({ engaged: false, reason: null, engagedAt: null })).toEqual({
      engaged: false,
      reason: null,
      engagedAt: null,
      engagedBy: null,
    });
  });

  it('fails closed on a reply it cannot read', () => {
    expect(normalizeKillSwitch(null).engaged).toBe(true);
    expect(normalizeKillSwitch({ engaged: 'no' }).engaged).toBe(true);
  });

  it('checks the reason the server will accept (3–500 characters)', () => {
    expect(killReasonError('')).not.toBeNull();
    expect(killReasonError(' ab ')).toBe('At least 3 characters');
    expect(killReasonError('abc')).toBeNull();
    expect(killReasonError('x'.repeat(501))).toBe('At most 500 characters');
  });

  it('says what the two switches allow, Safe Mode included', () => {
    expect(liveOrderGate(undefined, false).tone).toBe('neutral');
    expect(liveOrderGate(true, true).tone).toBe('bad');
    expect(liveOrderGate(false, false).tone).toBe('warn');
    expect(liveOrderGate(true, false).detail).toMatch(/Safe Mode/);
  });
});

describe('users', () => {
  const user = { email: 'a@example.com', role: 'user' as const };
  it('calls a waiting account waiting and a rejected one grey', () => {
    expect(APPROVAL.pending.label).toBe('Waiting');
    expect(APPROVAL.rejected.tone).toBe('neutral');
  });

  it('asks to revoke a working account, and to reject a waiting one', () => {
    expect(
      describeUserChange({ ...user, approvalStatus: 'approved' }, { approvalStatus: 'rejected' }),
    ).toMatchObject({ title: 'Revoke access?', confirmLabel: 'Revoke', destructive: true });
    expect(
      describeUserChange({ ...user, approvalStatus: 'pending' }, { approvalStatus: 'rejected' }),
    ).toMatchObject({ title: 'Reject this account?' });
    expect(
      describeUserChange({ ...user, approvalStatus: 'approved' }, { approvalStatus: 'approved' }),
    ).toBeNull();
  });
});

describe('dataSourceRows', () => {
  it('lists the service account, each session of yours, and the news feeds', () => {
    const rows = dataSourceRows({
      recService: { connected: true, lastRefreshedAt: '2026-10-05T03:00:00Z', lastError: null },
      connections: [
        {
          broker: 'mstock',
          mfaMethod: 'otp' as never,
          status: 'connected',
          connectedAt: null,
          expiresAt: null,
          lastError: null,
        },
        {
          broker: 'groww',
          mfaMethod: 'totp' as never,
          status: 'error',
          connectedAt: null,
          expiresAt: null,
          lastError: 'x',
        },
      ],
      workflows: { total: 5, active: 5, failedLast24h: 2, lastSuccessAt: null },
    });
    expect(rows.map((r) => [r.name, r.tone, r.label])).toEqual([
      ['mStock · service account', 'ok', 'Live'],
      ['mStock · your session', 'ok', 'connected'],
      ['Groww · your session', 'bad', 'error'],
      ['News RSS via n8n', 'bad', '2 failed'],
    ]);
  });

  it('separates checking from unreachable', () => {
    const loading = dataSourceRows({
      recService: undefined,
      connections: undefined,
      workflows: undefined,
    });
    expect(loading.map((r) => r.label)).toEqual(['Checking', 'Checking']);
    const down = dataSourceRows({ recService: undefined, connections: [], workflows: null });
    expect(down[1]).toMatchObject({ tone: 'warn', label: 'Unreachable' });
  });
});

describe('summaries', () => {
  it('sums recent research runs', () => {
    expect(
      researchSummary([
        { outcome: 'success', pagesVisited: 4 },
        { outcome: 'failed', pagesVisited: 1 },
      ]),
    ).toEqual({ runs: 2, succeeded: 1, pages: 5 });
  });

  it('finds the lowest uptime and never counts an unsampled service as up', () => {
    const row = (over: Partial<ServiceHealthRow>): ServiceHealthRow => ({
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
    });
    const summary = healthSummary([
      row({ service: 'mongo', uptimePct: 99.2, failures: 3 }),
      row({ service: 'redis', uptimePct: 100 }),
      row({ service: 'worker', ok: true, checks: 0, detail: 'no checks yet', uptimePct: null }),
    ]);
    expect(summary).toMatchObject({ up: 2, total: 3, failures: 3 });
    expect(summary.worst?.service).toBe('mongo');
    expect(healthSummary([]).worst).toBeNull();
  });

  it('averages tokens over answered calls only', () => {
    expect(tokensPerCall({ calls: 5, totalTokens: 1000, failedCalls: 1 })).toBe(250);
    expect(tokensPerCall({ calls: 2, totalTokens: 0, failedCalls: 2 })).toBeNull();
  });
});
