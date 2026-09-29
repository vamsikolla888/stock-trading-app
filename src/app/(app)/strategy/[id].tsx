import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { KpiGrid, type Kpi } from '@/components/ui/KpiGrid';
import { Section } from '@/components/ui/Section';
import { EquityCurveCard } from '@/features/strategies/components/EquityCurveCard';
import { StrategyFormFields, useStrategyForm } from '@/features/strategies/components/StrategyForm';
import { StrategyTodaySection } from '@/features/strategies/components/StrategyTodaySection';
import { TradeList } from '@/features/strategies/components/TradeList';
import {
  useBacktestStatus,
  useDeleteStrategy,
  useIndexCatalog,
  useRunBacktest,
  useStrategy,
  useUpdateStrategy,
} from '@/features/strategies/hooks';
import { parameterRows, recentTrades } from '@/features/strategies/lib/backtest';
import { formatProfitFactor } from '@/features/strategies/lib/ranking';
import type { StrategyDetail } from '@/features/strategies/types';
import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage, isApiError } from '@/types/api';

// A render failure here shows the error page with a retry, not a crashed app.
export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

export default function StrategyDetailScreen() {
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === 'string' ? rawId.trim() : '';
  const query = useStrategy(id || undefined);
  // No id (a malformed link) never fetches, and a deleted strategy — say, one the Live board
  // still points at — answers 404: both deserve "not found", not an endless skeleton or a raw
  // server message.
  const notFound = id === '' || (isApiError(query.error) && query.error.status === 404);
  const indices = useIndexCatalog();
  const remove = useDeleteStrategy();

  // Status polling starts once the server has accepted a run (or the strategy says one is in
  // flight) and stops by itself when the job settles — the poll interval is off whenever the
  // last answer was "not running", so nothing has to switch it off here.
  const [queuedHere, setQueuedHere] = useState(false);
  const run = useRunBacktest(id, { onQueued: () => setQueuedHere(true) });
  const strategy = query.data;
  const inFlight = strategy?.status === 'queued' || strategy?.status === 'running';
  const status = useBacktestStatus(id, queuedHere || inFlight);
  // The queue is the authority once it has answered (as on the web): a strategy left "queued"
  // by a job the worker lost must not lock the Run button forever. Until it answers — or
  // while a poll is in flight — the strategy's own status and this screen's click stand in.
  const queueAnswered = status.data !== undefined && !status.isFetching;
  const running =
    run.isPending || (queueAnswered ? status.data?.running === true : inFlight || queuedHere);
  // Not while the detail is refetching: a finished job invalidates it, and until the new read
  // lands the old "running" status would read as stuck for a moment.
  const stuck = inFlight && queueAnswered && !running && !query.isFetching;

  const startBacktest = () =>
    run.mutate(undefined, {
      onSuccess: (result) =>
        toast.info(
          result.alreadyRunning ? 'A backtest is already running' : 'Backtest queued',
          'Results appear here when it finishes.',
        ),
      onError: (error) => toast.error("Couldn't start the backtest", getErrorMessage(error)),
    });

  const confirmDelete = () => {
    if (!strategy) return;
    Alert.alert(`Delete “${strategy.name}”?`, 'Its backtest results go with it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(strategy.id, {
            onSuccess: () => {
              toast.success('Strategy deleted');
              if (router.canGoBack()) router.back();
              else router.replace('/intel/strategies');
            },
            onError: (error) => toast.error("Couldn't delete the strategy", getErrorMessage(error)),
          }),
      },
    ]);
  };

  // ── Editing in place, with the same form the Build tab uses ──
  const navigation = useNavigation();
  const [editing, setEditing] = useState(false);
  const form = useStrategyForm();
  const update = useUpdateStrategy(id);

  const startEditing = () => {
    if (!strategy) return;
    form.reset({
      name: strategy.name,
      description: strategy.description ?? '',
      rules: strategy.rules,
    });
    update.reset();
    setEditing(true);
  };

  const cancelEditing = () => {
    if (!form.dirty) {
      setEditing(false);
      return;
    }
    Alert.alert('Discard changes?', 'Your edits to this strategy will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setEditing(false) },
    ]);
  };

  const saveEdits = async () => {
    if (!form.validation.valid) {
      form.setShowErrors(true);
      toast.error('Check the highlighted fields');
      return;
    }
    try {
      await update.mutateAsync(form.body());
      toast.success(
        'Changes saved',
        strategy?.ranAt
          ? 'Re-run the backtest — the old results describe the previous rules.'
          : undefined,
      );
      setEditing(false);
    } catch {
      // Shown in the banner above the form.
    }
  };

  // Leaving with unsaved edits (back button or gesture) asks first.
  useEffect(() => {
    if (!editing || !form.dirty) return undefined;
    return navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      Alert.alert('Discard changes?', 'Your edits to this strategy will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(event.data.action),
        },
      ]);
    });
  }, [editing, form.dirty, navigation]);

  const refresh = useCallback(() => query.refetch(), [query]);

  if (editing && strategy) {
    return (
      <StackScreen
        title="Edit strategy"
        subtitle={strategy.name}
        right={
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={cancelEditing}
            className="active:opacity-60"
          >
            <Text className="text-[15px] font-semibold text-ink-muted dark:text-ink-dark-muted">
              Cancel
            </Text>
          </Pressable>
        }
        footer={
          <View className="border-t border-line bg-canvas px-5 py-3 dark:border-line-dark dark:bg-canvas-dark">
            <Button
              label="Save changes"
              loading={update.isPending}
              disabled={update.isPending || !form.dirty}
              fullWidth
              onPress={() => void saveEdits()}
            />
          </View>
        }
      >
        {update.error ? (
          <Banner
            tone="error"
            title="Couldn't save"
            message={getErrorMessage(update.error)}
            className="mb-2"
          />
        ) : null}
        {strategy.ranAt ? (
          <Banner
            tone="info"
            className="mb-2"
            message="Changing the rules marks the current backtest out of date until you re-run it."
          />
        ) : null}
        <StrategyFormFields form={form} />
      </StackScreen>
    );
  }

  return (
    <StackScreen
      title={strategy?.name ?? 'Strategy'}
      subtitle={strategy ? statusLine(strategy, stuck) : undefined}
      onRefresh={refresh}
      right={
        strategy && !notFound ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit rules"
            hitSlop={8}
            onPress={startEditing}
            className="active:opacity-60"
          >
            <Text className="text-[15px] font-semibold text-brand-text dark:text-brand-text-dark">
              Edit
            </Text>
          </Pressable>
        ) : undefined
      }
      footer={
        strategy && !notFound ? (
          <View className="border-t border-line bg-canvas px-5 py-3 dark:border-line-dark dark:bg-canvas-dark">
            <Button
              label={
                running ? 'Backtest running…' : strategy.ranAt ? 'Re-run backtest' : 'Run backtest'
              }
              loading={run.isPending}
              disabled={running}
              fullWidth
              onPress={startBacktest}
            />
          </View>
        ) : undefined
      }
    >
      {notFound ? (
        <InlineEmpty
          title="Strategy not found"
          message="It may have been deleted, or the link is out of date. Strategies are private, so another account's link won't open here either."
          action={{ label: 'Go to strategies', onPress: () => router.replace('/intel/strategies') }}
        />
      ) : query.isPending ? (
        <ListSkeleton rows={5} />
      ) : query.error || !strategy ? (
        <InlineError
          what="this strategy"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <StrategyBody
          strategy={strategy}
          running={running}
          stuck={stuck}
          indexLabels={indices.data ?? []}
          onRun={startBacktest}
          onEdit={startEditing}
          onDelete={confirmDelete}
          deleting={remove.isPending}
        />
      )}
    </StackScreen>
  );
}

