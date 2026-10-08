import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { useScreenLayout } from '@/components/layout/responsive';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { ScrollTabs, Tabs } from '@/components/ui/Tabs';
import { BacktestTab } from '@/features/index-bot/components/BacktestTab';
import { BotHeader } from '@/features/index-bot/components/BotHeader';
import { ControlsTab, SaveBar } from '@/features/index-bot/components/ControlsTab';
import { DecisionsTab } from '@/features/index-bot/components/DecisionsTab';
import { OverviewTab } from '@/features/index-bot/components/OverviewTab';
import { BotNotice, BotQueryError, ChipRow } from '@/features/index-bot/components/parts';
import { TradesTab } from '@/features/index-bot/components/TradesTab';
import { useSettingsDraft } from '@/features/index-bot/components/useSettingsDraft';
import {
  indexBotKeys,
  useBotStatus,
  useIndexBacktest,
  useIndexOverview,
  useIsAdmin,
} from '@/features/index-bot/hooks';
import {
  BACKTEST_RANGES,
  BACKTEST_UNDERLYINGS,
  BOT_TABS,
  MODE_FILTERS,
  parseBacktestDays,
  parseBacktestUnderlying,
  parseMode,
  parsePhase,
  parseRange,
  parseTab,
  RANGES,
  type BotTab,
  type PhaseFilter,
} from '@/features/index-bot/lib/view';
import type { BacktestUnderlying, ModeFilter, RangeKey } from '@/features/index-bot/types';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/**
 * Agents › Index trading — the index-options bot: every few minutes in market hours a bull and a
 * bear researcher debate live futures, option liquidity and news; a trader proposes a call, a put
 * or HOLD; a code-side risk engine (rupee caps, a stop cap, a historical win-rate bound above cost
 * break-even) decides; a paper or OCO-protected live order follows only when everything agrees.
 *
 * Five views, each addressable (`?tab=overview|trades|decisions|backtest|controls`, other screens
 * link to `?tab=controls`): what it earned, every position, every scan and its debate, the rules
 * replayed on history, and the switch and caps. Mode and range live in the route too and are
 * shared by Overview and Trades; Decisions has its own range; Backtest reads `index` and `days`.
 * Admin-only, like every route it reads.
 */
export default function IndexTradingScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const isAdmin = useIsAdmin();
  const params = useLocalSearchParams<{
    tab?: string;
    mode?: string;
    range?: string;
    phase?: string;
    /** Backtest: NIFTY | BANKNIFTY. */
    index?: string;
    /** Backtest: 30 | 60 | 90. */
    days?: string;
  }>();
  const tab = parseTab(params.tab);
  const mode = parseMode(params.mode);
  const range = parseRange(params.range);
  const phase = parsePhase(params.phase);
  const underlying = parseBacktestUnderlying(params.index);
  const days = parseBacktestDays(params.days);
  const [decisionRange, setDecisionRange] = useState<RangeKey>('7d');
  const layout = useScreenLayout();

  const overview = useIndexOverview(mode, range);
  const status = useBotStatus(tab === 'controls');
  const backtest = useIndexBacktest(underlying, days, tab === 'backtest');
  const controller = useSettingsDraft(status.data);

  const setTab = useCallback(
    (next: BotTab, nextPhase?: PhaseFilter) =>
      router.setParams({
        tab: next,
        phase: nextPhase && nextPhase !== 'all' ? nextPhase : undefined,
      }),
    [router],
  );
  const setMode = useCallback((next: ModeFilter) => router.setParams({ mode: next }), [router]);
  const setRange = useCallback((next: RangeKey) => router.setParams({ range: next }), [router]);
  const setPhase = useCallback(
    (next: PhaseFilter) => router.setParams({ phase: next === 'all' ? undefined : next }),
    [router],
  );
  const setUnderlying = useCallback(
    (next: BacktestUnderlying) => router.setParams({ index: next }),
    [router],
  );
  const setDays = useCallback(
    (next: (typeof BACKTEST_RANGES)[number]['key']) => router.setParams({ days: next }),
    [router],
  );
  const onRefresh = useCallback(
    () => client.refetchQueries({ queryKey: indexBotKeys.all, type: 'active' }),
    [client],
  );

  if (!isAdmin) {
    return (
      <GroupScreen fill>
        <BotNotice kind="admin" />
      </GroupScreen>
    );
  }

  const showFilters = tab === 'overview' || tab === 'trades';

  return (
    <GroupScreen
      fill
      onRefresh={onRefresh}
      footer={
        tab === 'controls' && controller.dirty ? <SaveBar controller={controller} /> : undefined
      }
    >
      <BotHeader data={overview.data} loading={overview.isPending} />
      {/* Five tabs do not fit a phone's width at a readable size: they scroll there. */}
      {layout.compact ? (
        <ScrollTabs
          items={BOT_TABS}
          value={tab}
          onChange={(next) => setTab(next)}
          className="mb-4"
        />
      ) : (
        <Tabs items={BOT_TABS} value={tab} onChange={(next) => setTab(next)} className="mb-4" />
      )}

      {showFilters ? (
        <View className="mb-4 flex-row flex-wrap items-center gap-x-4 gap-y-2">
          <ChipRow items={MODE_FILTERS} value={mode} onChange={setMode} label="Mode" />
          <ChipRow items={RANGES} value={range} onChange={setRange} label="Range" />
        </View>
      ) : null}
      {tab === 'backtest' ? (
        <View className="mb-4 flex-row flex-wrap items-center gap-x-4 gap-y-2">
          <ChipRow
            items={BACKTEST_UNDERLYINGS}
            value={underlying}
            onChange={setUnderlying}
            label="Index"
          />
          <ChipRow
            items={BACKTEST_RANGES}
            value={String(days) as (typeof BACKTEST_RANGES)[number]['key']}
            onChange={setDays}
            label="History"
          />
        </View>
      ) : null}

      {tab === 'overview' ? (
        overview.isPending ? (
          <ListSkeleton rows={6} />
        ) : overview.data ? (
          <View style={{ opacity: overview.isPlaceholderData ? 0.6 : 1 }}>
            <OverviewTab data={overview.data} mode={mode} range={range} onTab={setTab} />
          </View>
        ) : (
          <BotQueryError
            what="the index bot"
            error={overview.error}
            onRetry={() => void overview.refetch()}
          />
        )
      ) : null}
      {tab === 'trades' ? (
        <TradesTab mode={mode} range={range} phase={phase} onPhase={setPhase} />
      ) : null}
      {tab === 'decisions' ? (
        <DecisionsTab range={decisionRange} onRange={setDecisionRange} />
      ) : null}
      {tab === 'backtest' ? (
        backtest.isPending ? (
          <View accessibilityLabel="Running the historical replay">
            <Text className="mb-3 text-xs text-ink-muted dark:text-ink-dark-muted">
              Replaying Groww history — a first run can take a minute.
            </Text>
            <ListSkeleton rows={6} />
          </View>
        ) : backtest.data ? (
          <View style={{ opacity: backtest.isPlaceholderData ? 0.6 : 1 }}>
            <BacktestTab data={backtest.data} />
          </View>
        ) : (
          <BotQueryError
            what="the backtest"
            error={backtest.error}
            onRetry={() => void backtest.refetch()}
          />
        )
      ) : null}
      {tab === 'controls' ? (
        <ControlsTab query={status} controller={controller} onTab={setTab} />
      ) : null}
    </GroupScreen>
  );
}
