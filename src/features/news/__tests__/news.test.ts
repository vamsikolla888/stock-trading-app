import { nextNewsPage } from '@/features/news/hooks';
import {
  articleState,
  formatExpectedMove,
  impactTier,
  isWebLink,
  newsWindowStart,
  plainText,
  scoredImpact,
} from '@/features/news/lib/news';
import type { AnalyzedArticleListResponse } from '@/features/news/types';

describe('impactTier', () => {
  it('tiers the 0–100 impact score at 40 and 70', () => {
    expect(impactTier(100)).toBe('high');
    expect(impactTier(70)).toBe('high');
    expect(impactTier(69)).toBe('medium');
    expect(impactTier(40)).toBe('medium');
    expect(impactTier(39)).toBe('low');
    expect(impactTier(0)).toBe('low');
  });
});

describe('articleState', () => {
  it('claims a sentiment only for a completed analysis', () => {
    expect(articleState({ jobStatus: 'completed', sentiment: 'Positive' })).toBe('scored');
    expect(articleState({ jobStatus: 'completed', sentiment: null })).toBe('pending');
    expect(articleState({ jobStatus: 'failed', sentiment: null })).toBe('failed');
    expect(articleState({ jobStatus: 'queued', sentiment: null })).toBe('analyzing');
    expect(articleState({ jobStatus: 'processing', sentiment: 'Negative' })).toBe('analyzing');
    expect(articleState({ jobStatus: null, sentiment: null })).toBe('pending');
  });
});

describe('scoredImpact', () => {
  it('shows impact only once scored — a queued row’s null is not a zero', () => {
    expect(scoredImpact({ jobStatus: 'completed', effectivenessScore: 72 })).toBe(72);
    expect(scoredImpact({ jobStatus: 'completed', effectivenessScore: 0 })).toBe(0);
    expect(scoredImpact({ jobStatus: 'completed', effectivenessScore: null })).toBeNull();
    expect(scoredImpact({ jobStatus: 'queued', effectivenessScore: 55 })).toBeNull();
  });
});

describe('isWebLink', () => {
  it('only passes http(s) links to the OS', () => {
    expect(isWebLink('https://example.com/story')).toBe(true);
    expect(isWebLink(' HTTP://example.com ')).toBe(true);
    expect(isWebLink('javascript:alert(1)')).toBe(false);
    expect(isWebLink('tel:123')).toBe(false);
    expect(isWebLink('')).toBe(false);
    expect(isWebLink(null)).toBe(false);
  });
});

describe('formatExpectedMove', () => {
  it('signs the model’s next-day estimate to one decimal', () => {
    expect(formatExpectedMove(1.24)).toBe('+1.2%');
    expect(formatExpectedMove(-0.8)).toBe('−0.8%');
    expect(formatExpectedMove(0)).toBe('0.0%');
    expect(formatExpectedMove(null)).toBe('—');
    expect(formatExpectedMove(Number.NaN)).toBe('—');
  });
});

describe('plainText', () => {
  it('drops tags, keeps paragraph breaks and decodes common entities', () => {
    expect(plainText('<p>Profit up&nbsp;12%</p><p>Q&amp;A &quot;call&quot;</p>')).toBe(
      'Profit up 12%\nQ&A "call"',
    );
    expect(plainText('Line one<br/>Line   two')).toBe('Line one\nLine two');
    expect(plainText('It&#39;s &lt;fine&gt;')).toBe('It’s <fine>');
  });

  it('is empty for nothing', () => {
    expect(plainText(null)).toBe('');
    expect(plainText(undefined)).toBe('');
    expect(plainText('   ')).toBe('');
  });
});

describe('newsWindowStart', () => {
  it('starts thirty days back, floored to the hour so the query key holds for an hour', () => {
    const at = Date.parse('2026-09-26T08:35:07.123Z');
    expect(newsWindowStart(at)).toBe('2026-08-27T08:00:00.000Z');
    expect(newsWindowStart(Date.parse('2026-09-26T08:59:59Z'))).toBe(newsWindowStart(at));
    expect(newsWindowStart(Date.parse('2026-09-26T09:00:00Z'))).toBe('2026-08-27T09:00:00.000Z');
  });
});

describe('nextNewsPage', () => {
  const page = (pageNumber: number, total: number, count: number): AnalyzedArticleListResponse => ({
    items: Array.from({ length: count }, (_, index) => ({
      newsId: `${pageNumber}-${index}`,
      title: 't',
      source: 's',
      link: 'https://example.com',
      publishedAtDate: null,
      jobStatus: 'completed',
      sentiment: 'Neutral',
      effectivenessScore: 10,
      stockSymbol: null,
      symbolVerified: false,
      lastError: null,
      env: null,
    })),
    total,
    page: pageNumber,
    pageSize: 20,
  });

  it('asks for the next page while rows remain', () => {
    expect(nextNewsPage(page(1, 45, 20))).toBe(2);
    expect(nextNewsPage(page(2, 45, 20))).toBe(3);
  });

  it('stops at the last page, or when a page comes back empty', () => {
    expect(nextNewsPage(page(3, 45, 5))).toBeUndefined();
    expect(nextNewsPage(page(1, 20, 20))).toBeUndefined();
    expect(nextNewsPage(page(2, 100, 0))).toBeUndefined();
  });
});
