import { appConfig } from '@/config/app';
import { displayNameFromEmail } from '@/lib/utils/user';

import type { AccountProfile, AccountSession, AuthenticationMethod } from '../types';

/**
 * This app's own User-Agent (services/api/userAgent.ts): "<Name>/<version> (<details>)". Only
 * this app's product token matches — a browser's "Mozilla/5.0 (…)" has the same shape.
 */
const APP_PRODUCT = appConfig.name.replace(/\s+/g, '');
export const APP_USER_AGENT = new RegExp(String.raw`^(${APP_PRODUCT})/[\w.-]+ \(([^)]*)\)`);

/** Same rule as the server's updateProfileSchema. */
export const PHONE_PATTERN = /^\+?[0-9 ()-]{7,24}$/;
export const PROFILE_LIMITS = { displayName: 80, phone: 24, bio: 240 } as const;
/** Server avatar route: JPG, PNG or WebP up to 5 MB. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** What to call the person: their chosen name, else one derived from the email. */
export function profileName(
  profile: Pick<AccountProfile, 'displayName' | 'email'> | null | undefined,
  fallbackEmail?: string | null,
): string {
  const chosen = profile?.displayName?.trim();
  if (chosen) return chosen;
  return displayNameFromEmail(profile?.email ?? fallbackEmail) || 'Your account';
}

/** Up to two initials for an avatar with no photo. */
export function profileInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return initials || '?';
}

export type SessionDevice = 'phone' | 'tablet' | 'computer';

/**
 * A session's heading. The server names a device from its browser; this app is not a browser,
 * so its sessions (recognised by our own User-Agent) are named after the app and the phone.
 */
export function sessionTitle(
  session: Pick<AccountSession, 'userAgent' | 'deviceName' | 'operatingSystem'>,
): string {
  const match = APP_USER_AGENT.exec(session.userAgent ?? '');
  if (match) {
    const details = match[2]!.split(';').map((part) => part.trim());
    // "(Linux; Android 14; Pixel 7)" → "Pixel 7"; "(iPhone 15; iPhone OS 17.4)" → "iPhone 15".
    const model = details.find(
      (part) => part && !/^(linux|android\b|iphone os|ipados)/i.test(part),
    );
    return `${match[1]} app${model ? ` · ${model}` : ` · ${session.operatingSystem}`}`;
  }
  return session.deviceName || 'Unknown device';
}

export function sessionDevice(
  session: Pick<AccountSession, 'deviceName' | 'userAgent'>,
): SessionDevice {
  const text = `${session.deviceName} ${session.userAgent}`;
  if (/tablet|ipad/i.test(text)) return 'tablet';
  if (/mobile|iphone|android/i.test(text)) return 'phone';
  return 'computer';
}

export function authMethodLabel(method: AuthenticationMethod): string {
  if (method === 'authenticator') return 'Authenticator code';
  if (method === 'recovery-code') return 'Recovery code';
  return 'Password';
}

/** This device first, then the rest by most recent activity; signed-out ones last. */
export function sortSessions(sessions: readonly AccountSession[]): AccountSession[] {
  return [...sessions].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
  });
}

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP" — easier to type into an authenticator. */
export function groupSecret(secret: string): string {
  return (
    secret
      .replace(/\s+/g, '')
      .match(/.{1,4}/g)
      ?.join(' ') ?? secret
  );
}

/** The text shared when someone saves their recovery codes off the phone. */
export function recoveryCodesText(
  appName: string,
  email: string,
  codes: readonly string[],
): string {
  return [
    `${appName} recovery codes for ${email}`,
    '',
    ...codes,
    '',
    'Each code works once. Keep them somewhere other than your phone.',
  ].join('\n');
}

export interface ProfileDraftCheck {
  valid: boolean;
  changed: boolean;
  errors: Partial<Record<'displayName' | 'phone' | 'bio', string>>;
}

/** Client-side mirror of the server's profile rules, so a bad phone never costs a round trip. */
export function checkProfileDraft(
  draft: { displayName: string; phone: string; bio: string },
  saved: Pick<AccountProfile, 'displayName' | 'phone' | 'bio'>,
): ProfileDraftCheck {
  const errors: ProfileDraftCheck['errors'] = {};
  const phone = draft.phone.trim();
  if (phone && !PHONE_PATTERN.test(phone)) errors.phone = 'Enter a valid phone number';
  if (draft.displayName.trim().length > PROFILE_LIMITS.displayName) {
    errors.displayName = `At most ${PROFILE_LIMITS.displayName} characters`;
  }
  if (draft.bio.trim().length > PROFILE_LIMITS.bio) {
    errors.bio = `At most ${PROFILE_LIMITS.bio} characters`;
  }
  const changed =
    draft.displayName.trim() !== saved.displayName ||
    phone !== saved.phone ||
    draft.bio.trim() !== saved.bio;
  return { valid: Object.keys(errors).length === 0, changed, errors };
}

/** "Member since September 2026". */
export function memberSince(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) return '';
  return `Member since ${date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
}

/** The server's refusal of a real order while the account's Safe Mode is on (403 SAFE_MODE_ON). */
export const SAFE_MODE_REFUSAL = 'SAFE_MODE_ON';

export function isSafeModeRefusal(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === SAFE_MODE_REFUSAL;
}

/** The profile switch's second line. `known` is false until the server has answered. */
export function safeModeCaption(state: {
  known: boolean;
  failed: boolean;
  saving: boolean;
  enabled: boolean;
}): string {
  if (!state.known) return state.failed ? 'Couldn’t check right now' : 'Checking…';
  if (state.saving) return 'Saving…';
  return state.enabled
    ? 'On — real orders are blocked on every broker'
    : 'Off — real orders are allowed';
}
