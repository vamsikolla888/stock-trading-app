import MoreHorizontal from 'lucide-react-native/icons/ellipsis';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Meter } from '@/components/ui/Meter';
import { formatAsOf } from '@/features/portfolio/lib/dates';
import { cn } from '@/lib/utils/cn';
import { formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import type { WatchlistAiSummary, WatchlistView } from '../types';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-1 rounded-xl bg-surface-sunk px-3 py-2.5 dark:bg-surface-sunk-dark">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-ink-dark-faint">
        {label}
      </Text>
      {children}
    </View>
  );
}

/**
 * The list's name, freshness and headline. "Since added" is the SERVER's equal-weighted
 * mean over every measurable row — the same amount in each stock, no costs — so it reads
 * as a list statistic, not as money. Unmeasurable rows are excluded, never counted flat.
 */
export function WatchlistSummaryCard({
  view,
  now,
  onMenu,
}: {
  view: WatchlistView;
  now: number;
  /** The list's actions (rename, share, delete). */
  onMenu: () => void;
}) {
  const { colors } = useTheme();
  const summary = view.summary;
  const unmeasured = summary.unmeasuredCount ?? summary.totalCount - summary.measuredCount;
  const measured = Math.max(1, summary.measuredCount);

  return (
    <Card>
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text
              className="flex-shrink text-[17px] font-bold text-ink dark:text-ink-dark"
              numberOfLines={1}
            >
              {view.name}
            </Text>
            <Badge
              label={`${summary.totalCount} ${summary.totalCount === 1 ? 'stock' : 'stocks'}`}
              variant="primary"
            />
          </View>
          <Text className="mt-0.5 text-xs text-ink-faint dark:text-ink-dark-faint">
            {view.readOnly ? 'Updated by the daily AI batch' : 'Your list'}
            {view.pricesAsOf ? ` · prices as of ${formatAsOf(view.pricesAsOf, now)}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${view.name} options`}
          hitSlop={10}
          onPress={onMenu}
          className="h-8 w-8 items-center justify-center rounded-full bg-surface-sunk active:opacity-70 dark:bg-surface-sunk-dark"
        >
          <MoreHorizontal size={18} color={colors.text} />
        </Pressable>
      </View>

      {summary.totalCount > 0 ? (
        <>
          <View className="mt-4 flex-row gap-2.5">
            <Tile label="Since added">
              <ChangeText
                value={summary.avgChangeSinceAddPct}
                className="mt-1 text-[18px] font-bold"
                style={NUMBERS}
              >
                {formatSignedPercent(summary.avgChangeSinceAddPct)}
              </ChangeText>
              <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                equal-weighted · {summary.measuredCount} of {summary.totalCount}
              </Text>
            </Tile>
            <Tile label="Today">
              <ChangeText
                value={summary.avgChangeTodayPct}
                className="mt-1 text-[18px] font-bold"
                style={NUMBERS}
              >
                {formatSignedPercent(summary.avgChangeTodayPct)}
              </ChangeText>
              <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                {summary.todayMeasuredCount ?? summary.measuredCount} of {summary.totalCount}
              </Text>
            </Tile>
          </View>
          <View className="mt-2.5 flex-row gap-2.5">
            <Tile label="Up / down">
              <Text
                className="mt-1 text-[18px] font-bold text-ink dark:text-ink-dark"
                style={NUMBERS}
              >
                {summary.winners}
                <Text className="text-[13px] font-normal text-ink-faint dark:text-ink-dark-faint">
                  {' '}
                  / {summary.losers}
                </Text>
              </Text>
              <View
                accessible
                accessibilityLabel={`${summary.winners} up, ${summary.losers} down since added`}
                className="mt-1.5 h-1.5 flex-row overflow-hidden rounded-full bg-line dark:bg-line-dark"
              >
                <View
                  className="h-full bg-brand-strong dark:bg-brand-strong-dark"
                  style={{ width: `${(summary.winners / measured) * 100}%` }}
                />
                <View
                  className="h-full bg-danger-500 dark:bg-danger-dark"
                  style={{ width: `${(summary.losers / measured) * 100}%` }}
                />
              </View>
            </Tile>
            <Tile label="Best / worst">
              <BestWorst item={summary.best} />
              <BestWorst item={summary.worst} />
            </Tile>
          </View>
          {unmeasured > 0 ? (
            <Text className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
              {unmeasured} not measurable — no price at one end, so left out of the averages rather
              than counted as flat.
            </Text>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function BestWorst({ item }: { item: { symbol: string; changePct: number } | null | undefined }) {
  return (
    <View className="mt-1 flex-row items-center justify-between gap-2">
      <Text
        className="flex-shrink text-xs font-semibold text-ink dark:text-ink-dark"
        numberOfLines={1}
      >
        {item?.symbol ?? '—'}
      </Text>
      {item ? (
        <ChangeText value={item.changePct} className="text-xs" style={NUMBERS}>
          {formatSignedPercent(item.changePct)}
        </ChangeText>
      ) : null}
    </View>
  );
}

const REVIEW_FILL: Record<string, string> = {
  CONFIRM: 'bg-brand-strong dark:bg-brand-strong-dark',
  TRIM: 'bg-warning-500 dark:bg-warning-dark',
  DROP: 'bg-danger-500 dark:bg-danger-dark',
};
const NOT_REVIEWED_FILL = 'bg-line-strong dark:bg-line-dark-strong';

/**
 * The AI layer of the recommendations list — only figures that exist. Scores are MODEL
 * scores out of 100, drawn on a 0–100 track so they can't be read as a probability; the
 * review split draws "not reviewed" as its own segment, because it is the majority state
 * and would otherwise read as a confirmation.
 */
export function AiPulseCard({
  ai,
  newestFlagDate,
}: {
  ai: WatchlistAiSummary;
  newestFlagDate: string | null;
}) {
  const reviewTotal = ai.reviewBreakdown.reduce((sum, row) => sum + row.count, 0) || 1;

  return (
    <Card>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[15px] font-bold text-ink dark:text-ink-dark">AI signal pulse</Text>
        <Badge label={`${ai.scoredCount} scored`} />
      </View>

      <View className="mt-3 flex-row items-baseline justify-between">
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Average composite score
        </Text>
        <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUMBERS}>
          {ai.avgCompositeScore !== null ? `${ai.avgCompositeScore} / 100` : '—'}
        </Text>
      </View>
      <Meter
        className="mt-1.5"
        value={ai.avgCompositeScore}
        accessibilityLabel={`Average composite score ${ai.avgCompositeScore ?? 'unknown'} out of 100`}
      />
      <View className="mt-1.5 flex-row justify-between">
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUMBERS}>
          Technical {ai.avgTechnicalScore ?? '—'}
        </Text>
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUMBERS}>
          News sentiment {ai.avgNewsSentimentScore ?? '—'}
        </Text>
      </View>

      <Text className="mt-4 text-[13px] text-ink-muted dark:text-ink-dark-muted">
        Independent review
      </Text>
      <View
        accessible
        accessibilityLabel={ai.reviewBreakdown.map((row) => `${row.label} ${row.count}`).join(', ')}
        className="mt-1.5 h-1.5 flex-row overflow-hidden rounded-full bg-line dark:bg-line-dark"
      >
        {ai.reviewBreakdown.map((row) => (
          <View
            key={row.label}
            className={cn('h-full', REVIEW_FILL[row.label] ?? NOT_REVIEWED_FILL)}
            style={{ width: `${(row.count / reviewTotal) * 100}%` }}
          />
        ))}
      </View>
      <View className="mt-2 flex-row flex-wrap gap-x-3 gap-y-1">
        {ai.reviewBreakdown.map((row) => (
          <View key={row.label} className="flex-row items-center gap-1.5">
            <View
              className={cn('h-2 w-2 rounded-full', REVIEW_FILL[row.label] ?? NOT_REVIEWED_FILL)}
            />
            <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" style={NUMBERS}>
              {row.label} {row.count}
            </Text>
          </View>
        ))}
      </View>

      <View className="mt-4 flex-row gap-2.5">
        <Tile label="Top sector">
          <Text
            className="mt-1 text-[13px] font-semibold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {ai.topSector?.label ?? '—'}
          </Text>
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
            {ai.topSector ? `${ai.topSector.count} of ${ai.scoredCount}` : 'none resolved'}
          </Text>
        </Tile>
        <Tile label="Suggested hold">
          <Text
            className="mt-1 text-[13px] font-semibold text-ink dark:text-ink-dark"
            style={NUMBERS}
          >
            {ai.avgHoldingPeriodDays !== null ? `${ai.avgHoldingPeriodDays} days` : '—'}
          </Text>
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
            the model's own estimate
          </Text>
        </Tile>
      </View>

      <Text className="mt-3 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
        <Text className="font-semibold text-ink dark:text-ink-dark">{ai.flaggedToday}</Text> flagged
        for the first time{newestFlagDate ? ` on ${newestFlagDate}` : ' in the latest batch'} ·{' '}
        <Text className="font-semibold text-ink dark:text-ink-dark">{ai.repeatFlagged}</Text>{' '}
        flagged on more than one day.
      </Text>
      <Text className="mt-2 border-t border-line pt-2 text-[11px] leading-4 text-ink-faint dark:border-line-dark dark:text-ink-dark-faint">
        {ai.scoreCaveat}
      </Text>
    </Card>
  );
}
