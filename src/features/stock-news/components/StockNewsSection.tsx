import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { Chips, RangeSelector } from '@/components/ui/Tabs';
import { openArticleLink } from '@/features/news/lib/openLink';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import { useStockNews } from '../hooks';
import {
  chipFor,
  coverageLine,
  EVENT_LABEL,
  HIGH_IMPACT,
  newsWhen,
  type SentimentTone,
} from '../lib/format';
import type { NewsSentimentFilter, NewsWindow, StockNewsItem, StockNewsSummary } from '../types';

import { NewsRiskTile, NewsScoreTile } from './NewsSignals';

/**
 * The company's news, all of it, with what it adds up to (web: the stock page's News section).
 * Every index company is searched once a day; stories the market-news feed analysed in full join
 * the same list. The News score and News risk lead, then the window's split by sentiment, then the
 * ten newest stories — filterable, older ones on "Show more". Neither number is a forecast.
 */

const WINDOWS: readonly { key: `${NewsWindow}`; label: string }[] = [
  { key: '7', label: '7D' },
  { key: '30', label: '30D' },
  { key: '90', label: '90D' },
];

const CHIP: Record<SentimentTone, string> = {
  pos: 'bg-success-wash text-brand-text dark:bg-success-wash-dark dark:text-brand-text-dark',
  neg: 'bg-danger-wash text-danger-600 dark:bg-danger-wash-dark dark:text-danger-dark',
  neutral: 'bg-surface-sunk text-ink-muted dark:bg-surface-sunk-dark dark:text-ink-dark-muted',
  pending: 'border border-line text-ink-faint dark:border-line-dark dark:text-ink-dark-faint',
};

/** The window's stories by sentiment — counts, not weights (the score does the weighing). */
function Split({ s, days }: { s: StockNewsSummary; days: number }) {
  if (!s.analyzed) return null;
  const parts = [
    {
      key: 'positive',
      label: 'Positive',
      n: s.positive,
      fill: 'bg-brand-strong dark:bg-brand-strong-dark',
    },
    { key: 'neutral', label: 'Neutral', n: s.neutral, fill: 'bg-ink-faint dark:bg-ink-dark-faint' },
    {
      key: 'negative',
      label: 'Negative',
      n: s.negative,
      fill: 'bg-danger-500 dark:bg-danger-dark',
    },
  ];
  return (
    <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
        Stories by sentiment · {days} days
      </Text>
      <View
        accessible
        accessibilityLabel={`${s.positive} positive, ${s.neutral} neutral, ${s.negative} negative`}
        className="mt-2.5 h-2 flex-row overflow-hidden rounded-full bg-line dark:bg-line-dark"
      >
        {parts
          .filter((p) => p.n > 0)
          .map((p) => (
            <View
              key={p.key}
              className={p.fill}
              style={{ width: `${(p.n / s.analyzed) * 100}%` }}
            />
          ))}
      </View>
      <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <View key={p.key} className="flex-row items-center gap-1.5">
            <View className={cn('h-2 w-2 rounded-full', p.fill)} />
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              {p.label} <Text className="font-semibold text-ink dark:text-ink-dark">{p.n}</Text>
            </Text>
          </View>
        ))}
      </View>
      <View className="mt-3 flex-row border-t border-line pt-3 dark:border-line-dark">
        <Fact label="High impact" value={String(s.highImpact)} />
        <Fact label="Awaiting reading" value={String(s.pending)} divider />
      </View>
    </View>
  );
}

function Fact({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      className={cn('flex-1', divider && 'border-l border-line pl-3 dark:border-line-dark')}
    >
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      <Text className="mt-0.5 text-sm font-semibold text-ink dark:text-ink-dark">{value}</Text>
    </View>
  );
}

