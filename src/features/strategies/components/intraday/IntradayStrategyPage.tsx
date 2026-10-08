import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ScrollTabs, SegmentedControl, type TabItem } from '@/components/ui/Tabs';
import {
  useStrategyDeploy,
  type StrategyDeploy,
} from '@/features/deployments/components/useStrategyDeploy';
import { confirmAction } from '@/features/settings/lib/confirm';
import { relativeTime } from '@/features/settings/lib/time';
import { useNow } from '@/hooks/useNow';
import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { isServerOutdated } from '@/services/api/contract';
import { useAuthStore } from '@/store/authStore';

import { useIntradayStrategy, useRunHouseReplay } from '../../hooks';
import { adminActionError } from '../../lib/houseView';
import { UNIVERSE_LABEL } from '../../lib/intradayNormalize';
import {
  isJobInFlight,
  jobNotice,
  notionalLabel,
  retestMessage,
  signedRupees,
} from '../../lib/intradayView';
import { formatProfitFactor } from '../../lib/ranking';
import type {
  IntradayStrategyDetail,
  IntradayStrategyKey,
  UniverseKey,
  VariantKey,
} from '../../types';
import { deploymentChips } from '../house/PlatformStrategyCard';
import { ModeChips } from '../ModeChips';
import { Caption } from './IntradayBits';
import { IntradayOverview } from './IntradayOverview';
import { IntradayRules } from './IntradayRules';
import { IntradayStocks } from './IntradayStocks';
import { IntradayTrades } from './IntradayTrades';

/** The page's tabs, in order. Deployment runs it on the paper wallet or the live broker. */
const TABS = ['overview', 'stocks', 'trades', 'rules', 'deployment'] as const;
type Tab = (typeof TABS)[number];

const VARIANTS: readonly TabItem<VariantKey>[] = [
  { key: 'improved', label: 'Improved' },
  { key: 'base', label: 'Your rules' },
];

/**
 * An INTRADAY platform strategy's page (Bollinger Mid-Band Thrust). Two switches decide what every
 * figure belongs to — the universe (Nifty 50 / Nifty 500) and the rules (improved / the owner's
 * own) — then Overview / Stocks / Trades / Rules. While an admin's re-test is queued or running
 * the page looks again every 15 s.
 */
export function IntradayStrategyPage({ strategyKey }: { strategyKey: IntradayStrategyKey }) {
  const router = useRouter();
  const now = useNow();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const [universe, setUniverse] = useState<UniverseKey>('nifty50');
  const [variant, setVariant] = useState<VariantKey>('improved');
  const [tab, setTab] = useState<Tab>('overview');
  const query = useIntradayStrategy(strategyKey, universe);
  const replay = useRunHouseReplay(strategyKey);
  const detail = query.data;
  // The deploy sheet starts from the universe and rules on screen, with this run's stocks.
  const deploy = useStrategyDeploy(
    { kind: 'platform', key: strategyKey },
    {
      universe,
      variant,
      stocks: detail?.variants[variant]?.stocks ?? [],
      strategyName: detail?.name,
      onDeployed: () => setTab('deployment'),
    },
  );
  const { refresh: refreshDeploy } = deploy;

  const refresh = useCallback(
    () => Promise.all([query.refetch(), refreshDeploy()]),
    [query, refreshDeploy],
  );

  const retest = (tested: boolean) =>
    confirmAction({
      title: tested ? 'Re-test now?' : 'Run the backtest now?',
      message:
        'Syncs 5-minute candles, then backtests. A first Nifty 500 sync takes about 40 minutes.',
      confirmLabel: tested ? 'Re-test' : 'Run backtest',
      onConfirm: () =>
        replay.mutate(undefined, {
          onSuccess: (result) => {
            const note = retestMessage(result.alreadyQueued);
            toast.info(note.title, note.message);
          },
          onError: (error) => toast.error('Couldn’t queue the re-test', adminActionError(error)),
        }),
    });

  const openStock = (symbol: string) =>
    router.push({
      pathname: '/house-strategy/[key]/stock/[symbol]',
      params: { key: strategyKey, symbol, u: universe, v: variant },
    });

  let body: React.ReactNode;
  if (query.isPending) {
    body = <ListSkeleton rows={6} />;
  } else if (query.error && !detail) {
    body = isServerOutdated(query.error) ? (
      <InlineEmpty
        title="Needs a newer server"
        message="This strategy isn’t available on the server this app is connected to yet."
      />
    ) : (
      <InlineError what="this strategy" error={query.error} onRetry={() => void query.refetch()} />
    );
  } else if (detail) {
    body = (
      <View style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
        <IntradayBody
          detail={detail}
          universe={universe}
          onUniverse={setUniverse}
          variant={variant}
          onVariant={setVariant}
          tab={tab}
          onTab={setTab}
          isAdmin={isAdmin}
          onRetest={() => retest(Object.keys(detail.variants).length > 0)}
          retestBusy={replay.isPending}
          onStock={openStock}
          deploy={deploy}
        />
      </View>
    );
  }

  const subtitle = !detail
    ? 'Platform strategy'
    : detail.runAt
      ? detail.status === 'completed'
        ? `Platform strategy · tested ${relativeTime(detail.runAt, now)}`
        : detail.status === 'no-data'
          ? 'Platform strategy · no candles yet'
          : 'Platform strategy · last test failed'
      : 'Platform strategy · not tested yet';

  return (
    <StackScreen
      title={detail?.name ?? 'Platform strategy'}
      subtitle={subtitle}
      onRefresh={refresh}
      fill
    >
      {body}
      {deploy.sheet}
    </StackScreen>
  );
}

