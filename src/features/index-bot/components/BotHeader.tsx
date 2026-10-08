import React from 'react';
import { Text, View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { relativeTime } from '@/features/settings/lib/time';
import { useNow } from '@/hooks/useNow';
import { isMarketOpen } from '@/lib/utils/market';

import { botHeadline } from '../lib/view';
import type { IndexOverview } from '../types';

/**
 * The bot at a glance above the tabs: paper or live, armed or off, whether the market is open, how
 * often it analyses and when it last did. Hidden (not an error) until the overview answers — each
 * tab reports its own failure.
 */
export function BotHeader({
  data,
  loading,
}: {
  data: IndexOverview | undefined;
  loading: boolean;
}) {
  const now = useNow();
  if (!data) {
    return loading ? (
      <View className="mb-3 gap-2">
        <Skeleton width={220} height={22} rounded="full" />
        <Skeleton width="70%" height={12} />
      </View>
    ) : null;
  }
  const headline = botHeadline(data.settings);
  const open = isMarketOpen(new Date(now));
  const cadence = data.settings.cadenceMinutes;
  return (
    <View className="mb-3 gap-1.5">
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusPill tone={headline.tone} label={headline.label} />
        <StatusPill tone={open ? 'ok' : 'neutral'} label={open ? 'Market open' : 'Market closed'} />
      </View>
      <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
        {[
          cadence ? `Every ${cadence} min` : null,
          '09:30–14:15 IST',
          data.latestRun ? `last scan ${relativeTime(data.latestRun.at, now)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </View>
  );
}
