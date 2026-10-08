import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { BarChart } from '@/components/charts/BarChart';
import { InlineEmpty } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { Banner } from '@/components/ui/Banner';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { RowDivider } from '@/components/ui/Section';
import { SegmentedControl } from '@/components/ui/Tabs';
import { openSource } from '@/features/agents/components/Parts';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { formatDateTime } from '@/features/settings/lib/time';

import {
  backtestContract,
  backtestExitView,
  backtestSeries,
  backtestTone,
  dayLabel,
  istClock,
  pct,
  periodLabel,
  plural,
  premium,
  signedPct,
  whole,
} from '../lib/view';
import type { BacktestTrade, IndexBacktest } from '../types';
import { NetCurve } from './NetCurve';
import { Caveat, FigLine, NUM, pnlClass, TextLink } from './parts';

type ChartView = 'running' | 'trade';
const CHART_VIEWS: readonly { key: ChartView; label: string }[] = [
  { key: 'running', label: 'Running return' },
  { key: 'trade', label: 'Per trade' },
];

/**
 * Index trading › Backtest — the bot's fixed entry and risk rules replayed on Groww's historical
 * option candles. A rules replay, not an AI prediction: news and the debate are left out so
 * today's knowledge never leaks into old data, and returns are gross premium (no fees, no
 * slippage). The server's own caveats close the page, verbatim.
 */
export function BacktestTab({ data }: { data: IndexBacktest }) {
  const layout = useScreenLayout();
  const { summary, coverage } = data;
  const equity = useMemo(() => data.curve.map((point) => point.equity), [data.curve]);
  // Newest first: on a phone the latest replayed sessions are read first.
  const trades = useMemo(() => [...data.trades].reverse(), [data.trades]);

  return (
    <View className="gap-3">
      <SourceCard data={data} />

      <Banner
        tone="info"
        title="Rules replay, not an AI prediction."
        message="Real historical option candles test the movement, liquidity and risk rules. News and the AI debate are left out, so today’s knowledge never leaks into old data."
      />

      <Grid columns={layout.kpiColumns === 6 ? 4 : layout.kpiColumns} gap={12}>
        <StatTile
          label="Gross return"
          value={signedPct(summary.grossReturnPct)}
          sub="compounded premium return"
          status={backtestTone(summary)}
          trend={equity}
        />
        <StatTile
          label="Win rate"
          value={pct(summary.winRate)}
          sub={`${summary.wins} wins · ${summary.losses} losses`}
        />
        <StatTile
          label="Max drawdown"
          value={pct(summary.maxDrawdownPct, 1)}
          sub="peak-to-trough premium fall"
        />
        <StatTile
          label="Replayed trades"
          value={whole(summary.trades)}
          sub={`${coverage.setups} setups · ${plural(data.period.sessions, 'session')}`}
        />
      </Grid>

      <Grid columns={layout.columns} gap={12} equalHeight={false}>
        <PerformancePanel data={data} />
        <RulesPanel data={data} />
      </Grid>

      <Panel
        title="Trade replay"
        meta={`${plural(summary.trades, 'trade')} · newest first`}
        flush={trades.length > 0}
      >
        {trades.length === 0 ? (
          <InlineEmpty
            title="No completed trades"
            message="No setup in this window had complete option data."
          />
        ) : (
          trades.map((trade, index) => (
            <View key={`${trade.day}:${trade.growwSymbol}`}>
              {index > 0 ? <RowDivider /> : null}
              <TradeRow trade={trade} underlying={data.underlying} />
            </View>
          ))
        )}
      </Panel>

      <Caveat>{[...data.caveats, 'A backtest is not a forecast.'].join(' ')}</Caveat>
    </View>
  );
}

