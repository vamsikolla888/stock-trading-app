import type { StatusTone } from '@/features/settings/lib/status';

// Trading controls (web: AdminConsole → Feature flags → Live trading, plus the kill switch the
// web only shows read-only). Both are global Redis settings that fail CLOSED on the server:
// an unreadable switch reads as off / engaged.

/** The server's rule for an engage reason (engageKillSwitchBodySchema): 3–500 characters. */
export const KILL_REASON_MIN = 3;
export const KILL_REASON_MAX = 500;

export function killReasonError(reason: string): string | null {
  const length = reason.trim().length;
  if (length === 0) return 'Say why, so whoever clears it knows what happened';
  if (length < KILL_REASON_MIN) return `At least ${KILL_REASON_MIN} characters`;
  if (length > KILL_REASON_MAX) return `At most ${KILL_REASON_MAX} characters`;
  return null;
}

export interface LiveOrderGate {
  tone: StatusTone;
  title: string;
  detail: string;
}

/**
 * Whether a real order can pass the two global gates right now. A broker session and the
 * per-order risk checks still apply on top — this only says what the switches allow.
 */
export function liveOrderGate(
  enabled: boolean | undefined,
  killEngaged: boolean | undefined,
): LiveOrderGate {
  if (enabled === undefined || killEngaged === undefined) {
    return { tone: 'neutral', title: 'Checking…', detail: 'Reading both switches.' };
  }
  if (killEngaged) {
    return {
      tone: 'bad',
      title: 'Live orders blocked',
      detail: 'The kill switch is engaged — every new live order is refused, whatever the setting.',
    };
  }
  if (!enabled) {
    return {
      tone: 'warn',
      title: 'Live trading is off',
      detail: 'Real orders are refused until an administrator switches it on. Paper trading works.',
    };
  }
  return {
    tone: 'ok',
    title: 'Live orders accepted',
    detail: 'Real orders reach the broker after the per-order risk checks.',
  };
}

/** `updatedBy` / `engagedBy` hold a user id (or "system"); shown as an email when known. */
export function actorLabel(
  actor: string | null | undefined,
  emailsById: ReadonlyMap<string, string>,
): string | null {
  if (!actor) return null;
  if (actor.startsWith('system')) return 'the system';
  return emailsById.get(actor) ?? 'another administrator';
}

/** Reads an optional string field the shared trading types don't declare (updatedBy, engagedBy). */
export function stringField(value: object | null | undefined, key: string): string | null {
  if (!value || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : null;
}
