import { ApiError, type ApiErrorDetail, type Envelope } from '@/types/api';

const SERVER_ERROR_MESSAGE = 'Something went wrong on our side. Please try again in a moment.';

export function isEnvelope(body: unknown): body is Envelope<unknown> {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { success?: unknown }).success === 'boolean' &&
    'data' in body
  );
}

function parseRetryAfter(value: unknown): number | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

function rateLimitMessage(retryAfterSeconds: number | undefined): string {
  if (!retryAfterSeconds) return 'Too many attempts. Please wait a minute and try again.';
  if (retryAfterSeconds < 60) {
    return `Too many attempts. Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}.`;
  }
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

function toFieldErrors(errors: ApiErrorDetail[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const error of errors) {
    // Keep the first message per field — it's the one the server considered primary.
    if (error.field && !fieldErrors[error.field]) fieldErrors[error.field] = error.message;
  }
  return fieldErrors;
}

/**
 * Builds an ApiError from a server response. Envelope failures carry the specific
 * reason in `errors[0]` (the top-level `message` is often a generic "Request failed"),
 * so that is preferred. 5xx messages are replaced with a friendly one: internal
 * failure text is for logs, not end users.
 */
export function toApiError(
  status: number,
  body: unknown,
  headers?: Record<string, unknown>,
): ApiError {
  const envelope = isEnvelope(body) ? body : undefined;
  const errors = envelope?.errors ?? [];
  const primary = errors[0];
  const retryAfterSeconds = parseRetryAfter(headers?.['retry-after']);

  let message = primary?.message || envelope?.message || 'Something went wrong. Please try again.';
  if (status === 429) message = rateLimitMessage(retryAfterSeconds);
  else if (status >= 500) message = SERVER_ERROR_MESSAGE;

  return new ApiError({
    status,
    code: primary?.code ?? (status === 429 ? 'RATE_LIMITED' : 'UNKNOWN_ERROR'),
    message,
    fieldErrors: toFieldErrors(errors),
    requestId: envelope?.requestId || undefined,
    retryAfterSeconds,
  });
}

/**
 * Returns the envelope's `data`. Some server errors are deliberately sent as HTTP 200
 * with `success: false` (e.g. MARKET_CLOSED), so success is decided by the envelope
 * flag, not the status code.
 */
export function unwrapEnvelope<T>(body: unknown, status = 200): T {
  if (!isEnvelope(body)) return body as T;
  if (!body.success) throw toApiError(status, body);
  return body.data as T;
}
