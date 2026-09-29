import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { SegmentedControl } from '@/components/ui/Tabs';
import {
  StrategyMatrixCellSheet,
  type MatrixCellDetail,
} from '@/features/strategies/components/StrategyMatrixCellSheet';
import {
  MatrixLegend,
  StrategyMatrixGrid,
  type MatrixSelection,
} from '@/features/strategies/components/StrategyMatrixGrid';
import { useStrategiesList, useStrategyDetails } from '@/features/strategies/hooks';
import {
  buildMatrix,
  matrixCandidates,
  MIN_TRADES_FOR_SYMBOL_STATS,
  splitMatrixKey,
  type MatrixMetric,
} from '@/features/strategies/lib/backtest';
import type { StrategySummary } from '@/features/strategies/types';
import { stockHref } from '@/lib/navigation';

const EMPTY: StrategySummary[] = [];

const METRICS: readonly { key: MatrixMetric; label: string }[] = [
  { key: 'profitFactor', label: 'Profit factor' },
  { key: 'winRate', label: 'Win rate' },
];

/**
 * Which strategies work on which stocks — one row per backtested strategy, one column per
 * stock, coloured by that cell's profit factor or win rate. Built entirely from each run's
 * own per-stock breakdown (the web's StrategyMatrix), with its two honesty rules: columns are
 * only stocks EVERY compared strategy traded (no blank cell reads as a zero), and cells under
 * the trade floor are dimmed rather than coloured.
 */
export default function StrategyMatrixScreen() {
  const router = useRouter();
  const list = useStrategiesList();
  const [metric, setMetric] = useState<MatrixMetric>('profitFactor');
  // The sheet keeps its last cell while it slides out, so `open` is tracked separately.
  const [detail, setDetail] = useState<(MatrixCellDetail & { strategyId: string }) | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { shown, total } = matrixCandidates(list.data ?? EMPTY);
  // The per-stock breakdown lives on each strategy's detail read, so one fetch per row — one
  // hook for all of them, sharing the detail screen's cache entries.
  const details = useStrategyDetails(shown.map((strategy) => strategy.id));
  const detailsPending = details.some((query) => query.isPending);
  const failed = details.filter((query) => query.error && !query.data);
  // A run recorded before the per-stock breakdown existed has nothing to line up. Left in, it
  // would empty every column (a column needs every row to have traded it), so it is left out
  // and counted instead.
  const rows = shown
    .map((strategy, index) => ({ strategy, stats: details[index]?.data?.run?.symbolStats }))
    .filter((row) => Array.isArray(row.stats) && row.stats.length > 0);
  const withoutBreakdown = shown.length - rows.length;
  const model = buildMatrix(rows.map((row) => row.stats));

  const openStrategy = (id: string) => router.push({ pathname: '/strategy/[id]', params: { id } });

  const selectCell = ({ row, column, stats }: MatrixSelection) => {
    const strategy = rows[row]?.strategy;
    if (!strategy) return;
    setDetail({
      strategyId: strategy.id,
      strategyName: strategy.name,
      stale: strategy.resultsStale,
      column,
      stats,
    });
    setSheetOpen(true);
  };

  const refresh = () => Promise.all([list.refetch(), ...details.map((query) => query.refetch())]);

  const intro =
    shown.length === 0
      ? 'Which strategies work on which stocks, from their own backtests'
      : `${total > shown.length ? `${shown.length} of ${total}` : shown.length} backtested ${
          total === 1 ? 'strategy' : 'strategies'
        } · per-stock breakdown`;

  let body: React.ReactNode;
  if (list.isPending) {
    body = <ListSkeleton rows={4} />;
  } else if (list.error && !list.data) {
    body = <InlineError what="strategies" error={list.error} onRetry={() => void list.refetch()} />;
  } else if (shown.length === 0) {
    body = (
      <InlineEmpty
        title="Nothing to compare yet"
        message="The matrix is built from each strategy's per-stock backtest breakdown, so at least one strategy needs a completed run with trades in it."
        action={{ label: 'Go to strategies', onPress: () => router.push('/intel/strategies') }}
      />
    );
  } else if (detailsPending) {
    body = <ListSkeleton rows={Math.min(shown.length, 5)} />;
  } else if (failed.length > 0) {
    body = (
      <InlineError
        what="the per-stock results"
        error={failed[0]!.error}
        onRetry={() => failed.forEach((query) => void query.refetch())}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <InlineEmpty
        title="No per-stock breakdown yet"
        message={`${shown.length === 1 ? "This strategy's backtest was" : 'These backtests were'} run before per-stock results were recorded. Re-run a backtest to add it to the matrix.`}
        action={{ label: 'Go to strategies', onPress: () => router.push('/intel/strategies') }}
      />
    );
  } else if (model.columns.length === 0) {
    body = (
      <InlineEmpty
        title="No stocks in common"
        message="Each of these strategies traded a different set of stocks, so there is nothing to line up side by side. Comparing them is more useful one strategy at a time."
      />
    );
  } else {
    body = (
      <>
        <MatrixLegend metric={metric} />
        <View className="mt-3">
          <StrategyMatrixGrid
            model={model}
            names={rows.map((row) => row.strategy.name)}
            metric={metric}
            onOpenStrategy={(row) => {
              const strategy = rows[row]?.strategy;
              if (strategy) openStrategy(strategy.id);
            }}
            onSelectCell={selectCell}
          />
        </View>
        <Text className="mt-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {model.columns.length > 3
            ? `${model.columns.length} stocks — swipe the grid sideways. `
            : ''}
          Tap a cell for its trades, tap a name to open the strategy.
        </Text>
        <Text className="mt-4 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
          Read down a column, not across a row: a stock where every strategy does well is telling
          you about the stock, not about the strategies. Cells from fewer than{' '}
          {MIN_TRADES_FOR_SYMBOL_STATS} trades are dimmed — a profit factor of 8 from two trades
          would be the brightest number here and the least useful.
          {total > shown.length
            ? ` Showing the ${shown.length} most recently updated of ${total} backtested strategies.`
            : ''}
          {withoutBreakdown > 0
            ? ` ${withoutBreakdown} left out: ${withoutBreakdown === 1 ? 'its run predates' : 'their runs predate'} per-stock results — re-run to include ${withoutBreakdown === 1 ? 'it' : 'them'}.`
            : ''}
        </Text>
      </>
    );
  }

  return (
    <GroupScreen intro={intro} onRefresh={refresh}>
      {shown.length > 0 ? (
        <>
          <SegmentedControl items={METRICS} value={metric} onChange={setMetric} />
          <Text className="mb-4 mt-3 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            Each cell is one strategy&apos;s result on one stock, taken from that strategy&apos;s
            own backtest. Columns are the stocks they all traded, most-traded first.
          </Text>
        </>
      ) : null}

      {body}

      <Text className="mt-6 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Not investment advice. Backtests use past prices and can&apos;t predict returns.
      </Text>

      <StrategyMatrixCellSheet
        visible={sheetOpen}
        detail={detail}
        onClose={() => setSheetOpen(false)}
        onOpenStrategy={() => {
          setSheetOpen(false);
          if (detail) openStrategy(detail.strategyId);
        }}
        onOpenStock={() => {
          setSheetOpen(false);
          if (detail) {
            const { exchange, symbol } = splitMatrixKey(detail.column);
            router.push(stockHref(symbol, exchange));
          }
        }}
      />
    </GroupScreen>
  );
}
