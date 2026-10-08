import { useRouter } from 'expo-router';
import Briefcase from 'lucide-react-native/icons/briefcase';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { Chips } from '@/components/ui/Tabs';
import { HoldingRow } from '@/features/agents/components/HoldingRow';
import { AgentsOutdated, NUM } from '@/features/agents/components/Parts';
import { VerdictShare } from '@/features/agents/components/Verdict';
import {
  usePortfolioReview,
  useRunPortfolioReview,
  useSetPortfolioReviewEnabled,
} from '@/features/agents/hooks';
import { agentErrorMessage } from '@/features/agents/lib/errors';
import {
  bookLine,
  bookView,
  canToggleReview,
  plural,
  recentChanges,
  runNowMessage,
  VERDICT,
  VERDICT_ORDER,
  visibleHoldings,
  type HoldingFilter,
} from '@/features/agents/lib/view';
import type { HoldingSummary, PortfolioReview, ReviewBookStatus } from '@/features/agents/types';
import { StatusDot } from '@/features/settings/components/StatusPill';
import { SwitchRow } from '@/features/settings/components/SwitchRow';
import { confirmAction } from '@/features/settings/lib/confirm';
import { relativeTime } from '@/features/settings/lib/time';
import { useNow } from '@/hooks/useNow';
import { formatNumber, formatPercent } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { isServerOutdated } from '@/services/api/contract';

/**
 * Agents › Portfolio review (web: /agents/portfolio) — each Groww and mStock holding re-read every
 * hour when switched on (a stock held in both is one review of the combined position): daily price
 * and volume patterns, company news and cited web research, ending in one of four labels. Leads
 * with the switch, how each book was read and what CHANGED, then every holding; a holding opens
 * its full note. Research only — nothing here places an order.
 */
export default function PortfolioReviewScreen() {
  const router = useRouter();
  const layout = useScreenLayout();
  const now = useNow();
  const review = usePortfolioReview();
  const toggle = useSetPortfolioReviewEnabled();
  const runNow = useRunPortfolioReview();
  const [filter, setFilter] = useState<HoldingFilter>('all');
  const data = review.data;

  const onRefresh = useCallback(() => review.refetch(), [review]);
  const open = useCallback(
    (holding: HoldingSummary) =>
      router.push({ pathname: '/holding-review/[key]', params: { key: holding.key } }),
    [router],
  );

  const setEnabled = useCallback(
    (enabled: boolean) => {
      const save = () =>
        toggle.mutate(enabled, {
          onSuccess: () =>
            toast.success(
              enabled ? 'Hourly review is on' : 'Hourly review is off',
              enabled ? 'The next collection starts within a minute.' : 'Saved reviews stay here.',
            ),
          onError: (error) => toast.error('Couldn’t change the schedule', agentErrorMessage(error)),
        });
      if (!enabled) {
        save();
        return;
      }
      confirmAction({
        title: 'Turn on hourly review?',
        message:
          'Each hour the agent re-reads every Groww and mStock equity holding — price patterns, company news and web research — and labels it. A stock held in both is one review. It never places an order.',
        confirmLabel: 'Turn on',
        onConfirm: save,
      });
    },
    [toggle],
  );

  const run = useCallback(() => {
    runNow.mutate(undefined, {
      onSuccess: (result) => {
        const message = runNowMessage(result);
        toast[message.tone](message.title, message.message);
      },
      onError: (error) => toast.error('Couldn’t start the review', agentErrorMessage(error)),
    });
  }, [runNow]);

  if (!data && isServerOutdated(review.error)) {
    return (
      <GroupScreen fill onRefresh={onRefresh}>
        <AgentsOutdated what="Portfolio review and the other Agents screens" />
      </GroupScreen>
    );
  }

  return (
    <GroupScreen
      fill
      onRefresh={onRefresh}
      intro="Labels each Groww and mStock holding hourly. Research only; it never orders."
    >
      {data ? (
        <Body
          data={data}
          now={now}
          columns={layout.columns}
          kpiColumns={layout.kpiColumns}
          filter={filter}
          onFilter={setFilter}
          onOpen={open}
          onToggle={setEnabled}
          toggling={toggle.isPending}
          onRun={run}
          running={runNow.isPending}
        />
      ) : review.error ? (
        <InlineError
          what="portfolio reviews"
          error={review.error}
          onRetry={() => void review.refetch()}
        />
      ) : (
        <View className="gap-4">
          <Skeleton height={120} rounded="lg" />
          <Grid columns={layout.kpiColumns}>
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} height={76} rounded="lg" />
            ))}
          </Grid>
          <ListSkeleton rows={6} />
        </View>
      )}
    </GroupScreen>
  );
}

