import type { Recommendation } from '@/features/insights/types';
import type { BrokerConnectionSummary } from '@/features/trading/types';

// Ported from the web client (features/alerts/derive-alerts.ts). The server has no
// notification feed: the bell is derived on the device from today's picks, broker
// sessions and the paper auto-trade halt state.

export type AlertSeverity = 'action' | 'warning' | 'info';

export interface DerivedAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  symbol: string | null;
  exchange: string | null;
  /** ISO timestamp from the source data, or null. Never fabricated. */
  at: string | null;
  target: 'stock' | 'broker' | 'paper' | 'picks';
}

export interface AlertInputs {
  recommendations: readonly Recommendation[];
  recommendationDate: string | null;
  brokers: readonly BrokerConnectionSummary[];
  autoTrade: { haltedReason: string | null; haltedAt: string | null } | null;
  now: Date;
}

const SESSION_WARNING_HOURS = 24;

const BROKER_LABELS: Record<string, string> = { mstock: 'mStock', groww: 'Groww' };
const brokerLabel = (id: string) => BROKER_LABELS[id] ?? id;

const SEVERITY_ORDER: Record<AlertSeverity, number> = { action: 0, warning: 1, info: 2 };

export function deriveAlerts(inputs: AlertInputs): DerivedAlert[] {
  const alerts: DerivedAlert[] = [];

  // No per-pick price alerts (stop breached / target reached): a pick's `ltp` is the price
  // when it was published, not a live quote, so comparing it with the stop and target
  // would raise alerts on stale data. They need a live price source first.

  if (inputs.autoTrade?.haltedReason) {
    alerts.push({
      id: 'autotrade-halted',
      severity: 'action',
      title: 'Auto-trade halted',
      detail: inputs.autoTrade.haltedReason,
      symbol: null,
      exchange: null,
      at: inputs.autoTrade.haltedAt,
      target: 'paper',
    });
  }

  for (const broker of inputs.brokers) {
    const base = { symbol: null, exchange: null, target: 'broker' as const };
    if (broker.lastError) {
      alerts.push({
        ...base,
        id: `broker-error:${broker.broker}`,
        severity: 'action',
        title: 'Broker connection failed',
        detail: `${brokerLabel(broker.broker)}: ${broker.lastError}`,
        at: null,
      });
      continue;
    }
    // Self-refreshing connections (API key + TOTP, e.g. Groww) pass `expiresAt` every day
    // and are re-minted by the server — an "expired" alert for them would be false.
    if (broker.autoRefresh || !broker.expiresAt) continue;
    const expiry = Date.parse(broker.expiresAt);
    if (!Number.isFinite(expiry)) continue;
    const hours = (expiry - inputs.now.getTime()) / 3_600_000;

    if (hours <= 0) {
      alerts.push({
        ...base,
        id: `broker-expired:${broker.broker}`,
        severity: 'action',
        title: 'Broker session expired',
        detail: `Reconnect ${brokerLabel(broker.broker)} to restore live prices and trading.`,
        at: broker.expiresAt,
      });
    } else if (hours <= SESSION_WARNING_HOURS) {
      const rounded = Math.max(1, Math.round(hours));
      alerts.push({
        ...base,
        id: `broker-expiring:${broker.broker}`,
        severity: 'warning',
        title: 'Broker session expiring',
        detail: `${brokerLabel(broker.broker)} expires in about ${rounded} hour${rounded === 1 ? '' : 's'}.`,
        at: broker.expiresAt,
      });
    }
  }

  if (inputs.recommendations.length > 0 && inputs.recommendationDate) {
    const count = inputs.recommendations.length;
    alerts.push({
      id: `picks:${inputs.recommendationDate}`,
      severity: 'info',
      title: `${count} pick${count === 1 ? '' : 's'} for ${inputs.recommendationDate}`,
      detail: 'Review the reasoning behind each before acting.',
      symbol: null,
      exchange: null,
      at: null,
      target: 'picks',
    });
  }

  // Stable sort: severity first, input order within a severity.
  return alerts
    .map((alert, index) => ({ alert, index }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.alert.severity] - SEVERITY_ORDER[b.alert.severity] || a.index - b.index,
    )
    .map(({ alert }) => alert);
}
