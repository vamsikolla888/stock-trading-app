import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { appConfig } from '@/config/app';
import { appVersion, env } from '@/config/env';
import { isTokenExpiring } from '@/lib/auth/jwt';
import { secureTokens } from '@/lib/storage/secureTokens';
import { toApiError, unwrapEnvelope } from '@/services/api/envelope';
import { buildUserAgent } from '@/services/api/userAgent';
import { ApiError, type ClientErrorCode } from '@/types/api';
import type { AuthTokens } from '@/types/auth';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /**
     * Public endpoints (login, register, refresh, password reset): send no bearer token
     * and never enter the refresh-and-retry path. A 401 from these is a real answer
     * ("wrong password"), not an expired session.
     */
    skipAuth?: boolean;
  }
  export interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}

type RefreshHandler = (refreshToken: string) => Promise<AuthTokens>;
type UnauthorizedHandler = () => void;

let refreshHandler: RefreshHandler | null = null;
let onUnauthorized: UnauthorizedHandler | null = null;

/** Wired once from the auth feature to avoid a circular import between the client and auth api. */
export function registerAuthHandlers(handlers: {
  refresh: RefreshHandler;
  onUnauthorized: UnauthorizedHandler;
}): void {
  refreshHandler = handlers.refresh;
  onUnauthorized = handlers.onUnauthorized;
}

// Browsers own their User-Agent (setting it is refused); native apps must send their own.
const nativeUserAgent =
  Platform.OS === 'web'
    ? null
    : buildUserAgent({
        appName: appConfig.name,
        version: appVersion,
        platform: Platform.OS,
        osVersion: Device.osVersion,
        model: Device.modelName,
      });

export const apiClient: AxiosInstance = axios.create({
  baseURL: env.apiUrl,
  timeout: appConfig.api.timeoutMs,
  headers: {
    Accept: 'application/json',
    ...(nativeUserAgent ? { 'User-Agent': nativeUserAgent } : {}),
  },
});

function clientError(code: ClientErrorCode, message: string, status = 0): ApiError {
  return new ApiError({ status, code, message });
}

/**
 * Whether a refresh failure means the session is truly over. Only the server saying
 * so counts: a dropped connection, a timeout, a 5xx or a rate limit must NOT sign the
 * user out — the next request after connectivity returns will refresh successfully.
 */
function isSessionInvalid(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return (
    error.code === 'NO_REFRESH_TOKEN' ||
    error.status === 401 ||
    error.status === 403 ||
    error.status === 422
  );
}

// Single in-flight refresh shared by every caller. Refresh tokens are single-use (each
// refresh rotates the pair), so the second of two concurrent refreshes with the same
// token would be rejected — and that 401 signs the user out.
let pendingRefresh: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = (async () => {
    try {
      const refreshToken = await secureTokens.getRefreshToken();
      if (!refreshToken || !refreshHandler) {
        throw clientError(
          'NO_REFRESH_TOKEN',
          'Your session has expired. Please sign in again.',
          401,
        );
      }
      const tokens = await refreshHandler(refreshToken);
      await secureTokens.setTokens(tokens.accessToken, tokens.refreshToken);
      return tokens.accessToken;
    } catch (error) {
      // Runs once per refresh, not once per waiting request.
      if (isSessionInvalid(error)) {
        await secureTokens.clearTokens();
        onUnauthorized?.();
      }
      throw error;
    }
  })().finally(() => {
    pendingRefresh = null;
  });

  return pendingRefresh;
}

/**
 * A usable access token for non-HTTP transports (the Socket.IO handshake), refreshed
 * first when it is about to expire. Transient refresh failures fall back to the current
 * token — the handshake will fail and retry, just like an HTTP request would.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const token = await secureTokens.getAccessToken();
  if (token && isTokenExpiring(token, appConfig.auth.refreshSkewSeconds)) {
    try {
      return await refreshAccessToken();
    } catch (error) {
      return isSessionInvalid(error) ? null : token;
    }
  }
  return token;
}

function setBearer(config: InternalAxiosRequestConfig, token: string): void {
  config.headers = config.headers ?? new AxiosHeaders();
  config.headers.set('Authorization', `Bearer ${token}`);
}

apiClient.interceptors.request.use(async (config) => {
  if (config.skipAuth) return config;

  let accessToken = await secureTokens.getAccessToken();

  // Refresh ahead of expiry (e.g. on app resume) instead of spending a round trip on a
  // guaranteed 401. If the refresh fails for a transient reason, send the request with
  // the current token and let the 401 path decide.
  if (accessToken && isTokenExpiring(accessToken, appConfig.auth.refreshSkewSeconds)) {
    try {
      accessToken = await refreshAccessToken();
    } catch (error) {
      if (isSessionInvalid(error)) throw error;
    }
  }

  if (accessToken) setBearer(config, accessToken);
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    response.data = unwrapEnvelope(response.data, response.status);
    return response;
  },
  async (error: unknown) => {
    // Cancellations (unmounted screens, superseded queries) must reach React Query as
    // cancellations — reporting them as network errors would show false error states.
    if (axios.isCancel(error) || !(error instanceof AxiosError)) throw error;

    const originalRequest = error.config;

    if (!error.response) {
      if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
        throw clientError('TIMEOUT', 'The request timed out. Check your connection and try again.');
      }
      throw clientError('NETWORK_ERROR', "Can't reach the server. Check your internet connection.");
    }

    const { status, data, headers } = error.response;

    if (status === 401 && originalRequest && !originalRequest.skipAuth && !originalRequest._retry) {
      originalRequest._retry = true;

      // If another request already rotated the pair while this one was in flight, just
      // replay with the current token instead of burning another refresh.
      const current = await secureTokens.getAccessToken();
      const sentWith = originalRequest.headers?.get?.('Authorization');
      if (current && sentWith !== `Bearer ${current}`) {
        setBearer(originalRequest, current);
        return apiClient.request(originalRequest);
      }

      try {
        setBearer(originalRequest, await refreshAccessToken());
      } catch (refreshError) {
        if (isSessionInvalid(refreshError)) {
          throw new ApiError({
            status: 401,
            code: 'AUTH_EXPIRED',
            message: 'Your session has expired. Please sign in again.',
          });
        }
        throw refreshError;
      }
      return apiClient.request(originalRequest);
    }

    throw toApiError(status, data, headers as Record<string, unknown>);
  },
);