function StoryRow({
  item,
  now,
  onPress,
}: {
  item: StockNewsItem;
  now: number;
  onPress: () => void;
}) {
  const chip = chipFor(item);
  const high = (item.impactScore ?? 0) >= HIGH_IMPACT;
  const meta = [
    item.publisher,
    newsWhen(item, now),
    item.eventType ? EVENT_LABEL[item.eventType] : null,
    item.relevance === 'mentions' ? 'mentioned' : null,
  ].filter(Boolean);
  return (
    <Pressable
      accessibilityRole={item.newsId ? 'button' : 'link'}
      accessibilityLabel={`${chip.label}: ${item.title}. ${meta.join(', ')}${high ? ', high impact' : ''}`}
      accessibilityHint={
        item.newsId ? 'Opens the full analysis' : 'Opens the story in your browser'
      }
      onPress={onPress}
      className="gap-1.5 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-center gap-2">
        <Text
          className={cn(
            'overflow-hidden rounded-full px-2 py-0.5 text-[11px] font-semibold',
            CHIP[chip.tone],
          )}
        >
          {chip.label}
        </Text>
        {high ? (
          <Text className="text-[11px] font-semibold text-warning-600 dark:text-warning-dark">
            High impact
          </Text>
        ) : null}
        {item.newsId ? (
          <Text className="ml-auto text-[11px] font-semibold text-brand-text dark:text-brand-text-dark">
            Full analysis
          </Text>
        ) : null}
      </View>
      <Text
        className="text-sm font-semibold leading-5 text-ink dark:text-ink-dark"
        numberOfLines={3}
      >
        {item.title}
      </Text>
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
        {meta.join(' · ')}
      </Text>
      {item.reason || item.snippet ? (
        <Text
          className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
          numberOfLines={3}
        >
          {item.reason ?? item.snippet}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function StockNewsSection({
  exchange,
  symbol,
  displaySymbol,
}: {
  exchange: 'NSE' | 'BSE';
  symbol: string;
  displaySymbol: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const now = useNow();
  const [days, setDays] = useState<NewsWindow>(30);
  const [sentiment, setSentiment] = useState<NewsSentimentFilter>('all');
  const query = useStockNews(exchange, symbol, days, sentiment);

  const first = query.data?.pages[0];
  const last = query.data?.pages[query.data.pages.length - 1];
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const s = first?.summary;
  const signals = first?.signals;
  const hasSignals = !!signals && (signals.score.value != null || signals.risk.value != null);

  const filters = s
    ? [
        { key: 'all' as const, label: `All ${s.total}` },
        { key: 'Positive' as const, label: `Positive ${s.positive}` },
        { key: 'Neutral' as const, label: `Neutral ${s.neutral}` },
        { key: 'Negative' as const, label: `Negative ${s.negative}` },
      ]
    : [];

  const open = (item: StockNewsItem) =>
    item.newsId
      ? router.push({ pathname: '/article/[id]', params: { id: item.newsId } })
      : void openArticleLink(item.url);

  let body: React.ReactNode;
  if (query.isPending) {
    body = <ListSkeleton rows={4} />;
  } else if (!first || !s || !signals) {
    body = <InlineError what="news" error={query.error} onRetry={() => void query.refetch()} />;
  } else if (s.total === 0 && !hasSignals) {
    body = (
      <InlineEmpty
        title={`No news about ${displaySymbol} in the last ${days} days`}
        message={coverageLine(first.coverage, now)}
        action={days < 90 ? { label: 'Look back 90 days', onPress: () => setDays(90) } : undefined}
      />
    );
  } else {
    body = (
      <View className="gap-3">
        <NewsScoreTile score={signals.score} />
        <NewsRiskTile risk={signals.risk} now={now} />
        <Split s={s} days={days} />
        <Chips items={filters} value={sentiment} onChange={setSentiment} className="mt-1" />
        {items.length === 0 ? (
          <InlineEmpty
            title={
              s.total === 0
                ? `No stories in the last ${days} days`
                : `No ${sentiment.toLowerCase()} stories in the last ${days} days`
            }
          />
        ) : (
          <ListCard className={query.isPlaceholderData ? 'opacity-60' : undefined}>
            {items.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <RowDivider /> : null}
                <StoryRow item={item} now={now} onPress={() => open(item)} />
              </View>
            ))}
          </ListCard>
        )}
        {last && items.length > 0 ? (
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              Showing {items.length} of {last.totalFiltered}
            </Text>
            {query.hasNextPage ? (
              query.isFetchingNextPage ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Button
                  label="Show more"
                  variant="outline"
                  size="sm"
                  onPress={() => void query.fetchNextPage()}
                />
              )
            ) : null}
          </View>
        ) : null}
        <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          {coverageLine(first.coverage, now)} Each story is read by an AI model
          {s.models.length ? ` (${s.models.join(', ')})` : ''} from its headline and snippet — the
          whole article where it says Full analysis. The score and risk weigh those readings by
          impact, confidence and age. They describe the news; they are not a forecast or advice.
        </Text>
      </View>
    );
  }

  return (
    <Section
      title="News"
      className="mt-6"
      right={
        <RangeSelector
          items={WINDOWS}
          value={`${days}` as `${NewsWindow}`}
          onChange={(key) => setDays(Number(key) as NewsWindow)}
        />
      }
    >
      {body}
    </Section>
  );
}
