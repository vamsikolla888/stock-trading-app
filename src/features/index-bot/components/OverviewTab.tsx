import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { BarChart } from '@/components/charts/BarChart';
import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { RowDivider } from '@/components/ui/Section';
import { SegmentedControl } from '@/components/ui/Tabs';
import { StatusDot, StatusPill } from '@/features/settings/components/StatusPill';
import { formatDateTime, relativeTime } from '@/features/settings/lib/time';
import { useNow } from '@/hooks/useNow';

import {
  aiProblem,
  axisMoney,
  botHeadline,
  dayExtremes,
  dayLabel,
  funnelBars,
  holdTime,
  money,
  outcomeView,
  pct,
  plural,
  pnlLabel,
  pnlTone,
  proposalLabel,
  reviewPlace,
  signedMoney,
  whole,
  winRateTone,
  type BotTab,
  type PhaseFilter,
} from '../lib/view';
import type { IndexOverview, ModeFilter, RangeKey, TradeRow } from '../types';
import { NetCurve } from './NetCurve';
import { BarRow, Caveat, FigLine, NUM, TextLink } from './parts';
import { TradeItem } from './rows';

type ChartView = 'cumulative' | 'daily';
const CHART_VIEWS: readonly { key: ChartView; label: string }[] = [
  { key: 'cumulative', label: 'Running total' },
  { key: 'daily', label: 'Per day' },
];

/**
 * Index trading › Overview — a calm operating view: is the bot armed, is it making money, what
 * did it last decide, and how far do its checks get. Every trade and every debate lives in its own
 * tab (Trades, Decisions); this screen only points there.
 */
export function OverviewTab({
  data,
  mode,
  range,
  onTab,
}: {
  data: IndexOverview;
  mode: ModeFilter;
  range: RangeKey;
  onTab: (tab: BotTab, phase?: PhaseFilter) => void;
}) {
  const router = useRouter();
  const layout = useScreenLayout();
  const s = data.stats;
  const scanned = data.funnel.stages[0]?.count ?? 0;
  const ordered = data.funnel.stages[data.funnel.stages.length - 1]?.count ?? 0;
  const ai = aiProblem(data);
  const openTrade = (row: TradeRow) =>
    router.push({ pathname: '/index-bot/trade/[id]', params: { id: row.intentId, mode, range } });

  return (
    <View className="gap-3">
      <StatusCard data={data} onControls={() => onTab('controls')} />

      {data.attention.length > 0 ? (
        <Banner
          tone="error"
          title={
            data.attention.length === 1
              ? 'An entry needs review.'
              : `${data.attention.length} entries need review.`
          }
          message={`Check the ${reviewPlace(data.attention[0]!.mode)}, then resolve it in Trades. New entries are blocked until then.`}
          action={{ label: 'Open in Trades', onPress: () => onTab('trades', 'review') }}
        />
      ) : null}
      {ai ? <Banner tone="warning" title={ai.title} message={ai.message} /> : null}
      {!data.settings.enabled ? (
        <Banner
          tone="info"
          title="Analysis is off."
          message="The bot is not opening new positions."
          action={{ label: 'Open controls', onPress: () => onTab('controls') }}
        />
      ) : null}

      <Grid columns={layout.kpiColumns === 6 ? 4 : layout.kpiColumns} gap={12}>
        <StatTile
          label={pnlLabel(mode)}
          value={signedMoney(s.net)}
          sub={`${whole(s.closed)} closed · ${money(s.charges)} charges`}
          status={pnlTone(s.net)}
        />
        <StatTile
          label="Win rate"
          value={pct(s.winRate)}
          sub={`${s.wins} wins from ${s.closed}`}
          status={winRateTone(s.winRate, s.closed)}
        />
        <StatTile
          label="Max drawdown"
          value={s.maxDrawdown ? money(-s.maxDrawdown) : s.maxDrawdown === 0 ? '₹0' : '—'}
          sub="largest peak-to-trough fall"
        />
        <StatTile
          label="Scans traded"
          value={`${whole(ordered)} / ${whole(scanned)}`}
          sub={
            s.avgHoldMinutes != null
              ? `average hold ${holdTime(s.avgHoldMinutes)}`
              : 'no closed trade yet'
          }
          onPress={() => onTab('decisions')}
        />
      </Grid>

      <Grid columns={layout.columns} gap={12} equalHeight={false}>
        <PerformancePanel data={data} mode={mode} />
        <LatestPanel data={data} onTab={onTab} />
      </Grid>

      <PathPanel data={data} />

      {data.open.length > 0 ? (
        <Panel
          title={data.open.length === 1 ? 'Open position' : 'Open positions'}
          meta="checked every minute"
          flush
        >
          {data.open.map((row, index) => (
            <View key={row.intentId}>
              {index > 0 ? <RowDivider /> : null}
              <TradeItem row={row} onPress={() => openTrade(row)} />
            </View>
          ))}
        </Panel>
      ) : null}

      <Caveat>{data.caveat}</Caveat>
    </View>
  );
}

/** Armed or off, the analysis window and cadence, the last check, and the way to the controls. */
function StatusCard({ data, onControls }: { data: IndexOverview; onControls: () => void }) {
  const now = useNow();
  const headline = botHeadline(data.settings);
  const cadence = data.settings.cadenceMinutes;
  const latest = data.latestRun;
  return (
    <View className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <StatusDot tone={headline.tone} size={8} />
          <Text className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
            {headline.label}
          </Text>
        </View>
        <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">
          Recurring analysis
        </Text>
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
          {['09:30–14:15 IST', cadence ? `every ${cadence} min` : null].filter(Boolean).join(' · ')}
          {latest ? ` · last check ${relativeTime(latest.at, now)}` : ''}
        </Text>
      </View>
      <Button label="Controls" size="sm" variant="outline" onPress={onControls} />
    </View>
  );
}