/** One equity book the review reads: read (with its holdings), not connected, or failed. */
function BookRow({
  book,
  now,
  divider,
}: {
  book: ReviewBookStatus;
  now: number;
  divider: boolean;
}) {
  const view = bookView(book);
  const read = book.state === 'ok' && book.asOf ? `read ${relativeTime(book.asOf, now)}` : null;
  return (
    <View
      accessible
      accessibilityLabel={`${book.label}: ${view.label}${read ? `, ${read}` : ''}${book.error ? `. ${book.error}` : ''}`}
      className={`gap-0.5 px-4 py-2.5${divider ? ' border-t border-line dark:border-line-dark' : ''}`}
    >
      <View className="flex-row items-center gap-2">
        <StatusDot tone={view.tone} size={7} />
        <Text className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark">
          {book.label}
        </Text>
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
          {[view.label, read].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {book.state === 'error' && book.error ? (
        <Text
          className="pl-[15px] text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
          numberOfLines={2}
        >
          {book.error}
        </Text>
      ) : null}
    </View>
  );
}

function Body({
  data,
  now,
  columns,
  kpiColumns,
  filter,
  onFilter,
  onOpen,
  onToggle,
  toggling,
  onRun,
  running,
}: {
  data: PortfolioReview;
  now: number;
  columns: 1 | 2 | 3;
  kpiColumns: number;
  filter: HoldingFilter;
  onFilter: (filter: HoldingFilter) => void;
  onOpen: (holding: HoldingSummary) => void;
  onToggle: (enabled: boolean) => void;
  toggling: boolean;
  onRun: () => void;
  running: boolean;
}) {
  const c = data.counts;
  const holdings = useMemo(() => visibleHoldings(data.holdings, filter), [data.holdings, filter]);
  const changes = useMemo(() => recentChanges(data.holdings), [data.holdings]);
  const chips = useMemo(
    () => [
      { key: 'all' as const, label: `All · ${c.holdings}` },
      ...VERDICT_ORDER.map((action) => ({
        key: action,
        label: `${VERDICT[action].label} · ${c.byAction[action]}`,
      })),
      { key: 'changed' as const, label: `Changed · ${c.changed}` },
    ],
    [c],
  );

  const schedule = [
    bookLine(data.books),
    data.cadenceMinutes ? `every ${data.cadenceMinutes} min` : null,
    data.windowDays ? `last ${data.windowDays} days kept` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const control = (
    <Panel title="The agent" flush>
      <SwitchRow
        Icon={Briefcase}
        title="Hourly review"
        subtitle={schedule || undefined}
        value={data.enabled}
        onValueChange={onToggle}
        disabled={!canToggleReview(data.enabled, data.ready, toggling)}
      />
      {data.books && data.books.length > 0 ? (
        <View className="border-t border-line dark:border-line-dark">
          {data.books.map((book, index) => (
            <BookRow key={book.broker} book={book} now={now} divider={index > 0} />
          ))}
        </View>
      ) : null}
      <View className="gap-3 px-4 pb-4 pt-3">
        {!data.ready ? (
          <Banner
            tone="warning"
            title="Portfolio review is not ready"
            message={data.readinessReason ?? 'The AI service or its worker is unavailable.'}
          />
        ) : null}
        {data.portfolioStale ? (
          <Banner
            tone="warning"
            title="Showing the latest broker snapshot."
            message="Refresh again shortly for the latest holdings."
          />
        ) : null}
        {data.portfolioError ? (
          <Banner
            tone="warning"
            title="Some broker holdings couldn’t be read just now."
            message={`${data.portfolioError.replace(/\.$/, '')}. Those holdings keep their last reviews; reconnect or refresh the account, then try again.`}
          />
        ) : null}
        {data.lastError ? (
          <Banner tone="warning" title="The last run had a problem" message={data.lastError} />
        ) : null}
        <Button
          label="Run now"
          variant="outline"
          size="sm"
          loading={running}
          disabled={!data.ready}
          accessibilityHint="Submits a review of every holding now, outside the hourly schedule"
          onPress={onRun}
        />
        <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Run now works with the schedule off; holdings already being reviewed are skipped.
        </Text>
      </View>
    </Panel>
  );

  const tiles = (
    <Grid columns={columns === 1 ? Math.min(kpiColumns, 4) : 2}>
      <StatTile
        label="Reviewed"
        value={`${c.withVerdict} of ${c.holdings}`}
        sub={
          c.inFlight
            ? `${c.inFlight} updating now`
            : c.latestAt
              ? `latest ${relativeTime(c.latestAt, now)}`
              : 'no review yet'
        }
        status={c.inFlight ? 'info' : undefined}
      />
      <StatTile
        label="Changed · 24 h"
        value={formatNumber(c.changed, 0)}
        sub="verdicts that flipped"
        status={c.changed ? 'warn' : undefined}
        onPress={c.changed ? () => onFilter('changed') : undefined}
      />
      <StatTile
        label="Failed"
        value={formatNumber(c.failed, 0)}
        sub={c.failed ? 'latest review failed' : 'none failed'}
        status={c.failed ? 'bad' : undefined}
      />
      <StatTile
        label="Adequate evidence"
        value={formatPercent(c.adequateEvidencePct, 0)}
        sub="of verdicts"
      />
    </Grid>
  );

  const mix = (
    <Panel
      title="Verdict mix"
      meta={plural(c.withVerdict, 'holding') + ' with a verdict'}
      footer="Ratings are research prompts, not orders: “Reduce” means the evidence argues for a second look at the position size; “Under review” that it was not enough for a view."
    >
      {c.withVerdict === 0 ? (
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No completed review yet.
        </Text>
      ) : (
        <VerdictShare counts={c} />
      )}
    </Panel>
  );

  const changed =
    changes.length > 0 ? (
      <Panel title="What changed" meta="last 24 hours" flush>
        {changes.map((holding, index) => (
          <Pressable
            key={holding.key}
            accessibilityRole="button"
            accessibilityLabel={`${holding.symbol} changed from ${
              holding.lastChange ? VERDICT[holding.lastChange.from].label : ''
            } to ${holding.lastChange ? VERDICT[holding.lastChange.to].label : ''}. Read the review`}
            onPress={() => onOpen(holding)}
            className={`flex-row items-center gap-3 px-4 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark${
              index > 0 ? ' border-t border-line dark:border-line-dark' : ''
            }`}
          >
            <Text
              className="w-24 text-sm font-semibold text-ink dark:text-ink-dark"
              numberOfLines={1}
            >
              {holding.symbol}
            </Text>
            <Text
              className="flex-1 text-[13px] text-ink-muted dark:text-ink-dark-muted"
              numberOfLines={1}
            >
              {holding.lastChange
                ? `${VERDICT[holding.lastChange.from].label} → ${VERDICT[holding.lastChange.to].label}`
                : '—'}
            </Text>
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
              {holding.lastChange ? relativeTime(holding.lastChange.at, now) : ''}
            </Text>
          </Pressable>
        ))}
      </Panel>
    ) : null;

  const list = (
    <Section
      title="Holdings"
      note="largest position first"
      className={columns === 1 ? undefined : 'mt-0'}
    >
      <Chips items={chips} value={filter} onChange={onFilter} className="mb-3" />
      {holdings.length === 0 ? (
        <InlineEmpty
          title={c.holdings === 0 ? 'No review yet' : 'No holding matches this filter'}
          message={
            c.holdings === 0
              ? 'Connect Groww or mStock, then run a review now or switch on the hourly schedule.'
              : undefined
          }
          action={
            c.holdings === 0 ? undefined : { label: 'Show all', onPress: () => onFilter('all') }
          }
        />
      ) : (
        <ListCard>
          {holdings.map((holding, index) => (
            <React.Fragment key={holding.key}>
              {index > 0 ? <RowDivider /> : null}
              <HoldingRow holding={holding} now={now} onPress={onOpen} />
            </React.Fragment>
          ))}
        </ListCard>
      )}
      {data.note ? (
        <Text className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          {`${data.note} Market data and web sources can be delayed or incomplete; check important claims at the source.`}
        </Text>
      ) : null}
    </Section>
  );

  if (columns === 1) {
    return (
      <View>
        {control}
        <View className="mt-4">{tiles}</View>
        <View className="mt-4">{mix}</View>
        {changed ? <View className="mt-4">{changed}</View> : null}
        {list}
      </View>
    );
  }

  // Wide: the agent, its figures and what changed beside the holdings list.
  return (
    <View className="flex-row items-start" style={{ columnGap: 16 }}>
      <View className="flex-1 gap-4">
        {control}
        {tiles}
        {mix}
        {changed}
      </View>
      <View style={{ flex: columns === 3 ? 2 : 1 }}>{list}</View>
    </View>
  );
}
