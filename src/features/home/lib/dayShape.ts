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
