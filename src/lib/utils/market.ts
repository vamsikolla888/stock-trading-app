/**
 * NSE/BSE cash-market session in IST (UTC+5:30, no DST): 09:15–15:30, Monday–Friday.
 * Exchange holidays aren't known client-side — the server stays the authority (it answers
 * MARKET_CLOSED), and this is only used to decide how eagerly to poll for prices.
 */

const IST_OFFSET_MINUTES = 5 * 60 + 30;
const OPEN_MINUTE = 9 * 60 + 15;
const CLOSE_MINUTE = 15 * 60 + 30;

function toIst(date: Date): { weekday: number; minuteOfDay: number } {
  const ist = new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    weekday: ist.getUTCDay(),
    minuteOfDay: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
  };
}

export function isMarketOpen(now: Date = new Date()): boolean {
  const { weekday, minuteOfDay } = toIst(now);
  if (weekday === 0 || weekday === 6) return false;
  return minuteOfDay >= OPEN_MINUTE && minuteOfDay < CLOSE_MINUTE;
}

/**
 * Poll interval for live prices: fast while the market is open, off otherwise (closing
 * prices don't move, and polling them would only spend battery and server quota).
 */
export function livePriceInterval(activeMs: number, now: Date = new Date()): number | false {
  return isMarketOpen(now) ? activeMs : false;
}
