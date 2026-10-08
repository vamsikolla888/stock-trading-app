import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ScrollTabs } from '@/components/ui/Tabs';
import {
  useStrategyDeploy,
  type StrategyDeploy,
} from '@/features/deployments/components/useStrategyDeploy';
import { barDate } from '@/features/insights/lib/dates';
import { confirmAction } from '@/features/settings/lib/confirm';
import { formatElapsed, relativeTime } from '@/features/settings/lib/time';
import { deploymentChips } from '@/features/strategies/components/house/PlatformStrategyCard';
import { ReplayOverview } from '@/features/strategies/components/house/ReplayOverview';
import { RulesTab } from '@/features/strategies/components/house/RulesTab';
import { ScanTab } from '@/features/strategies/components/house/ScanTab';
import { IntradayStrategyPage } from '@/features/strategies/components/intraday/IntradayStrategyPage';
import { ModeChips } from '@/features/strategies/components/ModeChips';
import { useHouseStrategy, useRunHouseReplay, useRunHouseScan } from '@/features/strategies/hooks';
import { adminActionError, houseJobMessage } from '@/features/strategies/lib/houseView';
import { formatProfitFactor } from '@/features/strategies/lib/ranking';
import { BB_KEY, SWING_KEY, type HouseStrategyDetail } from '@/features/strategies/types';
import { useNow } from '@/hooks/useNow';
import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { isServerOutdated } from '@/services/api/contract';
import { useAuthStore } from '@/store/authStore';

// A render failure here shows the error page with a retry, not a crashed app.
export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/**
 * Intelligence › Strategies › a PLATFORM strategy. The intraday one (Bollinger Mid-Band Thrust)
 * has its own page (features/strategies/components/intraday); the daily swing is below.
 */
export default function HouseStrategyRoute() {
  const { key } = useLocalSearchParams<{ key: string }>();
  if (key === BB_KEY) return <IntradayStrategyPage strategyKey={BB_KEY} />;
  return <SwingStrategyScreen valid={key === SWING_KEY} />;
}

/** The page's fixed tabs, in order; Deployment follows them with its own running label. */
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'scan', label: 'Scan' },
  { key: 'rules', label: 'Rules' },
] as const;
type Tab = (typeof TABS)[number]['key'] | 'deployment';

/**
 * Institutional Breakout Swing. Laid out like a saved strategy — headline numbers, then
 * Overview / Scan / Rules — but its rules are the platform's and its backtest is the replay of
 * those exact rules over stored history. The Scan tab is the live side: each evening's setups
 * for the next session.
 */
