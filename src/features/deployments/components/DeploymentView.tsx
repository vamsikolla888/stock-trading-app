import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { useSafeModeOn } from '@/features/account/hooks';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { confirmAction } from '@/features/settings/lib/confirm';
import { relativeTime } from '@/features/settings/lib/time';
import { useNow } from '@/hooks/useNow';
import {
  formatINR,
  formatNumber,
  formatPercent,
  formatSignedINR,
  formatSignedPercent,
} from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { isServerOutdated } from '@/services/api/contract';
import { getErrorMessage } from '@/types/api';

import { useDeploymentAction, useDeploymentDetail, type DeploymentAction } from '../hooks';
import {
  bookRoute,
  brokerName,
  EXIT_WORDS,
  exposureLine,
  isoDayLabel,
  planLine,
  RUNNER_VIEW,
  runnerLabel,
  squareOffMessage,
  STATUS_VIEW,
  stopMessage,
  targetParams,
  universeLabel,
  variantLabel,
  versusBacktest,
} from '../lib/view';
import type {
  DeployExitReason,
  DeployMode,
  Deployment,
  DeploymentList,
  DeployTarget,
} from '../types';
import { ActionButton, ModeBadge, Note, QuietEmpty } from './parts';
import { EventRow, OrderRow, PositionRow, TradeRow } from './rows';

/** How many rows of a long list the tab shows; the rest are one tap away on a pushed screen. */
const PREVIEW = 5;

export type DetailSection = 'orders' | 'trades' | 'activity';

const VERB: Record<DeploymentAction['kind'], string> = {
  pause: 'pause',
  resume: 'resume',
  stop: 'stop',
  'square-off': 'square off',
};

const tone = (n: number | null | undefined) =>
  n == null || n === 0 ? undefined : n > 0 ? 'ok' : 'bad';

/**
 * One running deployment, as a desk reports it to the account holder: whether it runs, the money
 * (today's or in the market, and since it started against the backtest), the open positions with
 * their stops and a square-off, what goes in next, the trades and the log. Money first, then
 * positions, then the log. Refreshes every 30 s while it runs in market hours.
 */
