import { deriveAlerts, type AlertInputs } from '@/features/alerts/deriveAlerts';
import type { Recommendation } from '@/features/insights/types';

const now = new Date('2026-09-25T10:00:00Z');

function rec(overrides: Partial<Recommendation>): Recommendation {
  return {
    sym: 'RELIANCE',
    name: 'Reliance Industries',
    exch: 'NSE',
    conf: 70,
    allocationPercent: 10,
    risk: 'Medium',
    lo: 100,
    hi: 110,
    target: 130,
    stop: 90,
    exp: 5,
    hold: '5 days',
    sent: 0.2,
    ltp: 105,
    why: [],
    caveat: '',
    ...overrides,
  };
}

const base: AlertInputs = {
  recommendations: [],
  recommendationDate: null,
  brokers: [],
  autoTrade: null,
  now,
};

describe('deriveAlerts', () => {
  it('never judges stop or target from the publication price', () => {
    // `ltp` on a pick is the price when it was published — below its stop here, above its
    // target there, yet neither says anything about the market now.
    const alerts = deriveAlerts({
      ...base,
      recommendations: [rec({ sym: 'A', ltp: 89 }), rec({ sym: 'B', ltp: 131 })],
    });
    expect(alerts).toEqual([]);
  });

  it('reports broker errors, expired and expiring sessions', () => {
    const alerts = deriveAlerts({
      ...base,
      brokers: [
        {
          broker: 'mstock',
          mfaMethod: 'otp',
          status: 'connected',
          connectedAt: null,
          expiresAt: '2026-09-25T09:00:00Z',
          lastError: null,
        },
        {
          broker: 'groww',
          mfaMethod: 'totp',
          status: 'connected',
          connectedAt: null,
          expiresAt: '2026-09-25T15:00:00Z',
          lastError: null,
        },
      ],
    });
    expect(alerts.map((alert) => alert.id)).toEqual([
      'broker-expired:mstock',
      'broker-expiring:groww',
    ]);
    expect(alerts[1]?.detail).toBe('Groww expires in about 5 hours.');
  });

  it('skips expiry alerts for sessions the server refreshes itself', () => {
    const alerts = deriveAlerts({
      ...base,
      brokers: [
        {
          broker: 'groww',
          mfaMethod: 'totp',
          status: 'connected',
          connectedAt: null,
          expiresAt: '2026-09-25T06:00:00Z',
          lastError: null,
          autoRefresh: true,
        },
      ],
    });
    expect(alerts).toEqual([]);
  });

  it('orders action → warning → info, keeping input order within a severity', () => {
    const alerts = deriveAlerts({
      ...base,
      recommendationDate: '2026-09-25',
      recommendations: [rec({ sym: 'PICK' })],
      autoTrade: { haltedReason: 'Daily loss limit reached', haltedAt: null },
      brokers: [
        {
          broker: 'mstock',
          mfaMethod: 'otp',
          status: 'connected',
          connectedAt: null,
          expiresAt: '2026-09-25T15:00:00Z',
          lastError: null,
        },
      ],
    });
    expect(alerts.map((alert) => [alert.id, alert.severity])).toEqual([
      ['autotrade-halted', 'action'],
      ['broker-expiring:mstock', 'warning'],
      ['picks:2026-09-25', 'info'],
    ]);
  });
});
