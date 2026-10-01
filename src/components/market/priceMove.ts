import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';

const MINUS = '−';

/** "+15.75 (1.24%)", or "+1.24%" when only the percent is known. */
export function formatPriceMove(abs: number | null | undefined, pct: number | null): string {
  if (typeof abs !== 'number' || !Number.isFinite(abs)) return formatSignedPercent(pct);
  const sign = abs > 0 ? '+' : abs < 0 ? MINUS : '';
  const move = `${sign}${formatNumber(Math.abs(abs))}`;
  return pct === null || !Number.isFinite(pct) ? move : `${move} (${formatPercent(Math.abs(pct))})`;
}
