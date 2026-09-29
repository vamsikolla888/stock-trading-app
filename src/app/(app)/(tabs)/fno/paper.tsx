import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Text, View } from 'react-native';

import { GroupScreen } from '@/components/navigation/GroupScreen';
import { SegmentedControl } from '@/components/ui/Tabs';
import { PaperExplore } from '@/features/derivatives/components/PaperExplore';
import { PaperOrders } from '@/features/derivatives/components/PaperOrders';
import { PaperPositions } from '@/features/derivatives/components/PaperPositions';
import { derivativesKeys } from '@/features/derivatives/hooks';
import { PAPER_VIEWS, parsePaperView } from '@/features/derivatives/lib/routes';
import type { PaperView } from '@/features/derivatives/types';
import { marketKeys } from '@/features/market/hooks';

/**
 * F&O › Paper trading — the simulated F&O book, the web's three /fno/paper screens (Explore,
 * Positions, Orders) as one tab with a segmented control. The view lives in the route
 * (`?view=positions`), so a ticket's "View paper positions" lands on the right one. The chain
 * itself is a stack screen (/paper-option-chain) pushed from every underlying here.
 */
export default function FnoPaperScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ view?: string }>();
  const view = parsePaperView(params.view);

  const setView = useCallback((next: PaperView) => router.setParams({ view: next }), [router]);

  // Only what the open view is showing: an inactive query has no observer to refresh.
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
    <GroupScreen onRefresh={onRefresh}>
      <SegmentedControl items={PAPER_VIEWS} value={view} onChange={setView} />
      <View className="mb-4 mt-2.5 flex-row items-center gap-2">
        <View className="rounded-md bg-info-wash px-1.5 py-0.5 dark:bg-info-wash-dark">
          <Text className="text-[10px] font-bold text-info dark:text-info-dark">PAPER</Text>
        </View>
        <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={2}>
          Simulated futures &amp; options with paper money. Nothing reaches a broker.
        </Text>
      </View>
      {view === 'positions' ? (
        <PaperPositions />
      ) : view === 'orders' ? (
        <PaperOrders />
      ) : (
        <PaperExplore onOpenView={setView} />
      )}
    </GroupScreen>
  );
}
