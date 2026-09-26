/** One entry of the server envelope's `errors[]` (server/src/common/http/envelope.ts). */
export interface ApiErrorDetail {
  code: string;
  message: string;
  /** Dotted request path for validation errors, e.g. "email". */
  field?: string;
}

/** The single response shape every server route returns, success or failure. */
export interface Envelope<T> {
  success: boolean;
  message: string;
  data: T;
  errors: ApiErrorDetail[];
  timestamp: string;
  requestId: string;
}

/** Client-side codes for failures that never reached (or never came back from) the server. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'NO_REFRESH_TOKEN' | 'UNKNOWN_ERROR';

export interface ApiErrorShape {
  status: number;
  code: string;
  message: string;
  /** Validation messages keyed by field, ready for react-hook-form's `setError`. */
  fieldErrors?: Record<string, string>;
  /** Server request id — include it in support/crash reports to find the server log line. */
  requestId?: string;
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor({ status, code, message, fieldErrors, requestId, retryAfterSeconds }: ApiErrorShape) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors ?? {};
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Human-readable message for any thrown value — never leaks a raw stack or `[object Object]`. */
export function getErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (isApiError(error)) return error.message;
  return fallback;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
