import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Plus from 'lucide-react-native/icons/plus';
import Sparkles from 'lucide-react-native/icons/sparkles';
import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { Chips, SegmentedControl } from '@/components/ui/Tabs';
import { useMyDeployments } from '@/features/deployments/hooks';
import { modesByStrategy } from '@/features/deployments/lib/view';
import { useAutoTradeConfig } from '@/features/live/api';
import { ScannerLibrary } from '@/features/next-day/components/ScannerLibrary';
import { nextDayKeys } from '@/features/next-day/hooks';
import { GenerateSheet } from '@/features/strategies/components/GenerateSheet';
import { PlatformStrategyCard } from '@/features/strategies/components/house/PlatformStrategyCard';
import { StrategyCard } from '@/features/strategies/components/StrategyCard';
import {
  useHouseStrategies,
  useRunStaleBacktests,
  useStrategiesList,
} from '@/features/strategies/hooks';
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

type ListTab = 'next-day' | 'swing';

/**
 * Intelligence › Strategies. Two tabs, as on the web: NEXT-DAY SCANNERS (the default) — the
 * Next-Day system's scanners with their rules and measured edge — and SWING STRATEGIES
 * (`?tab=swing`): the platform strategies first, one card each with the same figures, then the
 * user's own.
 */
export default function StrategiesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const tab: ListTab = params.tab === 'swing' ? 'swing' : 'next-day';
  const { colors } = useTheme();
  const layout = useScreenLayout();
  const list = useStrategiesList();
  // Platform strategies sit above the user's own. An older server (or any failure) hides the
  // section; the user's strategies never wait on it.
  const house = useHouseStrategies();
  // Only to badge the one strategy the paper engine follows; a failure just means no badge.
  const autoTrade = useAutoTradeConfig();
  // Which of the user's strategies run on paper or live right now: one call for the whole list.
  // A failure (or an older server) just means no chips.
  const mine = useMyDeployments();
  const modesBy = useMemo(() => modesByStrategy(mine.data ?? []), [mine.data]);
  const [sort, setSort] = useState<SortKey>('expectancy');
  const [generating, setGenerating] = useState(false);
  const runStale = useRunStaleBacktests();

  const strategies = list.data ?? EMPTY;
  const platform = house.data ?? [];
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

  const tabs = useMemo(
    () => [
      { key: 'next-day' as const, label: 'Next-day scanners' },
      {
        key: 'swing' as const,
        label: list.isPending
          ? 'Swing strategies'
          : `Swing strategies ${platform.length + strategies.length}`,
      },
    ],
    [list.isPending, platform.length, strategies.length],
  );

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

  const queryClient = useQueryClient();
  const refresh = useCallback(
    () =>
      tab === 'next-day'
        ? queryClient.refetchQueries({ queryKey: nextDayKeys.library })
        : Promise.all([list.refetch(), autoTrade.refetch(), house.refetch(), mine.refetch()]),
    [tab, queryClient, list, autoTrade, house, mine],
  );

  return (
    <GroupScreen
      intro={
        tab === 'next-day'
          ? 'The Next-Day system — eleven scanners, measured on NSE history, voting together'
          : `${platform.length} platform · ${strategies.length} yours · ${withResults} backtested`
      }
      onRefresh={refresh}
    >
      <SegmentedControl
        items={tabs}
        value={tab}
        onChange={(key) => router.setParams({ tab: key === 'swing' ? 'swing' : undefined })}
        className="mb-5"
      />

      {tab === 'next-day' ? (
        <ScannerLibrary />
      ) : (
        <>
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

          {platform.length > 0 ? (
            <Section title="Platform strategies" note="Run for everyone" className="mt-6">
              <Grid columns={Math.min(layout.columns, 2)} equalHeight={false}>
                {platform.map((strategy) => (
                  <PlatformStrategyCard
                    key={strategy.key}
                    strategy={strategy}
                    onPress={() =>
                      router.push({
                        pathname: '/house-strategy/[key]',
                        params: { key: strategy.key },
                      })
                    }
                  />
                ))}
              </Grid>
            </Section>
          ) : null}

          <Section
            title="Your strategies"
            action={
              strategies.some((s) => s.metrics && s.metrics.totalTrades > 0)
                ? { label: 'Compare', onPress: () => router.push('/intel/matrix') }
                : undefined
            }
            className="mt-6"
          >
            {list.isPending ? (
              <ListSkeleton rows={4} />
            ) : list.error && !list.data ? (
              <InlineError
                what="strategies"
                error={list.error}
                onRetry={() => void list.refetch()}
              />
            ) : strategies.length === 0 ? (
              <InlineEmpty
                title="No strategies of your own yet"
                message="Start from a template, or compose your own conditions."
                action={{ label: 'Build a strategy', onPress: () => router.push('/intel/build') }}
              />
            ) : (
              <>
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
                      modes={modesBy.get(strategy.id)}
                      onPress={() =>
                        router.push({ pathname: '/strategy/[id]', params: { id: strategy.id } })
                      }
                    />
                  ))}
                </View>
                <Text className="mt-4 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
                  Sorted on backtested results, which are not forecasts. Below about 30 trades the
                  order is mostly luck. Expectancy decides it: a high win rate with negative
                  expectancy still loses money.
                </Text>
              </>
            )}
          </Section>

          <Text className="mt-5 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            Backtests run on stored candles, net of costs. Not investment advice — past results
            don&apos;t predict returns.
          </Text>

          <GenerateSheet
            visible={generating}
            kind="strategy"
            onClose={() => setGenerating(false)}
          />
        </>
      )}
    </GroupScreen>
  );
}
