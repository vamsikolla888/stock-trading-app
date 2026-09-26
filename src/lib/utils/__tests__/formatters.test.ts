import {
  EMPTY_VALUE,
  formatCompactNumber,
  formatINR,
  formatINRCompact,
  formatNumber,
  formatPercent,
  formatQuantity,
  formatSignedINR,
  formatSignedPercent,
  truncate,
} from '@/lib/utils/formatters';

const MINUS = '−';

describe('formatINR', () => {
  it('uses the rupee sign and Indian digit grouping', () => {
    expect(formatINR(1248360)).toBe('₹12,48,360.00');
    expect(formatINR(1285.6)).toBe('₹1,285.60');
  });

  it('keeps a leading minus for negatives', () => {
    expect(formatINR(-120)).toBe(`${MINUS}₹120.00`);
  });

  it('supports whole-rupee display', () => {
    expect(formatINR(1248360.4, 0)).toBe('₹12,48,360');
  });
});

describe('formatSignedINR', () => {
  it('signs gains and losses', () => {
    expect(formatSignedINR(18260)).toBe('+₹18,260.00');
    expect(formatSignedINR(-1240.5)).toBe(`${MINUS}₹1,240.50`);
    expect(formatSignedINR(0)).toBe('₹0.00');
  });
});

describe('formatINRCompact', () => {
  it('uses lakh and crore', () => {
    expect(formatINRCompact(1248360)).toBe('₹12.48L');
    expect(formatINRCompact(25600000)).toBe('₹2.56Cr');
    expect(formatINRCompact(45000)).toBe('₹45,000');
  });
});

describe('percent formatting (percent units)', () => {
  it('formats unsigned', () => {
    expect(formatPercent(1.24)).toBe('1.24%');
  });

  it('signs changes', () => {
    expect(formatSignedPercent(1.24)).toBe('+1.24%');
    expect(formatSignedPercent(-0.41)).toBe(`${MINUS}0.41%`);
    expect(formatSignedPercent(0)).toBe('0.00%');
  });
});

describe('number formatting', () => {
  it('groups the Indian way', () => {
    expect(formatNumber(24815.4)).toBe('24,815.40');
    expect(formatQuantity(1200)).toBe('1,200');
  });

  it('compacts volumes', () => {
    expect(formatCompactNumber(1234567)).toBe('12.35L');
    expect(formatCompactNumber(4200)).toBe('4.2K');
  });
});

describe('missing values', () => {
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    'renders %p as an em dash',
    (value) => {
      expect(formatINR(value)).toBe(EMPTY_VALUE);
      expect(formatSignedPercent(value)).toBe(EMPTY_VALUE);
      expect(formatNumber(value)).toBe(EMPTY_VALUE);
    },
  );
});

describe('truncate', () => {
  it('returns the original string when shorter than maxLength', () => {
    expect(truncate('Reliance', 10)).toBe('Reliance');
  });

  it('truncates and appends an ellipsis when longer than maxLength', () => {
    expect(truncate('Reliance Industries', 8)).toBe('Relianc…');
  });
});