/** The running total (or each day's net) with the best and worst day and the average trade. */
function PerformancePanel({ data, mode }: { data: IndexOverview; mode: ModeFilter }) {
  const [view, setView] = useState<ChartView>('cumulative');
  const extremes = dayExtremes(data.daily);
  const s = data.stats;
  const labels = useMemo(() => data.daily.map((d) => dayLabel(d.day)), [data.daily]);
  const cumulative = useMemo(() => data.daily.map((d) => d.cumulative), [data.daily]);
  const bars = useMemo(
    () => data.daily.map((d) => ({ label: dayLabel(d.day), value: d.net })),
    [data.daily],
  );
  return (
    <Panel
      title={mode === 'all' ? 'Performance' : `${mode === 'live' ? 'Live' : 'Paper'} performance`}
      meta={plural(extremes.tradeDays, 'trading day')}
    >
      <SegmentedControl items={CHART_VIEWS} value={view} onChange={setView} className="mb-3" />
      {data.daily.length === 0 ? (
        <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No trades in this window.
        </Text>
      ) : view === 'cumulative' ? (
        <NetCurve
          labels={labels}
          values={cumulative}
          format={(v) => signedMoney(v)}
          axisFormat={axisMoney}
          accessibilityLabel={`Running net P&L, ${signedMoney(s.net)} in total`}
        />
      ) : (
        <BarChart bars={bars} signed height={140} accessibilityLabel="Net P&L per trading day" />
      )}
      <FigLine
        items={[
          { label: 'Best day', value: signedMoney(extremes.best), sign: extremes.best },
          { label: 'Worst day', value: signedMoney(extremes.worst), sign: extremes.worst },
          { label: 'Per trade', value: signedMoney(s.expectancy), sign: s.expectancy },
        ]}
      />
    </Panel>
  );
}

/** The newest analysis: its outcome, the call, the reason, and the debate's scores. */
function LatestPanel({ data, onTab }: { data: IndexOverview; onTab: (tab: BotTab) => void }) {
  const router = useRouter();
  const run = data.latestRun;
  const right = <TextLink label="All decisions" onPress={() => onTab('decisions')} />;
  if (!run) {
    return (
      <Panel title="Latest analysis" right={right}>
        <Text className="py-4 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No analysis yet.
        </Text>
      </Panel>
    );
  }
  const outcome = outcomeView(run.outcome);
  const proposal = proposalLabel(run);
  const d = run.debate;
  const scores: [string, number | null | undefined][] = d
    ? [
        ['Bull', d.bullish?.conviction],
        ['Bear', d.bearish?.conviction],
        ['Trader', d.decision.confidence],
      ]
    : [];
  return (
    <Panel title="Latest analysis" meta={formatDateTime(run.at)} right={right}>
      <View className="flex-row items-center gap-2">
        <StatusPill tone={outcome.tone} label={outcome.label} />
        {run.mode ? (
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            {run.mode === 'live' ? 'Live' : 'Paper'}
          </Text>
        ) : null}
      </View>
      <Text className="mt-2.5 text-[15px] font-semibold text-ink dark:text-ink-dark">
        {proposal === '—' ? 'No trade setup' : proposal}
      </Text>
      <Text
        className="mt-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted"
        numberOfLines={4}
      >
        {run.reason || d?.decision.reason || 'No reason recorded.'}
      </Text>
      {scores.length > 0 ? (
        <View
          accessible
          accessibilityLabel={`Scores: ${scores.map(([name, v]) => `${name} ${v ?? 'not recorded'}`).join(', ')}. Research scores, not probabilities.`}
          className="mt-3 flex-row flex-wrap gap-x-5 gap-y-2"
        >
          {scores.map(([name, value]) => (
            <View key={name}>
              <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{name}</Text>
              <Text
                className="mt-0.5 text-[13px] font-semibold text-ink dark:text-ink-dark"
                style={NUM}
              >
                {value == null ? '—' : `${value}/100`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View className="mt-3 self-start">
        <TextLink
          label="See debate"
          onPress={() => router.push({ pathname: '/index-bot/run/[id]', params: { id: run.id } })}
        />
      </View>
    </Panel>
  );
}

/** Completed checks → debated → proposed → risk checks → edge → ordered. */
function PathPanel({ data }: { data: IndexOverview }) {
  const stages = funnelBars(data.funnel.stages);
  const scanned = stages[0]?.count ?? 0;
  return (
    <Panel
      title="Analysis path"
      meta={
        data.funnel.running
          ? `${data.funnel.running} running · ${whole(scanned)} completed`
          : `${plural(scanned, 'completed check')}`
      }
    >
      {scanned === 0 ? (
        <Text className="py-4 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No completed checks in this window.
        </Text>
      ) : (
        <View className="gap-3">
          {stages.map((stage) => (
            <BarRow
              key={stage.key}
              label={stage.label}
              value={whole(stage.count)}
              share={stage.width}
              tone={stage.key === 'ordered' ? 'brand' : 'info'}
            />
          ))}
        </View>
      )}
    </Panel>
  );
}