export function DeploymentView({
  target,
  dep,
  list,
  onEdit,
  canAddOther,
  onDeploy,
}: {
  target: DeployTarget;
  dep: Deployment;
  list: DeploymentList;
  onEdit: () => void;
  canAddOther: boolean;
  onDeploy: (mode: DeployMode) => void;
}) {
  const router = useRouter();
  const now = useNow(30_000);
  const layout = useScreenLayout();
  const safeOn = useSafeModeOn();
  const q = useDeploymentDetail(target, dep.id);
  const act = useDeploymentAction(target);

  const openStock = (symbol: string) =>
    router.push({ pathname: '/stock/[symbol]', params: { symbol, exchange: 'NSE' } });
  const openMore = (section: DetailSection) =>
    router.push({
      pathname: '/deployment/[id]',
      params: { id: dep.id, section, ...targetParams(target) },
    });

  if (q.isPending) return <ListSkeleton rows={6} />;
  const d = q.data;
  if (!d) {
    if (isServerOutdated(q.error)) {
      return (
        <InlineEmpty
          title="Needs a newer server"
          message="This deployment can’t be shown by the server this app is connected to."
        />
      );
    }
    return <InlineError what="this deployment" error={q.error} onRetry={() => void q.refetch()} />;
  }

  const live = d.deployment;
  const real = live.mode === 'live';
  const platform = live.source === 'platform';
  const swing = live.engine === 'swing';
  const open = d.positions.filter((p) => p.status === 'open');
  const vs = versusBacktest(d.stats.avgReturnPct, d.expected?.avgReturnPct);
  const plan = swing ? planLine(live.lastPlan, live.source) : null;
  const busy = act.isPending;

  const run = (action: DeploymentAction, done: string, detail?: string) =>
    act.mutate(
      { id: live.id, action },
      {
        onSuccess: (result) => {
          if (result.kind === 'square-off') {
            const { squaredOff, atNextOpen } = result.value;
            if (atNextOpen > 0) {
              toast.info(
                'Market closed',
                `${atNextOpen} position${atNextOpen === 1 ? '' : 's'} will be sold at the next open.`,
              );
            } else {
              toast.success(
                'Squared off',
                `${squaredOff} position${squaredOff === 1 ? '' : 's'} sold.`,
              );
            }
            return;
          }
          toast.success(done, detail);
        },
        onError: (error) => toast.error(`Couldn’t ${VERB[action.kind]}`, getErrorMessage(error)),
      },
    );

  const pause = () =>
    run({ kind: 'pause' }, 'Paused', 'No new entries; open positions keep their exits.');

  const resume = () => {
    if (!real) {
      run({ kind: 'resume' }, 'Resumed');
      return;
    }
    // The server refuses these too; saying so first saves a round trip and a confusing error.
    if (safeOn || list.live.safeMode) {
      toast.error('Can’t resume live', 'Safe Mode is on — turn it off in Profile & security.');
      return;
    }
    if (!list.live.masterSwitch) {
      toast.error('Can’t resume live', 'Live trading is off for the platform.');
      return;
    }
    confirmAction({
      title: 'Resume LIVE trading?',
      message: `New entries place real orders at ${brokerName(live.broker)} — real money.`,
      confirmLabel: 'Resume live',
      destructive: true,
      onConfirm: () => run({ kind: 'resume' }, 'Resumed', 'Live — orders are real.'),
    });
  };

  const stop = () =>
    confirmAction({
      title: `Stop this ${real ? 'LIVE' : 'paper'} deployment?`,
      message: stopMessage(live),
      confirmLabel: 'Stop and square off',
      destructive: true,
      onConfirm: () => run({ kind: 'stop' }, 'Stopped'),
    });

  const squareOff = (symbol?: string) =>
    confirmAction({
      title: symbol
        ? `Square off ${symbol}${real ? ' (LIVE)' : ''}?`
        : `Square off every ${real ? 'LIVE ' : 'paper '}position?`,
      message: squareOffMessage(live),
      confirmLabel: 'Square off',
      destructive: true,
      onConfirm: () => run({ kind: 'square-off', symbol }, 'Square off'),
    });

  const st = STATUS_VIEW[live.status];
  const rn = RUNNER_VIEW[live.runner.state];
  const since = `Since ${isoDayLabel(live.startedAt)}`;
  const scope = swing
    ? `${live.symbols.length ? `${formatNumber(live.symbols.length, 0)} chosen stocks` : 'every stock the rules allow'} · delivery`
    : `${variantLabel(live.variant)} · ${universeLabel(live.universe)} · ${formatNumber(live.symbols.length, 0)} stocks`;

  const tiles = swing
    ? [
        <StatTile
          key="open"
          label="Open P&L"
          value={formatSignedINR(d.money?.unrealised ?? 0)}
          sub={d.money?.unpriced ? `${d.money.unpriced} not priced` : 'after charges to sell'}
          status={tone(d.money?.unrealised)}
        />,
        <StatTile
          key="invested"
          label="Invested"
          value={formatINR(d.money?.invested ?? 0, 0)}
          sub={`${open.length} / ${live.maxOpenPositions} positions`}
        />,
      ]
    : [
        <StatTile
          key="today"
          label="Today"
          value={formatSignedINR(d.today?.total ?? 0)}
          sub={`${formatSignedINR(d.today?.realised ?? 0, 0)} booked · ${formatSignedINR(d.today?.unrealised ?? 0, 0)} open`}
          status={tone(d.today?.total)}
        />,
        <StatTile
          key="open"
          label="Open"
          value={`${d.today?.openPositions ?? open.length} / ${live.maxOpenPositions}`}
          sub={`${formatINR(live.capitalPerTrade, 0)} a trade`}
        />,
        <StatTile
          key="entries"
          label="Entries today"
          value={`${d.today?.entries ?? 0} / ${live.maxEntriesPerDay}`}
          sub={
            d.today?.refused
              ? `${d.today.refused} refused`
              : `loss limit ${formatINR(live.dailyLossLimit, 0)}`
          }
        />,
      ];
  tiles.push(
    <StatTile
      key="net"
      label="Net since start"
      value={formatSignedINR(d.stats.netPnl)}
      sub={`after ${formatINR(d.stats.charges, 0)} charges`}
      status={tone(d.stats.netPnl)}
    />,
    <StatTile
      key="win"
      label="Win rate"
      value={formatPercent(d.stats.winRate, 1)}
      sub={`${d.stats.wins} won · ${d.stats.losses} lost`}
    />,
    <StatTile
      key="per"
      label="Per trade"
      value={formatSignedPercent(d.stats.avgReturnPct, 2)}
      sub={
        d.expected
          ? `backtest ${formatSignedPercent(d.expected.avgReturnPct, 2)}`
          : 'no backtest figure'
      }
      status={tone(d.stats.avgReturnPct)}
    />,
  );
  if (swing) {
    tiles.push(
      <StatTile
        key="held"
        label="Held"
        value={
          d.stats.avgSessionsHeld == null
            ? '—'
            : `${formatNumber(d.stats.avgSessionsHeld, 1)} sessions`
        }
        sub="average, closed trades"
      />,
    );
  }

  const tradesNote = swing
    ? `${d.stats.trades} closed · ${d.stats.failed} refused · ${d.stats.cancelled} not taken`
    : `${d.stats.trades} closed · ${d.stats.failed} refused`;

  return (
    <View>
      <Card>
        <View className="flex-row flex-wrap items-center gap-1.5">
          <ModeBadge mode={live.mode} broker={live.broker} />
          <StatusPill tone={st.tone} label={st.label} />
          <StatusPill tone={rn.tone} label={runnerLabel(live, (iso) => relativeTime(iso, now))} />
        </View>
        <Text className="mt-2.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          {`${since} · ${scope}`}
        </Text>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {live.status === 'active' ? (
            <ActionButton
              label="Pause"
              onPress={pause}
              disabled={busy}
              accessibilityHint="No new entries; open positions keep their exits"
            />
          ) : (
            <ActionButton label="Resume" onPress={resume} disabled={busy} />
          )}
          <ActionButton label="Settings" onPress={onEdit} disabled={busy} />
          {canAddOther ? (
            <ActionButton
              label={real ? 'Also on paper' : 'Go live'}
              onPress={() => onDeploy(real ? 'paper' : 'live')}
              disabled={busy}
            />
          ) : null}
          <ActionButton label="Stop" onPress={stop} disabled={busy} danger />
        </View>
      </Card>

      <View className="mt-3 gap-2">
        {live.runner.state === 'not-running' && live.runner.message ? (
          <Banner tone="error" message={live.runner.message} />
        ) : null}
        {live.haltedToday && live.haltReason ? (
          <Banner tone="error" message={live.haltReason} />
        ) : null}
        {live.rulesChanged ? (
          <Banner
            tone="warning"
            message="The strategy’s rules changed since this was deployed — it still trades the rules it was deployed with."
            action={{ label: 'Use current rules', onPress: onEdit }}
          />
        ) : null}
        {live.lastError ? (
          <Banner
            tone="warning"
            message={`${live.lastError}${live.lastErrorAt ? ` · ${relativeTime(live.lastErrorAt, now)}` : ''}`}
          />
        ) : null}
        {q.isRefetchError ? (
          <Banner
            tone="warning"
            message={`Showing the last figures — ${getErrorMessage(q.error)}`}
          />
        ) : null}
      </View>

      <Grid columns={Math.min(layout.kpiColumns, 6)} className="mt-3">
        {tiles}
      </Grid>
      {vs ? <Note className="mt-2">{vs}</Note> : null}

      <Section
        title="Open positions"
        right={
          open.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => squareOff()}
              className={busy ? 'opacity-50' : 'active:opacity-60'}
            >
              <Text className="text-[13px] font-semibold text-danger-600 dark:text-danger-dark">
                Square off all
              </Text>
            </Pressable>
          ) : undefined
        }
      >
        {d.positions.length === 0 ? (
          <QuietEmpty message="None open." />
        ) : (
          <ListCard>
            {d.positions.map((p, i) => (
              <React.Fragment key={p.id}>
                {i > 0 ? <RowDivider /> : null}
                <PositionRow
                  t={p}
                  dep={live}
                  onOpen={openStock}
                  onSquareOff={squareOff}
                  busy={busy}
                />
              </React.Fragment>
            ))}
          </ListCard>
        )}
        <View className="mt-2 flex-row items-center justify-between gap-3">
          <Note className="flex-1">
            {d.quotesAsOf ? `Prices ${relativeTime(d.quotesAsOf, now)}` : ''}
          </Note>
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => router.push(bookRoute(live.mode, live.broker))}
            className="active:opacity-60"
          >
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              {real ? `${brokerName(live.broker)} orders` : 'Paper book'}
            </Text>
          </Pressable>
        </View>
      </Section>

      {swing ? (
        <Section
          title={platform ? 'Resting triggers' : 'Next open'}
          action={
            d.orders.length > PREVIEW
              ? { label: `All ${d.orders.length}`, onPress: () => openMore('orders') }
              : undefined
          }
        >
          <Note className="-mt-1 mb-2.5">
            {plan ??
              (platform
                ? 'Made from each evening scan (16:30 IST)'
                : 'Planned after the close (17:20 IST)')}
          </Note>
          {d.orders.length === 0 ? (
            <QuietEmpty
              message={platform ? 'No trigger is waiting.' : 'Nothing to buy at the next open.'}
            />
          ) : (
            <ListCard>
              {d.orders.slice(0, PREVIEW).map((o, i) => (
                <React.Fragment key={o.id}>
                  {i > 0 ? <RowDivider /> : null}
                  <OrderRow t={o} platform={platform} onOpen={openStock} />
                </React.Fragment>
              ))}
            </ListCard>
          )}
        </Section>
      ) : null}

      <Section
        title="Trades"
        action={
          d.trades.length > PREVIEW
            ? { label: `All ${d.trades.length}`, onPress: () => openMore('trades') }
            : undefined
        }
      >
        <Note className="-mt-1 mb-2.5">{tradesNote}</Note>
        {d.trades.length === 0 ? (
          <QuietEmpty message="No trades yet." />
        ) : (
          <ListCard>
            {d.trades.slice(0, PREVIEW).map((t, i) => (
              <React.Fragment key={t.id}>
                {i > 0 ? <RowDivider /> : null}
                <TradeRow t={t} engine={live.engine} onOpen={openStock} />
              </React.Fragment>
            ))}
          </ListCard>
        )}
      </Section>

      {!swing && d.stats.trades > 0 ? (
        <Section title="How trades ended">
          <Card className="py-1.5">
            {Object.entries(d.stats.byExit).map(([reason, n], i) => (
              <KeyValueRow
                key={reason}
                divider={i > 0}
                label={EXIT_WORDS[reason as DeployExitReason] ?? reason}
                value={formatNumber(n, 0)}
              />
            ))}
            <KeyValueRow
              divider={Object.keys(d.stats.byExit).length > 0}
              label="Best / worst"
              value={`${formatSignedINR(d.stats.best)} / ${formatSignedINR(d.stats.worst)}`}
            />
            <KeyValueRow
              divider
              label="Sessions traded"
              value={formatNumber(d.stats.sessions, 0)}
            />
          </Card>
        </Section>
      ) : null}

      <Section
        title="Activity"
        action={
          d.events.length > 0
            ? { label: 'Full log', onPress: () => openMore('activity') }
            : undefined
        }
      >
        {d.events.length === 0 ? (
          <QuietEmpty message="Nothing yet." />
        ) : (
          <ListCard>
            {d.events.slice(0, PREVIEW).map((e, i) => (
              <React.Fragment key={`${e.at}-${i}`}>
                {i > 0 ? <RowDivider /> : null}
                <EventRow e={e} engine={live.engine} />
              </React.Fragment>
            ))}
          </ListCard>
        )}
      </Section>

      <Note className="mt-4">
        {`${exposureLine(live.capitalPerTrade, live.maxOpenPositions)} · up to ${live.maxEntriesPerDay} new a day.`}
        {swing
          ? platform
            ? ' Checked every minute of the session; a fill is the price seen, not the trigger itself.'
            : ' Decided on the daily close, traded at the next open — as the backtest.'
          : ''}
      </Note>
    </View>
  );
}
