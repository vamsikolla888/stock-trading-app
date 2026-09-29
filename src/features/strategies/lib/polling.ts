import { isApiError } from '@/types/api';

/**
 * Polling and retry rules for the long-running jobs (backtests, scans, AI generation). They
 * poll every few seconds, so one wrong rule repeats a failure hundreds of times.
 */

/**
 * The next poll delay after `error` (the query's latest failure, or null). A 4xx will answer
 * the same way again — the strategy was deleted, the id is bad — so polling stops. A rate
 * limit backs off to what the server asked for; anything else (offline, a 5xx) keeps the
 * normal pace, because it can clear on its own.
 */
export function pollInterval(error: unknown, ms: number): number | false {
  if (isApiError(error)) {
    if (error.status === 429) return Math.max(ms, (error.retryAfterSeconds ?? 10) * 1000);
    if (error.status >= 400 && error.status < 500) return false;
  }
  return ms;
}

/**
 * One retry, and only for failures a retry can fix (offline, 5xx). The heavy reads (matches,
 * pairing) sit on a tight per-user rate limit, so retrying a 429 or a 404 just spends it.
 */
export function retryOnceIfTransient(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status !== 0 && error.status < 500) return false;
  return failureCount < 1;
}