function SwingStrategyScreen({ valid }: { valid: boolean }) {
  const router = useRouter();
  const now = useNow();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const query = useHouseStrategy(valid ? SWING_KEY : null);
  const scan = useRunHouseScan(SWING_KEY);
  const replay = useRunHouseReplay(SWING_KEY);
  const [tab, setTab] = useState<Tab>('overview');
  const detail = query.data;
  // The evening scan's setups become buy-above triggers on the paper wallet or the live broker.
  const deploy = useStrategyDeploy(
    { kind: 'platform', key: SWING_KEY },
    { strategyName: detail?.name, onDeployed: () => setTab('deployment'), enabled: valid },
  );
  const { refresh: refreshDeploy } = deploy;

  const refresh = useCallback(
    () => Promise.all([query.refetch(), refreshDeploy()]),
    [query, refreshDeploy],
  );

  const runScan = () =>
    confirmAction({
      title: 'Run the evening scan now?',
      message: 'It replaces this session’s scan and takes a minute or two.',
      confirmLabel: 'Run scan',
      onConfirm: () =>
        scan.mutate(undefined, {
          onSuccess: (result) => {
            const note = houseJobMessage('scan', result.alreadyQueued);
            toast.info(note.title, note.message);
          },
          onError: (error) => toast.error('Couldn’t queue the scan', adminActionError(error)),
        }),
    });

  const runReplay = () =>
    confirmAction({
      title: detail?.replay ? 'Replay the backtest again?' : 'Run the backtest now?',
      message: 'Judges every stored session with the scan’s rules. Takes a few minutes.',
      confirmLabel: 'Run replay',
      onConfirm: () =>
        replay.mutate(undefined, {
          onSuccess: (result) => {
            const note = houseJobMessage('replay', result.alreadyQueued);
            toast.info(note.title, note.message);
          },
          onError: (error) => toast.error('Couldn’t queue the replay', adminActionError(error)),
        }),
    });

  let body: React.ReactNode;
  if (!valid) {
    body = (
      <InlineEmpty
        title="Strategy not found"
        message="This link doesn’t name a platform strategy this app knows."
        action={{
          label: 'Go to strategies',
          onPress: () =>
            router.replace({ pathname: '/intel/strategies', params: { tab: 'swing' } }),
        }}
      />
    );
  } else if (query.isPending) {
    body = <ListSkeleton rows={6} />;
  } else if (query.error && !detail) {
    body = isServerOutdated(query.error) ? (
      <InlineEmpty
        title="Needs a newer server"
        message="Platform strategies aren’t available on the server this app is connected to yet."
      />
    ) : (
      <InlineError what="this strategy" error={query.error} onRetry={() => void query.refetch()} />
    );
  } else if (detail) {
    body = (
      <SwingBody
        detail={detail}
        tab={tab}
        onTab={setTab}
        isAdmin={isAdmin}
        onRunScan={runScan}
        scanBusy={scan.isPending}
        onRunReplay={runReplay}
        replayBusy={replay.isPending}
        deploy={deploy}
      />
    );
  }

  const subtitle = detail
    ? detail.replay
      ? detail.replay.status === 'completed'
        ? `Platform strategy · replayed ${relativeTime(detail.replay.runAt, now)}`
        : 'Platform strategy · last replay failed'
      : 'Platform strategy · not backtested yet'
    : 'Platform strategy';

  return (
    <StackScreen
      title={detail?.name ?? 'Platform strategy'}
      subtitle={subtitle}
      onRefresh={valid ? refresh : undefined}
      fill
    >
      {body}
      {valid ? deploy.sheet : null}
    </StackScreen>
  );
}

