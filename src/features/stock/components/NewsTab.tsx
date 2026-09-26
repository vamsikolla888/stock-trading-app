import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { NewsRow } from '@/features/news/components/NewsRow';
import { useStockNews } from '@/features/news/hooks';

/**
 * This company's analysed news from the last 30 days, newest first. Fetched only while the
 * tab is open; rows open the in-app article.
 */
export function NewsTab({
  newsSymbol,
  displaySymbol,
}: {
  newsSymbol: string;
  displaySymbol: string;
}) {
  const router = useRouter();
  const news = useStockNews(newsSymbol);
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
    <Section title="In the news" note="Last 30 days" className="mt-6">
      {body}
      {items.length > 0 ? (
        <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          {total > items.length ? `Latest ${items.length} of ${total} articles. ` : ''}The number is
          each article’s impact score (0–100), from an AI model — not investment advice.
        </Text>
      ) : null}
    </Section>
  );
}
