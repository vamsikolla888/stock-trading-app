import { useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Flag from 'lucide-react-native/icons/flag';
import React, { memo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { StockLogo } from '@/components/market/StockLogo';
import { Badge } from '@/components/ui/Badge';
import { Meter } from '@/components/ui/Meter';
import { ModalSheet } from '@/features/home/components/ModalSheet';
import { stockLogoUrl } from '@/features/market/api';
import { stockHref } from '@/lib/navigation';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import {
  formatRewardRisk,
  monitorSampleNote,
  progressPercent,
  SEGMENT_LABEL,
  STRUCTURE_ACCENT,
  STRUCTURE_LABEL,
  SUGGESTION_BADGE,
  SUGGESTION_LABEL,
} from '../lib/strongPicks';
import type { StrongPick } from '../types';

const numbers = { fontVariant: ['tabular-nums' as const] };

/** Conviction 1–5 as blocks — deliberately not a percentage beside the measured rate. */
function ConvictionBars({ value }: { value: number }) {
  return (
    <View
      accessible
      accessibilityLabel={`Conviction ${value} of 5`}
      className="flex-row items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((step) => (
        <View
          key={step}
          className={cn(
            'h-1.5 w-2.5 rounded-[1px]',
            step <= value
              ? 'bg-brand-strong dark:bg-brand-strong-dark'
              : 'bg-line-strong dark:bg-line-dark-strong',
          )}
        />
      ))}
    </View>
  );
}

