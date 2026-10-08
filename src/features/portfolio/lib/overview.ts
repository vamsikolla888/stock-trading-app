import { isApiError } from '@/types/api';

/** Where a broker book's request stands, in the terms the UI cares about. */
export type BrokerState = 'connected' | 'not-connected' | 'session-expired' | 'error' | 'loading';

/** How a book request ended. Today's home card reads books instead (lib/books.ts). */
export function brokerStateOf(error: unknown, hasData: boolean, pending: boolean): BrokerState {
  if (hasData) return 'connected';
  if (pending) return 'loading';
  if (isApiError(error)) {
    if (error.code === 'NOT_FOUND' || error.status === 404) return 'not-connected';
    if (error.code === 'BROKER_SESSION_EXPIRED') return 'session-expired';
  }
  return error ? 'error' : 'not-connected';
}
