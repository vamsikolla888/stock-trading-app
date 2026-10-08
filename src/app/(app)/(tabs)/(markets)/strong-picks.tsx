import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Chips, SegmentedControl } from '@/components/ui/Tabs';
import { ModalSheet } from '@/features/home/components/ModalSheet';
import { formatIstTime } from '@/features/home/lib/istTime';
import { confirmAction } from '@/features/settings/lib/confirm';
import { ScanTab } from '@/features/strategies/components/house/ScanTab';
import { houseKeys, useHouseStrategy, useRunHouseScan } from '@/features/strategies/hooks';
import { adminActionError, houseJobMessage } from '@/features/strategies/lib/houseView';
import { SWING_KEY } from '@/features/strategies/types';
import { DayStrip } from '@/features/strong-picks/components/DayStrip';
import { PicksView, RegimeStrip } from '@/features/strong-picks/components/PicksView';
import { ResultsView } from '@/features/strong-picks/components/ResultsView';
import type { ReviewActions } from '@/features/strong-picks/components/RunPanel';
import {
  strongPickKeys,
  useGenerateStrongPicks,
  useStrongPickAnalytics,
  useStrongPicksFor,
  useSweepStrongPickMonitor,
} from '@/features/strong-picks/hooks';
import {
  buildDayStrip,
  categoryChips,
  dayName,
  todayIST,
  type CategoryFilter,
} from '@/features/strong-picks/lib/picksView';
import type { ResultRange } from '@/features/strong-picks/lib/results';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/lib/utils/toast';
import { isServerOutdated } from '@/services/api/contract';
import { useAuthStore } from '@/store/authStore';

type View3 = 'picks' | 'swing' | 'results';

const VIEWS: readonly { key: View3; label: string }[] = [
  { key: 'picks', label: 'Picks' },
  { key: 'swing', label: 'Swing scan' },
  { key: 'results', label: 'Results' },
];

/** The day strip and the headline read the 30-day record; Results picks its own range. */
const STRIP_DAYS = 30;

function AboutSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const paragraphs = [
    'Each evening the Institutional Breakout Swing strategy scans for setups. At 09:30 those setups, the morning’s high-impact news, the overnight recommendations and the screeners are re-checked against the first fifteen minutes of real trading.',
    'Survivors are re-analysed by the AI review, put in a category the rules allow — equity, intraday, futures or options — and published with entry, stop, target and an F&O contract where one applies.',
    'A monitor follows each pick to its target, its stop or the end of its horizon: intraday by 15:20, options within 3 sessions, futures 5, equity 10. Results counts a pick a success when it closes in profit.',
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
 * Markets › Strong picks — the day's best trades, each a complete plan, one trading day at a
 * time. Picks: the market regime, the day strip, category chips and the tickets (live today,
 * settled before), the picks still running from earlier days, and how the list was made. Swing
 * scan: the evening scan the morning's swing picks come from. Results: the track record.
 */
export default function StrongPicksScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const now = useNow();
  const today = todayIST(now);
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const [view, setView] = useState<View3>('picks');
  const [date, setDate] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [range, setRange] = useState<ResultRange>('30');
  const [aboutOpen, setAboutOpen] = useState(false);

  const picksQuery = useStrongPicksFor(date && date !== today ? date : null);
  const data = picksQuery.data;
  const marketOpen = data?.marketOpen === true;
  const strip = useStrongPickAnalytics(STRIP_DAYS, { enabled: view === 'picks', live: marketOpen });
  const house = useHouseStrategy(view === 'swing' ? SWING_KEY : null);
  const runScan = useRunHouseScan(SWING_KEY);
  const review = useGenerateStrongPicks();
  const sweep = useSweepStrongPickMonitor();

  const selected = date ?? today;
  const shownIsToday = data ? data.date === today : selected === today;
  const picks = useMemo(() => data?.picks ?? [], [data]);
  const chips = useMemo(() => categoryChips(picks), [picks]);
  const categorised = picks.some((p) => p.category !== null);
  const days = useMemo(
    () =>
      buildDayStrip(
        strip.data?.byDay ?? [],
        today,
        data && data.date === today && !picksQuery.isPlaceholderData ? data.picks.length : null,
        selected,
      ),
    [strip.data, today, data, picksQuery.isPlaceholderData, selected],
  );
  const record =
    strip.data && !isServerOutdated(strip.error)
      ? {
          days: strip.data.days || STRIP_DAYS,
          successRate: strip.data.overall.successRate,
          closed: strip.data.overall.closed,
          profitable: strip.data.overall.profitable,
        }
      : null;

  const pickDay = useCallback((next: string) => setDate(next === today ? null : next), [today]);

  const actions: ReviewActions = {
    reviewBusy: review.isPending,
    sweepBusy: sweep.isPending,
    onReview: () =>
      confirmAction({
        title: 'Run the 09:30 review again?',
        message:
          'It spends a model call and replaces today’s published picks with whatever survives now.',
        confirmLabel: 'Run review',
        onConfirm: () =>
          review.mutate(undefined, {
            onSuccess: (result) =>
              toast.info(
                result.alreadyRunning ? 'A review is already queued' : 'Review queued',
                'The list refreshes when it finishes.',
              ),
            onError: (error) => toast.error('Couldn’t queue the review', adminActionError(error)),
          }),
      }),
    onSweep: () =>
      sweep.mutate(undefined, {
        onSuccess: (result) =>
          result.skipped
            ? toast.info('Monitor skipped', result.skipped)
            : toast.success(`Sampled ${result.sampled} of ${result.picks} picks`),
        onError: (error) => toast.error('Monitor sweep failed', adminActionError(error)),
      }),
  };

  const startScan = () =>
    confirmAction({
      title: 'Run the evening scan now?',
      message: 'It runs on the screener worker and replaces this session’s scan.',
      confirmLabel: 'Run scan',
      onConfirm: () =>
        runScan.mutate(undefined, {
          onSuccess: (result) => {
            const note = houseJobMessage('scan', result.alreadyQueued);
            toast.info(note.title, note.message);
          },
          onError: (error) => toast.error('Couldn’t queue the scan', adminActionError(error)),
        }),
    });

  const refresh = useCallback(() => {
    if (view === 'swing') {
      return queryClient.invalidateQueries({ queryKey: houseKeys.all });
    }
    if (view === 'results') {
      return queryClient.invalidateQueries({ queryKey: ['strong-picks', 'analytics'] });
    }
    return Promise.all([
      picksQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: strongPickKeys.analytics(STRIP_DAYS) }),
    ]);
  }, [view, queryClient, picksQuery]);

  const reviewed = data?.generatedAt ? formatIstTime(data.generatedAt) : null;
  const intro =
    view === 'picks' && data
      ? [
          shownIsToday ? `Today · ${dayName(data.date)}` : dayName(data.date),
          reviewed ? `reviewed ${reviewed} IST` : null,
          data.marketOpen ? 'market open' : 'market closed',
        ]
          .filter(Boolean)
          .join(' · ')
      : view === 'swing'
        ? 'Tomorrow’s candidates from the evening Institutional Breakout Swing scan'
        : view === 'results'
          ? 'How the picks did, settled by the monitor'
          : 'Swing setups, news and screeners, re-checked at the open';

  let picksBody: React.ReactNode;
  if (picksQuery.isPending) {
    picksBody = <ListSkeleton rows={4} />;
  } else if (picksQuery.error && !data) {
    picksBody = (
      <InlineError
        what="strong picks"
        error={picksQuery.error}
        onRetry={() => void picksQuery.refetch()}
      />
    );
  } else if (data) {
    picksBody = (
      <View style={{ opacity: picksQuery.isPlaceholderData ? 0.6 : 1 }}>
        <PicksView
          data={data}
          isToday={shownIsToday}
          category={categorised ? category : 'all'}
          onCategory={setCategory}
          record={record}
          isAdmin={isAdmin}
          actions={actions}
          onOpenResults={() => setView('results')}
          onShowDate={pickDay}
        />
      </View>
    );
  }

  return (
    <GroupScreen
      intro={intro}
      onRefresh={refresh}
      fill
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
      <SegmentedControl items={VIEWS} value={view} onChange={setView} className="mb-4" />

      {view === 'picks' ? (
        <View className="gap-4">
          <RegimeStrip regime={data?.regime ?? null} />
          <DayStrip days={days} selected={selected} onPick={pickDay} />
          {!shownIsToday && data ? (
            <Banner
              tone="info"
              title={`Showing ${dayName(data.date)}`}
              message="An earlier day’s picks, as they settled. Their levels describe that plan — not today."
              action={{ label: 'Back to today', onPress: () => setDate(null) }}
            />
          ) : null}
          {categorised ? <Chips items={chips} value={category} onChange={setCategory} /> : null}
          {picksBody}
        </View>
      ) : null}

      {view === 'swing' ? (
        <View className="gap-4">
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
              Setups that hold up at the 09:30 open are re-checked by the AI review and can become
              tomorrow’s picks.
            </Text>
            <Button
              label="Strategy"
              size="sm"
              variant="ghost"
              accessibilityLabel="Open the Institutional Breakout Swing strategy"
              onPress={() =>
                router.push({ pathname: '/house-strategy/[key]', params: { key: SWING_KEY } })
              }
            />
          </View>
          <ScanTab
            strategyKey={SWING_KEY}
            days={house.data?.scanDays ?? []}
            isAdmin={isAdmin}
            onRunScan={startScan}
            scanBusy={runScan.isPending}
          />
        </View>
      ) : null}

      {view === 'results' ? (
        <ResultsView
          range={range}
          onRange={setRange}
          live={marketOpen}
          onOpenDay={(day) => {
            pickDay(day);
            setView('picks');
          }}
        />
      ) : null}

      <AboutSheet visible={aboutOpen} onClose={() => setAboutOpen(false)} />
    </GroupScreen>
  );
}