function SwingBody({
  detail,
  tab,
  onTab,
  isAdmin,
  onRunScan,
  scanBusy,
  onRunReplay,
  replayBusy,
  deploy,
}: {
  detail: HouseStrategyDetail;
  tab: Tab;
  onTab: (tab: Tab) => void;
  isAdmin: boolean;
  onRunScan: () => void;
  scanBusy: boolean;
  onRunReplay: () => void;
  replayBusy: boolean;
  deploy: StrategyDeploy;
}) {
  const layout = useScreenLayout();
  const rp = detail.replay;
  const m = rp?.run?.metrics ?? null;
  const tags = [detail.timeframe, detail.holding].filter(Boolean);
  const chips = deploymentChips(detail.deployments);
  const tabs = [...TABS, { key: 'deployment' as const, label: deploy.tabLabel }];
  const deployed = deploy.running.length > 0;

  // The header's actions: Deploy (or the running deployment) for everyone, the jobs for admins.
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
        key="scan"
        label="Run scan"
        size="sm"
        variant="secondary"
        className="flex-1"
        loading={scanBusy}
        onPress={onRunScan}
      />,
      <Button
        key="replay"
        label={rp?.run ? 'Replay again' : 'Run backtest'}
        size="sm"
        variant="secondary"
        className="flex-1"
        loading={replayBusy}
        onPress={onRunReplay}
      />,
    );
  }

  return (
    <View className="gap-4">
      <View>
        <View className="flex-row flex-wrap items-center gap-1.5">
          {tags.length ? (
            tags.map((tag) => (
              <View
                key={tag}
                className="rounded-full bg-surface-sunk px-2.5 py-1 dark:bg-surface-sunk-dark"
              >
                <Text className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
                  {tag}
                </Text>
              </View>
            ))
          ) : detail.universe ? (
            <View className="rounded-full bg-surface-sunk px-2.5 py-1 dark:bg-surface-sunk-dark">
              <Text className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
                {detail.universe}
              </Text>
            </View>
          ) : null}
          <ModeChips chips={chips} />
        </View>
        {detail.description ? (
          <Text className="mt-2.5 text-[14px] leading-5 text-ink dark:text-ink-dark">
            {detail.description}
          </Text>
        ) : null}
      </View>

      {actions.length > 0 ? <View className="flex-row gap-2.5">{actions}</View> : null}

      {!rp ? (
        <Banner tone="info" message="Not backtested yet." />
      ) : rp.status === 'failed' ? (
        <Banner
          tone="error"
          title="The last replay failed"
          message={`${rp.error ?? 'No reason was recorded.'} The figures below are from the previous run.`}
        />
      ) : rp.error ? (
        <Banner tone="warning" message={rp.error} />
      ) : null}

      {m ? (
        <Grid columns={Math.min(layout.kpiColumns, 6)}>
          <StatTile
            label="Per trade"
            value={formatSignedPercent(m.expectancyPct, 2)}
            sub="after costs"
            status={m.expectancyPct > 0 ? 'ok' : m.expectancyPct < 0 ? 'bad' : undefined}
          />
          <StatTile
            label="Win rate"
            value={formatPercent(m.winRate, 1)}
            sub={`${formatNumber(m.wins, 0)} won · ${formatNumber(m.losses, 0)} lost`}
          />
          <StatTile
            label="Trades"
            value={formatNumber(m.totalTrades, 0)}
            sub={`${formatNumber(m.symbolsWithTrades, 0)} stocks · ${formatNumber(rp?.counts.setups ?? 0, 0)} setups`}
          />
          <StatTile label="Profit factor" value={formatProfitFactor(m.profitFactor)} />
          <StatTile
            label="Max fall"
            value={formatPercent(m.maxDrawdownPct, 1)}
            sub="portfolio"
            status={m.maxDrawdownPct !== 0 ? 'bad' : undefined}
          />
          <StatTile
            label={m.cagrPct == null ? 'Return' : 'Yearly'}
            value={formatSignedPercent(m.cagrPct ?? m.totalReturnPct, 1)}
            sub={`${barDate(m.firstTradeAt, false)} – ${barDate(m.lastTradeAt, false)}`}
            status={
              (m.cagrPct ?? m.totalReturnPct) > 0
                ? 'ok'
                : (m.cagrPct ?? m.totalReturnPct) < 0
                  ? 'bad'
                  : undefined
            }
          />
        </Grid>
      ) : null}

      <ScrollTabs items={tabs} value={tab} onChange={onTab} />

      {tab === 'overview' ? (
        <ReplayOverview detail={detail} onOpenScan={() => onTab('scan')} />
      ) : null}
      {tab === 'scan' ? (
        <ScanTab
          strategyKey={detail.key}
          days={detail.scanDays}
          isAdmin={isAdmin}
          onRunScan={onRunScan}
          scanBusy={scanBusy}
        />
      ) : null}
      {tab === 'rules' ? <RulesTab config={detail.config} /> : null}
      {tab === 'deployment' ? deploy.tab : null}

      <Text className="text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        {rp
          ? `${formatNumber(rp.sessions, 0)} sessions · ${formatNumber(rp.universe.withBars, 0)} stocks${rp.durationMs != null ? ` · ${formatElapsed(rp.durationMs)}` : ''}. Backtested on stored daily candles, net of costs. Research, not investment advice.`
          : 'Research, not investment advice.'}
      </Text>
    </View>
  );
}
