import { useIsFocused, useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { KpiGrid, type Kpi } from '@/components/ui/KpiGrid';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { barDate, istDateTime } from '@/features/insights/lib/dates';
import { useAutoTradeActivity, useAutoTradeConfig, useHoldingQuotes } from '@/features/live/api';
import { EngineEventRow } from '@/features/live/components/EngineEventRow';
import { bookDayChange, engineState, todayTally } from '@/features/live/lib/engine';
import type { AutoTradeActivity } from '@/features/live/types';
import { usePaperPortfolio } from '@/features/paper/hooks';
import { StrategyMatchRows } from '@/features/strategies/components/StrategyTodaySection';
import { useStrategiesList, useStrategyMatches } from '@/features/strategies/hooks';
import { useNow } from '@/hooks/useNow';
import {
  formatINR,
  formatNumber,
  formatSignedINR,
  formatSignedPercent,
} from '@/lib/utils/formatters';
import { isApiError } from '@/types/api';

const EMPTY_SKIPPED: AutoTradeActivity['skippedToday'] = [];

/**
 * What the auto-trade engine is doing on the paper account right now. Every number is real:
 * the engine follows ONE source (the recommendations batch or a single strategy), so P&L is
 * the account's, never a per-strategy figure. Entries are decided on the daily close and
 * filled at the next open — nothing here is intraday, and nothing places a real order.
 */
export default function LiveScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const now = useNow();

  const configQuery = useAutoTradeConfig();
  const activityQuery = useAutoTradeActivity(100, focused);
  const portfolioQuery = usePaperPortfolio('equity');
  const strategiesQuery = useStrategiesList();

  // Null until the library has loaded, so a followed strategy is never called deleted early.
  const engine = engineState(configQuery.data, strategiesQuery.data ?? null);
  const activity = activityQuery.data ?? null;
  const portfolio = portfolioQuery.data ?? null;
  const tally = todayTally(activity, new Date(now));
  const declined = activity?.skippedToday ?? EMPTY_SKIPPED;
  const events = activity?.events ?? [];

  // Only when the engine follows a strategy — the recommendations batch has its own tab —
  // and gated, because evaluating the entry is a multi-second server pass.
  const watchedId = engine.source === 'strategy' ? engine.strategyId : null;
  // Deployed, then deleted from the library: there is nothing to scan (the server would 404),
  // and the engine places no new entries — the useful thing to say is where to pick another.
  // The library's own answer decides it; failing that, the scan's 404 does.
  const listedGone =
    watchedId !== null && strategiesQuery.data !== undefined && engine.strategyName === null;
  const watchingStrategy = watchedId !== null && !listedGone;
  const matchesQuery = useStrategyMatches(watchedId ?? undefined, watchingStrategy);
  const matches = matchesQuery.data;
  const watchedGone =
    listedGone || (isApiError(matchesQuery.error) && matchesQuery.error.status === 404);

  // Today's move needs every holding's previous close; a partial sum would mislead.
  const positions = useMemo(() => portfolio?.positions ?? [], [portfolio]);
  const quotes = useHoldingQuotes(positions, focused);
  const day = bookDayChange(
    positions.map((position, index) => {
      const quote = quotes[index]?.data;
      return {
        quantity: position.quantity,
        ltp: quote?.ltp ?? position.ltp,
        prevClose: quote?.prevClose ?? null,
      };
    }),
  );

  const refresh = useCallback(
    () =>
      Promise.all([
        configQuery.refetch(),
        activityQuery.refetch(),
        portfolioQuery.refetch(),
        strategiesQuery.refetch(),
        // A strategy already known to be gone would only answer 404 again, on a tight limit.
        watchingStrategy && !watchedGone ? matchesQuery.refetch() : null,
      ]),
    [
      configQuery,
      activityQuery,
      portfolioQuery,
      strategiesQuery,
      matchesQuery,
      watchingStrategy,
      watchedGone,
    ],
  );

  const kpis: Kpi[] = [
    {
      label: "Today's P&L",
      // Unknown until the account has loaded — an empty book and an unread one differ.
      value: !portfolio ? '—' : positions.length === 0 ? formatINR(0) : formatSignedINR(day.change),
      sub: !portfolio
        ? undefined
        : positions.length === 0
          ? 'No open positions'
          : day.change === null
            ? 'Not every holding has a previous close'
            : `${formatSignedPercent(day.changePct)} on the book`,
      trend: portfolio ? day.change : null,
    },
    {
      label: 'Total P&L',
      value: portfolio ? formatSignedINR(portfolio.totalPnl) : '—',
      sub: portfolio
        ? `${formatSignedPercent(portfolio.totalPnlPct)} · account, not per strategy`
        : undefined,
      trend: portfolio?.totalPnl ?? null,
    },
    {
      label: 'Open positions',
      value: activity ? formatNumber(activity.openCount, 0) : '—',
      sub: engine.maxPositions === null ? 'cap not set' : `of ${engine.maxPositions} allowed`,
    },
    {
      label: 'Placed today',
      value: formatNumber(tally.filled, 0),
      sub: `${tally.buys} in · ${tally.sells} out${tally.rejected > 0 ? ` · ${tally.rejected} rejected` : ''}`,
    },
    {
      label: 'Declined today',
      value: formatNumber(tally.declined, 0),
      sub:
        declined.length === 0
          ? 'nothing turned away'
          : `${declined.length} reason${declined.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Committed',
      value: portfolio ? formatINR(portfolio.currentValue) : '—',
      sub: portfolio ? `${formatINR(portfolio.cash)} cash free` : undefined,
    },
  ];

  const stateBadge = !engine.configured
    ? { label: 'Not set up', variant: 'neutral' as const }
    : engine.enabled
      ? { label: 'Engine on', variant: 'success' as const }
      : { label: 'Engine off', variant: 'neutral' as const };

  return (
    <GroupScreen
      intro={`${engine.summary}${engine.lastRunAt ? ` · last run ${istDateTime(engine.lastRunAt)} IST` : ''}`}
      onRefresh={refresh}
    >
      {configQuery.isPending ? (
        <ListSkeleton rows={2} />
      ) : configQuery.error && !configQuery.data ? (
        <InlineError
          what="the engine's settings"
          error={configQuery.error}
          onRetry={() => void configQuery.refetch()}
        />
      ) : (
        <>
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge label={stateBadge.label} variant={stateBadge.variant} />
            <Badge label="Paper book · orders are off" />
          </View>

          {/* A halt is the most consequential thing this screen can report. */}
          {engine.haltedReason ? (
            <Banner
              tone="warning"
              title="Halted"
              message={`${engine.haltedReason} New entries are blocked; exits keep running, so a halt never traps an open position.`}
              action={{ label: 'Engine settings', onPress: () => router.push('/trade/paper') }}
              className="mt-4"
            />
          ) : null}

          {!engine.configured ? (
            <View className="mt-4">
              <InlineEmpty
                title="The engine has never been switched on"
                message="There is no auto-trade configuration for this account, so nothing can run it."
                action={{
                  label: 'Set it up on the paper screen',
                  onPress: () => router.push('/trade/paper'),
                }}
              />
            </View>
          ) : null}
        </>
      )}

      <KpiGrid items={kpis} className="mt-5" />
      {portfolioQuery.error && !portfolio ? (
        <Text className="mt-2 text-xs text-danger-600 dark:text-danger-dark">
          Couldn&apos;t load the paper account — P&amp;L is unavailable right now.
        </Text>
      ) : null}

      {watchedId !== null ? (
        <Section
          title="What it is watching"
          action={
            watchedGone
              ? undefined
              : {
                  label: 'Open strategy',
                  onPress: () =>
                    router.push({ pathname: '/strategy/[id]', params: { id: watchedId } }),
                }
          }
        >
          {watchedGone ? (
            <InlineEmpty
              title="That strategy is no longer in your library"
              message="The engine is still pointed at it, so it has nothing to scan and places no new entries. Choose another strategy, or the recommendations batch, in the engine settings."
              action={{ label: 'Engine settings', onPress: () => router.push('/trade/paper') }}
            />
          ) : matchesQuery.isPending ? (
            <ListSkeleton rows={3} />
          ) : matchesQuery.error ? (
            <InlineError
              what="the strategy's matches"
              error={matchesQuery.error}
              onRetry={() => void matchesQuery.refetch()}
            />
          ) : matches ? (
            <>
              <Text className="mb-2 text-xs font-semibold text-ink dark:text-ink-dark">
                {formatNumber(matches.matches.length, 0)} of {formatNumber(matches.universeSize, 0)}{' '}
                scanned match now
              </Text>
              {matches.matches.length === 0 ? (
                <InlineEmpty
                  title="Nothing matches on the latest close"
                  message="The engine places nothing until something does."
                />
              ) : (
                <StrategyMatchRows matches={matches.matches} limit={15} />
              )}
              {matches.asOfBarTime ? (
                <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
                  Evaluated on the {barDate(matches.asOfBarTime)} close
                  {matches.skippedForInsufficientBars > 0
                    ? ` · ${formatNumber(matches.skippedForInsufficientBars, 0)} stocks had too little history to judge`
                    : ''}
                  . A fill would happen at the next open, not at the price shown.
                </Text>
              ) : null}
            </>
          ) : null}
        </Section>
      ) : null}

      <Section
        title="Engine activity"
        note={events.length === 0 ? undefined : `Last ${events.length} orders`}
      >
        {activityQuery.isPending ? (
          <ListSkeleton rows={4} />
        ) : activityQuery.error && !activity ? (
          <InlineError
            what="engine activity"
            error={activityQuery.error}
            onRetry={() => void activityQuery.refetch()}
          />
        ) : events.length === 0 ? (
          <InlineEmpty
            title="No orders yet"
            message={`The engine has not placed an order on this account.${
              engine.configured && !engine.enabled ? ' It is switched off.' : ''
            }`}
          />
        ) : (
          <ListCard>
            {events.map((event, index) => (
              <View key={event.orderId}>
                {index > 0 ? <RowDivider /> : null}
                <EngineEventRow event={event} />
              </View>
            ))}
          </ListCard>
        )}
      </Section>

      {declined.length > 0 ? (
        <Section
          title="Declined today"
          note={`${tally.declined} candidate${tally.declined === 1 ? '' : 's'}`}
        >
          <Text className="mb-3 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
            What the rules turned away. A strategy passing on signals because the position cap was
            full is telling you something about the risk settings.
          </Text>
          <ListCard>
            {declined.map((item, index) => (
              <View key={item.reason}>
                {index > 0 ? <RowDivider /> : null}
                <View className="px-3.5 py-3">
                  <View className="flex-row items-baseline gap-2">
                    <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
                      {item.reason}
                    </Text>
                    <Text
                      className="text-sm font-bold text-ink dark:text-ink-dark"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {formatNumber(item.count, 0)}
                    </Text>
                  </View>
                  {item.detail ? (
                    <Text className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                      {item.detail}
                    </Text>
                  ) : null}
                  {item.symbols.length > 0 ? (
                    <Text
                      className="mt-1 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
                      numberOfLines={3}
                    >
                      {item.symbols.join(' · ')}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </ListCard>
        </Section>
      ) : null}

      {activity && activity.caveats.length > 0 ? (
        <Card className="mt-7 bg-surface-sunk dark:bg-surface-sunk-dark">
          {/* Verbatim — the server states its own limitations here. */}
          {activity.caveats.map((caveat, index) => (
            <Text
              key={caveat}
              className={`text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted${index > 0 ? ' mt-1.5' : ''}`}
            >
              {caveat}
            </Text>
          ))}
        </Card>
      ) : null}

      <Text className="mt-6 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Paper trading only — order routing is off, so nothing here reaches your broker. Not
        investment advice.
      </Text>
    </GroupScreen>
  );
}
