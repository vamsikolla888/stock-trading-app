import axios, {
  AxiosError,
  CanceledError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { secureTokens } from '@/lib/storage/secureTokens';
import { authApi } from '@/services/api/authApi';
import { apiClient, registerAuthHandlers } from '@/services/api/client';
import { ApiError } from '@/types/api';

type Reply = { status: number; data?: unknown; headers?: Record<string, string> } | Error;
type Handler = (config: InternalAxiosRequestConfig) => Reply | Promise<Reply>;

const envelope = (
  data: unknown,
  errors: { code: string; message: string; field?: string }[] = [],
) => ({
  success: errors.length === 0,
  message: errors.length === 0 ? '' : 'Request failed',
  data: errors.length === 0 ? data : {},
  errors,
  timestamp: '2026-09-25T10:00:00.000Z',
  requestId: 'req-1',
});

function makeJwt(expSeconds: number): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256' })}.${encode({ sub: 'u1', exp: expSeconds })}.sig`;
}

let handler: Handler;
let requests: InternalAxiosRequestConfig[] = [];
const onUnauthorized = jest.fn();
const refreshSpy = jest.fn((token: string) => authApi.refresh(token));

const auth = (config: InternalAxiosRequestConfig) => config.headers.get('Authorization');
const refreshCalls = () => requests.filter((config) => config.url === '/auth/refresh').length;

beforeAll(() => {
  registerAuthHandlers({ refresh: refreshSpy, onUnauthorized });

  apiClient.defaults.adapter = async (config) => {
    requests.push(config);
    const reply = await handler(config);
    if (reply instanceof Error) throw reply;
    const response: AxiosResponse = {
      data: reply.data,
      status: reply.status,
      statusText: '',
      headers: reply.headers ?? {},
      config,
      request: {},
    };
    if (reply.status >= 200 && reply.status < 300) return response;
    throw new AxiosError('Request failed', AxiosError.ERR_BAD_REQUEST, config, {}, response);
  };
});

beforeEach(async () => {
  requests = [];
  jest.clearAllMocks();
  await secureTokens.setTokens('access-1', 'refresh-1');
});

const rotate = {
  status: 200,
  data: envelope({ accessToken: 'access-2', refreshToken: 'refresh-2' }),
};

describe('apiClient', () => {
  it('attaches the bearer token and unwraps the envelope', async () => {
    handler = () => ({ status: 200, data: envelope({ watchlists: [] }) });

    const { data } = await apiClient.get('/watchlists');

    expect(data).toEqual({ watchlists: [] });
    expect(auth(requests[0]!)).toBe('Bearer access-1');
  });

  it('refreshes exactly once for a burst of 401s and replays every request', async () => {
    handler = (config) => {
      if (config.url === '/auth/refresh') return rotate;
      return auth(config) === 'Bearer access-2'
        ? { status: 200, data: envelope({ url: config.url }) }
        : {
            status: 401,
            data: envelope(null, [{ code: 'AUTH_EXPIRED', message: 'Session expired' }]),
          };
    };

    const results = await Promise.all(['/a', '/b', '/c'].map((url) => apiClient.get(url)));

    expect(results.map((response) => response.data)).toEqual([
      { url: '/a' },
      { url: '/b' },
      { url: '/c' },
    ]);
    expect(refreshCalls()).toBe(1);
    expect(await secureTokens.getRefreshToken()).toBe('refresh-2');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('ends the session when the server rejects the refresh token', async () => {
    handler = (config) =>
      config.url === '/auth/refresh'
        ? {
            status: 401,
            data: envelope(null, [{ code: 'AUTH_EXPIRED', message: 'Refresh token reused' }]),
          }
        : {
            status: 401,
            data: envelope(null, [{ code: 'AUTH_EXPIRED', message: 'Session expired' }]),
          };

    await expect(apiClient.get('/portfolio')).rejects.toMatchObject({
      code: 'AUTH_EXPIRED',
      status: 401,
    });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(await secureTokens.getAccessToken()).toBeNull();
    expect(await secureTokens.getRefreshToken()).toBeNull();
  });

  it('keeps the session when the refresh fails for a network reason', async () => {
    handler = (config) =>
      config.url === '/auth/refresh'
        ? new AxiosError('Network Error', AxiosError.ERR_NETWORK, config)
        : {
            status: 401,
            data: envelope(null, [{ code: 'AUTH_EXPIRED', message: 'Session expired' }]),
          };

    await expect(apiClient.get('/portfolio')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(await secureTokens.getRefreshToken()).toBe('refresh-1');
  });

  it('never enters the refresh path for public auth routes', async () => {
    handler = () => ({
      status: 401,
      data: envelope(null, [{ code: 'AUTH_INVALID', message: 'Invalid email or password' }]),
    });

    await expect(
      authApi.login({ email: 'trader@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID', message: 'Invalid email or password' });

    expect(refreshCalls()).toBe(0);
    expect(auth(requests[0]!)).toBeUndefined();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('refreshes ahead of expiry instead of waiting for a 401', async () => {
    await secureTokens.setTokens(makeJwt(Math.floor(Date.now() / 1000) + 5), 'refresh-1');
    handler = (config) =>
      config.url === '/auth/refresh' ? rotate : { status: 200, data: envelope({ ok: true }) };

    await apiClient.get('/watchlists');

    expect(requests.map((config) => config.url)).toEqual(['/auth/refresh', '/watchlists']);
    expect(auth(requests[1]!)).toBe('Bearer access-2');
  });

  it('passes cancellations through untouched', async () => {
    handler = () => new CanceledError();

    const error = await apiClient.get('/slow').catch((caught: unknown) => caught);

    expect(axios.isCancel(error)).toBe(true);
  });

  it('reports timeouts distinctly from connectivity loss', async () => {
    handler = (config) => new AxiosError('timeout', AxiosError.ECONNABORTED, config);

    await expect(apiClient.get('/slow')).rejects.toMatchObject({ code: 'TIMEOUT', status: 0 });
  });

  it('rejects malformed token payloads instead of persisting them', async () => {
    handler = () => ({ status: 200, data: envelope({ user: { id: 'u1', email: 'a@b.co' } }) });

    const error = await authApi
      .login({ email: 'a@b.co', password: 'x' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INVALID_RESPONSE');
  });
});
