/** The stocks API's own bound on a symbol (GET /stocks/:symbol: 1–20 characters). */
const MAX_SYMBOL_LENGTH = 20;

type RawParam = string | string[] | undefined;

function firstValue(value: RawParam): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : '';
}

/** Expo Router hands params over decoded; a stray `%` in a hand-typed link must not throw. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * `/stock/[symbol]?exchange=` → the listing to open. A missing, empty or over-long symbol
 * comes back as '' so the screen can say "not found" instead of loading forever; any
 * exchange other than BSE is the NSE listing (the stocks API knows only those two).
 */
export function parseStockParams(params: { symbol?: RawParam; exchange?: RawParam }): {
  symbol: string;
  exchange: 'NSE' | 'BSE';
} {
  const symbol = safeDecode(firstValue(params.symbol)).trim().toUpperCase();
  const exchange = firstValue(params.exchange).trim().toUpperCase() === 'BSE' ? 'BSE' : 'NSE';
  return { symbol: symbol.length <= MAX_SYMBOL_LENGTH ? symbol : '', exchange };
}
