import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ChangeText } from '@/components/market/ChangeText';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { formatDayKey, formatIst } from '@/features/insights/lib/dates';
import { usePushState } from '@/features/settings/push';
import {
  useGenerateSignals,
  useMeasureReliability,
  useSignalDay,
  useSignalReliability,
  useSignalStatus,
} from '@/features/signals/api';
import { FeaturedSignal } from '@/features/signals/components/FeaturedSignal';
import { NUM } from '@/features/signals/components/SignalParts';
import { SignalPushCard } from '@/features/signals/components/SignalPushCard';
import { SignalRow } from '@/features/signals/components/SignalRow';
import { SignalSheet } from '@/features/signals/components/SignalSheet';
import {
  INTRADAY_CHECKS,
  SORTS,
  actionChips,
  featuredSignal,
  filterSignals,
  sortReliability,
  summarizeSignals,
  type ActionFilter,
  type SignalSort,
} from '@/features/signals/lib/signals';
import type { PushGateStatus, Signal } from '@/features/signals/types';
import { animateNextLayout } from '@/lib/animation';
import { stockHref } from '@/lib/navigation';
import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

/** Rows drawn before "Show all" — a busy day has up to a hundred setups. */
const FIRST_ROWS = 25;

const EMPTY: Signal[] = [];

