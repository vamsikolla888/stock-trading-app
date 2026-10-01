import { isEnvelope, toApiError, unwrapEnvelope } from '@/services/api/envelope';
import { ApiError } from '@/types/api';

const envelope = <T>(
  overrides: Partial<{ success: boolean; message: string; data: T; errors: unknown[] }>,
) => ({
  success: true,
  message: '',
  data: {},
  errors: [],
  timestamp: '2026-09-25T10:00:00.000Z',
  requestId: 'req-123',
  ...overrides,
});

describe('isEnvelope', () => {
  it('recognises the server envelope shape', () => {
    expect(isEnvelope(envelope({}))).toBe(true);
  });

  it.each([null, undefined, 'text', 42, { data: {} }, { success: 'yes', data: {} }])(
    'rejects %p',
    (value) => {
      expect(isEnvelope(value)).toBe(false);
    },
  );
});

describe('unwrapEnvelope', () => {
  it('returns data from a successful envelope', () => {
    expect(unwrapEnvelope(envelope({ data: { id: 'u1' } }))).toEqual({ id: 'u1' });
  });

  it('passes non-envelope bodies through untouched', () => {
    expect(unwrapEnvelope({ raw: true })).toEqual({ raw: true });
  });

  it('throws on a 200 response whose envelope reports failure (e.g. MARKET_CLOSED)', () => {
    const body = envelope({
      success: false,
      message: 'Request failed',
      errors: [{ code: 'MARKET_CLOSED', message: 'Market is currently closed' }],
    });
    expect(() => unwrapEnvelope(body, 200)).toThrow(ApiError);
    try {
      unwrapEnvelope(body, 200);
    } catch (error) {
      expect((error as ApiError).code).toBe('MARKET_CLOSED');
      expect((error as ApiError).message).toBe('Market is currently closed');
    }
  });
});

describe('toApiError', () => {
  it('prefers the specific errors[0] message over the generic envelope message', () => {
    const error = toApiError(
      401,
      envelope({
        success: false,
        message: 'Request failed',
        errors: [{ code: 'AUTH_INVALID', message: 'Invalid email or password' }],
      }),
    );
    expect(error.status).toBe(401);
    expect(error.code).toBe('AUTH_INVALID');
    expect(error.message).toBe('Invalid email or password');
    expect(error.requestId).toBe('req-123');
    expect(error.isAuthError).toBe(true);
  });

  it('maps validation errors to fields, keeping the first message per field', () => {
    const error = toApiError(
      422,
      envelope({
        success: false,
        errors: [
          {
            code: 'VALIDATION',
            message: 'An account with this email already exists',
            field: 'email',
          },
          { code: 'VALIDATION', message: 'Second message', field: 'email' },
          { code: 'VALIDATION', message: 'Too short', field: 'password' },
        ],
      }),
    );
    expect(error.fieldErrors).toEqual({
      email: 'An account with this email already exists',
      password: 'Too short',
    });
  });

  it('turns Retry-After into a readable rate-limit message', () => {
    const error = toApiError(429, envelope({ success: false }), { 'retry-after': '42' });
    expect(error.isRateLimited).toBe(true);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryAfterSeconds).toBe(42);
    expect(error.message).toBe('Too many attempts. Try again in 42 seconds.');
  });

  it('rounds long waits up to minutes', () => {
    expect(toApiError(429, undefined, { 'retry-after': '61' }).message).toBe(
      'Too many attempts. Try again in 2 minutes.',
    );
  });

  it('never shows raw server-error text to users', () => {
    const error = toApiError(
      500,
      envelope({ success: false, errors: [{ code: 'INTERNAL', message: 'Mongo pool exhausted' }] }),
    );
    expect(error.message).not.toContain('Mongo');
    expect(error.isServerError).toBe(true);
  });

  it('reads a path the server has no route for as an outdated server, not a missing record', () => {
    const error = toApiError(
      404,
      envelope({
        success: false,
        message: 'No route matches GET /api/v1/account/profile',
        errors: [{ code: 'NOT_FOUND', message: 'No route matches GET /api/v1/account/profile' }],
      }),
    );
    expect(error).toMatchObject({ status: 426, code: 'SERVER_OUTDATED', requestId: 'req-123' });
    expect(error.message).toMatch(/needs a newer server version/);
    expect(error.message).not.toContain('/api/v1');
  });

  it('keeps an ordinary 404 as the server worded it', () => {
    const error = toApiError(
      404,
      envelope({
        success: false,
        errors: [{ code: 'NOT_FOUND', message: 'NIFTYX is not a listed NFO contract' }],
      }),
    );
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(error.message).toBe('NIFTYX is not a listed NFO contract');
  });
});
