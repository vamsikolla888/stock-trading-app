/**
 * One session's real price points, for a tiny "day shape" line beside a mover row
 * (ported from the web client's shared/components/DayShape.tsx).
 *
 * The snapshot records the day's high and low but not WHEN each happened, so only the
 * endpoints are in true order. The middle two follow the day's direction — up days plot
 * open → low → high → ltp, down days open → high → low → ltp. Every plotted value is real;
 * nothing is drawn unless open, high, low and ltp are all known.
 */
export function dayShapeValues(input: {
  prevClose?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  ltp?: number | null;
}): number[] | null {
  const { prevClose, open, high, low, ltp } = input;
  const known = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (!known(open) || !known(high) || !known(low) || !known(ltp)) return null;

  const rising = ltp >= open;
  return [
    ...(known(prevClose) ? [prevClose] : []),
    open,
    ...(rising ? [low, high] : [high, low]),
    ltp,
  ];
}

/**
 * Resolves a trend array for a stock quote row or card.
 * Uses exact session dayShape if OHLC is present; falls back to prevClose/change/LTP trend
 * so stocks never miss their sparkline graph.
 */
export function moverTrendShape(input: {
  prevClose?: number | null;
  close?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  ltp?: number | null;
  changePct?: number | null;
}): number[] | null {
  const shape = dayShapeValues({
    prevClose: input.prevClose ?? input.close,
    open: input.open,
    high: input.high,
    low: input.low,
    ltp: input.ltp,
  });
  if (shape && shape.length > 1) return shape;

  const known = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

  const ltp = input.ltp;
  if (!known(ltp)) return null;

  const ref = known(input.close)
    ? input.close
    : known(input.prevClose)
      ? input.prevClose
      : known(input.open)
        ? input.open
        : known(input.changePct) && input.changePct !== 0
          ? ltp / (1 + input.changePct / 100)
          : null;

  if (known(ref) && ref !== ltp) {
    const isUp = ltp > ref;
    const mid = isUp ? ref + (ltp - ref) * 0.4 : ref - (ref - ltp) * 0.4;
    return [ref, mid, ltp];
  }

  return [ltp, ltp];
}
