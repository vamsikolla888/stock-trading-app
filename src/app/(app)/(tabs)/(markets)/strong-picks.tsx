import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Chips } from '@/components/ui/Tabs';
import { ModalSheet } from '@/features/home/components/ModalSheet';
import { formatIstTime, formatSessionDay } from '@/features/home/lib/istTime';
import { RunPanel } from '@/features/strong-picks/components/RunPanel';
import { StrongPickCard } from '@/features/strong-picks/components/StrongPickCard';
import { useStrongPicksFor } from '@/features/strong-picks/hooks';
import {
  filterBySegment,
  SEGMENT_FILTERS,
  type SegmentFilter,
} from '@/features/strong-picks/lib/strongPicks';

function AboutSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const paragraphs = [
    'The overnight batch is built before the market opens. At 09:30 every candidate is re-measured against the first fifteen minutes of real trading.',
    'Anything that gapped through its level, faded on no volume, or already ran is dropped. At most five survivors are published.',
    'Entry, target and stop are derived from that window and each stock’s own ATR — they are not the pre-open levels. Each published pick is then watched once a minute.',
    'A morning that produces none is a normal morning, and this screen says which kind of morning it was.',
  ];
  return (
    <ModalSheet visible={visible} title="How strong picks work" onClose={onClose}>
      {paragraphs.map((text) => (
        <Text key={text} className="mb-3 text-[14px] leading-[21px] text-ink dark:text-ink-dark">
          {text}
        </Text>
      ))}
    </ModalSheet>
  );
}

/**
 * What survived the open, and what it has done since. Picks come with the server's live
 * watch; an empty morning shows the 09:30 pass's own verdict instead of a guessed reason.
 */
export default function StrongPicksScreen() {
  const router = useRouter();
  const [date, setDate] = useState<string | null>(null);
  const [segment, setSegment] = useState<SegmentFilter>('all');
  const [aboutOpen, setAboutOpen] = useState(false);
  const query = useStrongPicksFor(date);
  const data = query.data;
  const picks = useMemo(() => data?.picks ?? [], [data]);
  const filtered = useMemo(() => filterBySegment(picks, segment), [picks, segment]);

  const reviewed = data?.generatedAt ? formatIstTime(data.generatedAt) : null;
  const intro = data
    ? [
        formatSessionDay(data.date),
        reviewed ? `reviewed ${reviewed} IST` : null,
        data.marketOpen ? null : 'market closed',
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Re-checked against the first 15 minutes of trading';

  let body: React.ReactNode;
  if (query.isPending) {
    body = <ListSkeleton rows={3} />;
  } else if (query.error && !data) {
    body = (
      <InlineError what="strong picks" error={query.error} onRetry={() => void query.refetch()} />
    );
  } else if (data && picks.length === 0) {
    body = (
      <RunPanel
        data={data}
        onOpenRecommendations={() => router.push('/intel')}
        onShowDate={(next) => {
          setSegment('all');
          setDate(next);
        }}
      />
    );
  } else {
    body = (
      <>
        <Chips items={SEGMENT_FILTERS} value={segment} onChange={setSegment} className="mb-4" />
        {filtered.length === 0 ? (
          <InlineEmpty
            title="None suit this segment"
            message="No published pick is suitable for this segment on this day."
            action={{ label: 'Show all picks', onPress: () => setSegment('all') }}
          />
        ) : (
          <View className="gap-4">
            {filtered.map((pick) => (
              <StrongPickCard key={`${pick.exchange}:${pick.symbol}`} pick={pick} />
            ))}
          </View>
        )}
      </>
    );
  }

  return (
    <GroupScreen
      intro={intro}
      onRefresh={query.refetch}
      right={
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setAboutOpen(true)}
          className="active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            How it works
          </Text>
        </Pressable>
      }
    >
      {date ? (
        <Banner
          className="mb-4"
          tone="info"
          title={`Showing ${formatSessionDay(date)}`}
          message="A past morning’s picks. Their levels describe that session only — not today."
          action={{ label: 'Back to today', onPress: () => setDate(null) }}
        />
      ) : null}

      {body}

      {data ? (
        <View className="mt-7 gap-2">
          {data.caveats.map((caveat) => (
            <Text
              key={caveat}
              className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
            >
              {caveat}
            </Text>
          ))}
          <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            The F&O flag is exact, from the NSE instrument master. Intraday is inferred from daily
            turnover and range — it means “not obviously futile”, not “tested intraday”. Tap a
            pick’s segments for the numbers behind them. Not investment advice.
          </Text>
        </View>
      ) : null}

      <AboutSheet visible={aboutOpen} onClose={() => setAboutOpen(false)} />
    </GroupScreen>
  );
}