/** Which index and window were replayed, from where, and when the answer was built. */
function SourceCard({ data }: { data: IndexBacktest }) {
  const url = data.source.url;
  return (
    <View className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <View className="min-w-0 flex-1 gap-1.5">
        <StatusPill tone="neutral" label="Historical replay" />
        <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">
          {data.underlying}
          <Text className="text-[13px] font-normal text-ink-muted dark:text-ink-dark-muted">
            {'  '}
            {periodLabel(data.period)}
          </Text>
        </Text>
      </View>
      <View className="items-end gap-1.5">
        {url ? (
          <TextLink
            label={`${data.source.name} data`}
            accessibilityLabel={`Open the ${data.source.name} backtesting data docs`}
            onPress={() => void openSource(url)}
          />
        ) : null}
        {data.source.generatedAt ? (
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            {data.source.cached ? 'cached · ' : ''}built {formatDateTime(data.source.generatedAt)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The compounded return after each trade, or each trade's own return. */
function PerformancePanel({ data }: { data: IndexBacktest }) {
  const [view, setView] = useState<ChartView>('running');
  const series = useMemo(() => backtestSeries(data.curve), [data.curve]);
  const s = data.summary;
  return (
    <Panel title="Performance" meta="gross option premium">
      <SegmentedControl items={CHART_VIEWS} value={view} onChange={setView} className="mb-3" />
      {data.curve.length === 0 ? (
        <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No setup had complete option data in this period.
        </Text>
      ) : view === 'running' ? (
        <NetCurve
          labels={series.labels}
          values={series.running}
          format={(v) => signedPct(v)}
          readoutLabel="Return"
          accessibilityLabel={`${data.underlying} compounded replay return, ${signedPct(s.grossReturnPct)} in total`}
        />
      ) : (
        <BarChart
          bars={series.perTrade}
          signed
          height={140}
          accessibilityLabel={`${data.underlying} option return for each replayed trade`}
        />
      )}
      <FigLine
        items={[
          {
            label: 'Average',
            value: signedPct(s.averageReturnPct),
            sign: s.averageReturnPct,
          },
          {
            label: 'Profit factor',
            value: s.profitFactor == null ? '—' : s.profitFactor.toFixed(2),
          },
          { label: 'Target exits', value: whole(s.exits.target) },
          { label: 'Stop exits', value: whole(s.exits.stop) },
          { label: 'Time exits', value: whole(s.exits.time) },
        ]}
      />
    </Panel>
  );
}

/** The fixed rules the replay applied, and why setups did not become trades. */
function RulesPanel({ data }: { data: IndexBacktest }) {
  const r = data.rules;
  const c = data.coverage;
  const risk =
    r.stopPct != null && r.targetPct != null
      ? `${pct(r.stopPct)} stop · ${pct(r.targetPct)} target`
      : '—';
  return (
    <Panel title="Replay rules" meta="fixed and repeatable">
      <KeyValueRow label="Signal" value="" hint={r.signal ?? '—'} />
      <KeyValueRow divider label="Contract" value="" hint={r.entry ?? '—'} />
      <KeyValueRow divider label="Risk" value={risk} />
      <KeyValueRow
        divider
        label="Exit"
        value={r.maxHoldMinutes != null ? `${whole(r.maxHoldMinutes)} min at most` : '—'}
      />
      <KeyValueRow
        divider
        label="Scans"
        value={r.scanTimes.length ? `${r.scanTimes.length} a day` : '—'}
        hint={r.scanTimes.length ? `${r.scanTimes.join(' · ')} IST` : undefined}
      />
      <KeyValueRow
        divider
        label="Liquidity"
        value={r.minOptionVolume != null ? `${whole(r.minOptionVolume)} volume` : '—'}
        hint="by entry"
      />
      <Text
        accessibilityLabel={`Coverage: ${c.noSignal} sessions with no setup, ${c.missingOptionData} with incomplete data, ${c.missingContract} with no contract`}
        className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
        style={NUM}
      >
        {whole(c.noSignal)} no setup · {whole(c.missingOptionData)} incomplete data ·{' '}
        {whole(c.missingContract)} no contract
      </Text>
    </Panel>
  );
}

/** One replayed trade: contract and result, when and why it entered, and its fills. */
function TradeRow({ trade, underlying }: { trade: BacktestTrade; underlying: string }) {
  const exit = backtestExitView(trade.exitReason);
  const when = `${dayLabel(trade.day)} · ${istClock(trade.signalAt)}`;
  const move = trade.movePct != null ? `${signedPct(trade.movePct, 2)} index move` : null;
  return (
    <View
      accessible
      accessibilityLabel={`${backtestContract(underlying, trade)}, ${when}, ${exit.label} exit, ${signedPct(trade.returnPct)}`}
      className="gap-1 px-4 py-3"
    >
      <View className="flex-row items-center gap-2">
        <Text
          className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark"
          numberOfLines={1}
        >
          {backtestContract(underlying, trade)}
        </Text>
        <Text className={`text-[13px] font-semibold ${pnlClass(trade.returnPct)}`} style={NUM}>
          {signedPct(trade.returnPct)}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Text
          className="flex-1 text-[11px] text-ink-muted dark:text-ink-dark-muted"
          numberOfLines={1}
          style={NUM}
        >
          {[when, move, trade.expiry ? `expires ${dayLabel(trade.expiry)}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <StatusPill tone={exit.tone} label={exit.label} />
      </View>
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
        {premium(trade.entry)} → {premium(trade.exit)}
      </Text>
    </View>
  );
}
