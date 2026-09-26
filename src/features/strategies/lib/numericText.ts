/**
 * Typed-number handling for rule inputs. Kept pure so the edge cases (a lone "-", "1.",
 * pasted text with commas) are tested rather than discovered on a device.
 */

/** Keeps digits, at most one decimal point (unless integer) and a leading minus when allowed. */
export function sanitizeNumericText(
  raw: string,
  { integer = false, allowNegative = false }: { integer?: boolean; allowNegative?: boolean } = {},
): string {
  const trimmed = raw.replace(/[\s,]/g, '');
  const negative = allowNegative && trimmed.startsWith('-');
  let seenDot = false;
  let out = '';
  for (const ch of trimmed) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && !integer && !seenDot) {
      seenDot = true;
      out += ch;
    }
  }
  return negative ? `-${out}` : out;
}

/** "" → undefined (not set); an incomplete "-" or "." → NaN (invalid); otherwise the number. */
export function parseNumericText(text: string): number | undefined {
  if (text === '') return undefined;
  if (text === '-' || text === '.' || text === '-.') return Number.NaN;
  const value = Number(text);
  return Number.isFinite(value) ? value : Number.NaN;
}
