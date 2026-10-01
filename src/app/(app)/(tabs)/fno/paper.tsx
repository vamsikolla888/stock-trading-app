import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Text, View } from 'react-native';

import { GroupScreen } from '@/components/navigation/GroupScreen';
import { Button } from '@/components/ui/Button';
import { ScrollTabs } from '@/components/ui/Tabs';
import { PaperAnalytics } from '@/features/derivatives/components/PaperAnalytics';
import { PaperExplore } from '@/features/derivatives/components/PaperExplore';
import { PaperFnoSummary } from '@/features/derivatives/components/PaperFnoSummary';
import { PaperOrders } from '@/features/derivatives/components/PaperOrders';
import { PaperPositions } from '@/features/derivatives/components/PaperPositions';
import { derivativesKeys, usePaperOrders } from '@/features/derivatives/hooks';
import { PAPER_ORDERS_LIMIT } from '@/features/derivatives/lib/book';
import { PAPER_VIEWS, paperChainHref, parsePaperView } from '@/features/derivatives/lib/routes';
import type { PaperView } from '@/features/derivatives/types';
import { marketKeys } from '@/features/market/hooks';

/**
 * F&O › Paper trading — the simulated F&O account, shaped like the web's /fno/paper: the
 * account summary (with its OWN wallet, separate from the cash paper wallet), then the book —
 * Positions, Orders (a resting LIMIT order waits here), Analytics — and Explore for finding the
 * next contract. The view lives in the route (`?view=orders`), so a ticket's "View paper
 * positions" lands on the right one. The chain is a stack screen, opened from the footer.
 */
export default function FnoPaperScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ view?: string }>();
  const view = parsePaperView(params.view);
  const setView = useCallback((next: PaperView) => router.setParams({ view: next }), [router]);

  // Shared with the Orders view (same key), so the resting-order count costs no extra request.
  const orders = usePaperOrders(PAPER_ORDERS_LIMIT);
  const resting = orders.data?.filter((o) => o.status === 'PENDING').length ?? 0;

  // Only what is on screen: an inactive query has no observer to refresh.
  const onRefresh = useCallback(
    () =>
      Promise.all([
        qc.refetchQueries({ queryKey: derivativesKeys.all, type: 'active' }),
        view === 'explore'
          ? qc.refetchQueries({ queryKey: marketKeys.indices(), type: 'active' })
          : Promise.resolve(),
      ]),
    [qc, view],
  );

  return (
    <GroupScreen
      onRefresh={onRefresh}
      footer={
        <View className="border-t border-line px-5 pb-2 pt-3 dark:border-line-dark">
          <Button
            label="Trade on the option chain"
            size="lg"
            fullWidth
            onPress={() => router.push(paperChainHref())}
          />
        </View>
      }
    >
      <View className="mb-4 flex-row items-center gap-2">
        <View className="rounded-md bg-info-wash px-1.5 py-0.5 dark:bg-info-wash-dark">
          <Text className="text-[10px] font-bold text-info dark:text-info-dark">PAPER</Text>
        </View>
        <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={2}>
          Simulated futures &amp; options with their own paper wallet. Nothing reaches a broker.
        </Text>
      </View>

      <PaperFnoSummary />

      <ScrollTabs
        items={PAPER_VIEWS}
        value={view}
        onChange={setView}
        className="mb-4 mt-6"
        badges={{ orders: resting }}
      />

      {view === 'orders' ? (
        <PaperOrders />
      ) : view === 'analytics' ? (
        <PaperAnalytics />
      ) : view === 'explore' ? (
        <PaperExplore onOpenView={setView} />
      ) : (
        <PaperPositions />
      )}
    </GroupScreen>
  );
}