function statusLine(strategy: StrategyDetail, stuck: boolean): string {
  if (stuck) return "Last backtest didn't finish";
  if (strategy.status === 'queued' || strategy.status === 'running') return 'Backtest running';
  if (strategy.status === 'never-run') return 'Never backtested';
  if (strategy.status === 'failed') return 'Last backtest failed';
  return strategy.resultsStale ? 'Rules changed since the last run' : 'Backtested · daily bars';
}

function StrategyBody({
  strategy,
  running,
  stuck,
  indexLabels,
  onRun,
  onEdit,
  onDelete,
  deleting,
}: {
  strategy: StrategyDetail;
  running: boolean;
  /** Marked queued/running, but the queue no longer holds the job. */
  stuck: boolean;
  indexLabels: Parameters<typeof parameterRows>[2];
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const runData = strategy.run;
  const m = runData?.metrics ?? null;
  const analysis = runData?.analysis ?? null;
  const trades = useMemo(() => recentTrades(runData?.trades ?? [], 12), [runData]);
  const params = parameterRows(strategy.rules, runData, indexLabels);

  const kpis: Kpi[] = m
    ? [
        {
          label: 'Total return',
          value: formatSignedPercent(m.totalReturnPct, 1),
          sub: 'portfolio, indexed to 100',
          trend: m.totalReturnPct,
        },
        {
          label: 'Win rate',
          value: formatPercent(m.winRate, 1),
          sub: `${formatNumber(m.totalTrades, 0)} trades`,
        },
        {
          label: 'Profit factor',
          value: formatProfitFactor(m.profitFactor),
          sub: m.profitFactor == null ? 'no losing trades — distrust it' : 'gross win ÷ gross loss',
        },
        {
          label: 'Max drawdown',
          value: formatPercent(m.maxDrawdownPct, 1),
          sub: 'worst peak-to-trough',
          trend: m.maxDrawdownPct === 0 ? null : -1,
        },
        {
          label: 'Expectancy',
          value: formatSignedPercent(m.expectancyPct, 2),
          sub: 'per trade, net of costs',
          trend: m.expectancyPct,
        },
        {
          label: 'CAGR',
          value: m.cagrPct != null ? formatSignedPercent(m.cagrPct, 1) : '—',
          sub: m.cagrPct != null ? 'annualised' : 'window under a year',
          ...(m.cagrPct != null ? { trend: m.cagrPct } : {}),
        },
      ]
    : [];

  const badges: { label: string; variant: 'success' | 'warning' | 'neutral' | 'danger' }[] = [];
  if (strategy.resultsStale)
    badges.push({ label: 'Rules changed since this run', variant: 'warning' });
  else if (strategy.status === 'complete') badges.push({ label: 'Backtested', variant: 'success' });
  else if (strategy.status === 'never-run') badges.push({ label: 'Never run', variant: 'neutral' });
  else if (strategy.status === 'failed') badges.push({ label: 'Failed', variant: 'danger' });
  if (strategy.templateId) badges.push({ label: 'From template', variant: 'neutral' });

  return (
    <View>
      {badges.length > 0 ? (
        <View className="mb-3 flex-row flex-wrap gap-1.5">
          {badges.map((badge) => (
            <Badge key={badge.label} label={badge.label} variant={badge.variant} />
          ))}
        </View>
      ) : null}
      {strategy.description ? (
        <Text className="mb-3 text-[14px] leading-5 text-ink-muted dark:text-ink-dark-muted">
          {strategy.description}
        </Text>
      ) : null}

      <Card className="bg-surface-sunk dark:bg-surface-sunk-dark">
        <Text className="text-[11px] font-bold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
          The rule, as saved
        </Text>
        <Text className="mt-1.5 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
          {strategy.readback}
        </Text>
      </Card>

      {running ? (
        <Banner
          tone="info"
          className="mt-4"
          message="Replaying these rules across every stock with enough daily history — this takes a little while. You can leave this screen."
        />
      ) : stuck ? (
        <Banner
          tone="warning"
          className="mt-4"
          title="The last backtest didn't finish"
          message="It is marked as running, but the job is no longer in the queue — the worker may have restarted. Run it again."
          action={{ label: 'Run backtest', onPress: onRun }}
        />
      ) : strategy.status === 'failed' && strategy.lastError ? (
        <Banner
          tone="error"
          className="mt-4"
          title="Backtest failed"
          message={strategy.lastError}
        />
      ) : null}

      {m ? <KpiGrid items={kpis} className="mt-4" /> : null}

      <StrategyTodaySection strategyId={strategy.id} />

      {!runData && !running ? (
        <Section title="Backtest">
          <InlineEmpty
            title="Never backtested"
            message="Running it replays these rules over every stock with enough daily history."
            action={{ label: 'Run backtest', onPress: onRun }}
          />
        </Section>
      ) : null}

      {runData ? (
        <>
          <Section title="Equity curve">
            <EquityCurveCard points={runData.equityCurve ?? []} />
          </Section>

          <Section
            title="Recent trades"
            // The run stores only the newest 200 trades; totalTrades is the true count.
            note={`${trades.length} of ${formatNumber(m?.totalTrades ?? runData.trades.length, 0)}`}
          >
            {trades.length === 0 ? (
              <InlineEmpty title="No trades" message="This run produced no trades." />
            ) : (
              <TradeList trades={trades} />
            )}
            <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
              Fills at the next bar&apos;s open after the signal, charged {runData.costBps} bps per
              side. Stops are checked on the close, not intrabar.
            </Text>
          </Section>

          <Section title="Risk">
            <Card className="py-1.5">
              <KeyValueRow
                label="Sharpe ratio"
                value={analysis?.sharpe != null ? formatNumber(analysis.sharpe, 2) : '—'}
              />
              <KeyValueRow
                divider
                label="Sortino ratio"
                value={analysis?.sortino != null ? formatNumber(analysis.sortino, 2) : '—'}
              />
              <KeyValueRow
                divider
                label="Drawdown depth"
                value={analysis?.drawdown ? formatPercent(analysis.drawdown.depthPct, 1) : '—'}
                trend={analysis?.drawdown ? -1 : undefined}
              />
              <KeyValueRow
                divider
                label="Drawdown length"
                value={analysis?.drawdown ? `${analysis.drawdown.durationDays} days` : '—'}
              />
              <KeyValueRow
                divider
                label="Recovered in"
                value={
                  analysis?.drawdown
                    ? analysis.drawdown.recoveryDays != null
                      ? `${analysis.drawdown.recoveryDays} days`
                      : 'Never recovered'
                    : '—'
                }
                trend={
                  analysis?.drawdown && analysis.drawdown.recoveryDays == null ? -1 : undefined
                }
              />
              {analysis?.topSymbolProfitSharePct != null ? (
                <KeyValueRow
                  divider
                  label="Top stock's profit share"
                  hint={analysis.topSymbol ?? undefined}
                  value={formatPercent(analysis.topSymbolProfitSharePct, 0)}
                  trend={analysis.topSymbolProfitSharePct > 50 ? -1 : undefined}
                />
              ) : null}
            </Card>
            <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
              {analysis?.sharpe == null || analysis?.sortino == null
                ? 'A ratio reads “—” when there are too few trades for it to mean anything. '
                : ''}
              No benchmark comparison: no index price history is stored, so alpha and beta
              can&apos;t be computed rather than guessed.
            </Text>
          </Section>
        </>
      ) : null}

      <Section title="Parameters" action={{ label: 'Edit', onPress: onEdit }}>
        <Card className="py-1.5">
          {params.map((row, index) => (
            <KeyValueRow key={row.label} label={row.label} value={row.value} divider={index > 0} />
          ))}
        </Card>
      </Section>

      {analysis?.splits?.length === 2 ? (
        <Section title="Held up out of sample?">
          <Card className="py-1.5">
            {analysis.splits.map((split, index) => (
              <KeyValueRow
                key={split.label}
                divider={index > 0}
                label={split.label === 'in-sample' ? 'First 70% of history' : 'Last 30% of history'}
                hint={`${formatNumber(split.trades, 0)} trades · expectancy per trade`}
                value={formatSignedPercent(split.expectancyPct, 2)}
                trend={split.expectancyPct}
              />
            ))}
          </Card>
          <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
            The overfitting check: a rule that only worked in the first stretch was probably fitted
            to it.
          </Text>
        </Section>
      ) : null}

      {strategy.caveats.length > 0 ? (
        <Section title="What this doesn't model">
          <View className="gap-2">
            {strategy.caveats.map((caveat) => (
              <View key={caveat} className="flex-row gap-2">
                <Text className="text-[13px] text-ink-faint dark:text-ink-dark-faint">•</Text>
                <Text className="flex-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
                  {caveat}
                </Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: deleting }}
        disabled={deleting}
        onPress={onDelete}
        hitSlop={8}
        className="mt-8 self-center px-4 py-2 active:opacity-60"
      >
        <Text className="text-[13px] font-semibold text-danger-600 dark:text-danger-dark">
          {deleting ? 'Deleting…' : 'Delete strategy'}
        </Text>
      </Pressable>
      <Text className="mt-3 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Not investment advice — review before acting. Backtests use past prices and can&apos;t
        predict returns.
      </Text>
    </View>
  );
}
