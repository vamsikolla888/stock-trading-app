import { apiClient } from '@/services/api/client';

import type {
  AccountProfile,
  AccountSecurity,
  EmailChangeResult,
  MfaSetup,
  ProfileFields,
  SafeModeState,
} from './types';

function safeModeState(value: unknown): SafeModeState {
  const raw = (value ?? {}) as Partial<SafeModeState>;
  return {
    enabled: raw.enabled === true,
    changedAt: typeof raw.changedAt === 'string' ? raw.changedAt : null,
  };
}

/** /api/v1/account — same paths and bodies as the web client's account.service.ts. */
export const accountApi = {
  async profile(): Promise<AccountProfile> {
    const { data } = await apiClient.get<{ profile: AccountProfile }>('/account/profile');
    return data.profile;
  },

  async safeMode(): Promise<SafeModeState> {
    const { data } = await apiClient.get<{ safeMode: SafeModeState }>('/account/safe-mode');
    return safeModeState(data.safeMode);
  },

  /** Setting the value it already has changes nothing server-side (changedAt is kept). */
  async setSafeMode(enabled: boolean): Promise<SafeModeState> {
    const { data } = await apiClient.put<{ safeMode: SafeModeState }>('/account/safe-mode', {
      enabled,
    });
    return safeModeState(data.safeMode);
  },

  async updateProfile(input: ProfileFields): Promise<AccountProfile> {
    const { data } = await apiClient.patch<{ profile: AccountProfile }>('/account/profile', input);
    return data.profile;
  },

  /**
   * Raw image bytes (JPG, PNG or WebP, ≤ 5 MB) — the server normalises them to a 512 px WebP.
   * Sent as the body itself, not multipart: that is what the route's `express.raw` reads.
   */
  async uploadAvatar(image: Blob): Promise<AccountProfile> {
    const { data } = await apiClient.post<{ profile: AccountProfile }>('/account/avatar', image, {
      headers: { 'Content-Type': 'application/octet-stream' },
      // A photo on a slow uplink takes longer than an ordinary request.
      timeout: 60_000,
    });
    return data.profile;
  },

  async removeAvatar(): Promise<AccountProfile> {
    const { data } = await apiClient.delete<{ profile: AccountProfile }>('/account/avatar');
    return data.profile;
  },

  /** Revokes EVERY session, this one included — the caller signs out afterwards. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.post('/account/password', { currentPassword, newPassword });
  },

  /** Emails a one-hour confirmation link to the NEW address; nothing changes until it is used. */
  async requestEmailChange(email: string, currentPassword: string): Promise<void> {
    await apiClient.post('/account/email/request', { email, currentPassword });
  },

  /** Applies the change and returns a replacement token pair (older sessions are revoked). */
  async confirmEmailChange(token: string): Promise<EmailChangeResult> {
    const { data } = await apiClient.post<EmailChangeResult>('/account/email/confirm', { token });
    return data;
  },

  async security(): Promise<AccountSecurity> {
    const { data } = await apiClient.get<AccountSecurity>('/account/security');
    return { mfa: data.mfa, sessions: data.sessions ?? [] };
  },

  async revokeSession(sessionId: string): Promise<{ revoked: boolean; current: boolean }> {
    const { data } = await apiClient.delete<{ revoked: boolean; current: boolean }>(
      `/account/sessions/${encodeURIComponent(sessionId)}`,
    );
    return data;
  },

  async beginMfaSetup(currentPassword: string): Promise<MfaSetup> {
    const { data } = await apiClient.post<MfaSetup>('/account/mfa/setup', { currentPassword });
    return data;
  },

  /** Recovery codes come back ONCE, here — they are never shown again. */
  async confirmMfaSetup(
    setupToken: string,
    code: string,
  ): Promise<{ recoveryCodes: string[]; enabledAt: string }> {
    const { data } = await apiClient.post<{ recoveryCodes: string[]; enabledAt: string }>(
      '/account/mfa/confirm',
      { setupToken, code },
    );
    return data;
  },

  async disableMfa(currentPassword: string, code: string): Promise<void> {
    await apiClient.post('/account/mfa/disable', { currentPassword, code });
  },

  async regenerateRecoveryCodes(
    currentPassword: string,
    code: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const { data } = await apiClient.post<{ recoveryCodes: string[] }>(
      '/account/mfa/recovery-codes',
      { currentPassword, code },
    );
    return data;
  },
};
