import {
  attentionItems,
  breadthShares,
  fitTranscript,
  humanize,
  moveSection,
  nextSpeed,
  pickPreferred,
  sectorBarPercent,
  todayIst,
  togglePreferred,
  toggleSection,
  toneOfLabel,
  visibleSections,
} from '../lib/brief';
import { DEFAULT_PREFERENCES, normalizeBrief } from '../lib/normalize';

describe('section preferences', () => {
  const prefs = {
    ...DEFAULT_PREFERENCES,
    sectionOrder: ['summary', 'news', 'movers'] as const,
    visibleSections: ['summary', 'movers'] as const,
  } as unknown as typeof DEFAULT_PREFERENCES;

  it('lists visible sections in the saved order', () => {
    expect(visibleSections(prefs)).toEqual(['summary', 'movers']);
  });

  it('toggles a section but always keeps one visible', () => {
    expect(toggleSection(prefs, 'news').visibleSections).toEqual(['summary', 'movers', 'news']);
    const one = { ...prefs, visibleSections: ['movers' as const] };
    expect(toggleSection(one, 'movers')).toBe(one);
  });

  it('moves a section and stops at the ends', () => {
    expect(moveSection(prefs, 'news', -1).sectionOrder).toEqual(['news', 'summary', 'movers']);
    expect(moveSection(prefs, 'summary', -1)).toBe(prefs);
    expect(moveSection(prefs, 'movers', 1)).toBe(prefs);
  });
});

describe('preferred indices and sectors', () => {
  it('caps picks at the server limit', () => {
    expect(togglePreferred(['A'], 'B', 2)).toEqual({ next: ['A', 'B'], atLimit: false });
    expect(togglePreferred(['A', 'B'], 'C', 2)).toEqual({ next: ['A', 'B'], atLimit: true });
    expect(togglePreferred(['A', 'B'], 'A', 2)).toEqual({ next: ['B'], atLimit: false });
  });

  it('falls back to every row when no pick is in the feed', () => {
    const rows = [{ n: 'NIFTY 50' }, { n: 'SENSEX' }];
    expect(pickPreferred(rows, ['SENSEX'], (row) => row.n)).toEqual([{ n: 'SENSEX' }]);
    expect(pickPreferred(rows, ['GONE'], (row) => row.n)).toEqual(rows);
    expect(pickPreferred(rows, [], (row) => row.n)).toEqual(rows);
  });
});

describe('display helpers', () => {
  it('splits breadth without dividing by zero', () => {
    expect(breadthShares({ advances: 0, declines: 0, unchanged: 0 })).toEqual({
      advances: 0,
      declines: 0,
      unchanged: 0,
    });
    expect(breadthShares({ advances: 3, declines: 1, unchanged: 0 }).advances).toBe(75);
  });

  it('keeps sector bars between 3% and 100%', () => {
    expect(sectorBarPercent(0, 2)).toBe(3);
    expect(sectorBarPercent(-2, 2)).toBe(100);
    expect(sectorBarPercent(1, 0)).toBe(3);
  });

  it('humanizes labels and reads their tone', () => {
    expect(humanize('STRONG_POSITIVE')).toBe('Strong positive');
    expect(toneOfLabel('Strong Negative')).toBe('down');
    expect(toneOfLabel('NEUTRAL')).toBe('flat');
    expect(toneOfLabel('POSITIVE')).toBe('up');
  });

  it('cycles narration speeds', () => {
    expect(nextSpeed(1)).toBe(1.25);
    expect(nextSpeed(2)).toBe(1);
    expect(nextSpeed(3)).toBe(1);
  });

  it('cuts a long transcript at a sentence end', () => {
    expect(fitTranscript('One.  Two.', 100)).toBe('One. Two.');
    expect(fitTranscript('First sentence here. Second one is long.', 30)).toBe(
      'First sentence here.',
    );
  });

  it('reads today in IST, not device time', () => {
    // 20:00 UTC is already the next day in India.
    expect(todayIst(new Date('2026-09-28T20:00:00Z'))).toBe('2026-09-29');
  });
});

describe('attentionItems', () => {
  it('uses watchlist moves as observations when there is no AI analysis', () => {
    const brief = normalizeBrief({
      watchlist: {
        available: true,
        attention: [
          { symbol: 'TCS', exchange: 'NSE', watchlist: 'IT', changePct: 2.5, note: null },
        ],
      },
    });
    const [item] = attentionItems(brief);
    expect(item?.symbol).toBe('TCS');
    expect(item?.title).toBe('TCS moved +2.50%');
    expect(item?.risk).toMatch(/not an investment signal/);
  });
});
