import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ChangeText } from '@/components/market/ChangeText';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { RowDivider } from '@/components/ui/Section';
import { formatIstTime } from '@/features/home/lib/istTime';
import { relativeTime } from '@/features/settings/lib/time';
import { stockHref } from '@/lib/navigation';
import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';
import { isServerOutdated } from '@/services/api/contract';

import { useNextDayTrackRecord } from '../hooks';
import {
  hitCell,
  morningCounts,
  PICK_LIST_LABEL,
  PICK_STATE_VIEW,
  pickResult,
  SCANNER_SHORT,
  sectorShort,
  sessionDay,
  signed,
  type Tone,
} from '../lib/view';
import type {
  DayOutcome,
  MorningCheck,
  NextDayReport,
  NextDayStatus,
  ReportDocument,
  SectorDay,
} from '../types';
import { NUM, ToneText } from './parts';

const rTone = (r: number | null | undefined): Tone =>
  r == null || r === 0 ? 'none' : r > 0 ? 'good' : 'bad';

/** Sectors ranked, strongest first — a sideways strip of small tiles. */
export function SectorStrip({ sectors }: { sectors: SectorDay[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-5"
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      accessibilityLabel="Sectors ranked"
    >
      {sectors.map((s) => (
        <View
          key={s.key}
          accessible
          accessibilityLabel={`${s.rank ?? ''} ${s.label}: ${formatSignedPercent(s.ret1)} today, ${formatSignedPercent(s.ret5)} over 5 sessions`}
          className="min-w-[104px] rounded-field border border-line bg-surface px-3 py-2 dark:border-line-dark dark:bg-surface-dark"
        >
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {`${s.rank != null ? `${s.rank}. ` : ''}${sectorShort(s.label)}`}
          </Text>
          <ChangeText value={s.ret1} className="mt-0.5 text-[15px]" style={NUM}>
            {formatSignedPercent(s.ret1)}
          </ChangeText>
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            {`5d ${formatSignedPercent(s.ret5)}`}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

/** The morning confirmation (09:20–10:15): the open, the summary, how many held up. */
export function MorningPanel({ morning }: { morning: MorningCheck }) {
  const time = morning.at ? formatIstTime(morning.at) : null;
  const nifty = morning.market.niftyPct;
  const counts = morningCounts(morning);
  return (
    <Panel title="Morning check" meta={time ? `${time} IST` : undefined}>
      <View className="flex-row flex-wrap items-baseline gap-x-2">
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Nifty at the open
        </Text>
        <ChangeText value={nifty} className="text-[13px]" style={NUM}>
          {formatSignedPercent(nifty)}
        </ChangeText>
      </View>
      {counts ? (
        <Text className="mt-1 text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUM}>
          {counts}
        </Text>
      ) : null}
      {morning.summary ? (
        <Text className="mt-1.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {morning.summary}
        </Text>
      ) : null}
    </Panel>
  );
}

/** One graded day's picks: "SYM +1.2R · SYM2 –". */
function PicksLine({ day }: { day: DayOutcome }) {
  return (
    <Text
      className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
      style={NUM}
    >
      {day.picks.map((p, i) => (
        <Text key={`${p.list}${p.symbol}`}>
          {i > 0 ? ' · ' : ''}
          {`${p.symbol} `}
          <ToneText tone={rTone(p.r)} className="text-xs">
            {pickResult(p)}
          </ToneText>
        </Text>
      ))}
    </Text>
  );
}

/** How this report's own picks did once their session closed. */
export function OutcomePanel({ doc }: { doc: ReportDocument }) {
  const router = useRouter();
  const o = doc.outcome;
  if (!o) return null;
  return (
    <Panel
      title="How these picks did"
      meta={
        o.triggered
          ? `${o.wins}/${o.triggered} won · ${signed(o.totalR, 2, 'R')}`
          : 'none triggered — no trade'
      }
      flush
      footer="Traded by the backtest's rule. Untriggered = no trade, never a loss."
    >
      {o.picks.map((p, index) => {
        const view = PICK_STATE_VIEW[p.state];
        return (
          <View key={`${p.list}${p.symbol}`}>
            {index > 0 ? <RowDivider /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${p.symbol}, ${PICK_LIST_LABEL[p.list]}, ${view.label}, ${pickResult(p)}. Open stock`}
              onPress={() => router.push(stockHref(p.symbol, 'NSE'))}
              className="flex-row items-center gap-3 px-4 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
            >
              <View className="min-w-0 flex-1">
                <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                  {p.symbol}
                </Text>
                <Text
                  className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                  style={NUM}
                >
                  {[
                    PICK_LIST_LABEL[p.list],
                    p.direction === 'LONG' ? 'long' : 'short',
                    view.label,
                    p.entry != null ? `in ₹${p.entry}, out ₹${p.exitPrice ?? '—'}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <ToneText tone={rTone(p.r)} className="text-sm font-semibold">
                {pickResult(p)}
              </ToneText>
            </Pressable>
          </View>
        );
      })}
    </Panel>
  );
}

/** The system's own track record: the last 30 graded sessions, traded by the backtest's rule. */
export function TrackRecordPanel() {
  const layout = useScreenLayout();
  const query = useNextDayTrackRecord(30);
  const rec = query.data?.record;

  let body: React.ReactNode;
  if (query.isPending) body = <ListSkeleton rows={3} />;
  else if (query.error && !query.data) {
    if (isServerOutdated(query.error)) return null;
    body = (
      <InlineError
        what="the track record"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  } else if (!rec || rec.days === 0) {
    body = (
      <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        No graded sessions yet — picks are graded once their session closes.
      </Text>
    );
  } else {
    const days = query.data?.days.slice(0, 10) ?? [];
    body = (
      <View className="gap-3">
        <Grid columns={Math.min(layout.kpiColumns, 4)} gap={10}>
          <StatTile
            label="Triggered"
            value={`${rec.triggered}/${rec.picks}`}
            sub={`${rec.days} session${rec.days === 1 ? '' : 's'}`}
          />
          <StatTile
            label="Win rate"
            value={rec.winRatePct == null ? '—' : formatPercent(rec.winRatePct, 0)}
            sub={`${rec.wins} of ${rec.triggered} trades`}
          />
          <StatTile
            label="Per trade"
            value={rec.avgR == null ? '—' : signed(rec.avgR, 2, 'R')}
            sub={`Total ${signed(rec.totalR, 2, 'R')}`}
            status={rec.avgR == null || rec.avgR === 0 ? undefined : rec.avgR > 0 ? 'ok' : 'bad'}
          />
          <StatTile
            label="Losses in a row"
            value={String(rec.lossStreak)}
            sub={rec.lossStreak >= 3 ? 'Stop rule active' : 'Stops at 3'}
            status={rec.lossStreak >= 3 ? 'bad' : undefined}
          />
        </Grid>
        {days.length > 0 ? (
          <View className="overflow-hidden rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
            {days.map((day, index) => (
              <View key={day.forDate}>
                {index > 0 ? <RowDivider /> : null}
                <View accessible className="flex-row items-start gap-3 px-3.5 py-2.5">
                  <View className="min-w-0 flex-1">
                    <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                      {sessionDay(day.forDate)}
                    </Text>
                    <PicksLine day={day} />
                  </View>
                  <ToneText
                    tone={day.triggered ? rTone(day.totalR) : 'none'}
                    className="text-sm font-semibold"
                  >
                    {day.triggered ? signed(day.totalR, 2, 'R') : '—'}
                  </ToneText>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <View className="mb-3 flex-row items-baseline justify-between gap-3">
        <Text
          accessibilityRole="header"
          className="text-[17px] font-bold text-ink dark:text-ink-dark"
          style={{ letterSpacing: -0.4 }}
        >
          How the picks did
        </Text>
        <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">Last 30 sessions</Text>
      </View>
      <View style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>{body}</View>
      <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Untriggered = no trade, never a loss.
      </Text>
    </View>
  );
}

/** What each of the eleven scanners voted today, and its strongest names. */
export function ScannerHitsPanel({ report }: { report: NextDayReport }) {
  const router = useRouter();
  if (report.strategyHits.length === 0) return null;
  return (
    <Panel
      title="What each scanner saw"
      meta="Buy · sell votes today"
      flush
      footer="* Not counted — its measured history contradicts that side."
    >
      {report.strategyHits.map((h, index) => {
        const squeeze = h.key === 'volatility-squeeze';
        return (
          <View key={h.key}>
            {index > 0 ? <RowDivider /> : null}
            <View className="px-4 py-2.5">
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                  {SCANNER_SHORT[h.key]}
                </Text>
                <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted" style={NUM}>
                  {squeeze
                    ? hitCell(h, 'buy')
                    : `${hitCell(h, 'buy')} buy · ${hitCell(h, 'sell')} sell`}
                </Text>
              </View>
              {h.top.length > 0 ? (
                <View className="mt-1.5 flex-row flex-wrap gap-1.5">
                  {h.top.slice(0, 5).map((t) => (
                    <Pressable
                      key={t.symbol}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.symbol}: ${t.reason}. Open stock`}
                      onPress={() => router.push(stockHref(t.symbol, 'NSE'))}
                      hitSlop={4}
                      className="rounded-md bg-surface-sunk px-2 py-1 active:opacity-60 dark:bg-surface-sunk-dark"
                    >
                      <Text className="text-[11px] font-semibold text-ink dark:text-ink-dark">
                        {t.symbol}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </Panel>
  );
}

/** Where the data stands: the stored NSE history, the last backtest, the report, the queue. */
export function DataStatusPanel({
  status,
  doc,
  report,
  isAdmin,
  now,
}: {
  status: NextDayStatus | undefined;
  doc: ReportDocument;
  report: NextDayReport;
  isAdmin: boolean;
  now: number;
}) {
  const eod = status?.eod;
  return (
    <Panel title="Data" meta="NSE end-of-day files">
      <KeyValueRow
        label="Scanned"
        value={`${formatNumber(report.universe.scanned, 0)} liquid · ${formatNumber(report.universe.fno, 0)} F&O`}
      />
      <KeyValueRow divider label="Report built" value={relativeTime(report.generatedAt, now)} />
      {doc.morning?.at ? (
        <KeyValueRow divider label="Morning check" value={relativeTime(doc.morning.at, now)} />
      ) : null}
      {eod ? (
        <KeyValueRow
          divider
          label="Sessions stored"
          hint={
            eod.first && eod.last ? `${sessionDay(eod.first)} – ${sessionDay(eod.last)}` : undefined
          }
          value={`${formatNumber(eod.sessions, 0)} · F&O ${formatNumber(eod.foSessions, 0)}`}
        />
      ) : null}
      {status ? (
        <KeyValueRow
          divider
          label="Scanners measured"
          value={status.measure?.at ? relativeTime(status.measure.at, now) : 'Not yet'}
        />
      ) : null}
      {isAdmin && status ? (
        <KeyValueRow
          divider
          label="Queue"
          value={`${status.queue.active} running · ${status.queue.waiting} waiting`}
          hint={
            status.queue.workers != null
              ? `${status.queue.workers} worker${status.queue.workers === 1 ? '' : 's'}`
              : undefined
          }
        />
      ) : null}
    </Panel>
  );
}
