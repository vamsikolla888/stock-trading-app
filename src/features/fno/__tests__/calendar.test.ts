import {
  buildMonthView,
  calendarTitle,
  dayMarks,
  DEFAULT_FILTERS,
  holidaySessionLabel,
  isDefaultFilters,
  istMonth,
  matchesHoliday,
  monthLabel,
  monthWeeks,
  normalizeExpiryCalendar,
  shiftMonth,
  sourcesForMonth,
  weekdayOf,
} from '../lib/calendar';
import type { CalendarHoliday, ExpiryCalendar, ExpiryEntry } from '../types';

const nifty: ExpiryEntry = {
  kind: 'index',
  exchange: 'NFO',
  underlying: 'NIFTY',
  label: 'NIFTY',
  count: 1,
  hasOptions: true,
  hasFutures: false,
};
const stocks: ExpiryEntry = {
  kind: 'stocks',
  exchange: 'NFO',
  underlying: null,
  label: 'Stock F&O',
  count: 214,
  hasOptions: true,
  hasFutures: true,
};
const gold: ExpiryEntry = {
  kind: 'commodity',
  exchange: 'MCX',
  underlying: 'GOLD',
  label: 'Gold',
  count: 1,
  hasOptions: false,
  hasFutures: true,
};
const dussehraNse: CalendarHoliday = {
  date: '2026-10-20',
  name: 'Dussehra',
  kind: 'market',
  markets: ['NSE', 'BSE'],
  session: 'full-day',
  note: null,
};
const dussehraMcx: CalendarHoliday = {
  date: '2026-10-20',
  name: 'Dussehra',
  kind: 'market',
  markets: ['MCX'],
  session: 'morning',
  note: 'Evening session is open',
};
const dussehraPublic: CalendarHoliday = {
  date: '2026-10-20',
  name: 'Dussehra',
  kind: 'public',
  markets: [],
  session: null,
  note: 'Central Government gazetted holiday',
};

const october: ExpiryCalendar = {
  month: '2026-10',
  days: [
    { date: '2026-10-06', daysToExpiry: 0, entries: [nifty] },
    { date: '2026-10-27', daysToExpiry: 21, entries: [nifty, stocks, gold] },
  ],
  holidays: [dussehraNse, dussehraMcx, dussehraPublic],
  holidaySources: [
    { label: 'NSE F&O trading holidays', url: 'https://nse.example/2026.pdf', year: 2026 },
  ],
  asOf: '2026-10-06T04:00:00.000Z',
};

describe('month arithmetic', () => {
  it('shifts across year ends', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
    expect(shiftMonth('nonsense', 1)).toBe('nonsense');
  });

  it('labels months and weekdays without the device locale', () => {
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(weekdayOf('2026-10-20')).toBe('Tue');
  });

  it('reads the IST month, not the device’s', () => {
    // 2026-10-31 20:00 UTC is already 1 November in IST.
    expect(istMonth(Date.UTC(2026, 9, 31, 20, 0))).toBe('2026-11');
  });

  it('lays a month out Sunday-first in as many weeks as it needs', () => {
    const weeks = monthWeeks('2026-10'); // 1 Oct 2026 is a Thursday
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(monthWeeks('2026-02')).toHaveLength(4); // 1 Feb 2026 is a Sunday, 28 days
    expect(monthWeeks('bad')).toEqual([]);
  });
});

describe('buildMonthView', () => {
  it('collects expiries and holidays per date, and adds the selected date to the agenda', () => {
    const view = buildMonthView(october, DEFAULT_FILTERS, '2026-10-08');
    expect(view.agenda.map((d) => d.date)).toEqual([
      '2026-10-06',
      '2026-10-08',
      '2026-10-20',
      '2026-10-27',
    ]);
    expect(view.byDate.get('2026-10-20')?.holidays).toHaveLength(3);
    expect(view.byDate.get('2026-10-27')?.daysToExpiry).toBe(21);
    expect(view.expiryCount).toBe(4);
    expect(view.holidayCount).toBe(3);
  });

  it('does not add a selected date from another month', () => {
    const view = buildMonthView(october, DEFAULT_FILTERS, '2026-11-02');
    expect(view.agenda.map((d) => d.date)).not.toContain('2026-11-02');
  });

  it('filters by market, exchange and contract type', () => {
    const commodities = buildMonthView(
      october,
      { ...DEFAULT_FILTERS, category: 'commodity' },
      null,
    );
    expect(commodities.agenda.map((d) => d.date)).toEqual(['2026-10-20', '2026-10-27']);
    expect(commodities.byDate.get('2026-10-27')?.entries).toEqual([gold]);
    // Only MCX's closure and the public holiday belong on a commodities calendar.
    expect(commodities.byDate.get('2026-10-20')?.holidays).toEqual([dussehraMcx, dussehraPublic]);

    const options = buildMonthView(october, { ...DEFAULT_FILTERS, contract: 'options' }, null);
    expect(options.byDate.get('2026-10-27')?.entries).toEqual([nifty, stocks]);

    const bse = buildMonthView(october, { ...DEFAULT_FILTERS, exchange: 'BFO' }, null);
    expect(bse.expiryCount).toBe(0);
    expect(bse.byDate.get('2026-10-20')?.holidays).toEqual([dussehraNse, dussehraPublic]);
  });

  it('marks a day calmly: one dot per expiry kind, a tint per holiday kind', () => {
    const view = buildMonthView(october, DEFAULT_FILTERS, null);
    expect(dayMarks(view.byDate.get('2026-10-27'))).toEqual({
      index: true,
      stocks: true,
      commodity: true,
      market: false,
      public: false,
    });
    expect(dayMarks(view.byDate.get('2026-10-20'))).toMatchObject({ market: true, public: true });
    expect(dayMarks(undefined)).toEqual({
      index: false,
      stocks: false,
      commodity: false,
      market: false,
      public: false,
    });
  });
});

