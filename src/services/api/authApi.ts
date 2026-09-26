import { z } from 'zod';

import { apiClient } from '@/services/api/client';
import { ApiError } from '@/types/api';
import type {
  AuthTokens,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest,
} from '@/types/auth';

// Endpoints documented in stocks-advisory-platform/server/src/docs/specs/auth.routes.yaml
// (forgot/reset-password live in server/src/interfaces/http/auth/auth.routes.ts).
// There is no /auth/me or /auth/logout on this server: sessions are restored from
// the stored user + refresh token, and sign-out is local.

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

export const authApi = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const { data } = await apiClient.post<unknown>('/auth/login', payload, { skipAuth: true });
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

  /** Always resolves the same way whether or not the account exists (anti-enumeration). */
  async requestPasswordReset(email: string): Promise<void> {
    await apiClient.post('/auth/forgot-password', { email }, { skipAuth: true });
  },

  async resetPassword(payload: ResetPasswordRequest): Promise<void> {
    await apiClient.post('/auth/reset-password', payload, { skipAuth: true });
  },
};
