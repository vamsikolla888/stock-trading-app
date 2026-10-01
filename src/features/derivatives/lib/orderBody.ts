import type { PlacePaperFnoOrderInput } from '../types';

/**
 * The order body as the server's strict schema accepts it. MARKET is the server's default, so a
 * market order carries no `type` at all — and must not: a server from before LIMIT orders rejects
 * any unknown key (422), which would refuse every paper order. `type` and `limitPrice` go only
 * with a LIMIT order, which such a server cannot take anyway.
 */
export function paperOrderBody(input: PlacePaperFnoOrderInput): PlacePaperFnoOrderInput {
  const { type, limitPrice, ...base } = input;
  if (type !== 'LIMIT') return base;
  return { ...base, type, ...(limitPrice != null ? { limitPrice } : {}) };
}