describe('labels', () => {
  it('names the session a holiday closes', () => {
    expect(holidaySessionLabel(dussehraNse)).toBe('NSE · BSE · Market closed');
    expect(holidaySessionLabel(dussehraMcx)).toBe('MCX · Morning session closed');
    expect(holidaySessionLabel({ ...dussehraMcx, session: 'evening' })).toBe(
      'MCX · Evening session closed',
    );
    expect(holidaySessionLabel(dussehraPublic)).toBe('Public holiday');
  });

  it('titles the screen by market, as the web does', () => {
    expect(calendarTitle('commodity')).toBe('Commodities expiry calendar');
    expect(calendarTitle('index')).toBe('Index expiry calendar');
    expect(calendarTitle('all')).toBe('F&O calendar');
  });

  it('keeps a public holiday under every filter', () => {
    expect(matchesHoliday(dussehraPublic, { ...DEFAULT_FILTERS, exchange: 'MCX' })).toBe(true);
    expect(matchesHoliday(dussehraNse, { ...DEFAULT_FILTERS, exchange: 'MCX' })).toBe(false);
    expect(isDefaultFilters(DEFAULT_FILTERS)).toBe(true);
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, contract: 'futures' })).toBe(false);
  });

  it('lists only the sources for the month’s year', () => {
    expect(sourcesForMonth(october.holidaySources, '2026-10')).toHaveLength(1);
    expect(sourcesForMonth(october.holidaySources, '2027-01')).toEqual([]);
  });
});

describe('normalizeExpiryCalendar', () => {
  it('passes a well-formed month through', () => {
    expect(normalizeExpiryCalendar(october, '2026-10')).toEqual(october);
  });

  it('drops what lies outside the month (an older server answers its 45-day window)', () => {
    const old = {
      days: [
        { date: '2026-10-27', daysToExpiry: 21, entries: [nifty] },
        { date: '2026-11-03', daysToExpiry: 28, entries: [nifty] },
      ],
      windowDays: 45,
      asOf: '2026-10-06T04:00:00.000Z',
    };
    const cal = normalizeExpiryCalendar(old, '2026-10');
    expect(cal.days.map((d) => d.date)).toEqual(['2026-10-27']);
    expect(cal.holidays).toEqual([]);
    expect(cal.holidaySources).toEqual([]);
    expect(cal.month).toBe('2026-10');
  });

  it('drops malformed entries, holidays and sources instead of guessing', () => {
    const cal = normalizeExpiryCalendar(
      {
        days: [
          {
            date: '2026-10-27',
            daysToExpiry: 21,
            entries: [nifty, { kind: 'bond', exchange: 'NFO', label: 'X' }, { kind: 'index' }],
          },
          { date: 'not-a-date', entries: [nifty] },
          { date: '2026-10-28', entries: [] },
        ],
        holidays: [
          dussehraNse,
          { date: '2026-10-21', name: 'Odd', kind: 'market', markets: [] },
          { date: '2026-10-22', name: 'Mystery', kind: 'closure', markets: ['NSE'] },
          { date: '2026-10-23', name: 'Unknown session', kind: 'market', markets: ['MCX', 'XYZ'] },
        ],
        holidaySources: [
          { label: 'ok', url: 'https://x.example', year: 2026 },
          { label: 'insecure', url: 'http://x.example', year: 2026 },
          { label: 'no year', url: 'https://x.example' },
        ],
      },
      '2026-10',
    );
    expect(cal.days).toEqual([{ date: '2026-10-27', daysToExpiry: 21, entries: [nifty] }]);
    expect(cal.holidays.map((h) => h.name)).toEqual(['Dussehra', 'Unknown session']);
    expect(cal.holidays[1]).toMatchObject({ markets: ['MCX'], session: 'full-day' });
    expect(cal.holidaySources.map((s) => s.label)).toEqual(['ok']);
  });

  it('survives a body that is not an object', () => {
    const cal = normalizeExpiryCalendar(null, '2026-10');
    expect(cal.days).toEqual([]);
    expect(cal.holidays).toEqual([]);
    expect(typeof cal.asOf).toBe('string');
  });
});
