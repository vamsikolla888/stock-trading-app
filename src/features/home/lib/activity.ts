import type { ScreenerSummary } from '@/features/market/types';
import type { NewsRunListItem } from '@/features/news/types';

export type ActivityKind = 'screeners' | 'news' | 'strong-picks';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** Epoch ms. */
  at: number;
  title: string;
  detail: string;
}

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  return Number.isNaN(at) ? null : at;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Today's activity, from three real timestamped records only — the screeners' last scan,
 * news ingestion runs and the strong-picks pass's own verdict (as on the web Dashboard).
 * The screens are scanned together by one worker pass, so they collapse into one row
 * rather than repeating the same time for every screen. Newest first.
 */
export function buildActivity(
  input: {
    screeners?: readonly ScreenerSummary[] | null;
    newsRuns?: readonly NewsRunListItem[] | null;
    strongPickRun?: { verdict: string; finishedAt: string | null } | null;
  },
  limit = 4,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  const scanned = (input.screeners ?? []).filter((screener) => timeOf(screener.runAt) !== null);
  if (scanned.length > 0) {
    const latest = Math.max(...scanned.map((screener) => timeOf(screener.runAt) ?? 0));
    const firing = scanned.filter((screener) => screener.matchCount > 0).length;
    items.push({
      id: 'screeners',
      kind: 'screeners',
      at: latest,
      title: 'Screeners scanned',
      detail: `${plural(scanned.length, 'screen')} · ${firing} with matches`,
    });
  }

  for (const run of input.newsRuns ?? []) {
    const at = timeOf(run.finishedAt ?? run.startedAt);
    if (at === null) continue;
    items.push({
      id: `news:${run.runId}`,
      kind: 'news',
      at,
      title:
        run.status === 'COMPLETED'
          ? 'News refreshed'
          : run.status === 'FAILED'
            ? 'News refresh failed'
            : 'News refresh running',
      detail:
        run.status === 'COMPLETED'
          ? `${plural(run.counts.inserted, 'new article')}`
          : run.status === 'FAILED'
            ? (run.errorMessage ?? 'The ingestion run did not finish')
            : 'Fetching the latest articles',
    });
  }

  const run = input.strongPickRun;
  const runAt = timeOf(run?.finishedAt);
  if (run && runAt !== null) {
    items.push({
      id: 'strong-picks',
      kind: 'strong-picks',
      at: runAt,
      title: 'Strong picks review',
      detail: run.verdict,
    });
  }

  return items.sort((a, b) => b.at - a.at).slice(0, limit);
}
