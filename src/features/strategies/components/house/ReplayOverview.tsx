import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ChangeText } from '@/components/market/ChangeText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { RowDivider } from '@/components/ui/Section';
import { StatusDot, StatusPill } from '@/features/settings/components/StatusPill';
import { stockHref } from '@/lib/navigation';
import { formatINR, formatNumber, formatSignedPercent } from '@/lib/utils/formatters';

import { useHouseScan } from '../../hooks';
import { recentTrades } from '../../lib/backtest';
import {
  dayLabel,
  formatR,
  lineSummary,
  outcomeShares,
  regimeView,
  SETUP_STATUS_VIEW,
} from '../../lib/houseView';
import type { HouseStrategyDetail, ReplayLine } from '../../types';
import { EquityCurveCard } from '../EquityCurveCard';
import { TradeList } from '../TradeList';
import { BulletList, Note, TrackBar } from './HouseBits';
import { ReplaySetupsCard } from './ReplaySetupsCard';

const NUM = { fontVariant: ['tabular-nums' as const] };
const VERDICT_TONE = { good: 'success', warn: 'warning', bad: 'error', unknown: 'info' } as const;

/**
 * Overview: the replayed equity beside what the strategy found for the next session, then how
 * every setup ended, the record by grade and by setup type, the newest trades, every setup the
 * replay found, and how the replay was done (the server's caveats, verbatim).
 */
export function ReplayOverview({
  detail,
  onOpenScan,
}: {
  detail: HouseStrategyDetail;
  onOpenScan: () => void;
}) {
  const layout = useScreenLayout();
  const replay = detail.replay;
  const run = replay?.run ?? null;
  const trades = useMemo(() => recentTrades(run?.trades ?? [], 12), [run]);
  const verdict = detail.backtest?.verdict ?? null;

  return (
    <View className="gap-4">
      <Grid columns={Math.min(layout.columns, 2)} equalHeight={false}>
        <View>
          <PanelHeading
            title="Equity"
            meta={
              replay?.from && replay.to
                ? `${dayLabel(replay.from, false)} – ${dayLabel(replay.to, false)} · ${formatNumber(replay.sessions, 0)} sessions`
                : undefined
            }
          />
          {run && run.equityCurve.length > 1 ? (
            <EquityCurveCard points={run.equityCurve} />
          ) : (
            <InlineEmpty
              title={replay ? 'Nothing to chart' : 'Not replayed yet'}
              message={replay ? 'The replay found no closed trades to chart.' : undefined}
            />
          )}
          {run ? (
            <Note className="mt-2">
              {`${run.maxOpenPositions}-slot portfolio, indexed to 100 · ${formatNumber(run.costBps, 0)} bps a side`}
            </Note>
          ) : null}
        </View>
        <NextSession detail={detail} onOpenScan={onOpenScan} />
      </Grid>

      {verdict && run ? (
        <Banner
          tone={VERDICT_TONE[verdict.tone]}
          title="Out-of-sample check"
          message={verdict.text}
        />
      ) : null}

      {replay && replay.counts.setups > 0 ? (
        <Grid columns={Math.min(layout.columns, 2)} equalHeight={false}>
          <Panel
            title="By grade and setup type"
            meta="closed trades · R = move ÷ planned risk"
            flush
          >
            {(
              [
                ['Grade A', replay.byGrade.A],
                ['Grade B', replay.byGrade.B],
                ['Grade C', replay.byGrade.C],
                ['Breakouts', replay.byTrigger.breakout],
                ['EMA bounces', replay.byTrigger.pullback],
              ] as [string, ReplayLine][]
            ).map(([label, line], index) => (
              <View key={label}>
                {index > 0 ? <RowDivider /> : null}
                <LineRow label={label} line={line} />
              </View>
            ))}
            <View className="h-2" />
          </Panel>
          <Outcomes detail={detail} />
        </Grid>
      ) : null}

      {run ? (
        <View>
          <PanelHeading
            title="Recent trades"
            meta={`${trades.length} of ${formatNumber(run.metrics.totalTrades, 0)}`}
          />
          {trades.length === 0 ? (
            <InlineEmpty title="No trades" message="The replay produced no closed trades." />
          ) : (
            <TradeList trades={trades} />
          )}
        </View>
      ) : null}

      {replay && replay.setups.length > 0 ? <ReplaySetupsCard setups={replay.setups} /> : null}

      {detail.caveats.length > 0 || (run?.skippedForInsufficientBars ?? 0) > 0 ? (
        <Panel title="How this was tested">
          <BulletList
            items={[
              ...detail.caveats,
              ...(run && run.skippedForInsufficientBars > 0
                ? [
                    `${formatNumber(run.skippedForInsufficientBars, 0)} stocks skipped for too little history.`,
                  ]
                : []),
            ]}
          />
        </Panel>
      ) : null}
    </View>
  );
}

function PanelHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <View className="mb-2.5 flex-row flex-wrap items-baseline gap-x-2">
      <Text
        accessibilityRole="header"
        className="text-[15px] font-semibold text-ink dark:text-ink-dark"
      >
        {title}
      </Text>
      {meta ? (
        <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

function LineRow({ label, line }: { label: string; line: ReplayLine }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${lineSummary(line)}`}
      className="flex-row items-center gap-3 px-4 py-2.5"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">{label}</Text>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {lineSummary(line)}
        </Text>
      </View>
      <View className="items-end">
        <ChangeText value={line.expectancyPct} className="text-[13px]" style={NUM}>
          {formatSignedPercent(line.expectancyPct, 2)}
        </ChangeText>
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          {formatR(line.avgR)}
        </Text>
      </View>
    </View>
  );
}

function Outcomes({ detail }: { detail: HouseStrategyDetail }) {
  const replay = detail.replay!;
  const shares = outcomeShares(replay.counts);
  const maxShare = Math.max(1, ...shares.map((s) => s.pct));
  return (
    <Panel
      title="How every setup ended"
      meta={`${formatNumber(replay.counts.setups, 0)} setups · ${formatNumber(replay.counts.triggered, 0)} triggered`}
    >
      <View className="gap-3">
        {shares.map((share) => {
          const view = SETUP_STATUS_VIEW[share.key];
          return (
            <View
              key={share.key}
              accessible
              accessibilityLabel={`${share.label}: ${share.count}, ${share.pct}%`}
            >
              <View className="mb-1 flex-row items-center gap-2">
                <StatusDot tone={view.tone} size={7} />
                <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted">
                  {share.label}
                </Text>
                <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={NUM}>
                  {formatNumber(share.count, 0)}
                </Text>
                <Text
                  className="w-12 text-right text-xs text-ink-faint dark:text-ink-dark-faint"
                  style={NUM}
                >
                  {share.pct}%
                </Text>
              </View>
              <TrackBar pct={(share.pct / maxShare) * 100} emphasis={view.trade} />
            </View>
          );
        })}
      </View>
    </Panel>
  );
}

/** What the latest evening scan found for the next session — the live side of the strategy. */
function NextSession({
  detail,
  onOpenScan,
}: {
  detail: HouseStrategyDetail;
  onOpenScan: () => void;
}) {
  const router = useRouter();
  const day = detail.scanDays[0] ?? null;
  const query = useHouseScan(detail.key, day?.date ?? null, day !== null);
  const scan = query.data ?? null;
  const regime = regimeView(scan?.regime.state ?? day?.regime);

  return (
    <Panel
      title="Next session"
      meta={day ? `from the scan after ${dayLabel(day.date)}` : 'no scan yet'}
      right={
        day ? (
          <Button label="All setups" size="sm" variant="ghost" onPress={onOpenScan} />
        ) : undefined
      }
    >
      {!day ? (
        <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          No scan yet.
        </Text>
      ) : (
        <>
          <View className="flex-row items-center gap-2">
            <StatusPill tone={regime.tone} label={regime.label} />
          </View>
          {scan?.regime.detail ? (
            <Text className="mt-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
              {scan.regime.detail}
            </Text>
          ) : null}
          <Text className="mt-3 text-[22px] font-bold text-ink dark:text-ink-dark" style={NUM}>
            {`${formatNumber(day.setups, 0)} setup${day.setups === 1 ? '' : 's'}`}
            {day.gradeA ? (
              <Text className="text-[13px] font-normal text-ink-muted dark:text-ink-dark-muted">
                {` · ${day.gradeA} grade A`}
              </Text>
            ) : null}
          </Text>
          {scan && scan.setups.length > 0 ? (
            <View className="mt-2">
              {scan.setups.slice(0, 6).map((s, index) => (
                <View key={s.symbol}>
                  {index > 0 ? <RowDivider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${s.symbol}, grade ${s.grade}, buy above ${formatINR(s.plan.entry)}, stop ${formatINR(s.plan.stop)}. Open stock`}
                    onPress={() => router.push(stockHref(s.symbol, s.exchange))}
                    className="flex-row items-center gap-3 py-2 active:opacity-70"
                  >
                    <Text className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark">
                      {s.symbol}
                      <Text className="font-normal text-ink-faint dark:text-ink-dark-faint">
                        {`  ${s.grade}`}
                      </Text>
                    </Text>
                    <Text className="text-xs text-ink dark:text-ink-dark" style={NUM}>
                      above {formatINR(s.plan.entry)}
                    </Text>
                    <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
                      stop {formatINR(s.plan.stop)}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text className="mt-2 text-[13px] text-ink-muted dark:text-ink-dark-muted">
              {query.isPending
                ? 'Loading the setups…'
                : day.status === 'completed'
                  ? 'No stock qualified.'
                  : 'This scan did not complete.'}
            </Text>
          )}
          <View className="mt-3 flex-row items-center gap-1">
            <Note>Feeds Strong picks at 09:30.</Note>
            <Button
              label="Open"
              variant="link"
              accessibilityLabel="Open Strong picks"
              onPress={() => router.push('/strong-picks')}
            />
          </View>
        </>
      )}
    </Panel>
  );
}
