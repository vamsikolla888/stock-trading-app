import type { Href } from 'expo-router';

/**
 * The server's activity feed and research requesters link to records by WEB path —
 * `/agents/index-trading?tab=decisions`, `/agents/portfolio?holding=NSE%3AINFY`,
 * `/agents/web-research?run=JOB-…`, `/ipo/<id>#research`. This maps each to the app's own typed
 * route, or null for a path the app has no screen for (the row is then not tappable). Pure, so
 * every mapping is pinned by a test.
 */

/** The Index trading screen's tabs (it reads a `tab` param). */
export const INDEX_TRADING_TABS = [
  'overview',
  'trades',
  'decisions',
  'backtest',
  'controls',
] as const;
export type IndexTradingTab = (typeof INDEX_TRADING_TABS)[number];

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

/** `a=1&b=two` → { a: '1', b: 'two' }; the first value of a repeated key wins. */
function queryParams(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of query.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = decode(eq < 0 ? part : part.slice(0, eq));
    const value = decode(eq < 0 ? '' : part.slice(eq + 1));
    if (key && value !== null && !(key in out)) out[key] = value;
  }
  return out;
}

/** Splits "/a/b?x=1#frag" into its path segments and query. */
function parse(to: string): { segments: string[]; params: Record<string, string> } | null {
  const trimmed = to.trim();
  // Only app-relative paths: an absolute URL or a protocol-relative one is not an in-app link.
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  const withoutHash = trimmed.split('#')[0] ?? '';
  const q = withoutHash.indexOf('?');
  const path = q < 0 ? withoutHash : withoutHash.slice(0, q);
  const query = q < 0 ? '' : withoutHash.slice(q + 1);
  const segments: string[] = [];
  for (const raw of path.split('/')) {
    if (!raw) continue;
    const segment = decode(raw);
    if (segment === null) return null;
    segments.push(segment);
  }
  return { segments, params: queryParams(query) };
}

export function mobileHrefFor(to: string | null | undefined): Href | null {
  if (!to) return null;
  const parsed = parse(to);
  if (!parsed) return null;
  const { segments, params } = parsed;
  const [first, second, third] = segments;

  if (first === 'ipo' && second && !third) {
    return { pathname: '/ipo/[id]', params: { id: second } };
  }
  if (first !== 'agents') return null;
  if (third) return null;

  switch (second) {
    case undefined:
      return '/agents';
    case 'index-trading': {
      const tab = (INDEX_TRADING_TABS as readonly string[]).includes(params.tab ?? '')
        ? (params.tab as IndexTradingTab)
        : null;
      return tab ? { pathname: '/agents/index-trading', params: { tab } } : '/agents/index-trading';
    }
    case 'portfolio': {
      const holding = params.holding?.trim();
      return holding
        ? { pathname: '/holding-review/[key]', params: { key: holding } }
        : '/agents/portfolio';
    }
    case 'web-research': {
      // The server writes `?run=`; `?job=` is accepted too.
      const jobId = (params.run ?? params.job)?.trim();
      return jobId ? { pathname: '/research/[jobId]', params: { jobId } } : '/agents/web-research';
    }
    case 'docs':
      return '/agents/docs';
    default:
      return null;
  }
}
