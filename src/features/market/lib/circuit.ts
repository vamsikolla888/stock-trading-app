/**
 * Circuit limits as the wire carries them: GET /market/circuit (server market/circuit.service.ts)
 * and the `circuit` on a live tick (realtime/tickBus.ts TickPayload.circuit). Pure, so the
 * parsing is pinned by tests; the stock page words them in features/stock/lib/circuit.ts.
 *
 * The server already validates a pair (circuit.rules.ts), but the app may meet a server that lags
 * or leads it, so every read goes through here: both sides positive and finite, lower below
 * upper — one side alone or a crossed pair is a feed fault, never half an answer.
 */

export interface CircuitLimits {
  lower: number;
  upper: number;
}

/** GET /market/circuit. Always a 200: `limits` is null with a `reason` when there are none. */
export interface CircuitResponse {
  exchange: string;
  symbol: string;
  limits: CircuitLimits | null;
  source: 'groww' | null;
  /** When the limits were read (ISO); null when there are none. */
  asOf: string | null;
  /** Why there are no limits, in the server's words. */
  reason: string | null;
}

const positive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** A usable { lower, upper } pair, or null. */
export function circuitLimitsOf(raw: unknown): CircuitLimits | null {
  if (!raw || typeof raw !== 'object') return null;
  const { lower, upper } = raw as Record<string, unknown>;
  const l = positive(lower);
  const u = positive(upper);
  if (l === null || u === null || !(l < u)) return null;
  return { lower: l, upper: u };
}

/** Two pairs say the same thing (both absent counts as the same). */
export function sameCircuit(
  a: CircuitLimits | null | undefined,
  b: CircuitLimits | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  return a.lower === b.lower && a.upper === b.upper;
}

export function normalizeCircuitResponse(
  raw: unknown,
  asked: { exchange: string; symbol: string },
): CircuitResponse {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const limits = circuitLimitsOf(body.limits);
  return {
    exchange: text(body.exchange) ?? asked.exchange,
    symbol: text(body.symbol) ?? asked.symbol,
    limits,
    source: limits && body.source === 'groww' ? 'groww' : null,
    asOf: limits ? text(body.asOf) : null,
    reason: limits ? null : text(body.reason),
  };
}
