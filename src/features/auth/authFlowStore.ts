import { create } from 'zustand';

import type { BannerTone } from '@/components/ui/Banner';

/** A password that was accepted, waiting on its second factor. */
export interface PendingChallenge {
  challengeToken: string;
  /** ISO — the server expires the challenge five minutes after the password was accepted. */
  expiresAt: string;
  /** Shown on the code screen so the person knows which account they are confirming. */
  email: string;
}

/** A one-shot message for the sign-in screen, e.g. after a password change signed us out. */
export interface SignInNotice {
  tone: BannerTone;
  title?: string;
  message: string;
}

interface AuthFlowState {
  challenge: PendingChallenge | null;
  notice: SignInNotice | null;
  setChallenge: (challenge: PendingChallenge) => void;
  clearChallenge: () => void;
  setNotice: (notice: SignInNotice) => void;
  /** Called once the sign-in screen has picked the notice up, so it is never shown twice. */
  clearNotice: () => void;
}

/**
 * The signed-out flow's in-flight state. Deliberately NOT persisted and never put in a route
 * param: a challenge token is a live credential for the next five minutes, so it lives only in
 * memory and dies with the process — a cold start simply asks for the password again.
 */
export const useAuthFlowStore = create<AuthFlowState>()((set) => ({
  challenge: null,
  notice: null,
  setChallenge: (challenge) => set({ challenge }),
  clearChallenge: () => set({ challenge: null }),
  setNotice: (notice) => set({ notice }),
  clearNotice: () => set({ notice: null }),
}));

/** Seconds until a challenge expires (0 once it has), from the server's own timestamp. */
export function challengeSecondsLeft(expiresAt: string, now = Date.now()): number {
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

/**
 * Normalises what was typed into the code field. Authenticator codes are six digits, so
 * everything else (the spaces a paste from some apps carries) is dropped. Recovery codes are
 * shown as XXXX-XXXX-XXXX; the server ignores separators and case, so only letters, digits and
 * dashes are kept, upper-cased.
 */
export function normaliseMfaCode(text: string, mode: 'totp' | 'recovery'): string {
  if (mode === 'totp') return text.replace(/\D/g, '').slice(0, 6);
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
}

/** Whether a code is complete enough to send (the server's own minimum is 6 characters). */
export function isMfaCodeReady(code: string, mode: 'totp' | 'recovery'): boolean {
  if (mode === 'totp') return /^\d{6}$/.test(code);
  return code.replace(/-/g, '').length >= 8;
}
