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

/**
 * "RELIANCE · NIFTY 50": the ticker and the broad index it belongs to, if any. No exchange: the
 * search lists one row per company and the stock page switches NSE/BSE itself, so an NSE/BSE tag
 * on every row only invited reading two listings of one company as two stocks.
 */
export function searchResultMeta(result: Pick<SearchResult, 'symbol' | 'indices'>): string {
  const index = result.indices?.primary?.shortLabel;
  return [result.symbol, index].filter(Boolean).join(' · ');
}

const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * GET /stocks/search's `{ results }`, read defensively: a row without a symbol or an exchange is
 * dropped (it could not open a stock page), a price that isn't a finite number is unknown, and
 * duplicate listings keep their first (best-ranked) row.
 */
export function normalizeSearchResults(raw: unknown): SearchResult[] {
  const list =
    raw && typeof raw === 'object' && Array.isArray((raw as { results?: unknown }).results)
      ? ((raw as { results: unknown[] }).results ?? [])
      : [];
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const symbol = text(row.symbol);
    const exchange = text(row.exchange)?.toUpperCase() ?? null;
    if (!symbol || !exchange) continue;
    const key = `${exchange}:${symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const indices = row.indices;
    out.push({
      symbol,
      exchange,
      companyName: text(row.companyName),
      ltp: finiteOrNull(row.ltp),
      changePct: finiteOrNull(row.changePct),
      ...(indices && typeof indices === 'object'
        ? { indices: indices as SearchResult['indices'] }
        : {}),
    });
  }
  return out;
}

/**
 * A company name reduced to what identifies it (server stocks/company-name.ts): lowercase,
 * legal-form words dropped, punctuation folded. "Tube Investments of India Ltd." and
 * "TUBE INVESTMENTS OF INDIA LIMITED" are one company.
 */
export function cleanCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(limited|ltd|ltd\.|the|co|company|corporation|corp|inc)\b/g, ' ')
    .replace(/[^a-z0-9& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One row per company — the app-side stand-in for `group=company` (server search-grouping.ts)
 * when a server older than that parameter answers. A search row carries no ISIN, so the cleaned
 * company name is the key. Only rows on DIFFERENT exchanges merge (two rows of one exchange are
 * two instruments, a DVR share say); the NSE listing stays, where the company first ranked.
 */
export function oneRowPerCompany<T extends Pick<SearchResult, 'exchange' | 'companyName'>>(
  rows: readonly T[],
): T[] {
  const kept: { row: T; name: string | null; exchanges: Set<string> }[] = [];
  for (const row of rows) {
    const cleaned = row.companyName ? cleanCompanyName(row.companyName) : '';
    const name = cleaned.length >= 3 ? cleaned : null;
    const exchange = row.exchange.toUpperCase();
    const twin = name ? kept.find((k) => k.name === name && !k.exchanges.has(exchange)) : undefined;
    if (!twin) {
      kept.push({ row, name, exchanges: new Set([exchange]) });
      continue;
    }
    twin.exchanges.add(exchange);
    if (exchange === 'NSE') twin.row = row;
  }
  return kept.map((k) => k.row);
}
