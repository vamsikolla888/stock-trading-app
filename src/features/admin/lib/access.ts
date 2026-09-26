import { isApiError } from '@/types/api';

/**
 * The server refuses a non-admin on an admin route with 401 AUTH_INVALID "Admin access
 * required" (requireAdmin.middleware.ts); a 403 is treated the same. Used to show "Admins
 * only" instead of a generic failure when a cached role is stale.
 */
export function isAdminDenied(error: unknown): boolean {
  if (!isApiError(error)) return false;
  if (error.status === 403 || error.code === 'FORBIDDEN') return true;
  return error.status === 401 && /admin/i.test(error.message);
}

/** True for the 503 an unconfigured dependency answers with (n8n, service account, Firebase). */
export function isDependencyUnavailable(error: unknown): boolean {
  return isApiError(error) && error.code === 'DEPENDENCY_UNAVAILABLE';
}
