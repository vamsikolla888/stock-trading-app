import type { StatusTone } from '@/features/settings/lib/status';
import type { BrokerConnectionSummary } from '@/features/trading/types';

import type { GenerateRunResult, MstockConnectionStatus, ServiceUserOption } from '../types';

// The recommendation engine's data session (web: RecommendationsAdmin). Two ways to give it
// a live mStock session: borrow a user's own connection, or a dedicated service account.

export const MSTOCK_STATUS: Record<MstockConnectionStatus, { tone: StatusTone; label: string }> = {
  connected: { tone: 'ok', label: 'Connected' },
  pending_verification: { tone: 'warn', label: 'Awaiting code' },
  disconnected: { tone: 'warn', label: 'Session expired' },
  error: { tone: 'bad', label: 'Needs attention' },
  not_connected: { tone: 'neutral', label: 'Not connected' },
};

/** "Connected · Authenticator app" — the picker row's second line. */
export function serviceUserDetail(option: ServiceUserOption): string {
  const status = MSTOCK_STATUS[option.mstock.status]?.label ?? option.mstock.status;
  if (option.mstock.status === 'not_connected') return 'mStock not connected';
  const mfa =
    option.mstock.mfaMethod === 'totp'
      ? 'Authenticator app'
      : option.mstock.mfaMethod === 'otp'
        ? 'SMS code'
        : null;
  return mfa ? `mStock ${status.toLowerCase()} · ${mfa}` : `mStock ${status.toLowerCase()}`;
}

export type ServiceUserWarning = 'not-connected' | 'will-go-stale';

/**
 * Why a pick would not keep the engine fed. Only a TOTP connection can be renewed by the
 * daily refresh job (it generates a TOTP code); an SMS-code one lapses at the next expiry.
 */
export function serviceUserWarning(option: ServiceUserOption | null): ServiceUserWarning | null {
  if (!option) return null;
  if (option.mstock.status === 'not_connected') return 'not-connected';
  if (option.mstock.mfaMethod !== 'totp') return 'will-go-stale';
  return null;
}

/** Email search for the picker; the current engine user always stays listed. */
export function filterServiceUsers(
  users: readonly ServiceUserOption[],
  query: string,
  keepId: string | null,
): ServiceUserOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...users];
  return users.filter((user) => user.id === keepId || user.email.toLowerCase().includes(q));
}

/** The dedicated account's mStock connection, from GET .../service-broker. */
export function serviceConnectionState(connection: BrokerConnectionSummary | null): {
  tone: StatusTone;
  label: string;
} {
  if (!connection) return MSTOCK_STATUS.not_connected;
  return MSTOCK_STATUS[connection.status] ?? { tone: 'neutral', label: connection.status };
}

/** One line for a queued engine run. */
export function runOutcomeMessage(result: GenerateRunResult, what: string): string {
  if (result.alreadyRunning)
    return `${what} is already queued for ${result.date} (job ${result.jobId}).`;
  return `${what} queued for ${result.date} as job ${result.jobId}. Results appear when the worker finishes.`;
}
