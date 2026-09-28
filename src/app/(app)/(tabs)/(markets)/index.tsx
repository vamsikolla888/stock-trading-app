import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback } from 'react';
import { Text } from 'react-native';

import { GroupScreen } from '@/components/navigation/GroupScreen';
import { HoldingsCard } from '@/features/home/components/HoldingsCard';
import { IndexStrip } from '@/features/home/components/IndexStrip';
import { MarketActivity } from '@/features/home/components/MarketActivity';
import { PaperAccountCard } from '@/features/home/components/PaperAccountCard';
import { ProductsAndTools } from '@/features/home/components/ProductsAndTools';
import { StocksInNews } from '@/features/home/components/StocksInNews';
import { TodaysPicks } from '@/features/home/components/TodaysPicks';
import { TopMovers } from '@/features/home/components/TopMovers';
import { WatchlistPreview } from '@/features/home/components/WatchlistPreview';
import { insightKeys } from '@/features/insights/api';
import { marketKeys, useLiveIndices } from '@/features/market/hooks';
import { newsKeys } from '@/features/news/hooks';
import {
  useGrowwPortfolioOverview,
  useMstockPortfolioOverview,
  usePortfolioOverview,
} from '@/features/portfolio/hooks';
import { strongPickKeys } from '@/features/strong-picks/hooks';
import { tradingKeys } from '@/features/trading/hooks';
import { watchlistKeys } from '@/features/watchlists/hooks';

/**
 * Today — the Groww-style home: index ticker with the session's status, holdings, top
 * movers, today's picks (or the screeners that fired), tools, watchlist, the paper book,
 * stocks in the news and what ran behind the scenes. Each section loads and fails on its
 * own, so one slow endpoint never blanks the screen.
 */
export default function HomeScreen() {
  const queryClient = useQueryClient();
  const overview = usePortfolioOverview();
  const mstockOverview = useMstockPortfolioOverview();
  const growwOverview = useGrowwPortfolioOverview();
  const indices = useLiveIndices();

  const onRefresh = useCallback(
    () =>
      Promise.all([
        overview.refetch(),
        mstockOverview.refetch(),
        growwOverview.refetch(),
        indices.refetch(),
        queryClient.invalidateQueries({ queryKey: [...marketKeys.all, 'movers'] }),
        queryClient.invalidateQueries({ queryKey: marketKeys.news() }),
        queryClient.invalidateQueries({ queryKey: marketKeys.screeners() }),
        queryClient.invalidateQueries({ queryKey: watchlistKeys.all }),
        queryClient.invalidateQueries({ queryKey: insightKeys.today }),
        queryClient.invalidateQueries({ queryKey: insightKeys.signals }),
        queryClient.invalidateQueries({ queryKey: strongPickKeys.today, exact: true }),
        queryClient.invalidateQueries({ queryKey: newsKeys.runs(3) }),
        queryClient.invalidateQueries({ queryKey: tradingKeys.paperSegments }),
      ]),
    [overview, mstockOverview, growwOverview, indices, queryClient],
  );

  return (
    <GroupScreen onRefresh={onRefresh}>
      <IndexStrip
        indices={indices.indices}
        marketOpen={indices.marketOpen}
        isLoading={indices.isLoading}
        error={indices.error}
        onRetry={() => void indices.refetch()}
      />
      <HoldingsCard
        overview={overview}
        mstockOverview={mstockOverview}
        growwOverview={growwOverview}
      />
      <TopMovers />
      <TodaysPicks />
      <ProductsAndTools />
      <WatchlistPreview />
      <PaperAccountCard />
      <StocksInNews />
      <MarketActivity />
      <Text className="mt-8 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Investments in securities are subject to market risks. Read all related documents carefully
        before investing. Picks and signals are not investment advice.
      </Text>
    </GroupScreen>
  );
}
