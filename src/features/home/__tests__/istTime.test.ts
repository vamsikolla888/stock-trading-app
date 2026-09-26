import {
  formatIstDate,
  formatIstDateTime,
  formatIstTime,
  formatIstWeekdayTime,
  formatNextOpen,
  formatSessionDay,
  istDayKey,
  nextMarketOpen,
} from '@/features/home/lib/istTime';

// 2026-09-26 14:05:07 IST (a Saturday).
const SAT_AFTERNOON = '2026-09-26T08:35:07Z';

describe('IST formatting', () => {
  it('prints the market’s wall-clock time whatever the device zone', () => {
    expect(formatIstTime(SAT_AFTERNOON)).toBe('14:05');
    expect(formatIstTime(SAT_AFTERNOON, true)).toBe('14:05:07');
    expect(formatIstDate(SAT_AFTERNOON)).toBe('26 Sep');
    expect(formatIstDateTime(SAT_AFTERNOON)).toBe('26 Sep, 14:05');
    expect(formatIstWeekdayTime(SAT_AFTERNOON)).toBe('Sat 14:05');
  });

  it('accepts epoch ms and Date objects as well as ISO strings', () => {
    const ms = Date.parse(SAT_AFTERNOON);
    expect(formatIstTime(ms)).toBe('14:05');
    expect(formatIstTime(new Date(ms))).toBe('14:05');
  });

  it('rolls the day over at IST midnight, not UTC', () => {
    // 18:40 UTC on the 25th is 00:10 IST on the 26th.
    expect(istDayKey('2026-09-25T18:40:00Z')).toBe('2026-09-26');
    expect(istDayKey('2026-09-25T18:20:00Z')).toBe('2026-09-25');
    expect(formatIstDateTime('2026-09-25T18:40:00Z')).toBe('26 Sep, 00:10');
  });

  it('returns null for missing or unparseable input', () => {
    for (const input of [null, undefined, '', 'not a date']) {
      expect(formatIstTime(input)).toBeNull();
      expect(formatIstDate(input)).toBeNull();
      expect(formatIstDateTime(input)).toBeNull();
      expect(formatIstWeekdayTime(input)).toBeNull();
      expect(istDayKey(input)).toBeNull();
    }
  });
});

describe('formatSessionDay', () => {
  it('turns a YYYY-MM-DD session into "12 Sep"', () => {
    expect(formatSessionDay('2026-09-12')).toBe('12 Sep');
    expect(formatSessionDay('2026-01-05')).toBe('5 Jan');
  });

  it('hands back anything it cannot read', () => {
    expect(formatSessionDay('2026-13-01')).toBe('2026-13-01');
    expect(formatSessionDay('yesterday')).toBe('yesterday');
    expect(formatSessionDay('')).toBe('');
  });
});

describe('nextMarketOpen / formatNextOpen', () => {
  const at = (iso: string) => new Date(iso);

  it('is today’s 09:15 before the open on a weekday', () => {
    const now = at('2026-09-24T03:30:00Z'); // Thu 09:00 IST
    const open = nextMarketOpen(now);
    expect(open.toISOString()).toBe('2026-09-24T03:45:00.000Z');
    expect(formatNextOpen(open, now)).toBe('today 09:15');
  });

  it('is the next weekday once the session has started', () => {
    const now = at('2026-09-24T10:30:00Z'); // Thu 16:00 IST
    const open = nextMarketOpen(now);
    expect(open.toISOString()).toBe('2026-09-25T03:45:00.000Z');
    expect(formatNextOpen(open, now)).toBe('tomorrow 09:15');
  });

  it('skips the weekend', () => {
    const fridayClose = at('2026-09-25T10:00:00Z'); // Fri 15:30 IST
    const open = nextMarketOpen(fridayClose);
    expect(open.toISOString()).toBe('2026-09-28T03:45:00.000Z');
    expect(formatNextOpen(open, fridayClose)).toBe('Mon 09:15');

    const saturday = at(SAT_AFTERNOON);
    expect(nextMarketOpen(saturday).toISOString()).toBe('2026-09-28T03:45:00.000Z');

    const sundayEvening = at('2026-09-27T14:30:00Z'); // Sun 20:00 IST
    expect(formatNextOpen(nextMarketOpen(sundayEvening), sundayEvening)).toBe('tomorrow 09:15');
  });

  it('treats a minute before the open as still today', () => {
    const now = at('2026-09-28T03:44:00Z'); // Mon 09:14 IST
    expect(nextMarketOpen(now).toISOString()).toBe('2026-09-28T03:45:00.000Z');
  });
});