/** What must pass before anyone is notified — the server's own rules, stated verbatim. */
function GateCard({ gate }: { gate: PushGateStatus }) {
  const cells: [string, string][] = [
    ['Reliable range', `${gate.minHitRate}–${gate.maxHitRate}%`],
    ['Minimum history', `${formatNumber(gate.minSample, 0)} matches`],
    ['Eligible rules', `${formatNumber(gate.clearing, 0)} / ${formatNumber(gate.measured, 0)}`],
    ['Measured hold', `${gate.holdDays} days`],
  ];
  return (
    <Card>
      {gate.verdict ? (
        <Text className="text-[13px] leading-[19px] text-ink dark:text-ink-dark">
          {gate.verdict}
        </Text>
      ) : null}
      <View className="mt-3 flex-row flex-wrap border-t border-line dark:border-line-dark">
        {cells.map(([label, value]) => (
          <View
            key={label}
            accessible
            accessibilityLabel={`${label}: ${value}`}
            className="w-1/2 pt-3"
          >
            <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
            <Text
              className="mt-0.5 text-[15px] font-semibold text-ink dark:text-ink-dark"
              style={NUM}
            >
              {value}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const STEPS: [string, string][] = [
  ['Screen', 'Technical setups from the prepared daily scans.'],
  ['Measure', 'How the same rule did across its past matches.'],
  ['Read today', 'The current quote and the model’s reason label it Buy, Sell or Watch.'],
  ['Notify', 'Once per setup per day, only after every measured rule passes.'],
];

/** How a pick becomes an alert — four steps. */
function HowItWorks() {
  return (
    <Panel title="How a pick becomes an alert">
      <View className="gap-3">
        {STEPS.map(([title, line], index) => (
          <View key={title} className="flex-row gap-3">
            <View className="h-6 w-6 items-center justify-center rounded-full bg-surface-sunk dark:bg-surface-sunk-dark">
              <Text className="text-xs font-bold text-ink dark:text-ink-dark">{index + 1}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">{title}</Text>
              <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                {line}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Panel>
  );
}

/** Every screener's measured record — the numbers the alert rules read. */
function ReliabilitySection({
  gate,
  measuring,
  onMeasure,
}: {
  gate: PushGateStatus | null;
  measuring: boolean;
  onMeasure: () => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const reliability = useSignalReliability(open);
  const rows = reliability.data ? sortReliability(reliability.data.reliability) : [];
  const unmeasurable = reliability.data?.unmeasurable ?? [];

  return (
    <Section
      title="Reliability by screener"
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Re-measure every screener's hit rate"
          disabled={measuring}
          hitSlop={8}
          onPress={onMeasure}
          className="active:opacity-60"
        >
          <Text
            className={
              measuring
                ? 'text-[13px] font-semibold text-ink-faint dark:text-ink-dark-faint'
                : 'text-[13px] font-semibold text-brand-text dark:text-brand-text-dark'
            }
          >
            {measuring ? 'Measuring…' : 'Update'}
          </Text>
        </Pressable>
      }
    >
      <ListCard>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => {
            animateNextLayout();
            setOpen((value) => !value);
          }}
          className="min-h-[48px] flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
        >
          <View className="flex-1">
            <Text className="text-[13px] text-ink dark:text-ink-dark">
              Best: {gate?.bestScreener ?? 'not measured'}
              {gate?.bestHitRatePct != null ? ` · ${formatPercent(gate.bestHitRatePct, 1)}` : ''}
            </Text>
            <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
              Median {formatPercent(gate?.medianHitRatePct, 1)} · {open ? 'Hide' : 'View'} every
              rule
            </Text>
          </View>
          {open ? (
            <ChevronUp size={18} color={colors.textMuted} />
          ) : (
            <ChevronDown size={18} color={colors.textMuted} />
          )}
        </Pressable>
        {open ? (
          <View className="border-t border-line dark:border-line-dark">
            {reliability.isPending ? (
              <View className="p-3.5">
                <ListSkeleton rows={4} />
              </View>
            ) : reliability.error && !reliability.data ? (
              <InlineError
                className="m-3.5"
                what="the track records"
                error={reliability.error}
                onRetry={() => void reliability.refetch()}
              />
            ) : rows.length === 0 ? (
              <InlineEmpty
                className="m-3.5"
                title="Nothing measured yet"
                message="Update to backtest each screener's past matches."
              />
            ) : (
              rows.map((row, index) => (
                // One record per screener AND hold period (the server's unique key).
                <View key={`${row.screenerKey}:${row.holdDays}`}>
                  {index > 0 ? <RowDivider /> : null}
                  <View
                    accessible
                    accessibilityLabel={`${row.screenerName}: hit rate ${formatPercent(row.hitRatePct, 1)} over ${row.sampleTrades} matches, average return ${formatSignedPercent(row.avgReturnPct, 2)}`}
                    className="px-3.5 py-3"
                  >
                    <View className="flex-row items-baseline gap-2">
                      <Text
                        className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark"
                        numberOfLines={2}
                      >
                        {row.screenerName}
                      </Text>
                      <Text className="text-sm font-bold text-ink dark:text-ink-dark" style={NUM}>
                        {formatPercent(row.hitRatePct, 1)}
                      </Text>
                    </View>
                    <View className="mt-1 flex-row flex-wrap items-baseline gap-x-2">
                      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
                        {formatNumber(row.sampleTrades, 0)} matches · avg
                      </Text>
                      <ChangeText value={row.avgReturnPct} className="text-xs" style={NUM}>
                        {formatSignedPercent(row.avgReturnPct, 2)}
                      </ChangeText>
                      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
                        · win +{formatNumber(row.avgWinPct, 2)}% · loss −
                        {formatNumber(Math.abs(row.avgLossPct), 2)}% · worst{' '}
                        {formatPercent(row.worstReturnPct, 1)}
                      </Text>
                    </View>
                    <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                      {row.holdDays}-day hold
                      {row.measuredAt
                        ? ` · measured ${formatIst(row.measuredAt, { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : ''}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ListCard>
      {open && unmeasurable.length > 0 ? (
        <View className="mt-4">
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
            {unmeasurable.length} screener{unmeasurable.length === 1 ? '' : 's'} can&apos;t be
            measured
          </Text>
          {unmeasurable.map((item) => (
            <Text
              key={item.key}
              className="mt-1.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
            >
              <Text className="font-semibold text-ink dark:text-ink-dark">{item.key}</Text> —{' '}
              {item.reason}
            </Text>
          ))}
        </View>
      ) : null}
    </Section>
  );
}

/**
 * Market signals (web: /signals) — today's screener matches turned into calls, ranked by their
 * MEASURED history first. The day is fetched once and filtered on the phone, so the lead setup
 * never disappears when the list is narrowed. An alert fires only when every measured rule
 * passes; the model's 1–5 read is evidence strength, never a probability.
 */
export default function SignalsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const layout = useScreenLayout();
  const [action, setAction] = useState<ActionFilter>('ALL');
  const [alertReady, setAlertReady] = useState(false);
  const [sort, setSort] = useState<SignalSort>('ranked');
  const [sortOpen, setSortOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<Signal | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const day = useSignalDay();
  const status = useSignalStatus();
  const generate = useGenerateSignals();
  const measure = useMeasureReliability();
  const push = usePushState();

  const all = day.data?.signals ?? EMPTY;
  const gate = status.data?.gate ?? null;
  const holdDays = gate?.holdDays ?? day.data?.gate?.holdDays ?? 10;
  const summary = useMemo(() => summarizeSignals(all), [all]);
  const featured = useMemo(() => featuredSignal(all), [all]);
  const rows = useMemo(
    () => filterSignals(all, { action, alertReady }, sort),
    [all, action, alertReady, sort],
  );
  const chips = useMemo(() => actionChips(summary), [summary]);
  const shown = showAll ? rows : rows.slice(0, FIRST_ROWS);

  const generating = (status.data?.generation.running ?? false) || generate.isPending;
  const measuring = (status.data?.reliability.running ?? false) || measure.isPending;
  const lastError = status.data?.generation.lastError ?? null;

  const refresh = useCallback(
    () => Promise.all([day.refetch(), status.refetch(), push.refresh()]),
    [day, status, push],
  );

  const runGenerate = () =>
    generate.mutate(undefined, {
      onSuccess: () => toast.success('Signal refresh queued', 'The list updates when it’s done.'),
      onError: (error) => toast.error('Couldn’t queue a refresh', getErrorMessage(error)),
    });
  const runMeasure = () =>
    measure.mutate(undefined, {
      onSuccess: () =>
        toast.success('Updating reliability', 'A backtest per screener — it takes a while.'),
      onError: (error) => toast.error('Couldn’t start the update', getErrorMessage(error)),
    });

  const openStock = useCallback(
    (signal: Signal) => {
      setSheetOpen(false);
      router.push(stockHref(signal.symbol, signal.exchange));
    },
    [router],
  );
  const openSheet = useCallback((signal: Signal) => {
    setPicked(signal);
    setSheetOpen(true);
  }, []);

  const filtered = action !== 'ALL' || alertReady;
  const sortLabel = SORTS.find((option) => option.key === sort)?.label ?? '';

  return (
    <GroupScreen
      intro={
        day.data
          ? `${formatDayKey(day.data.date)} · intraday checks ${INTRADAY_CHECKS}`
          : `Intraday checks ${INTRADAY_CHECKS}`
      }
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh today's signals"
          accessibilityState={{ disabled: generating }}
          disabled={generating}
          hitSlop={8}
          onPress={runGenerate}
          className="flex-row items-center gap-1.5 rounded-full border border-line px-3 py-1.5 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
        >
          <RefreshCw size={13} color={generating ? colors.textFaint : colors.text} />
          <Text
            className={
              generating
                ? 'text-xs font-semibold text-ink-faint dark:text-ink-dark-faint'
                : 'text-xs font-semibold text-ink dark:text-ink-dark'
            }
          >
            {generating ? 'Refreshing…' : 'Refresh'}
          </Text>
        </Pressable>
      }
      onRefresh={refresh}
    >
      {lastError ? (
        <Banner
          className="mb-4"
          tone="error"
          title="The latest signal refresh failed"
          message={lastError}
        />
      ) : null}

      {/* ── The day in numbers ── */}
      <Grid columns={layout.kpiColumns >= 4 ? 4 : 2}>
        <StatTile
          label="Setups today"
          value={day.data ? formatNumber(summary.total, 0) : '—'}
          sub={`${summary.byAction.BUY} buy · ${summary.byAction.SELL} sell · ${summary.byAction.WATCH} watch`}
        />
        <StatTile
          label="Alert-ready"
          value={day.data ? formatNumber(summary.alertReady, 0) : '—'}
          status={summary.alertReady > 0 ? 'ok' : undefined}
          sub="Clear every measured rule"
        />
        <StatTile
          label="Alerts sent"
          value={day.data ? formatNumber(summary.alertsSent, 0) : '—'}
          sub="Once per setup per day"
        />
        <StatTile
          label="Eligible rules"
          value={gate ? `${gate.clearing}/${gate.measured}` : '—'}
          sub={gate ? `${gate.minHitRate}–${gate.maxHitRate}% hit-rate bar` : 'Screeners measured'}
        />
      </Grid>

      {featured ? (
        <View className="mt-5">
          <FeaturedSignal signal={featured} onOpen={() => openStock(featured)} />
        </View>
      ) : null}

      {/* ── Every setup ── */}
      <Section
        title="All evaluated setups"
        right={
          all.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sort: ${sortLabel}`}
              hitSlop={8}
              onPress={() => setSortOpen(true)}
              className="flex-row items-center gap-1 rounded-full border border-line px-3 py-1.5 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
            >
              <Text className="text-xs font-semibold text-ink dark:text-ink-dark">{sortLabel}</Text>
              <ChevronDown size={14} color={colors.textMuted} />
            </Pressable>
          ) : undefined
        }
      >
        <Chips
          items={chips}
          value={action}
          onChange={(next) => {
            setAction(next);
            setShowAll(false);
          }}
        />
        <View className="mb-3 mt-3 flex-row items-center gap-3">
          <Text className="flex-1 text-[13px] text-ink dark:text-ink-dark">Alert-ready only</Text>
          <Switch
            value={alertReady}
            onValueChange={(value) => {
              setAlertReady(value);
              setShowAll(false);
            }}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            accessibilityLabel="Show only setups that clear every alert rule"
          />
        </View>

        {day.isPending ? (
          <ListSkeleton rows={4} />
        ) : day.error && !day.data ? (
          <InlineError what="signals" error={day.error} onRetry={() => void day.refetch()} />
        ) : all.length === 0 ? (
          <InlineEmpty
            title="No signals yet today"
            message="Checks run during the session and once after the close."
            action={generating ? undefined : { label: 'Generate signals', onPress: runGenerate }}
          />
        ) : rows.length === 0 ? (
          <InlineEmpty
            title="No setup matches these filters"
            action={{
              label: 'Show every setup',
              onPress: () => {
                setAction('ALL');
                setAlertReady(false);
              },
            }}
          />
        ) : (
          <>
            <ListCard>
              {shown.map((signal, index) => (
                <View key={`${signal.screenerKey}:${signal.exchange}:${signal.symbol}`}>
                  {index > 0 ? <RowDivider /> : null}
                  <SignalRow signal={signal} onPress={() => openSheet(signal)} />
                </View>
              ))}
            </ListCard>
            {rows.length > shown.length ? (
              <Button
                className="mt-3"
                label={`Show all ${rows.length}`}
                variant="ghost"
                size="sm"
                onPress={() => {
                  animateNextLayout();
                  setShowAll(true);
                }}
              />
            ) : null}
            <Text className="mt-3 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
              {filtered ? `${rows.length} of ${all.length} shown. ` : ''}Historical figures use a{' '}
              {holdDays}-day hold and include measured costs. Today strength is a 1–5 model rank,
              not a probability.
            </Text>
          </>
        )}
      </Section>

      {/* ── The rules, and how to hear about a pick ── */}
      <Section title="Before you’re alerted">
        {gate ? (
          <GateCard gate={gate} />
        ) : status.error && !status.data ? (
          <InlineError
            what="the alert rules"
            error={status.error}
            onRetry={() => void status.refetch()}
          />
        ) : (
          <ListSkeleton rows={1} />
        )}
      </Section>

      <View className="mt-5">
        <Grid columns={layout.columns >= 2 ? 2 : 1} equalHeight={false}>
          <SignalPushCard push={push} featured={featured} />
          <HowItWorks />
        </Grid>
      </View>

      <ReliabilitySection gate={gate} measuring={measuring} onMeasure={runMeasure} />

      <Text className="mt-6 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Signal strength, not a probability. Not investment advice.
      </Text>

      <OptionSheet
        visible={sortOpen}
        title="Sort setups"
        options={SORTS}
        value={sort}
        onSelect={setSort}
        onClose={() => setSortOpen(false)}
      />
      <SignalSheet
        signal={picked}
        visible={sheetOpen}
        holdDays={holdDays}
        onClose={() => setSheetOpen(false)}
        onOpenStock={openStock}
      />
    </GroupScreen>
  );
}
