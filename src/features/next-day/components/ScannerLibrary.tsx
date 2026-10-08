import { useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Meter } from '@/components/ui/Meter';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { relativeTime } from '@/features/settings/lib/time';
import { useNow } from '@/hooks/useNow';
import { formatNumber, formatPercent } from '@/lib/utils/formatters';
import { isServerOutdated } from '@/services/api/contract';
import { useTheme } from '@/theme/ThemeProvider';

import { useNextDayLibrary } from '../hooks';
import {
  COMPAT_VIEW,
  edgeText,
  libraryRows,
  sessionDay,
  signed,
  TIER_LABEL,
  todayText,
  type LibraryRow,
  type LibrarySide,
} from '../lib/view';
import type { StrategyLibrary } from '../types';
import { Bullets, FinePrint, NUM, TonePill } from './parts';

/**
 * The eleven scanners of the Next-Day system: what each looks for, what its votes were worth on
 * the stored NSE history — per direction, as an edge over the same day's market and as trades —
 * and so whether its vote counts. Then the score's weights, the tiers with their own measured
 * results, and the risk rules every candidate is sized by.
 *
 * Contract: no props; renders content for a screen that already scrolls (GroupScreen) — no
 * ScrollView of its own; handles its own loading, error, empty and server-outdated states. A
 * scanner's full detail is a pushed screen (/next-day/scanner/[key]).
 */
