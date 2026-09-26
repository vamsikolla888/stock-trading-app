import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { StockRow } from '@/components/market/StockRow';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { SearchTrigger } from '@/components/ui/SearchTrigger';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { stockLogoUrl } from '@/features/market/api';
import { marketKeys, useMovers, useRecentlyViewed } from '@/features/market/hooks';
import { LiveOrdersList } from '@/features/trading/components/LiveOrdersList';
import { TradingStatusCard } from '@/features/trading/components/TradingStatusCard';
import { stockHref } from '@/lib/navigation';

interface StockItem {
  symbol: string;
  companyName: string | null;
  exchange: string;
  ltp: number | null;
  changePct: number | null;
}

function StockList({
  title,
  items,
  isPending,
  error,
  onRetry,
}: {
  title: string;
  items: readonly StockItem[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const router = useRouter();
  if (!isPending && !error && items.length === 0) return null;

  return (
    <Section title={title}>
      {isPending ? (
        <ListSkeleton rows={3} />
      ) : error && items.length === 0 ? (
        <InlineError what={title.toLowerCase()} error={error} onRetry={onRetry} />
      ) : (
        <ListCard>
          {items.map((item, index) => (
            <View key={`${item.exchange}:${item.symbol}`}>
              {index > 0 ? <RowDivider /> : null}
              <StockRow
                symbol={item.symbol}
                name={item.companyName}
                exchange={item.exchange}
                price={item.ltp}
                changePercent={item.changePct}
                logoUri={stockLogoUrl(item.symbol)}
                onPress={() => router.push(stockHref(item.symbol, item.exchange))}
              />
            </View>
          ))}
        </ListCard>
      )}
    </Section>
  );
}

/**
 * The Trade hub — Groww's "search a stock to trade": find a stock, open it, then Buy or
 * Sell from its page (a real order through the connected broker, after a review step).
 * Around the search sit what matters before and after an order: whether live trading is
 * ready and what each broker can spend, recent stocks, and the real orders placed here.
 */
export default function TradeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const recent = useRecentlyViewed(12);
  const mostTraded = useMovers('volume', 6);

  const onRefresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: marketKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['brokers'] }),
        queryClient.invalidateQueries({ queryKey: ['live-trading'] }),
      ]),
    [queryClient],
  );

  return (
    <GroupScreen
      onRefresh={onRefresh}
      intro="Search a stock, review it, then buy or sell for real."
    >
      <SearchTrigger placeholder="Search a stock to trade" onPress={() => router.push('/search')} />

      <View className="mt-5">
        <TradingStatusCard />
      </View>

      <StockList
        title="Recently viewed"
        items={(recent.data ?? []).slice(0, 5)}
        isPending={recent.isPending}
        error={recent.error}
        onRetry={() => void recent.refetch()}
      />

      <Section title="Your live orders" note="real orders only">
        <LiveOrdersList />
      </Section>

      <StockList
        title="Most traded today"
        items={(mostTraded.data ?? []).slice(0, 6)}
        isPending={mostTraded.isPending}
        error={mostTraded.error}
        onRetry={() => void mostTraded.refetch()}
      />
    </GroupScreen>
  );
}
