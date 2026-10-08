import type { StatusTone } from '@/features/settings/lib/status';

import type { KillSwitchAdminState } from '../types';

// Trading controls (web: Admin › Trading controls) — the two platform switches every real order
// passes through. Both are global Redis settings that fail CLOSED on the server: an unreadable
// switch reads as off / engaged. A real order also needs its own user's Safe Mode off.

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
    detail:
      'Real orders reach the broker after the per-order risk checks, unless the user’s own Safe Mode is on.',
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

/**
 * The kill-switch state an engage/disengage reply carries, ready to put in the shared
 * kill-switch query. Anything unreadable is treated as ENGAGED — the server fails closed, and
 * the screen must never show "clear" for a state it could not read.
 */
export function normalizeKillSwitch(raw: unknown): KillSwitchAdminState {
  const value =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const str = (field: unknown) => (typeof field === 'string' && field.trim() ? field : null);
  return {
    engaged: value.engaged !== false,
    reason: str(value.reason),
    engagedAt: str(value.engagedAt),
    engagedBy: str(value.engagedBy),
  };
}
