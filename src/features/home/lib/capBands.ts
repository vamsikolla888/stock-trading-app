import type { CapBand } from '@/features/market/types';
import { EMPTY_VALUE, formatNumber } from '@/lib/utils/formatters';

// Mirrors the web client's features/explore/lib/capBands.ts, which mirrors the server's
// CAP_BANDS by hand. These are labels: drift here misdescribes a band, it never misfilters.

/** A cap-band tab; `all` sends no `cap` and ranks across every band. */
export type CapTab = CapBand | 'all';

/** Large first: an all-caps ranking is dominated by the biggest names anyway. */
export const CAP_TABS: readonly { key: CapTab; label: string }[] = [
  { key: 'large', label: 'Large cap' },
  { key: 'mid', label: 'Mid cap' },
  { key: 'small', label: 'Low cap' },
  { key: 'all', label: 'All' },
];

export const CAP_RANGES: Record<CapBand, string> = {
  small: '₹500 – 5,000 cr',
  mid: '₹5,000 – 20,000 cr',
  large: 'above ₹20,000 cr',
};

export function isCapTab(value: unknown): value is CapTab {
  return CAP_TABS.some((tab) => tab.key === value);
}

/** The `cap` query value for a tab — undefined for "All". */
export function capParam(tab: CapTab): CapBand | undefined {
  return tab === 'all' ? undefined : tab;
}

export function capTabRange(tab: CapTab): string {
  return tab === 'all' ? 'every market cap' : CAP_RANGES[tab];
}

/**
 * Market cap arrives in PAISE (one crore of rupees is 1e9 paise). Very large caps read in
 * lakh crore: 1.7959e15 paise → "₹17.96L cr"; 2.4e13 → "₹24,000 cr"; 6.2e11 → "₹620 cr".
 */
export function formatMarketCapCrore(paise: number | null | undefined): string {
  if (typeof paise !== 'number' || !Number.isFinite(paise) || paise <= 0) return EMPTY_VALUE;
  const crore = paise / 1e9;
  if (crore >= 100_000) return `₹${formatNumber(crore / 100_000, 2)}L cr`;
  return `₹${formatNumber(Math.round(crore), 0)} cr`;
}
