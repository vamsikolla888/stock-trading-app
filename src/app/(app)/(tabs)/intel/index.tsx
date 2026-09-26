import { useRouter } from 'expo-router';
import Gauge from 'lucide-react-native/icons/gauge';
import ScanSearch from 'lucide-react-native/icons/scan-search';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { MenuRow } from '@/components/ui/MenuRow';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { Chips, SegmentedControl } from '@/components/ui/Tabs';
import { useTodayPicks } from '@/features/insights/api';
import { formatDayKey } from '@/features/insights/lib/dates';
import type { Recommendation } from '@/features/insights/types';
import {
  useGeneratePreMarket,
  useRecommendationHistory,
  useRecommendationsByDate,
} from '@/features/recommendations/api';
import { PickCard } from '@/features/recommendations/components/PickCard';
import {
  countBySource,
  reviewFor,
  SOURCE_LABEL,
  sourceOf,
  type PickSource,
} from '@/features/recommendations/lib/picks';
import { toast } from '@/lib/utils/toast';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const EMPTY: Recommendation[] = [];
const CURRENT = 'current';

/**
 * The day's research setups — evidence-backed candidates, never promises or instructions.
 * "Current" is the standing batch (the server resolves which day that is — Friday's picks
 * stay live over a weekend); the other chips are the last week's batches by date.
 */
export default function RecommendationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const [source, setSource] = useState<PickSource>('news');
  const [day, setDay] = useState<string>(CURRENT);

  const current = useTodayPicks();
  const history = useRecommendationHistory(7);
  const isCurrent = day === CURRENT;
  const past = useRecommendationsByDate(isCurrent ? null : day);
  const selected = isCurrent ? current : past;
  const data = selected.data;
  const preMarket = useGeneratePreMarket();

  const allPicks = data?.recommendations ?? EMPTY;
  const counts = useMemo(() => countBySource(allPicks), [allPicks]);
  const picks = useMemo(
    () => allPicks.filter((pick) => sourceOf(pick) === source),
    [allPicks, source],
  );
  const reviews = isCurrent ? current.data?.reviews : undefined;
  const session = isCurrent ? current.data?.session : undefined;

  // Day 0 of the history is today; "Current" stands in for it, since the standing batch may
  // be an earlier day's (a weekend shows Friday's).
  const dayChips = useMemo(
    () => [
      { key: CURRENT, label: 'Current' },
      ...(history.data ?? []).slice(1).map((entry) => ({
        key: entry.date,
        label: formatDayKey(entry.date, { weekday: 'short', day: 'numeric', month: 'short' }),
      })),
    ],
    [history.data],
  );

  const sources = useMemo(
    () =>
      (['news', 'historical'] as const).map((key) => ({
        key,
        label: `${SOURCE_LABEL[key]} · ${counts[key]}`,
      })),
    [counts],
  );

  const refresh = useCallback(
    () => Promise.all([current.refetch(), history.refetch(), isCurrent ? null : past.refetch()]),
    [current, history, past, isCurrent],
  );

  const confirmPreMarket = () =>
    Alert.alert(
      'Run the pre-market scan?',
      'Queues the technical and liquidity picker over the entire eligible universe — the run that is normally scheduled for 08:15 IST.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run scan',
          onPress: () =>
            preMarket.mutate(undefined, {
              onSuccess: () =>
                toast.success('Pre-market scan queued', 'New setups appear here when it finishes.'),
              onError: (error) =>
                toast.error("Couldn't queue the pre-market scan", getErrorMessage(error)),
            }),
        },
      ],
    );

  const shownDate = data?.date ?? (isCurrent ? null : day);
  const intro = shownDate
    ? `Research setups · ${formatDayKey(shownDate, { weekday: 'long', day: 'numeric', month: 'long' })}`
    : 'Research setups from news and the pre-market scan';

  return (
    <GroupScreen intro={intro} onRefresh={refresh}>
      {session && session.kind !== 'CURRENT' && session.label ? (
        <Banner tone="info" message={session.label} className="mb-4" />
      ) : null}

      <SegmentedControl items={sources} value={source} onChange={setSource} />
      {history.data && history.data.length > 1 ? (
        <Chips items={dayChips} value={day} onChange={setDay} className="mt-3" />
      ) : null}

      <View className="mt-5">
        {selected.isPending ? (
          <ListSkeleton rows={3} />
        ) : selected.error && !data ? (
          <InlineError
            what="recommendations"
            error={selected.error}
            onRetry={() => void selected.refetch()}
          />
        ) : picks.length === 0 ? (
          <InlineEmpty
            title={`No ${SOURCE_LABEL[source].toLowerCase()} setups`}
            message={
              allPicks.length > 0
                ? `This batch has ${allPicks.length} ${source === 'news' ? 'pre-market' : 'news'} setup${allPicks.length === 1 ? '' : 's'} instead.`
                : (data?.reason ??
                  'No stock cleared every condition. Try another day, or check back after the next run.')
            }
          />
        ) : (
          <View className="gap-3">
            {picks.map((pick) => (
              <PickCard
                key={`${pick.exch}:${pick.sym}`}
                pick={pick}
                review={reviewFor(reviews, pick)}
              />
            ))}
          </View>
        )}
      </View>

      <Text className="mt-4 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
        {source === 'news'
          ? 'News setups rest on a story, checked against price and volume.'
          : 'Pre-market setups come from the overnight full-universe scan and rest on price and volume alone — no story behind them.'}{' '}
        The score ranks setups against each other; it is not a probability of profit.
      </Text>

      {isAdmin ? (
        <Section title="Admin">
          <ListCard>
            <MenuRow
              Icon={ScanSearch}
              iconTone="violet"
              title="Run pre-market scan"
              subtitle="Scans the entire eligible universe"
              onPress={() => {
                if (!preMarket.isPending) confirmPreMarket();
              }}
              right={
                preMarket.isPending ? (
                  <ActivityIndicator size="small" color={colors.link} />
                ) : undefined
              }
            />
            <RowDivider />
            <MenuRow
              Icon={Gauge}
              iconTone="blue"
              title="Recommendations admin"
              subtitle="Review, publish and engine settings"
              onPress={() => router.push('/recommendations-admin')}
            />
          </ListCard>
        </Section>
      ) : null}

      <Text className="mt-6 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Not investment advice — review before acting. No order is ever placed for you.
      </Text>
    </GroupScreen>
  );
}
