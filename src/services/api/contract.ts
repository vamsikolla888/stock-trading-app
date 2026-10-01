import { ApiError } from '@/types/api';

/** The connected API is older than this app: a response lacks fields the app reads. */
export const SERVER_OUTDATED = 'SERVER_OUTDATED';

/**
 * Refuses a response that lacks fields this app version renders, as a typed error.
 *
 * The app ships separately from the API, so the server it talks to can lag it (a backend not yet
 * deployed, a staging server, a cache written by an older build). Read in the old shape, a nested
 * field such as `wallet.positionCount` throws mid-render and takes a whole tab down with it; refused
 * here, the query simply fails and every screen shows its normal error state instead.
 *
 * 426 (Upgrade Required): a 4xx, so the query client does not retry an answer that cannot change.
 */
export function requireFields<T>(data: T, fields: readonly (keyof T & string)[], what: string): T {
  const record =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
  const missing = record ? fields.filter((field) => record[field] == null) : fields;
  if (missing.length === 0) return data;
  throw new ApiError({
    status: 426,
    code: SERVER_OUTDATED,
    message: `${what} needs a newer server version than the one this app is connected to.`,
  });
}

export function isServerOutdated(error: unknown): boolean {
  return error instanceof ApiError && error.code === SERVER_OUTDATED;
}
