import { layoutFor } from '../responsive';

describe('layoutFor', () => {
  it('gives a phone one column and two tiles per row', () => {
    const layout = layoutFor(390);
    expect(layout).toMatchObject({ gutter: 20, content: 350, columns: 1, kpiColumns: 2 });
    expect(layout.compact).toBe(true);
  });

  it('adds columns as the window widens instead of stretching one', () => {
    expect(layoutFor(600)).toMatchObject({ gutter: 20, columns: 1, kpiColumns: 3, compact: true });
    expect(layoutFor(768)).toMatchObject({ gutter: 24, columns: 2, kpiColumns: 3, compact: false });
    expect(layoutFor(820)).toMatchObject({ columns: 2, kpiColumns: 4 });
    expect(layoutFor(1024)).toMatchObject({ columns: 2, kpiColumns: 4 });
    expect(layoutFor(1280)).toMatchObject({ gutter: 32, columns: 3, kpiColumns: 6 });
  });

  it('switches at the content width, after the gutters', () => {
    // 680 − 2 × 20 = 640: the first width with room for two panels.
    expect(layoutFor(679)).toMatchObject({ columns: 1, compact: true });
    expect(layoutFor(680)).toMatchObject({ columns: 2, compact: false });
  });

  it('never reports negative content for a zero or tiny window', () => {
    expect(layoutFor(0).content).toBe(0);
    expect(layoutFor(10)).toMatchObject({ content: 0, columns: 1, kpiColumns: 2 });
  });
});
