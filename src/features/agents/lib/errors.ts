import { isAdminDenied, isDependencyUnavailable } from '@/features/admin/lib/access';
import { isServerOutdated } from '@/services/api/contract';
import { getErrorMessage } from '@/types/api';

/**
 * What a failed agent action says. The API client replaces every 5xx message with a generic one,
 * so the AI service being down (503 DEPENDENCY_UNAVAILABLE — not configured, worker stopped,
 * unreachable) is named from its code instead; a refused admin route reads "Administrators only".
 */
export function agentErrorMessage(error: unknown, fallback?: string): string {
  if (isServerOutdated(error)) return 'This needs a newer server version than the one connected.';
  if (isAdminDenied(error)) return 'Administrators only.';
  if (isDependencyUnavailable(error)) {
    return 'The AI service isn’t available right now — it may be unconfigured or its worker stopped. Try again shortly.';
  }
  return getErrorMessage(error, fallback);
}