function tabLabel(
  tab: Tab,
  detail: IntradayStrategyDetail,
  variant: VariantKey,
  deployLabel: string,
): string {
  const v = detail.variants[variant];
  switch (tab) {
    case 'overview':
      return 'Overview';
    case 'stocks':
      return v ? `Stocks · ${formatNumber(v.stocks.length, 0)}` : 'Stocks';
    case 'trades':
      return v ? `Trades · ${formatNumber(v.run.metrics.totalTrades, 0)}` : 'Trades';
    case 'rules':
      return 'Rules';
    case 'deployment':
      return deployLabel;
  }
}

function IntradayBody({
  detail,
  universe,
  onUniverse,
  variant,
  onVariant,
  tab,
  onTab,
  isAdmin,
  onRetest,
  retestBusy,
  onStock,
  deploy,
}: {
  detail: IntradayStrategyDetail;
  universe: UniverseKey;
  onUniverse: (u: UniverseKey) => void;
  variant: VariantKey;
  onVariant: (v: VariantKey) => void;
  tab: Tab;
  onTab: (t: Tab) => void;
  isAdmin: boolean;
  onRetest: () => void;
  retestBusy: boolean;
  onStock: (symbol: string) => void;
  deploy: StrategyDeploy;
}) {
  const layout = useScreenLayout();
  const v = detail.variants[variant];
  const m = v?.run.metrics ?? null;
  const tested = Object.keys(detail.variants).length > 0;
  const job = jobNotice(detail.job);
  const inFlight = isJobInFlight(detail.job);
  const tags = [detail.timeframe, detail.holding].filter(Boolean);
  const chips = deploymentChips(detail.deployments);
  const d = detail.data;
  const universes = detail.universes.map((u) => ({ key: u.key, label: u.label }));
  const tabs = TABS.map((key) => ({
    key,
    label: tabLabel(key, detail, variant, deploy.tabLabel),
  }));
  const deployed = deploy.running.length > 0;

  // The header's actions: Deploy (or the running deployment) for everyone, Re-test for admins.
  const actions: React.ReactNode[] = [
    <Button
      key="deploy"
      label={deployed ? 'Deployment' : 'Deploy'}
      size="sm"
      variant={deployed ? 'secondary' : 'primary'}
      className="flex-1"
      disabled={!deploy.ready}
      onPress={() => (deployed ? onTab('deployment') : deploy.openDeploy('paper'))}
    />,
  ];
  if (isAdmin) {
    actions.push(
      <Button
        key="retest"
        label={inFlight ? 'Re-test running…' : tested ? 'Re-test' : 'Run backtest'}
        size="sm"
        variant="secondary"
        className="flex-1"
        loading={retestBusy}
        disabled={inFlight}
        onPress={onRetest}
      />,
    );
  }

  return (
    <View className="gap-4">
      <View>
        {tags.length || chips.length ? (
          <View className="flex-row flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <View
                key={tag}
                className="rounded-full bg-surface-sunk px-2.5 py-1 dark:bg-surface-sunk-dark"
              >
                <Text className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
                  {tag}
                </Text>
              </View>
            ))}
            <ModeChips chips={chips} />
          </View>
        ) : null}
        {detail.description ? (
          <Text className="mt-2.5 text-[14px] leading-5 text-ink dark:text-ink-dark">
            {detail.description}
          </Text>
        ) : null}
        {d?.from && d.to ? (
          <Text
            className="mt-1 text-[13px] text-ink-muted dark:text-ink-dark-muted"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {`${d.from} → ${d.to} · ${formatNumber(d.sessions, 0)} sessions · ${formatNumber(d.stocks, 0)} stocks`}
          </Text>
        ) : null}
      </View>

      {actions.length > 0 ? <View className="flex-row gap-2.5">{actions}</View> : null}

      {job ? <Banner tone={job.tone} message={job.text} /> : null}
      {!tested && !job ? (
        <Banner
          tone="info"
          message={
            isAdmin
              ? 'Not tested yet — run the backtest.'
              : 'Not tested yet — it runs after every close.'
          }
        />
      ) : null}
      {detail.status === 'failed' && detail.error ? (
        <Banner
          tone="error"
          message={`${detail.error}${tested ? ' Figures below are from the previous run.' : ''}`}
        />
      ) : null}
      {detail.status === 'no-data' && detail.error ? (
        <Banner tone="warning" message={detail.error} />
      ) : null}
      {detail.sync?.error ? (
        <Banner
          tone="warning"
          message={`Candle sync failed — tested on the stored history. ${detail.sync.error}`}
        />
      ) : null}

      <View className={layout.columns > 1 ? 'flex-row gap-4' : 'gap-3'}>
        <View className={layout.columns > 1 ? 'flex-1' : undefined}>
          <Caption>Universe</Caption>
          <SegmentedControl items={universes} value={universe} onChange={onUniverse} />
        </View>
        <View className={layout.columns > 1 ? 'flex-1' : undefined}>
          <Caption>Rules</Caption>
          <SegmentedControl items={VARIANTS} value={variant} onChange={onVariant} />
        </View>
      </View>

      {m && v ? (
        <Grid columns={Math.min(layout.kpiColumns, 4)}>
          <StatTile
            label="Per trade"
            value={formatSignedPercent(m.expectancyPct, 3)}
            sub="after costs"
            status={m.expectancyPct > 0 ? 'ok' : m.expectancyPct < 0 ? 'bad' : undefined}
          />
          <StatTile
            label="Win rate"
            value={formatPercent(m.winRate, 1)}
            sub={`${formatNumber(m.wins, 0)} won · ${formatNumber(m.losses, 0)} lost`}
          />
          <StatTile label="Profit factor" value={formatProfitFactor(m.profitFactor)} />
          <StatTile
            label="Trades"
            value={formatNumber(m.totalTrades, 0)}
            sub={`${formatNumber(m.symbolsWithTrades, 0)} stocks`}
          />
          <StatTile
            label="Net P&L"
            value={signedRupees(v.line.netPnl)}
            sub={`${notionalLabel(detail.costs?.notionalInr)} a trade`}
            status={v.line.netPnl > 0 ? 'ok' : v.line.netPnl < 0 ? 'bad' : undefined}
          />
          <StatTile
            label="Max fall"
            value={formatPercent(m.maxDrawdownPct, 1)}
            sub={`${v.run.maxOpenPositions}-slot portfolio`}
            status={m.maxDrawdownPct !== 0 ? 'bad' : undefined}
          />
          <StatTile
            label="Works on"
            value={`${formatNumber(v.line.stocksWorking, 0)} stocks`}
            sub={`of ${formatNumber(v.stocks.length, 0)} traded`}
          />
        </Grid>
      ) : null}

      <ScrollTabs items={tabs} value={tab} onChange={onTab} />

      {tab === 'deployment' ? (
        deploy.tab
      ) : (
        <TabBody detail={detail} variant={variant} tab={tab} onTab={onTab} onStock={onStock} />
      )}

      <Text className="text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        {`Backtested on stored 5-minute candles of the ${UNIVERSE_LABEL[universe]}, net of costs. A backtest is not a forecast. Research, not investment advice.`}
      </Text>
    </View>
  );
}

function TabBody({
  detail,
  variant,
  tab,
  onTab,
  onStock,
}: {
  detail: IntradayStrategyDetail;
  variant: VariantKey;
  tab: Exclude<Tab, 'deployment'>;
  onTab: (t: Tab) => void;
  onStock: (symbol: string) => void;
}) {
  const v = detail.variants[variant];
  if (tab === 'rules') return <IntradayRules detail={detail} variant={variant} />;
  if (!v) {
    return (
      <InlineEmpty
        title="Not tested yet"
        message={
          Object.keys(detail.variants).length > 0 ? 'These rules have no run yet.' : undefined
        }
      />
    );
  }
  switch (tab) {
    case 'overview':
      return (
        <IntradayOverview
          detail={detail}
          variant={variant}
          onStocks={() => onTab('stocks')}
          onStock={onStock}
        />
      );
    case 'stocks':
      return <IntradayStocks rows={v.stocks} onStock={onStock} />;
    case 'trades':
      return <IntradayTrades trades={v.recentTrades} total={v.run.metrics.totalTrades} />;
  }
}
