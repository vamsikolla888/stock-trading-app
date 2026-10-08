/**
 * How an F&O underlying is found by what a person types — a deliberate COPY of the server's
 * fno-search.rules.ts and the web's lib/underlyingSearch.ts (the search sheet filters the cached
 * universe locally, per keystroke, so it must rank exactly as GET /fno/search does).
 *
 * Every WORD of the query must appear in the underlying's searchable text — symbol, the
 * master's name, the spoken index names below, and the word INDEX for an index — so "bank
 * nifty", "fin nifty", "midcap nifty" and "index" all find what a person means. A query typed
 * without its spaces ("banknifty") still matches a spaced name, per name.
 */

export interface SearchableUnderlying {
  underlying: string;
  name: string | null;
  isIndex: boolean;
}

/** What people call the F&O indices, which neither the derivative symbol nor the master's cash
 *  name ("NIFTY Bank", "Nifty Financial Services") contains. Lookup only: an index missing
 *  here is still found by its symbol and name. */
export const INDEX_ALIASES: Readonly<Record<string, readonly string[]>> = {
  NIFTY: ['NIFTY 50', 'NIFTY FIFTY'],
  BANKNIFTY: ['BANK NIFTY', 'NIFTY BANK'],
  FINNIFTY: ['FIN NIFTY', 'NIFTY FIN SERVICE', 'NIFTY FINANCIAL SERVICES'],
  MIDCPNIFTY: ['MIDCAP NIFTY', 'MIDCP NIFTY', 'NIFTY MIDCAP SELECT'],
  NIFTYNXT50: ['NIFTY NEXT 50', 'NIFTY NEXT', 'NIFTY JUNIOR'],
  SENSEX: ['BSE SENSEX', 'SENSEX 30', 'BSE 30'],
  BANKEX: ['BSE BANKEX', 'BSE BANK'],
};

/** "index", "indices", "indexes" all mean INDEX. */
const INDEX_WORD = /^(INDEX|INDEXES|INDICES|INDICE)$/;

export function searchTokens(q: string): string[] {
  return q
    .toUpperCase()
    .split(/[^A-Z0-9&]+/)
    .filter(Boolean)
    .map((t) => (INDEX_WORD.test(t) ? 'INDEX' : t));
}

/** The names an underlying goes by, upper-case: symbol, the master's name, spoken aliases. */
function namesOf(u: SearchableUnderlying): string[] {
  const sym = u.underlying.toUpperCase();
  return [sym, (u.name ?? '').toUpperCase(), ...(INDEX_ALIASES[sym] ?? [])].filter(Boolean);
}

/** Everything a query word may match, upper-case, words separated by spaces. */
export function searchText(u: SearchableUnderlying): string {
  return [...namesOf(u), u.isIndex ? 'INDEX' : ''].filter(Boolean).join(' ');
}

const squash = (s: string) => s.replace(/[^A-Z0-9&]/g, '');

/** Whether an underlying answers a query. */
export function matchesUnderlying(u: SearchableUnderlying, q: string): boolean {
  const tokens = searchTokens(q);
  if (!tokens.length) return false;
  const text = searchText(u);
  if (tokens.every((t) => text.includes(t))) return true;
  // Spacing typed differently from the name: "banknifty" vs "BANK NIFTY", "nifty bank" vs
  // BANKNIFTY. Checked per NAME, so a match can never straddle the symbol and the name.
  const joined = tokens.join('');
  return joined.length >= 3 && namesOf(u).some((n) => squash(n).includes(joined));
}

/** 0 = the symbol itself, 1 = symbol starts with it, 2 = a name/alias starts with it, 3 = else. */
function rank(u: SearchableUnderlying, q: string): number {
  // "index" filters (only indices match it); it is not part of any name, so it does not rank.
  const joined = searchTokens(q)
    .filter((t) => t !== 'INDEX')
    .join('');
  if (!joined) return 3;
  const [sym, ...others] = namesOf(u);
  if (sym === joined) return 0;
  if (sym?.startsWith(joined)) return 1;
  return others.some((n) => squash(n).startsWith(joined)) ? 2 : 3;
}

/** The matching underlyings, best first: exact symbol, then prefix, then name; indices before
 *  stocks at the same rank (they carry most of the volume), then alphabetical. */
export function rankUnderlyings<T extends SearchableUnderlying>(
  all: readonly T[],
  q: string,
  limit: number,
): T[] {
  return all
    .filter((u) => matchesUnderlying(u, q))
    .map((u) => ({ u, r: rank(u, q) }))
    .sort(
      (a, b) =>
        a.r - b.r ||
        Number(!a.u.isIndex) - Number(!b.u.isIndex) ||
        a.u.underlying.localeCompare(b.u.underlying),
    )
    .slice(0, limit)
    .map((x) => x.u);
}
