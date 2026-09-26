import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import React, { useCallback, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { StatGrid } from '@/components/ui/StatGrid';
import { Chips } from '@/components/ui/Tabs';
import { formatDayKey, formatIst } from '@/features/insights/lib/dates';
import {
  useGenerateSignals,
  useMeasureReliability,
  useSignalList,
  useSignalReliability,
  useSignalStatus,
} from '@/features/signals/api';
import { SignalCard } from '@/features/signals/components/SignalCard';
import { ACTION_FILTERS, sortReliability } from '@/features/signals/lib/signals';
import type { PushGateStatus, SignalAction } from '@/features/signals/types';
import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const numbers = { fontVariant: ['tabular-nums' as const] };

/** The alert gate — top of the screen, because it explains everything under it. */
function GateCard({ gate }: { gate: PushGateStatus }) {
  const open = gate.clearing > 0;
  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <Badge
          label={open ? `${gate.clearing} clearing the bar` : 'Alerts off'}
          variant={open ? 'success' : 'danger'}
        />
      </View>
      {/* Verbatim: the server owns the explanation, including what to change. */}
      <Text className="mt-2 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
        {gate.verdict}
      </Text>
      <View className="mt-3">
        <StatGrid
          stats={[
            { label: 'Alert bar', value: `${gate.minHitRate}–${gate.maxHitRate}%` },
            {
              label: 'Best measured',
              value: gate.bestHitRatePct != null ? formatPercent(gate.bestHitRatePct, 1) : '—',
            },
            {
              label: 'Median',
              value: gate.medianHitRatePct != null ? formatPercent(gate.medianHitRatePct, 1) : '—',
            },
            { label: 'Screeners measured', value: formatNumber(gate.measured, 0) },
            { label: 'Hold', value: `${gate.holdDays} days` },
            { label: 'Min sample', value: `${formatNumber(gate.minSample, 0)} matches` },
          ]}
        />
      </View>
      {gate.bestScreener ? (
        <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
          Best: {gate.bestScreener}
        </Text>
      ) : null}
    </Card>
  );
}

