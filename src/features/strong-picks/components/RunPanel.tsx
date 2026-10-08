import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Meter } from '@/components/ui/Meter';
import { formatIstTime, formatIstWeekdayTime, formatSessionDay } from '@/features/home/lib/istTime';
import { formatNumber } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { dayName } from '../lib/picksView';
import { groupRejections } from '../lib/strongPicks';
import type { StrongPicksResponse } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };

function SubHeading({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted">
      {children}
    </Text>
  );
}

export interface ReviewActions {
  onReview: () => void;
  reviewBusy: boolean;
  onSweep: () => void;
  sweepBusy: boolean;
}

/**
 * What the 09:30 pass did. On a day with nothing to show (`empty`) it is the day's answer — the
 * server's own verdict, verbatim, never a guessed reason — with the way to the last day that
 * published. On a day that published (`summary`) it closes the page: how the list was made, the
 * funnel, where candidates came from and why each dropped one was dropped.
 */
export function RunPanel({
  data,
  isToday,
  mode,
  onOpenRecommendations,
  onShowDate,
  actions,
}: {
  data: StrongPicksResponse;
  isToday: boolean;
  mode: 'empty' | 'summary';
  onOpenRecommendations?: () => void;
  onShowDate?: (date: string) => void;
  /** Admin, today only: re-run the review, sample prices now. */
  actions?: ReviewActions;
}) {
  const { colors } = useTheme();
  const [showDropped, setShowDropped] = useState(false);
  const { run, lastPublished } = data;
  const notRun = run.status === 'not-run-yet';
  const next = isToday ? formatIstWeekdayTime(data.nextRunAt) : null;
  const reviewed = run.finishedAt ? formatIstTime(run.finishedAt) : null;
  const groups = groupRejections(run.rejections);
  const Chevron = showDropped ? ChevronUp : ChevronDown;
  const top = Math.max(1, run.considered);
  const steps = [
    { label: 'Checked at the open', value: run.considered },
    { label: 'Survived the first 15 minutes', value: run.survivedOpen },
    { label: 'Re-analysed by the AI review', value: run.reachedModel },
    { label: 'Published', value: run.published },
  ];

  return (
    <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      {mode === 'empty' ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge
            label={
              notRun ? (isToday ? 'Not reviewed yet' : 'No review this day') : 'Nothing published'
            }
            variant={notRun ? 'neutral' : 'warning'}
          />
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            {formatSessionDay(data.date)}
          </Text>
        </View>
      ) : (
        <View className="flex-row flex-wrap items-baseline gap-x-2">
          <Text
            accessibilityRole="header"
            className="text-[15px] font-semibold text-ink dark:text-ink-dark"
          >
            {isToday ? 'How today’s list was made' : `How the ${dayName(data.date)} list was made`}
          </Text>
          {reviewed ? (
            <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
              reviewed {reviewed} IST
            </Text>
          ) : null}
        </View>
      )}

      {run.verdict ? (
        <Text className="mt-3 text-[14px] leading-[21px] text-ink dark:text-ink-dark">
          {run.verdict}
        </Text>
      ) : null}
      {next && mode === 'empty' ? (
        <Text className="mt-2 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Next review {next} IST.
        </Text>
      ) : null}

      {!notRun ? (
        <View className="mt-4 gap-2.5">
          {steps.map((step) => (
            <View key={step.label} accessible accessibilityLabel={`${step.label}: ${step.value}`}>
              <View className="mb-1 flex-row items-baseline gap-2">
                <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted">
                  {step.label}
                </Text>
                <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={NUM}>
                  {formatNumber(step.value, 0)}
                </Text>
              </View>
              <Meter value={(step.value / top) * 100} tone="neutral" height={4} />
            </View>
          ))}
        </View>
      ) : null}

      {run.consideredBySource.length > 0 ? (
        <>
          <SubHeading>Where candidates came from</SubHeading>
          {run.consideredBySource.map((source) => (
            <View key={source.source} className="flex-row items-baseline gap-2 py-0.5">
              <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted">
                {source.source}
              </Text>
              <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={NUM}>
                {formatNumber(source.count, 0)}
              </Text>
            </View>
          ))}
        </>
      ) : null}

      {run.unavailableSources.length > 0 ? (
        <View>
          <SubHeading>Sources not consulted</SubHeading>
          {run.unavailableSources.map((source) => (
            <Text
              key={source.source}
              className="mb-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
            >
              <Text className="font-semibold text-ink dark:text-ink-dark">{source.source}</Text>
              {` — ${source.reason}`}
            </Text>
          ))}
        </View>
      ) : null}

      {groups.length > 0 ? (
        <View className="mt-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDropped }}
            onPress={() => setShowDropped((value) => !value)}
            className="flex-row items-center justify-between py-2 active:opacity-60"
          >
            <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
              Why each candidate was dropped ({run.rejections.length})
            </Text>
            <Chevron size={18} color={colors.textMuted} />
          </Pressable>
          {showDropped
            ? groups.map((group) => (
                <View key={group.stage}>
                  <SubHeading>{`${group.label} · ${group.items.length}`}</SubHeading>
                  {group.items.map((item, index) => (
                    <Text
                      key={`${item.exchange}:${item.symbol}:${index}`}
                      className="mb-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
                    >
                      <Text className="font-semibold text-ink dark:text-ink-dark">
                        {item.symbol}
                      </Text>
                      {` — ${item.reason}`}
                    </Text>
                  ))}
                </View>
              ))
            : null}
        </View>
      ) : null}

      {mode === 'empty' && (onOpenRecommendations || (lastPublished && onShowDate)) ? (
        <View className="mt-4 gap-2.5">
          {onOpenRecommendations ? (
            <Button
              label="See today’s recommendations"
              variant="outline"
              size="sm"
              onPress={onOpenRecommendations}
            />
          ) : null}
          {isToday && lastPublished && onShowDate ? (
            <Button
              label={`Last published: ${formatSessionDay(lastPublished.date)} (${lastPublished.count})`}
              variant="link"
              onPress={() => onShowDate(lastPublished.date)}
            />
          ) : null}
        </View>
      ) : null}

      {actions && isToday ? (
        <View className="mt-4 flex-row gap-2.5 border-t border-line pt-3 dark:border-line-dark">
          <Button
            label="Sample prices now"
            size="sm"
            variant="secondary"
            className="flex-1"
            loading={actions.sweepBusy}
            onPress={actions.onSweep}
          />
          <Button
            label="Run review now"
            size="sm"
            variant="outline"
            className="flex-1"
            loading={actions.reviewBusy}
            onPress={actions.onReview}
          />
        </View>
      ) : null}
    </View>
  );
}
