import { useRouter } from 'expo-router';
import Flag from 'lucide-react-native/icons/flag';
import Newspaper from 'lucide-react-native/icons/newspaper';
import Radar from 'lucide-react-native/icons/radar';
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { IconComponent } from '@/components/ui/icon';
import { IconTile, type IconTone } from '@/components/ui/IconTile';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { useScreeners } from '@/features/market/hooks';
import { useNewsRuns } from '@/features/news/hooks';
import { useStrongPicksFor } from '@/features/strong-picks/hooks';
import { useNow } from '@/hooks/useNow';

import { buildActivity, type ActivityKind } from '../lib/activity';
import { formatIstDate, formatIstTime, istDayKey } from '../lib/istTime';

const KIND: Record<
  ActivityKind,
  { Icon: IconComponent; tone: IconTone; href: '/intel/screeners' | '/news' | '/strong-picks' }
> = {
  screeners: { Icon: Radar, tone: 'blue', href: '/intel/screeners' },
  news: { Icon: Newspaper, tone: 'amber', href: '/news' },
  'strong-picks': { Icon: Flag, tone: 'green', href: '/strong-picks' },
};

/** Today's rows read as a time, older ones as a date (IST). */
function whenLabel(at: number, now: number): string {
  return istDayKey(at) === istDayKey(now) ? (formatIstTime(at) ?? '') : (formatIstDate(at) ?? '');
}

/**
 * What ran behind the scenes today — screener scans, news ingestion and the strong-picks
 * pass. Every row is a real, timestamped record; nothing is shown when there are none.
 */
export function MarketActivity() {
  const router = useRouter();
  const now = useNow();
  const screeners = useScreeners();
  const newsRuns = useNewsRuns(3);
  // No polling from here: the Strong picks screen owns the live refresh.
  const strongPicks = useStrongPicksFor(null, { poll: false });

  const items = useMemo(
    () =>
      buildActivity({
        screeners: screeners.data,
        newsRuns: newsRuns.data?.runs,
        strongPickRun: strongPicks.data?.run,
      }),
    [screeners.data, newsRuns.data, strongPicks.data],
  );

  if (items.length === 0) return null;

  return (
    <Section title="Market activity" note="IST">
      <ListCard>
        {items.map((item, index) => {
          const { Icon, tone, href } = KIND[item.kind];
          const when = whenLabel(item.at, now);
          return (
            <View key={item.id}>
              {index > 0 ? <RowDivider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.detail}, ${when}`}
                onPress={() => router.push(href)}
                className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <IconTile Icon={Icon} tone={tone} size="sm" />
                <View className="min-w-0 flex-1">
                  <Text
                    className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text
                    className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
                    numberOfLines={2}
                  >
                    {item.detail}
                  </Text>
                </View>
                <Text
                  className="text-[11px] text-ink-faint dark:text-ink-dark-faint"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {when}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ListCard>
    </Section>
  );
}
