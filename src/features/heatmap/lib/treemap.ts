// Ported from the web client (client/src/features/market-heatmap/lib/treemap.ts) so both apps
// lay out the same index identically.

export interface WeightedItem<T> {
  value: number;
  data: T;
}

export interface TreemapRect<T> {
  x: number;
  y: number;
  width: number;
  height: number;
  data: T;
}

/**
 * A deterministic binary treemap: large weights get large rectangles, and each split runs
 * along the longer side of the space left. Non-positive or non-finite weights count as 1,
 * so an unknown market cap still gets a (small) tile rather than vanishing.
 */
export function layoutTreemap<T>(
  items: readonly WeightedItem<T>[],
  width: number,
  height: number,
): TreemapRect<T>[] {
  const out: TreemapRect<T>[] = [];
  const clean = items
    .map((item) => ({
      ...item,
      value: Number.isFinite(item.value) && item.value > 0 ? item.value : 1,
    }))
    .sort((a, b) => b.value - a.value);

  const place = (rows: WeightedItem<T>[], x: number, y: number, w: number, h: number) => {
    if (rows.length === 0 || w <= 0 || h <= 0) return;
    const [only] = rows;
    if (rows.length === 1 && only) {
      out.push({ x, y, width: w, height: h, data: only.data });
      return;
    }
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    let splitAt = 1;
    let firstTotal = rows[0]?.value ?? 0;
    while (splitAt < rows.length - 1) {
      const next = rows[splitAt]?.value ?? 0;
      if (firstTotal + next > total / 2) break;
      firstTotal += next;
      splitAt += 1;
    }
    const ratio = Math.max(0.08, Math.min(0.92, firstTotal / total));
    const first = rows.slice(0, splitAt);
    const second = rows.slice(splitAt);
    if (w >= h) {
      const firstWidth = w * ratio;
      place(first, x, y, firstWidth, h);
      place(second, x + firstWidth, y, w - firstWidth, h);
    } else {
      const firstHeight = h * ratio;
      place(first, x, y, w, firstHeight);
      place(second, x, y + firstHeight, w, h - firstHeight);
    }
  };

  place(clean, 0, 0, Math.max(0, width), Math.max(0, height));
  return out;
}
