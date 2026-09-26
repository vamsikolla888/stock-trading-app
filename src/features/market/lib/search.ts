import type { SearchResult } from '../types';

/** The server's `q` limit (GET /stocks/search: 1–50 characters). */
export const SEARCH_MAX_LENGTH = 50;
/** Same debounce as the web's header search. */
export const SEARCH_DEBOUNCE_MS = 300;

export type SearchPhase = 'idle' | 'loading' | 'results' | 'empty' | 'error';

/**
 * What the search screen shows for the text in the box and the state of its query.
 *
 * "No stocks match" is only ever said about the text actually in the box: while the debounce
 * or the request for it is in flight, the previous answer stays up (marked `stale`, so the
 * screen can dim it) or a loading state shows — never an empty verdict about a query that
 * hasn't been asked yet.
 */
export function searchPhase(input: {
  /** The raw text in the box. */
  typed: string;
  /** The trimmed text the current query was made for. */
  debounced: string;
  pending: boolean;
  placeholder: boolean;
  error: boolean;
  count: number;
}): { phase: SearchPhase; stale: boolean } {
  const typed = input.typed.trim();
  if (!typed) return { phase: 'idle', stale: false };
  const settled = typed === input.debounced && !input.pending && !input.placeholder;
  if (settled) {
    if (input.count > 0) return { phase: 'results', stale: false };
    return { phase: input.error ? 'error' : 'empty', stale: false };
  }
  return input.count > 0 ? { phase: 'results', stale: true } : { phase: 'loading', stale: false };
}

/** "RELIANCE · NSE · NIFTY 50": ticker, exchange and the broad index it belongs to, if any. */
export function searchResultMeta(
  result: Pick<SearchResult, 'symbol' | 'exchange' | 'indices'>,
): string {
  const index = result.indices?.primary?.shortLabel;
  return [result.symbol, result.exchange, index].filter(Boolean).join(' · ');
}
