import { isMarketOpen, livePriceInterval } from '@/lib/utils/market';

// Helpers build instants from IST wall-clock times (UTC+5:30).
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe('isMarketOpen', () => {
  it('is open during the weekday session', () => {
    expect(isMarketOpen(ist('2026-09-25T09:15:00'))).toBe(true); // Friday
    expect(isMarketOpen(ist('2026-09-25T15:29:59'))).toBe(true);
  });

  it('is closed before the open and at the close', () => {
    expect(isMarketOpen(ist('2026-09-25T09:14:59'))).toBe(false);
    expect(isMarketOpen(ist('2026-09-25T15:30:00'))).toBe(false);
  });

  it('is closed on weekends', () => {
    expect(isMarketOpen(ist('2026-09-26T11:00:00'))).toBe(false); // Saturday
    expect(isMarketOpen(ist('2026-09-27T11:00:00'))).toBe(false); // Sunday
  });
});

describe('livePriceInterval', () => {
  it('polls only during market hours', () => {
    expect(livePriceInterval(5000, ist('2026-09-25T11:00:00'))).toBe(5000);
    expect(livePriceInterval(5000, ist('2026-09-25T20:00:00'))).toBe(false);
  });
});
