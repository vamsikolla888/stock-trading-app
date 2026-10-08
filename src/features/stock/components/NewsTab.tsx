import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { formatIstDateTime } from '@/features/home/lib/istTime';
import { useSentiment } from '@/features/market/hooks';
import type { StockDetail } from '@/features/market/types';
import { NewsRow } from '@/features/news/components/NewsRow';
import { useStockNews as useAnalysedNews } from '@/features/news/hooks';
import { StockNewsSection } from '@/features/stock-news/components/StockNewsSection';
import { useStockNews } from '@/features/stock-news/hooks';
import { cn } from '@/lib/utils/cn';
import { isServerOutdated } from '@/services/api/contract';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import {
  formatNet,
  MOOD_LABEL,
  newsSymbolFor,
  sentimentMood,
  sentimentSymbols,
  type SentimentMood,
} from '../lib/priceView';

const MOOD_TEXT: Record<SentimentMood, string> = {
  positive: 'text-brand-text dark:text-brand-text-dark',
  negative: 'text-danger-600 dark:text-danger-dark',
  mixed: 'text-ink dark:text-ink-dark',
};

/**
 * The stock page's News tab. The company's news with its score and risk (GET /stocks/:symbol/news
 * — the daily web search plus the feed's analyses); on a server that predates that endpoint, the
 * feed's own analysed articles and their 30-day sentiment instead, so the tab never goes blank.
 */
export function NewsTab({
  detail,
  exchange,
  displaySymbol,
}: {
  detail: StockDetail;
  exchange: 'NSE' | 'BSE';
  displaySymbol: string;
}) {
  // The same key the section below opens with, so this decides without a request of its own.
  const probe = useStockNews(exchange, detail.symbol);
  if (!probe.data && isServerOutdated(probe.error)) {
    return <LegacyNews detail={detail} exchange={exchange} displaySymbol={displaySymbol} />;
  }
  return (
    <StockNewsSection exchange={exchange} symbol={detail.symbol} displaySymbol={displaySymbol} />
  );
}

/* ───────────────── older servers: the analysed feed and its sentiment ───────────────── */

function LegacySentiment({ detail }: { detail: StockDetail }) {
  const { colors } = useTheme();
  const symbols = useMemo(
    () => sentimentSymbols(detail.symbol, detail.listings),
    [detail.symbol, detail.listings],
  );
  const sentiment = useSentiment(symbols);
  const data = sentiment.data;

  let body: React.ReactNode;
  if (sentiment.isPending) {
    body = <ActivityIndicator color={colors.accent} />;
  } else if (sentiment.error && !data) {
    body = (
      <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
        News sentiment couldn’t be loaded just now. {getErrorMessage(sentiment.error)}
      </Text>
    );
  } else if (!data || data.articles === 0 || data.net === null) {
    return null;
  } else {
    const mood = sentimentMood(data.net);
    const total = data.articles || 1;
    const latest = formatIstDateTime(data.latestAt);
    body = (
      <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
        <View className="flex-row items-baseline gap-2">
          <Text
            className={cn('text-[30px] font-bold', MOOD_TEXT[mood])}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatNet(data.net)}
          </Text>
          <Text className={cn('text-sm font-semibold', MOOD_TEXT[mood])}>{MOOD_LABEL[mood]}</Text>
        </View>
        <View
          accessible
          accessibilityLabel={`${data.positive} positive, ${data.neutral} neutral, ${data.negative} negative`}
          className="mt-3 h-2 flex-row overflow-hidden rounded-full bg-line dark:bg-line-dark"
        >
          <View
            className="bg-brand-strong dark:bg-brand-strong-dark"
            style={{ width: `${(data.positive / total) * 100}%` }}
          />
          <View
            className="bg-ink-faint dark:bg-ink-dark-faint"
            style={{ width: `${(data.neutral / total) * 100}%` }}
          />
          <View
            className="bg-danger-500 dark:bg-danger-dark"
            style={{ width: `${(data.negative / total) * 100}%` }}
          />
        </View>
        <Text className="mt-2 text-xs text-ink-muted dark:text-ink-dark-muted">
          {data.positive} positive · {data.neutral} neutral · {data.negative} negative
          {latest ? ` · latest ${latest} IST` : ''}
        </Text>
        <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Net = (positive − negative) ÷ articles, from each article’s AI analysis
          {data.models.length ? ` (${data.models.join(', ')})` : ''}.
        </Text>
      </View>
    );
  }

  return (
    <Section
      title="News sentiment"
      className="mt-6"
      note={
        data && data.articles > 0
          ? `${data.articles} article${data.articles === 1 ? '' : 's'} · ${data.days} days`
          : undefined
      }
    >
      {body}
    </Section>
  );
}

function LegacyNews({
  detail,
  exchange,
  displaySymbol,
}: {
  detail: StockDetail;
  exchange: 'NSE' | 'BSE';
  displaySymbol: string;
}) {
  const router = useRouter();
  const news = useAnalysedNews(newsSymbolFor(detail.symbol, exchange, detail.listings));
  const items = news.data?.items ?? [];

  let body: React.ReactNode;
  if (news.isPending) body = <ListSkeleton rows={4} />;
  else if (news.error && !news.data)
    body = <InlineError what="news" error={news.error} onRetry={() => void news.refetch()} />;
  else if (items.length === 0)
    body = (
      <InlineEmpty
        title={`No recent news about ${displaySymbol}`}
        message="Nothing analysed in the last 30 days mentions this company."
        action={{ label: 'Browse all market news', onPress: () => router.navigate('/news') }}
      />
    );
  else
    body = (
      <ListCard>
        {items.map((item, index) => (
          <View key={item.newsId}>
            {index > 0 ? <RowDivider /> : null}
            <NewsRow
              item={item}
              hideSymbol
              onPress={() =>
                router.push({ pathname: '/article/[id]', params: { id: item.newsId } })
              }
            />
          </View>
        ))}
      </ListCard>
    );

  const total = news.data?.total ?? 0;
  return (
    <View>
      <LegacySentiment detail={detail} />
      <Section title="In the news" note="Last 30 days" className="mt-6">
        {body}
        {items.length > 0 ? (
          <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            {total > items.length ? `Latest ${items.length} of ${total} articles. ` : ''}The number
            is each article’s impact score (0–100), from an AI model — not investment advice.
          </Text>
        ) : null}
      </Section>
    </View>
  );
}
