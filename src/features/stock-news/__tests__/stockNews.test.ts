import {
  ago,
  chipFor,
  coverageLine,
  newsWhen,
  scoreProgress,
  signedInt,
} from '@/features/stock-news/lib/format';
import { newsIdFromPath, normalizeStockNews } from '@/features/stock-news/lib/normalize';

const NOW = Date.parse('2026-10-03T10:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

describe('normalizeStockNews', () => {
  it('reads a page, links feed rows to the in-app article and drops unusable rows', () => {
    const page = normalizeStockNews({
      coverage: { tracked: true, lastCheckedAt: hoursAgo(2), lastOutcome: 'ok' },
      summary: { total: 3, analyzed: 2, positive: 1, negative: 1, models: ['m1', 4] },
      signals: {
        score: {
          value: 62,
          label: 'Positive',
          change7d: 4,
          series: [{ date: '2026-10-01', value: 58 }, {}],
        },
        risk: { value: 18, level: 'low', drivers: [{ id: 'd', title: 'T' }, { id: 'x' }] },
      },
      items: [
        {
          id: 'a',
          origin: 'feed',
          title: 'Results beat',
          url: 'https://x/a',
          analysisPath: '/news/analysis/n%201',
        },
        { id: 'b', title: 'No url' },
      ],
      page: 1,
      totalFiltered: 1,
      hasMore: false,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      origin: 'feed',
      newsId: 'n 1',
      analysisStatus: 'pending',
    });
    expect(page.summary).toMatchObject({ total: 3, neutral: 0, models: ['m1'] });
    expect(page.signals.score.series).toEqual([{ date: '2026-10-01', value: 58, stories: 0 }]);
    expect(page.signals.risk.drivers.map((d) => d.id)).toEqual(['d']);
    expect(page.signals.risk.evidence).toBe('thin');
  });

  it('survives an empty answer', () => {
    const page = normalizeStockNews(undefined);
    expect(page.items).toEqual([]);
    expect(page.signals.score.value).toBeNull();
    expect(page.coverage.tracked).toBe(false);
  });

  it('only accepts the analysis path the server writes', () => {
    expect(newsIdFromPath('/news/analysis/abc')).toBe('abc');
    expect(newsIdFromPath('https://evil/news/analysis/abc')).toBeNull();
    expect(newsIdFromPath(null)).toBeNull();
  });
});

describe('stock news wording', () => {
  it('labels a story by its sentiment or by why it has none', () => {
    expect(chipFor({ sentiment: 'Negative', analysisStatus: 'analyzed' })).toEqual({
      label: 'Negative',
      tone: 'neg',
    });
    expect(chipFor({ sentiment: null, analysisStatus: 'failed' }).label).toBe('Not analysed');
    expect(chipFor({ sentiment: null, analysisStatus: 'pending' }).label).toBe('Pending');
  });

  it('says when a story is from only as precisely as it is known', () => {
    expect(ago(hoursAgo(3), NOW)).toBe('3 h ago');
    expect(
      newsWhen(
        { publishedAt: hoursAgo(50), publishedPrecision: 'relative', foundAt: hoursAgo(1) },
        NOW,
      ),
    ).toBe('~2 d ago');
    expect(
      newsWhen({ publishedAt: null, publishedPrecision: null, foundAt: hoursAgo(1) }, NOW),
    ).toBe('found 1 h ago');
    expect(
      newsWhen(
        { publishedAt: '2026-09-08T00:00:00.000Z', publishedPrecision: 'day', foundAt: '' },
        NOW,
      ),
    ).toBe('8 Sep');
  });

  it('describes the week’s move, including a swing the two ends hide', () => {
    expect(signedInt(-3)).toBe('−3');
    expect(scoreProgress({ value: 70, change7d: 5, series: [] })).toBe(
      'Improved by 5 points over the past week',
    );
    expect(
      scoreProgress({
        value: 69,
        change7d: 0,
        series: [
          { date: '2026-09-27', value: 69, stories: 1 },
          { date: '2026-09-30', value: 48, stories: 3 },
          { date: '2026-10-03', value: 69, stories: 1 },
        ],
      }),
    ).toBe('Recovered from 48 on 30 Sep');
    expect(scoreProgress({ value: null, change7d: 2, series: [] })).toBeNull();
  });

  it('explains the coverage honestly', () => {
    expect(
      coverageLine({ tracked: false, lastCheckedAt: null, lastOutcome: null, nextRunAt: null }),
    ).toMatch(/in no tracked index/);
    expect(
      coverageLine(
        { tracked: true, lastCheckedAt: hoursAgo(5), lastOutcome: 'outage', nextRunAt: null },
        NOW,
      ),
    ).toBe(
      'Searched daily for every index company · last checked 5 h ago (the search engines did not answer).',
    );
  });
});
