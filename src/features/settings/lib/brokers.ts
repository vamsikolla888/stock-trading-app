import type { StatusTone } from '@/features/settings/lib/status';
import type { BrokerCatalogEntry, BrokerConnectionSummary } from '@/features/trading/types';

import type { GrowwTokenStatus, TokenRefreshOutcome } from '../types';

// Ported from the web client's BrokerConnect.tsx and GrowwTokenPanel.tsx.

export type BrokerCardState = 'connected' | 'expired' | 'awaiting-code' | 'error' | 'not-connected';

export function brokerCardState(connection: BrokerConnectionSummary | undefined): BrokerCardState {
  if (!connection) return 'not-connected';
  if (connection.status === 'connected') return 'connected';
  if (connection.status === 'pending_verification') return 'awaiting-code';
  if (connection.status === 'error') return 'error';
  return 'expired';
}

export const BROKER_STATE_CHIP: Record<BrokerCardState, { tone: StatusTone; label: string }> = {
  connected: { tone: 'ok', label: 'Connected' },
  expired: { tone: 'warn', label: 'Session expired' },
  'awaiting-code': { tone: 'warn', label: 'Awaiting code' },
  error: { tone: 'bad', label: 'Needs attention' },
  'not-connected': { tone: 'neutral', label: 'Not connected' },
};

export function brokerCapabilities(broker: BrokerCatalogEntry): string[] {
  const caps: string[] = [];
  if (broker.capabilities.portfolio) caps.push('Portfolio');
  if (broker.capabilities.orderHistory) caps.push('Orders & trades');
  if (broker.capabilities.liveTrading) caps.push('Live trading');
  if (broker.capabilities.marketData) caps.push('Market data');
  return caps;
}

export function brokerAuthLabel(broker: BrokerCatalogEntry): string {
  return broker.auth === 'api-key-totp' ? 'API key + TOTP' : 'API key + daily code';
}

/** Where "Open portfolio" goes for a connected broker (the Trade tab's broker books). */
export const PORTFOLIO_HREF = {
  mstock: '/trade/mstock',
  groww: '/trade/groww',
} as const;

export function portfolioHref(
  brokerId: string,
): (typeof PORTFOLIO_HREF)[keyof typeof PORTFOLIO_HREF] | null {
  return brokerId in PORTFOLIO_HREF
    ? PORTFOLIO_HREF[brokerId as keyof typeof PORTFOLIO_HREF]
    : null;
}

/** One-line summary for the Preferences menu row. */
export function brokerSummary(
  connections: readonly BrokerConnectionSummary[] | undefined,
  catalog: readonly BrokerCatalogEntry[] | undefined,
): string {
  const list = connections ?? [];
  const label = (id: string) => catalog?.find((broker) => broker.id === id)?.label ?? id;
  const connected = list.filter((connection) => connection.status === 'connected');
  const attention = list.filter(
    (connection) =>
      connection.status !== 'connected' && connection.status !== 'pending_verification',
  );
  if (attention.length > 0) {
    return `${attention.map((connection) => label(connection.broker)).join(', ')} needs attention`;
  }
  if (connected.length === 0) return 'Connect mStock, Groww and more';
  return `${connected.map((connection) => label(connection.broker)).join(', ')} connected`;
}

/** Base32 TOTP secret (what Groww shows beside the QR code), not the 6-digit code. */
export function cleanTotpSecret(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

export function isTotpSecret(input: string): boolean {
  return /^[A-Z2-7]{16,}=*$/.test(cleanTotpSecret(input));
}

export function growwTokenChip(status: GrowwTokenStatus): { tone: StatusTone; label: string } {
  if (status.valid) return { tone: 'ok', label: 'Valid' };
  if (status.status === 'error') return { tone: 'bad', label: 'Needs attention' };
  return { tone: 'warn', label: 'Expired · renews on next use' };
}

export const TOKEN_OUTCOME: Record<TokenRefreshOutcome, { tone: StatusTone; label: string }> = {
  refreshed: { tone: 'ok', label: 'Refreshed' },
  skipped: { tone: 'neutral', label: 'Already fresh' },
  failed: { tone: 'bad', label: 'Failed' },
};

export const TOKEN_TRIGGER: Record<GrowwTokenStatus['runs'][number]['trigger'], string> = {
  schedule: 'Daily job',
  admin: 'Admin',
  user: 'You',
};
