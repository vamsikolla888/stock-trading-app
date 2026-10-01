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
import { useRunStaleBacktests, useStrategiesList } from '@/features/strategies/hooks';
import { isRunActive } from '@/features/strategies/lib/backtest';
import {
  duplicateNames,
  SORTS,
  sortStrategies,
  type SortKey,
} from '@/features/strategies/lib/ranking';
import type { StrategySummary } from '@/features/strategies/types';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const EMPTY: StrategySummary[] = [];

export default function StrategiesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const list = useStrategiesList();
  // Only to badge the one strategy the paper engine follows; a failure just means no badge.
  const autoTrade = useAutoTradeConfig();
  const [sort, setSort] = useState<SortKey>('expectancy');
  const [generating, setGenerating] = useState(false);
  const runStale = useRunStaleBacktests();

  const strategies = list.data ?? EMPTY;
  const duplicates = useMemo(() => duplicateNames(strategies), [strategies]);
  const ordered = useMemo(() => sortStrategies(strategies, sort), [strategies, sort]);
  const withResults = strategies.filter((s) => s.metrics).length;
  const config = autoTrade.data?.configured ? autoTrade.data.config : null;
  const deployedId = config?.candidateSource === 'strategy' ? (config.strategyId ?? null) : null;
  const engineOn = config?.enabled === true;
  // Never run, failed or out of date — and not already running.
  const needsRun = strategies.filter(
    (s) => !isRunActive(s) && (s.status !== 'complete' || s.resultsStale),
  ).length;
  const runningNow = strategies.filter((s) => isRunActive(s)).length;

  const rerunStale = () =>
    runStale.mutate(undefined, {
      onSuccess: (result) =>
        toast.info(
          result.queued > 0
            ? `${result.queued} backtest${result.queued === 1 ? '' : 's'} queued`
            : 'Nothing new to run',
          result.deferred > 0
            ? `${result.deferred} more wait — press again once these finish.`
            : 'Results appear on each card as they finish.',
        ),
      onError: (error) => toast.error("Couldn't queue the backtests", getErrorMessage(error)),
    });

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
          {needsRun > 0 || runningNow > 0 ? (
            <View className="mb-3 flex-row items-center gap-3 rounded-field bg-surface-sunk px-3.5 py-2.5 dark:bg-surface-sunk-dark">
              <Text className="flex-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                {runningNow > 0
                  ? `${runningNow} backtest${runningNow === 1 ? '' : 's'} running`
                  : `${needsRun} strateg${needsRun === 1 ? 'y needs' : 'ies need'} a fresh backtest`}
              </Text>
              {needsRun > 0 ? (
                <Button
                  label="Run all"
                  size="sm"
                  variant="secondary"
                  loading={runStale.isPending}
                  onPress={rerunStale}
                />
              ) : null}
            </View>
          ) : null}
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
