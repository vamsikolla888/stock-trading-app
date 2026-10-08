import { axisLabel, nearestIndex, niceCeil, stackTops } from '../chartScale';

describe('niceCeil', () => {
  it.each([
    [0.7, 1],
    [1, 1],
    [1.2, 2],
    [2.1, 2.5],
    [3, 5],
    [7, 10],
    [42, 50],
    [180, 200],
    [1_234_567, 2_000_000],
  ])('rounds %p up to %p', (value, expected) => {
    expect(niceCeil(value)).toBe(expected);
  });

  it('keeps an exact power of ten despite floating-point noise', () => {
    expect(niceCeil(1000.0000000001)).toBe(1000);
  });

  it('falls back to 1 for nothing to draw', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-5)).toBe(1);
    expect(niceCeil(Number.NaN)).toBe(1);
    expect(niceCeil(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('stackTops', () => {
  it('piles stacked series so the last tops are the totals', () => {
    const { tops, bases, max } = stackTops(
      [
        [1, 2, 3],
        [10, 20, 30],
      ],
      true,
    );
    expect(bases).toEqual([
      [0, 0, 0],
      [1, 2, 3],
    ]);
    expect(tops).toEqual([
      [1, 2, 3],
      [11, 22, 33],
    ]);
    expect(max).toBe(33);
  });

  it('draws unstacked series from zero', () => {
    const { tops, bases, max } = stackTops(
      [
        [1, 5],
        [4, 2],
      ],
      false,
    );
    expect(bases).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(tops).toEqual([
      [1, 5],
      [4, 2],
    ]);
    expect(max).toBe(5);
  });

  it('pads short series and treats missing or negative values as zero', () => {
    const { tops } = stackTops([[2, -3, Number.NaN], [1]], true);
    expect(tops).toEqual([
      [2, 0, 0],
      [3, 0, 0],
    ]);
  });

  it('handles no series at all', () => {
    expect(stackTops([], true)).toEqual({ tops: [], bases: [], max: 0 });
  });
});

describe('nearestIndex', () => {
  it('snaps a tap to the closest point', () => {
    // 5 points across 400px sit every 100px.
    expect(nearestIndex(0, 400, 5)).toBe(0);
    expect(nearestIndex(49, 400, 5)).toBe(0);
    expect(nearestIndex(51, 400, 5)).toBe(1);
    expect(nearestIndex(400, 400, 5)).toBe(4);
  });

  it('clamps taps outside the plot', () => {
    expect(nearestIndex(-30, 400, 5)).toBe(0);
    expect(nearestIndex(900, 400, 5)).toBe(4);
  });

  it('returns the only point when there is one, or no width yet', () => {
    expect(nearestIndex(120, 400, 1)).toBe(0);
    expect(nearestIndex(120, 0, 5)).toBe(0);
  });
});

describe('axisLabel', () => {
  it.each([
    ['500.0k', '500k'],
    ['1.00M', '1M'],
    ['2,500', '2,500'],
    ['1.25M', '1.25M'],
    ['0.0', '0'],
    ['₹0.00', '₹0'],
    ['250ms', '250ms'],
    ['10.05k', '10.05k'],
  ])('shortens %p to %p', (text, expected) => {
    expect(axisLabel(text)).toBe(expected);
  });
});