/** All three segments, qualified or not — "not for intraday" is information too. */
function SegmentChips({ pick }: { pick: StrongPick }) {
  const [open, setOpen] = useState(false);
  // A pick published before segments were judged has no verdicts to show.
  if (pick.segmentVerdicts.length === 0) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Segments: ${pick.segmentVerdicts
          .map(
            (verdict) =>
              `${SEGMENT_LABEL[verdict.segment]} ${verdict.suitable ? 'suitable' : 'not suitable'}`,
          )
          .join(', ')}. Show why`}
        onPress={() => setOpen(true)}
        className="mt-3 flex-row flex-wrap gap-1.5 active:opacity-70"
      >
        {pick.segmentVerdicts.map((verdict) => (
          <View
            key={verdict.segment}
            className={cn(
              'rounded-full px-2.5 py-1',
              verdict.suitable
                ? 'bg-success-wash dark:bg-success-wash-dark'
                : 'bg-surface-sunk dark:bg-surface-sunk-dark',
            )}
          >
            <Text
              className={cn(
                'text-xs font-medium',
                verdict.suitable
                  ? 'text-brand-text dark:text-brand-text-dark'
                  : 'text-ink-muted line-through dark:text-ink-dark-muted',
              )}
            >
              {SEGMENT_LABEL[verdict.segment]}
              {verdict.suitable && verdict.confidence === 'inferred' ? ' · inferred' : ''}
            </Text>
          </View>
        ))}
      </Pressable>
      <ModalSheet
        visible={open}
        title={`Where ${pick.symbol} can be traded`}
        onClose={() => setOpen(false)}
      >
        {pick.segmentVerdicts.map((verdict) => (
          <View key={verdict.segment} className="border-b border-line py-3 dark:border-line-dark">
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-[15px] font-semibold text-ink dark:text-ink-dark">
                {SEGMENT_LABEL[verdict.segment]}
              </Text>
              <Badge
                label={verdict.suitable ? 'Suitable' : 'Not suitable'}
                variant={verdict.suitable ? 'success' : 'neutral'}
              />
            </View>
            <Text className="mt-1.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              {verdict.reason}
            </Text>
            {verdict.confidence === 'inferred' ? (
              <Text className="mt-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                Inferred from daily bars — this platform holds no intraday history.
              </Text>
            ) : null}
          </View>
        ))}
        <Text className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          The F&O flag is exact, from the NSE instrument master. Intraday is inferred from daily
          turnover and range — it means “not obviously futile”, not “tested intraday”.
        </Text>
      </ModalSheet>
    </>
  );
}

/** What the pick is doing now — the server's own sentence, verbatim. */
function MonitorStrip({ pick }: { pick: StrongPick }) {
  const monitor = pick.monitor;
  if (!monitor) return null;
  const { verdict } = monitor;
  const progress = progressPercent(verdict.progressToTarget);
  const note = monitorSampleNote(monitor.minutesSinceSample);

  return (
    <View className="mt-3 rounded-xl bg-surface-sunk p-3 dark:bg-surface-sunk-dark">
      <View className="flex-row items-center justify-between gap-2">
        <Badge
          label={SUGGESTION_LABEL[verdict.suggestion]}
          variant={SUGGESTION_BADGE[verdict.suggestion]}
        />
        <View className="flex-row items-baseline gap-1.5">
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={numbers}>
            {formatINR(monitor.lastPrice)}
          </Text>
          {verdict.movePct !== null ? (
            <ChangeText value={verdict.movePct} className="text-xs" style={numbers}>
              {formatSignedPercent(verdict.movePct)}
            </ChangeText>
          ) : null}
        </View>
      </View>
      {progress !== null ? (
        <Meter
          className="mt-2.5"
          value={progress}
          tone={verdict.suggestion === 'EXIT' ? 'loss' : 'gain'}
          accessibilityLabel={`${progress}% of the way from entry to target, at the best price seen since publication`}
        />
      ) : null}
      <Text className="mt-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
        {verdict.detail}
        {verdict.stale ? ' The latest price is stale.' : ''}
      </Text>
      {note ? (
        <Text
          className={cn(
            'mt-1 text-[11px]',
            note.tone === 'warning'
              ? 'text-danger-600 dark:text-danger-dark'
              : 'text-ink-faint dark:text-ink-dark-faint',
          )}
        >
          {note.text}
        </Text>
      ) : null}
    </View>
  );
}

function Level({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <View className="flex-1" accessible accessibilityLabel={`${label} ${value}`}>
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      <Text
        className={cn('mt-0.5 text-xs font-semibold', className)}
        style={numbers}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      {children}
    </View>
  );
}

/** One published strong pick: identity, live watch, levels, evidence and what would break it. */
export const StrongPickCard = memo(function StrongPickCard({ pick }: { pick: StrongPick }) {
  const router = useRouter();
  const { colors } = useTheme();
  const open = () => router.push(stockHref(pick.symbol, pick.exchange));
  const entry =
    pick.entryLow !== null && pick.entryHigh !== null
      ? `${formatINR(pick.entryLow)} – ${formatINR(pick.entryHigh)}`
      : formatINR(pick.entryLow ?? pick.entryHigh);

  return (
    <View
      className={cn(
        'rounded-card border border-l-4 border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark',
        STRUCTURE_ACCENT[pick.structure],
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Rank ${pick.rank}, ${pick.name || pick.symbol}. Open stock`}
        onPress={open}
        className="flex-row items-center gap-3 active:opacity-70"
      >
        <StockLogo symbol={pick.symbol} uri={stockLogoUrl(pick.symbol)} />
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
            {pick.symbol}
          </Text>
          {pick.name ? (
            <Text
              className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
              numberOfLines={1}
            >
              {pick.name} · {pick.exchange}
            </Text>
          ) : null}
        </View>
        <View className="rounded-full bg-surface-sunk px-2.5 py-1 dark:bg-surface-sunk-dark">
          <Text className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
            #{pick.rank}
          </Text>
        </View>
      </Pressable>

      <SegmentChips pick={pick} />
      <MonitorStrip pick={pick} />

      <View className="mt-3 flex-row gap-2 rounded-xl bg-surface-sunk p-3 dark:bg-surface-sunk-dark">
        <Level label="Entry" value={entry} className="text-ink dark:text-ink-dark" />
        <Level
          label="Target"
          value={formatINR(pick.targetPrice)}
          className="text-brand-text dark:text-brand-text-dark"
        />
        <Level
          label="Stop"
          value={formatINR(pick.stopPrice)}
          className="text-danger-600 dark:text-danger-dark"
        />
      </View>

      <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-2">
        <Fact label="Reward:risk">
          <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={numbers}>
            {formatRewardRisk(pick.rewardRisk)}
          </Text>
        </Fact>
        {pick.winProbability === null ? (
          <Fact label="AI setup score">
            <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={numbers}>
              {pick.modelSetupScore}
            </Text>
          </Fact>
        ) : (
          <Fact label="Calibrated win rate">
            <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={numbers}>
              {pick.winProbability}%
            </Text>
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
              n={pick.probabilitySampleSize}
            </Text>
          </Fact>
        )}
        <Fact label="Conviction">
          <ConvictionBars value={pick.conviction} />
        </Fact>
        {pick.atr !== null ? (
          <Fact label="ATR">
            <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={numbers}>
              {formatINR(pick.atr)}
            </Text>
            {pick.stopClamped !== 'none' ? (
              <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                stop {pick.stopClamped === 'widened-to-min' ? 'widened' : 'tightened'}
              </Text>
            ) : null}
          </Fact>
        ) : null}
      </View>

      <View className="mt-3 rounded-xl bg-info-wash p-3 dark:bg-info-wash-dark">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="text-xs font-semibold text-info dark:text-info-dark">
            {STRUCTURE_LABEL[pick.structure]}
          </Text>
          {pick.openMovePct !== null ? (
            <ChangeText value={pick.openMovePct} className="text-xs" style={numbers}>
              {formatSignedPercent(pick.openMovePct)} in the first 15 min
            </ChangeText>
          ) : null}
        </View>
        <Text className="mt-1.5 text-xs leading-[17px] text-ink dark:text-ink-dark">
          {pick.observationSummary}
        </Text>
        {pick.source ? (
          <Text className="mt-1 text-[11px] text-ink-muted dark:text-ink-dark-muted">
            Source: {pick.source}
          </Text>
        ) : null}
      </View>

      <Text className="mt-3 text-[13px] leading-[20px] text-ink dark:text-ink-dark">
        {pick.rationale}
      </Text>

      {pick.invalidation ? (
        <View className="mt-3 rounded-xl bg-danger-wash p-3 dark:bg-danger-wash-dark">
          <View className="flex-row items-center gap-1.5">
            <Flag size={13} color={colors.danger} />
            <Text className="text-xs font-semibold text-danger-600 dark:text-danger-dark">
              What would prove this wrong
            </Text>
          </View>
          <Text className="mt-1.5 text-xs leading-[17px] text-ink dark:text-ink-dark">
            {pick.invalidation}
          </Text>
          <Text className="mt-1 text-[11px] text-ink-muted dark:text-ink-dark-muted">
            Nothing watches this automatically — the monitor tracks the target and stop only.
          </Text>
        </View>
      ) : null}

      {pick.caveat ? (
        <Text className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          {pick.caveat}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={open}
        hitSlop={6}
        className="mt-3 flex-row items-center gap-1 self-start active:opacity-60"
      >
        <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
          View {pick.symbol}
        </Text>
        <ChevronRight size={15} color={colors.link} />
      </Pressable>
    </View>
  );
});
