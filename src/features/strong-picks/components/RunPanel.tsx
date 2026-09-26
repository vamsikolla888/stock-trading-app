import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatGrid } from '@/components/ui/StatGrid';
import { formatIstWeekdayTime, formatSessionDay } from '@/features/home/lib/istTime';
import { formatNumber } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { groupRejections } from '../lib/strongPicks';
import type { StrongPicksResponse } from '../types';

function SubHeading({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted">
      {children}
    </Text>
  );
}

/**
 * What the 09:30 pass did on a day with nothing to show. The verdict is the server's own
 * sentence, rendered verbatim — this screen never guesses why a morning was empty.
 */
export function RunPanel({
  data,
  onOpenRecommendations,
  onShowDate,
}: {
  data: StrongPicksResponse;
  onOpenRecommendations: () => void;
  onShowDate: (date: string) => void;
}) {
  const { colors } = useTheme();
  const [showDropped, setShowDropped] = useState(false);
  const { run, lastPublished } = data;
  const notRun = run.status === 'not-run-yet';
  const next = formatIstWeekdayTime(data.nextRunAt);
  const groups = groupRejections(run.rejections);
  const Chevron = showDropped ? ChevronUp : ChevronDown;

  return (
    <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge
          label={notRun ? 'Not run yet' : 'Nothing published'}
          variant={notRun ? 'neutral' : 'warning'}
        />
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          {formatSessionDay(data.date)}
        </Text>
      </View>

      <Text className="mt-3 text-[14px] leading-[21px] text-ink dark:text-ink-dark">
        {run.verdict}
      </Text>
      {next ? (
        <Text className="mt-2 text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Next review {next} IST.
        </Text>
      ) : null}

      {!notRun ? (
        <View className="mt-4">
          <StatGrid
            stats={[
              { label: 'Checked at the open', value: formatNumber(run.considered, 0) },
              { label: 'Survived the open', value: formatNumber(run.survivedOpen, 0) },
              { label: 'Ranked', value: formatNumber(run.reachedModel, 0) },
              { label: 'Published', value: formatNumber(run.published, 0) },
            ]}
          />
        </View>
      ) : null}

      {run.consideredBySource.length > 0 ? (
        <Text className="mt-3 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          Candidates offered:{' '}
          {run.consideredBySource.map((source) => `${source.source} ${source.count}`).join(' · ')}
        </Text>
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

      <View className="mt-4 gap-2.5">
        <Button
          label="See today’s recommendations"
          variant="outline"
          size="sm"
          onPress={onOpenRecommendations}
        />
        {lastPublished ? (
          <Button
            label={`Last published: ${formatSessionDay(lastPublished.date)} (${lastPublished.count})`}
            variant="link"
            onPress={() => onShowDate(lastPublished.date)}
          />
        ) : null}
      </View>
    </View>
  );
}
