import { useRouter } from 'expo-router';
import Plus from 'lucide-react-native/icons/plus';
import Sparkles from 'lucide-react-native/icons/sparkles';
import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { useAutoTradeConfig } from '@/features/live/api';
import { GenerateSheet } from '@/features/strategies/components/GenerateSheet';
import { StrategyCard } from '@/features/strategies/components/StrategyCard';
import { useStrategiesList } from '@/features/strategies/hooks';
import {
  duplicateNames,
  SORTS,
  sortStrategies,
  type SortKey,
} from '@/features/strategies/lib/ranking';
import type { StrategySummary } from '@/features/strategies/types';
import { useTheme } from '@/theme/ThemeProvider';

const EMPTY: StrategySummary[] = [];

export default function StrategiesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const list = useStrategiesList();
  // Only to badge the one strategy the paper engine follows; a failure just means no badge.
  const autoTrade = useAutoTradeConfig();
  const [sort, setSort] = useState<SortKey>('expectancy');
  const [generating, setGenerating] = useState(false);

  const strategies = list.data ?? EMPTY;
  const duplicates = useMemo(() => duplicateNames(strategies), [strategies]);
  const ordered = useMemo(() => sortStrategies(strategies, sort), [strategies, sort]);
  const withResults = strategies.filter((s) => s.metrics).length;
  const config = autoTrade.data?.configured ? autoTrade.data.config : null;
  const deployedId = config?.candidateSource === 'strategy' ? (config.strategyId ?? null) : null;
  const engineOn = config?.enabled === true;

  const refresh = useCallback(
    () => Promise.all([list.refetch(), autoTrade.refetch()]),
    [list, autoTrade],
  );

  return (
    <GroupScreen
      intro={
        strategies.length === 0
          ? 'Rule sets replayed over real daily history, net of costs'
          : `${strategies.length} saved · ${withResults} with results · daily bars, net of costs`
      }
      onRefresh={refresh}
    >
      <View className="flex-row gap-2.5">
        <Button
          label="Build a strategy"
          size="sm"
          className="flex-1"
          leftIcon={<Plus size={16} color={colors.primaryText} />}
          onPress={() => router.push('/intel/build')}
        />
        <Button
          label="Generate"
          variant="secondary"
          size="sm"
          className="flex-1"
          accessibilityLabel="Generate strategies with AI"
          leftIcon={<Sparkles size={15} color={colors.link} />}
          onPress={() => setGenerating(true)}
        />
      </View>

      {list.isPending ? (
        <View className="mt-6">
          <ListSkeleton rows={4} />
        </View>
      ) : list.error ? (
        <InlineError
          what="strategies"
          error={list.error}
          onRetry={() => void list.refetch()}
          className="mt-6"
        />
      ) : strategies.length === 0 ? (
        <View className="mt-6">
          <InlineEmpty
            title="No strategies yet"
            message="Start from a built-in template — an RSI reversal, an EMA cross, a volume breakout — or compose your own conditions."
            action={{ label: 'Build a strategy', onPress: () => router.push('/intel/build') }}
          />
        </View>
      ) : (
        <Section
          title="Your strategies"
          action={
            strategies.some((s) => s.metrics && s.metrics.totalTrades > 0)
              ? { label: 'Compare', onPress: () => router.push('/intel/matrix') }
              : undefined
          }
          className="mt-6"
        >
          {strategies.length > 1 ? (
            <Chips items={SORTS} value={sort} onChange={setSort} className="mb-3" />
          ) : null}
          <View className="gap-3">
            {ordered.map((strategy) => (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                sort={sort}
                duplicated={duplicates.has(strategy.name.trim().toLowerCase())}
                deployed={strategy.id === deployedId}
                engineOn={engineOn}
                onPress={() =>
                  router.push({ pathname: '/strategy/[id]', params: { id: strategy.id } })
                }
              />
            ))}
          </View>
          <Text className="mt-4 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
            Sorted on backtested results, which are not forecasts. Below about 30 trades the order
            is mostly luck, so the first card is not automatically the best. Expectancy decides it:
            a high win rate with negative expectancy still loses money.
          </Text>
        </Section>
      )}

      <Text className="mt-5 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Not investment advice — review before acting. Past results don&apos;t predict returns.
      </Text>

      <GenerateSheet visible={generating} kind="strategy" onClose={() => setGenerating(false)} />
    </GroupScreen>
  );
}
