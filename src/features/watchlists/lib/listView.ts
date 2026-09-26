import type { WatchlistItem, WatchlistListItem } from '../types';

/**
 * Filtering and sorting a watchlist, on the SERVER's stored figures — so the order is the
 * same whichever rows happen to be on screen. Pure, and unit-tested.
 */

export type WatchlistSort = 'default' | 'since' | 'today' | 'score' | 'added' | 'symbol';
export type QuickFilter = 'all' | 'gainers' | 'losers' | 'new' | 'repeat';

export const SORT_LABEL: Record<WatchlistSort, string> = {
  default: 'As listed',
  since: 'Since added',
  today: 'Today',
  score: 'AI score',
  added: 'Date added',
  symbol: 'Symbol (A–Z)',
};

/** The newest first-flagged date among AI rows — "new in the latest batch". */
export function newestFlagDate(items: readonly WatchlistItem[]): string | null {
  let newest: string | null = null;
  for (const item of items) {
    const date = item.ai?.lastFlaggedDate;
    if (date && (newest === null || date > newest)) newest = date;
  }
  return newest;
}

function matchesQuick(item: WatchlistItem, quick: QuickFilter, newest: string | null): boolean {
  switch (quick) {
    case 'all':
      return true;
    case 'gainers':
      return item.changeSinceAddPct !== null && item.changeSinceAddPct > 0;
    case 'losers':
      return item.changeSinceAddPct !== null && item.changeSinceAddPct < 0;
    case 'new':
      return item.ai != null && newest !== null && item.ai.firstFlaggedDate === newest;
    case 'repeat':
      return (item.ai?.flaggedCount ?? 0) > 1;
  }
}

export function quickFilterCounts(items: readonly WatchlistItem[]): Record<QuickFilter, number> {
  const newest = newestFlagDate(items);
  return {
    all: items.length,
    gainers: items.filter((item) => matchesQuick(item, 'gainers', newest)).length,
    losers: items.filter((item) => matchesQuick(item, 'losers', newest)).length,
    new: items.filter((item) => matchesQuick(item, 'new', newest)).length,
    repeat: items.filter((item) => matchesQuick(item, 'repeat', newest)).length,
  };
}

/** Nulls sort LAST in every numeric mode, so unpriced rows never top a "best" view. */
function byNumberDesc(a: number | null | undefined, b: number | null | undefined): number {
  const x = a ?? null;
  const y = b ?? null;
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return y - x;
}

export function filterAndSort(
  items: readonly WatchlistItem[],
  options: { query: string; quick: QuickFilter; sort: WatchlistSort },
): WatchlistItem[] {
  const newest = newestFlagDate(items);
  const needle = options.query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (
      needle &&
      !`${item.symbol} ${item.companyName ?? ''} ${item.ai?.sector ?? ''}`
        .toLowerCase()
        .includes(needle)
    ) {
      return false;
    }
    return matchesQuick(item, options.quick, newest);
  });

  const copy = [...filtered];
  switch (options.sort) {
    case 'default':
      return copy;
    case 'since':
      return copy.sort((a, b) => byNumberDesc(a.changeSinceAddPct, b.changeSinceAddPct));
    case 'today':
      return copy.sort((a, b) => byNumberDesc(a.changeTodayPct, b.changeTodayPct));
    case 'score':
      return copy.sort((a, b) => byNumberDesc(a.ai?.compositeScore, b.ai?.compositeScore));
    case 'added':
      return copy.sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));
    case 'symbol':
      return copy.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }
}

/** Own lists first, then the derived AI list. */
export function orderLists(lists: readonly WatchlistListItem[] | undefined): WatchlistListItem[] {
  const all = lists ?? [];
  return [
    ...all.filter((list) => list.kind === 'manual'),
    ...all.filter((list) => list.kind !== 'manual'),
  ];
}

const csvCell = (value: string | number | null | undefined) =>
  `"${String(value ?? '').replace(/"/g, '""')}"`;

/** The shortlist as CSV text — shared through the system share sheet. */
export function watchlistCsv(items: readonly WatchlistItem[]): string {
  const head = [
    'symbol',
    'exchange',
    'company',
    'ltp',
    'todayPct',
    'sinceAddedPct',
    'addedPrice',
    'addedAt',
    'compositeScore',
    'sector',
  ];
  const lines = items.map((item) =>
    [
      item.symbol,
      item.exchange,
      csvCell(item.companyName),
      item.ltp ?? '',
      item.changeTodayPct?.toFixed(2) ?? '',
      item.changeSinceAddPct?.toFixed(2) ?? '',
      item.addedPrice ?? '',
      item.addedAt,
      item.ai?.compositeScore ?? '',
      csvCell(item.ai?.sector),
    ].join(','),
  );
  return [head.join(','), ...lines].join('\n');
}