/** Every screener's measured record — the numbers the gate reads. */
function ReliabilitySection() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const reliability = useSignalReliability(open);
  const rows = reliability.data ? sortReliability(reliability.data.reliability) : [];
  const unmeasurable = reliability.data?.unmeasurable ?? [];

  return (
    <View className="mt-7">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center justify-between py-2 active:opacity-60"
      >
        <Text
          accessibilityRole="header"
          className="text-[17px] font-bold text-ink dark:text-ink-dark"
          style={{ letterSpacing: -0.4 }}
        >
          Screener track records
        </Text>
        {open ? (
          <ChevronUp size={18} color={colors.textMuted} />
        ) : (
          <ChevronDown size={18} color={colors.textMuted} />
        )}
      </Pressable>
      {!open ? (
        <Text className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          How often each screener&apos;s past matches actually made money.
        </Text>
      ) : reliability.isPending ? (
        <ListSkeleton rows={4} />
      ) : reliability.error && !reliability.data ? (
        <InlineError
          what="the track records"
          error={reliability.error}
          onRetry={() => void reliability.refetch()}
        />
      ) : rows.length === 0 ? (
        <InlineEmpty
          title="Nothing measured yet"
          message="Re-measure hit rates to backtest each screener's past matches."
        />
      ) : (
        <>
          <ListCard className="mt-1">
            {rows.map((row, index) => (
              <View key={row.screenerKey}>
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
                    <Text className="text-sm font-bold text-ink dark:text-ink-dark" style={numbers}>
                      {formatPercent(row.hitRatePct, 1)}
                    </Text>
                  </View>
                  <View className="mt-1 flex-row flex-wrap items-baseline gap-x-2">
                    <Text
                      className="text-xs text-ink-muted dark:text-ink-dark-muted"
                      style={numbers}
                    >
                      {formatNumber(row.sampleTrades, 0)} matches · avg
                    </Text>
                    <ChangeText value={row.avgReturnPct} className="text-xs" style={numbers}>
                      {formatSignedPercent(row.avgReturnPct, 2)}
                    </ChangeText>
                    <Text
                      className="text-xs text-ink-muted dark:text-ink-dark-muted"
                      style={numbers}
                    >
                      · win +{formatNumber(row.avgWinPct, 2)}% · loss −
                      {formatNumber(Math.abs(row.avgLossPct), 2)}% · worst{' '}
                      {formatPercent(row.worstReturnPct, 1)}
                    </Text>
                  </View>
                  <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                    {row.holdDays}-day hold · measured{' '}
                    {formatIst(row.measuredAt, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              </View>
            ))}
          </ListCard>
          {unmeasurable.length > 0 ? (
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
        </>
      )}
    </View>
  );
}

/**
 * Today's screener matches turned into buy/sell calls. Built around one measurement and its
 * limit: each signal carries the share of that screener's past matches that made money, and
 * the gate panel says plainly where the alert bar sits and how far the field falls short.
 */
export default function SignalsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [action, setAction] = useState<SignalAction | 'ALL'>('ALL');
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  const signals = useSignalList({ qualifiedOnly, action: action === 'ALL' ? undefined : action });
  const status = useSignalStatus();
  const generate = useGenerateSignals();
  const measure = useMeasureReliability();

  const gate = status.data?.gate;
  const rows = signals.data?.signals ?? [];
  const holdDays = gate?.holdDays ?? signals.data?.gate?.holdDays ?? 10;

  const refresh = useCallback(
    () => Promise.all([signals.refetch(), status.refetch()]),
    [signals, status],
  );

  const regenerate = () =>
    generate.mutate(undefined, {
      onSuccess: () =>
        toast.success('Signal generation queued', "Today's matches are being re-classified."),
      onError: (error) => toast.error("Couldn't queue signal generation", getErrorMessage(error)),
    });
  const remeasure = () =>
    measure.mutate(undefined, {
      onSuccess: () =>
        toast.success('Re-measuring hit rates', 'A backtest per screener — this takes a while.'),
      onError: (error) => toast.error("Couldn't start the measurement", getErrorMessage(error)),
    });

  return (
    <GroupScreen
      intro={
        signals.data
          ? `${formatDayKey(signals.data.date)} · ${rows.length} signal${rows.length === 1 ? '' : 's'}`
          : 'Screener matches turned into calls, with a measured hit rate'
      }
      onRefresh={refresh}
    >
      {gate ? (
        <GateCard gate={gate} />
      ) : status.error ? (
        <InlineError
          what="the alert gate"
          error={status.error}
          onRetry={() => void status.refetch()}
        />
      ) : null}

      <Chips
        items={ACTION_FILTERS}
        value={action}
        onChange={setAction}
        className={gate || status.error ? 'mt-5' : undefined}
      />
      <View className="mt-3 flex-row items-center gap-3">
        <Text className="flex-1 text-[13px] text-ink dark:text-ink-dark">
          Only ones that clear the alert bar
        </Text>
        <Switch
          value={qualifiedOnly}
          onValueChange={setQualifiedOnly}
          trackColor={{ true: colors.primary, false: colors.borderStrong }}
          accessibilityLabel="Only signals that clear the alert bar"
        />
      </View>

      <Section title="Today's signals" className="mt-5">
        {signals.isPending ? (
          <ListSkeleton rows={4} />
        ) : signals.error && !signals.data ? (
          <InlineError
            what="signals"
            error={signals.error}
            onRetry={() => void signals.refetch()}
          />
        ) : rows.length === 0 ? (
          <InlineEmpty
            title={qualifiedOnly ? 'Nothing clears the bar today' : 'No signals yet today'}
            message={
              qualifiedOnly
                ? 'With the bar where it is, that is the expected outcome — see the gate above.'
                : 'Signals are generated after the screeners run, around 16:30 IST on trading days.'
            }
            action={{
              label: 'Look at the screeners',
              onPress: () => router.push('/intel/screeners'),
            }}
          />
        ) : (
          <View className="gap-3">
            {rows.map((signal) => (
              <SignalCard
                key={`${signal.screenerKey}:${signal.exchange}:${signal.symbol}`}
                signal={signal}
              />
            ))}
          </View>
        )}
        {rows.length > 0 ? (
          <Text className="mt-3 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
            Hit rate and average return are measured from each screener&apos;s own past matches over
            a {holdDays}-day hold, net of costs. Conviction is the model reading today&apos;s
            numbers — an ordinal, not a probability, and it never decides whether you are alerted.
          </Text>
        ) : null}
      </Section>

      <View className="mt-5 flex-row gap-2.5">
        <Button
          label={generate.isPending ? 'Queueing…' : 'Regenerate'}
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={generate.isPending}
          onPress={regenerate}
          accessibilityLabel="Regenerate today's signals"
        />
        <Button
          label={measure.isPending ? 'Queueing…' : 'Re-measure'}
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={measure.isPending}
          onPress={remeasure}
          accessibilityLabel="Re-measure every screener's hit rate"
        />
      </View>

      <ReliabilitySection />

      <Text className="mt-6 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Not investment advice — review before acting.
      </Text>
    </GroupScreen>
  );
}
