import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { StockLogo } from '@/components/market/StockLogo';
import { Badge } from '@/components/ui/Badge';
import { Section } from '@/components/ui/Section';
import { formatIstDateTime } from '@/features/home/lib/istTime';
import { stockLogoUrl } from '@/features/market/api';
import { useNews } from '@/features/market/hooks';
import type { AnalyzedArticleListItem, Sentiment } from '@/features/market/types';
import { stockHref } from '@/lib/navigation';

const MAX_CARDS = 6;

const SENTIMENT_VARIANT: Record<Sentiment, 'success' | 'neutral' | 'danger'> = {
  Positive: 'success',
  Neutral: 'neutral',
  Negative: 'danger',
};

/** The feed's top-impact articles that are tied to a verified stock, one card per stock. */
function pickStoryPerStock(items: readonly AnalyzedArticleListItem[]): AnalyzedArticleListItem[] {
  const seen = new Set<string>();
  const picked: AnalyzedArticleListItem[] = [];
  for (const item of items) {
    if (!item.stockSymbol || !item.symbolVerified || seen.has(item.stockSymbol)) continue;
    seen.add(item.stockSymbol);
    picked.push(item);
    if (picked.length === MAX_CARDS) break;
  }
  return picked;
}

function NewsCard({ item }: { item: AnalyzedArticleListItem }) {
  const router = useRouter();
  const symbol = item.stockSymbol ?? '';
  const title = item.title || '(untitled)';
  // An ISO instant from the API; shown as the IST wall-clock time, like every other screen.
  const published = formatIstDateTime(item.publishedAtDate);

  return (
    <View className="w-[264px] rounded-card border border-line bg-surface p-3.5 dark:border-line-dark dark:bg-surface-dark">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${symbol}`}
        hitSlop={6}
        // News carries no exchange; NSE is the primary listing for nearly every tagged stock.
        onPress={() => router.push(stockHref(symbol, 'NSE'))}
        className="flex-row items-center gap-2.5 active:opacity-70"
      >
        <StockLogo symbol={symbol} uri={stockLogoUrl(symbol)} size="sm" />
        <Text
          className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark"
          numberOfLines={1}
        >
          {symbol}
        </Text>
        {item.sentiment ? (
          <Badge label={item.sentiment} variant={SENTIMENT_VARIANT[item.sentiment]} />
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${item.source}`}
        accessibilityHint="Opens the article"
        onPress={() => router.push({ pathname: '/article/[id]', params: { id: item.newsId } })}
        className="mt-3 flex-1 active:opacity-70"
      >
        <Text className="text-[13px] leading-[19px] text-ink dark:text-ink-dark" numberOfLines={3}>
          {title}
        </Text>
        <Text className="mt-2 text-xs text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
          {item.source}
          {published ? ` · ${published}` : ''}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Groww's "Stocks in news" rail. The ticker opens the stock; the headline opens the in-app
 * article (which links out to the original). Supplementary content: while loading, on
 * error, or with nothing stock-specific to show it renders nothing rather than a placeholder.
 */
export function StocksInNews() {
  const router = useRouter();
  const news = useNews();
  const stories = news.data ? pickStoryPerStock(news.data.items) : [];
  if (stories.length === 0) return null;

  return (
    <Section
      title="Stocks in news"
      action={{ label: 'See all', onPress: () => router.push('/news') }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-5"
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
      >
        {stories.map((item) => (
          <NewsCard key={item.newsId} item={item} />
        ))}
      </ScrollView>
    </Section>
  );
}
