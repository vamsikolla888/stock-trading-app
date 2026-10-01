import { z } from 'zod';

import { apiClient } from '@/services/api/client';
import { ApiError } from '@/types/api';
import type {
  AuthTokens,
  LoginRequest,
  LoginResponse,
  LoginResult,
  MfaChallenge,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest,
} from '@/types/auth';

// Endpoints documented in stocks-advisory-platform/server/src/docs/specs/auth.routes.yaml.
// There is no /auth/me: sessions are restored from the stored user + refresh token.

/** Sign-out must never hold the user on a spinner — the local wipe happens regardless. */
const LOGOUT_TIMEOUT_MS = 2_500;

const tokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  role: z.enum(['user', 'admin']).catch('user'),
});

const loginResponseSchema = tokensSchema.extend({ user: userSchema });

const mfaChallengeSchema = z.object({
  mfaRequired: z.literal(true),
  challengeToken: z.string().min(32),
  expiresAt: z.string().min(1),
});

/** Tokens go straight into the Keychain — refuse a malformed payload rather than persist garbage. */
function parseOrThrow<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw new ApiError({
    status: 500,
    code: 'INVALID_RESPONSE',
    message: 'We received an unexpected response. Please try again.',
  });
}

function parseLoginResult(data: unknown): LoginResult {
  if (typeof data === 'object' && data !== null && (data as MfaChallenge).mfaRequired === true) {
    return parseOrThrow(mfaChallengeSchema, data);
  }
  return parseOrThrow(loginResponseSchema, data);
}

export const authApi = {
  /** A session — or, with two-factor on, a challenge to complete at `verifyMfa`. */
  async login(payload: LoginRequest): Promise<LoginResult> {
    const { data } = await apiClient.post<unknown>('/auth/login', payload, { skipAuth: true });
    return parseLoginResult(data);
  },

  /** Exchanges a sign-in challenge and a TOTP / recovery code for a session. */
  async verifyMfa(challengeToken: string, code: string): Promise<LoginResponse> {
    const { data } = await apiClient.post<unknown>(
      '/auth/mfa/verify',
      { challengeToken, code },
      { skipAuth: true },
    );
    return parseOrThrow(loginResponseSchema, data);
  },

  async register(payload: RegisterRequest): Promise<RegisterResponse> {
    const { data } = await apiClient.post<RegisterResponse>('/auth/register', payload, {
      skipAuth: true,
    });
    return data;
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const { data } = await apiClient.post<unknown>(
      '/auth/refresh',
      { refreshToken },
      { skipAuth: true },
    );
    return parseOrThrow(tokensSchema, data);
  },

  /**
   * Revokes THIS device's session server-side (other devices stay signed in). Works with an
   * expired access token — the refresh token is the credential — and is bounded, because it
   * runs in front of the local sign-out.
   */
  async logout(refreshToken: string): Promise<void> {
    await apiClient.post(
      '/auth/logout',
      { refreshToken },
      { skipAuth: true, timeout: LOGOUT_TIMEOUT_MS },
    );
  },

  /** Always resolves the same way whether or not the account exists (anti-enumeration). */
  async requestPasswordReset(email: string): Promise<void> {
    await apiClient.post('/auth/forgot-password', { email }, { skipAuth: true });
  },

  async resetPassword(payload: ResetPasswordRequest): Promise<void> {
    await apiClient.post('/auth/reset-password', payload, { skipAuth: true });
  },
};