export function ScannerLibrary() {
  const query = useNextDayLibrary();

  if (query.isPending) {
    return (
      <View className="gap-3">
        <ListSkeleton rows={2} />
        <ListSkeleton rows={6} />
      </View>
    );
  }
  if (query.error && !query.data) {
    return isServerOutdated(query.error) ? (
      <InlineEmpty
        title="Needs a newer server"
        message="The next-day scanners aren’t available on the server this app is connected to yet."
      />
    ) : (
      <InlineError
        what="the scanner library"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!query.data || query.data.strategies.length === 0) {
    return <InlineEmpty title="No scanners yet" message="The server lists no next-day scanners." />;
  }
  return <Library lib={query.data} />;
}

function Library({ lib }: { lib: StrategyLibrary }) {
  const router = useRouter();
  const layout = useScreenLayout();
  const now = useNow();
  const rows = useMemo(() => libraryRows(lib.strategies), [lib.strategies]);
  const counted = (side: 'long' | 'short') =>
    rows.filter((r) => r[side].state !== 'excluded').length;
  const columns = Math.min(layout.columns, 2);

  return (
    <View className="gap-5">
      {!lib.measuredAt ? (
        <Banner
          tone="info"
          title="Not measured yet"
          message="Every scanner votes provisionally until the NSE history is imported and backtested."
        />
      ) : null}

      <Grid columns={Math.min(layout.kpiColumns, 4)} gap={10}>
        <StatTile label="Scanners" value={String(rows.length)} sub="Evening scan + morning check" />
        <StatTile
          label="Counted long"
          value={`${counted('long')}/${rows.length}`}
          sub="Votes that count for a BUY"
        />
        <StatTile
          label="Counted short"
          value={`${counted('short')}/${rows.length}`}
          sub="Votes that count for a SELL"
        />
        <StatTile
          label="Measured on"
          value={lib.window ? `${formatNumber(lib.window.sessions, 0)} sessions` : '—'}
          sub={
            lib.measuredAt
              ? `${relativeTime(lib.measuredAt, now)} · re-run Saturdays`
              : 'Re-run every Saturday'
          }
        />
      </Grid>
      {lib.window ? (
        <Text className="-mt-2 text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          {`${formatNumber(lib.window.stocks, 0)} stocks · ${sessionDay(lib.window.from)} – ${sessionDay(lib.window.to)}`}
        </Text>
      ) : null}

      <Section title="Scanners" note="Next-session edge vs the market" className="mt-0">
        <ListCard>
          {rows.map((row, index) => (
            <View key={row.key}>
              {index > 0 ? <RowDivider /> : null}
              <ScannerRow
                row={row}
                onPress={() =>
                  router.push({ pathname: '/next-day/scanner/[key]', params: { key: row.key } })
                }
              />
            </View>
          ))}
        </ListCard>
      </Section>

      <Grid columns={columns} gap={20} equalHeight={false}>
        <Panel key="weights" title="The 100-point score" meta="Per direction">
          <View className="gap-3">
            {lib.weights.map((w) => (
              <View key={w.key} accessible accessibilityLabel={`${w.label}: ${w.max} points`}>
                <View className="flex-row items-baseline justify-between gap-3">
                  <Text className="flex-1 text-[13px] text-ink dark:text-ink-dark">{w.label}</Text>
                  <Text
                    className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                    style={NUM}
                  >
                    {w.max}
                  </Text>
                </View>
                <Meter value={(w.max / 15) * 100} tone="neutral" height={4} className="mt-1.5" />
              </View>
            ))}
          </View>
          <Text className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            A component with no data leaves the denominator.
          </Text>
        </Panel>

        <Panel
          key="tiers"
          title="Tiers"
          meta="What each was worth"
          flush
          footer={`Signal strength, never a probability. A list needs ${lib.risk.tradableScore}+ after the hurdles.`}
        >
          {lib.tiersTable.map((t, index) => {
            const m = lib.tiers.find((x) => x.tier === t.tier);
            return (
              <View key={t.tier}>
                {index > 0 ? <RowDivider /> : null}
                <View accessible className="flex-row items-center gap-3 px-4 py-2.5">
                  <View className="min-w-0 flex-1">
                    <Text
                      className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                      style={NUM}
                    >
                      {t.from > 0 ? `${t.from}+` : `< ${lib.tiersTable[index - 1]?.from ?? 60}`}
                      <Text className="font-normal text-ink-muted dark:text-ink-dark-muted">
                        {`  ${TIER_LABEL[t.tier]}`}
                      </Text>
                    </Text>
                    <Text
                      className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                      style={NUM}
                    >
                      {m
                        ? `Edge ${edgeText(m.edge)} · win ${m.trade.winRatePct == null ? '—' : formatPercent(m.trade.winRatePct, 0)}`
                        : t.tier === 'ignore'
                          ? 'No trade'
                          : 'Not measured yet'}
                    </Text>
                  </View>
                  <Text
                    className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                    style={NUM}
                  >
                    {m?.trade.avgR == null ? '—' : signed(m.trade.avgR, 2, 'R')}
                  </Text>
                </View>
              </View>
            );
          })}
        </Panel>

        <Panel key="risk" title="Risk rules" meta="Every candidate">
          <Bullets
            items={[
              `Risk ${lib.risk.riskPct}% of capital a trade (0.25–0.5%); size from the stop, never the score`,
              `At most ${lib.risk.maxTradesPerDay} trades a day; stop after a ${lib.risk.maxDailyLossPct}% daily loss`,
              `Reward : risk at least 1 : ${lib.risk.minRewardRisk} (prefer 1 : ${lib.risk.preferredRewardRisk})`,
              `${lib.risk.stopAfterLosses} losses in a row → no trade until reviewed`,
              `Trigger ${lib.risk.levels.triggerBufferPct}% past the day’s high / low; stop ${lib.risk.levels.minStopAtr}–${lib.risk.levels.maxStopAtr} ATR; T1 ${lib.risk.levels.t1R}R, T2 ${lib.risk.levels.t2R}R`,
              'Options: defined risk only — never naked selling',
              'Cash shorts are intraday only',
            ]}
          />
        </Panel>

        <Panel key="who" title="Who may vote" meta="How the backtest decides">
          <Bullets
            items={[
              `Excluded in a direction only where history contradicts it: a negative edge next session and over five, or t of −${lib.rules.harmT} or worse. Under ${lib.rules.minSignals} signals it votes provisionally.`,
              `In today’s market class, a scanner with ${lib.rules.minRegimeSignals}+ signals and a clearly negative edge there sits the day out.`,
              ...lib.caveats,
            ]}
          />
        </Panel>
      </Grid>

      <FinePrint>A backtest is not a forecast. Not investment advice.</FinePrint>
    </View>
  );
}

function SideLine({ label, side }: { label: string; side: LibrarySide }) {
  const view = COMPAT_VIEW[side.state];
  return (
    <View className="flex-row items-center gap-2">
      <Text className="w-[14px] text-xs font-semibold text-ink-faint dark:text-ink-dark-faint">
        {label}
      </Text>
      <Text className="flex-1 text-xs text-ink dark:text-ink-dark" style={NUM} numberOfLines={1}>
        {side.edge}
      </Text>
      <TonePill tone={view.tone} label={view.label} />
    </View>
  );
}

function ScannerRow({ row, onPress }: { row: LibraryRow; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.name}. Long ${COMPAT_VIEW[row.long.state].label}, edge ${row.long.edge}. Short ${COMPAT_VIEW[row.short.state].label}, edge ${row.short.edge}. Today ${todayText(row)}. Open`}
      onPress={onPress}
      className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="min-w-0 flex-1">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text
            className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {row.name}
          </Text>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
            {`Today ${todayText(row)}`}
          </Text>
        </View>
        {row.summary ? (
          <Text
            className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={2}
          >
            {row.summary}
          </Text>
        ) : null}
        <View className="mt-2 gap-1.5">
          <SideLine label="L" side={row.long} />
          <SideLine label="S" side={row.short} />
        </View>
      </View>
      <ChevronRight size={16} color={colors.textFaint} />
    </Pressable>
  );
}
