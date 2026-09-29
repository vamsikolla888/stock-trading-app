import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { Banner } from '@/components/ui/Banner';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { BriefHeader, BriefSkeleton } from '@/features/daily-brief/components/BriefHeader';
import {
  AttentionSection,
  CalendarSection,
  DerivativesSection,
  IndicesSection,
  MoversSection,
  NewsSection,
  OutlookSection,
  PortfolioSection,
  PulseSection,
  SectorsSection,
  SummarySection,
  TechnicalSection,
  WatchlistSection,
} from '@/features/daily-brief/components/BriefSections';
import { BriefSettingsSheet } from '@/features/daily-brief/components/BriefSettingsSheet';
import { NarrationBar } from '@/features/daily-brief/components/NarrationBar';
import {
  resolvedPreferences,
  useDailyBrief,
  useDailyBriefDates,
  useDailyBriefPreferences,
  useRefreshDailyBrief,
  useUpdateDailyBriefPreferences,
} from '@/features/daily-brief/hooks';
import { RISK_OPTIONS, todayIst, visibleSections } from '@/features/daily-brief/lib/brief';
import type {
  DailyBrief,
  DailyBriefPreferences,
  DailyBriefRiskProfile,
  DailyBriefSection,
} from '@/features/daily-brief/types';
import { useNarration } from '@/features/daily-brief/useNarration';
import { formatSessionDay } from '@/features/home/lib/istTime';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage } from '@/types/api';

/**
 * Markets › Daily Brief (web: /markets/daily-brief). One scrolling page per session day:
 * the 30-second summary, the AI outlook, indices, breadth, sectors, movers, NIFTY
 * derivatives, the user's portfolio and watchlists, technical signals, what needs
 * attention, analyzed news and provider status — in the order and selection the user
 * saved. Observed data, calculated metrics and model interpretation are labelled apart,
 * and a section whose source is down says so instead of showing a stand-in.
 */
export default function DailyBriefScreen() {
  const today = todayIst();
  const [date, setDate] = useState(today);
  const preferencesQuery = useDailyBriefPreferences();
  const preferences = resolvedPreferences(preferencesQuery.data);
  // The header's picker overrides the saved default for this visit only; saving settings
  // makes the saved one current again.
  const [riskOverride, setRiskOverride] = useState<DailyBriefRiskProfile | null>(null);
  const riskProfile = riskOverride ?? preferences.riskProfile;
  const [sheet, setSheet] = useState<'date' | 'risk' | 'settings' | null>(null);

  const isToday = date === today;
  const briefQuery = useDailyBrief(date, riskProfile);
  const datesQuery = useDailyBriefDates();
  const refresh = useRefreshDailyBrief(date, riskProfile);
  const updatePreferences = useUpdateDailyBriefPreferences();
  const narration = useNarration(date, riskProfile);
  const { close: closeNarration } = narration;

  // Each brief has its own narration script, so the player closes before switching.
  const pickDate = useCallback(
    (next: string) => {
      if (next === date) return;
      closeNarration();
      setDate(next);
    },
    [closeNarration, date],
  );
  const pickRisk = useCallback(
    (next: DailyBriefRiskProfile) => {
      if (next === riskProfile) return;
      closeNarration();
      setRiskOverride(next);
    },
    [closeNarration, riskProfile],
  );

  const brief = briefQuery.data;
  const showListen = preferences.audioEnabled && narration.supported;
  const listenBusy = narration.status === 'loading';

  const dateOptions = useMemo(
    () => [
      { key: today, label: `Today · ${formatSessionDay(today)}` },
      ...(datesQuery.data ?? [])
        .filter((day) => day !== today)
        .map((day) => ({ key: day, label: `${formatSessionDay(day)} ${day.slice(0, 4)}` })),
    ],
    [datesQuery.data, today],
  );

  const { mutate: mutateRefresh, isPending: refreshPending } = refresh;
  const runRefresh = useCallback(() => {
    if (!isToday || refreshPending) return;
    mutateRefresh(undefined, {
      onSuccess: (next) =>
        toast.success(
          next.aiStatus === 'ready' ? 'Brief refreshed' : 'Brief refreshed without AI',
          next.aiStatus === 'ready'
            ? 'A new analysis was made from the latest data.'
            : 'The AI analysis is unavailable right now; calculated data is up to date.',
        ),
      onError: (error) => toast.error('Couldn’t refresh the brief', getErrorMessage(error)),
    });
  }, [isToday, mutateRefresh, refreshPending]);

  const { mutate: mutatePreferences } = updatePreferences;
  const saveSettings = useCallback(
    (next: DailyBriefPreferences) => {
      mutatePreferences(next, {
        onSuccess: (saved) => {
          if (saved.riskProfile !== riskProfile) closeNarration();
          setRiskOverride(null);
          setSheet(null);
          toast.success('Daily Brief settings saved');
        },
        onError: (error) => toast.error('Couldn’t save settings', getErrorMessage(error)),
      });
    },
    [closeNarration, mutatePreferences, riskProfile],
  );

  // What the settings sheet opens with: the saved preferences, with the risk profile the
  // header is currently showing.
  const sheetPreferences = useMemo(
    () => ({ ...preferences, riskProfile }),
    [preferences, riskProfile],
  );

  let body: React.ReactNode;
  if (briefQuery.isPending) {
    body = <BriefSkeleton />;
  } else if (!brief) {
    body = (
      <View className="mt-5">
        <InlineError
          what={isToday ? 'the Daily Brief' : `the brief for ${formatSessionDay(date)}`}
          error={briefQuery.error}
          onRetry={() => void briefQuery.refetch()}
        />
      </View>
    );
  } else {
    body = (
      <BriefBody
        brief={brief}
        preferences={preferences}
        dimmed={briefQuery.isPlaceholderData}
        refreshError={briefQuery.error}
        canRefresh={isToday && !refreshPending}
        showListen={showListen}
        listenBusy={listenBusy}
        onListen={narration.start}
        onRefresh={runRefresh}
      />
    );
  }

  return (
    <GroupScreen
      onRefresh={() => briefQuery.refetch()}
      footer={<NarrationBar narration={narration} />}
    >
      <BriefHeader
        brief={brief}
        date={date}
        isToday={isToday}
        riskProfile={riskProfile}
        showListen={showListen}
        listenBusy={listenBusy}
        refreshing={refreshPending}
        onPickDate={() => setSheet('date')}
        onPickRisk={() => setSheet('risk')}
        onListen={narration.start}
        onRefresh={runRefresh}
        onSettings={() => setSheet('settings')}
      />
      {body}

      <OptionSheet
        visible={sheet === 'date'}
        title="Brief date"
        options={dateOptions}
        value={date}
        onSelect={pickDate}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'risk'}
        title="Risk profile"
        options={RISK_OPTIONS}
        value={riskProfile}
        onSelect={pickRisk}
        onClose={() => setSheet(null)}
      />
      <BriefSettingsSheet
        visible={sheet === 'settings'}
        preferences={sheetPreferences}
        availableIndices={brief?.indices.map((row) => row.name) ?? []}
        availableSectors={brief?.sectors.map((row) => row.name) ?? []}
        saving={updatePreferences.isPending}
        onClose={() => setSheet(null)}
        onSave={saveSettings}
      />
    </GroupScreen>
  );
}

/** Memoised: the narration bar updates on every spoken word, and the brief shouldn't re-render with it. */
const BriefBody = React.memo(function BriefBody({
  brief,
  preferences,
  dimmed,
  refreshError,
  canRefresh,
  showListen,
  listenBusy,
  onListen,
  onRefresh,
}: {
  brief: DailyBrief;
  preferences: DailyBriefPreferences;
  dimmed: boolean;
  refreshError: unknown;
  canRefresh: boolean;
  showListen: boolean;
  listenBusy: boolean;
  onListen: () => void;
  onRefresh: () => void;
}) {
  const order = visibleSections(preferences);
  const render = (section: DailyBriefSection): React.ReactNode => {
    switch (section) {
      case 'summary':
        return (
          <SummarySection
            brief={brief}
            onListen={onListen}
            listenBusy={listenBusy}
            showListen={showListen}
          />
        );
      case 'outlook':
        return <OutlookSection brief={brief} onRefresh={onRefresh} canRefresh={canRefresh} />;
      case 'indices':
        return <IndicesSection brief={brief} preferred={preferences.preferredIndices} />;
      case 'breadth':
        return <PulseSection brief={brief} />;
      case 'sectors':
        return <SectorsSection brief={brief} preferred={preferences.preferredSectors} />;
      case 'movers':
        return <MoversSection brief={brief} />;
      case 'derivatives':
        return <DerivativesSection brief={brief} />;
      case 'portfolio':
        return <PortfolioSection brief={brief} />;
      case 'watchlist':
        return <WatchlistSection brief={brief} />;
      case 'technical':
        return <TechnicalSection brief={brief} />;
      case 'attention':
        return <AttentionSection brief={brief} />;
      case 'news':
        return <NewsSection brief={brief} />;
      case 'calendar':
        return <CalendarSection brief={brief} />;
    }
  };

  const degraded = brief.stale || brief.partialFailures.length > 0;

  return (
    <View style={{ opacity: dimmed ? 0.55 : 1 }}>
      {refreshError ? (
        <Banner
          tone="warning"
          className="mt-4"
          message={`Showing the last brief that loaded. ${getErrorMessage(refreshError)}`}
        />
      ) : null}
      {degraded ? (
        <Banner
          tone="warning"
          className="mt-4"
          title="Some sources are delayed or unavailable"
          message={[
            'The sections that did load are shown with their source times.',
            ...brief.partialFailures.slice(0, 2),
          ].join(' ')}
        />
      ) : null}
      {order.map((section) => (
        <React.Fragment key={section}>{render(section)}</React.Fragment>
      ))}
      <Text className="mt-8 text-center text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
        Observed data, calculated metrics and model interpretation are labelled separately. Nothing
        here guarantees a market direction or a return.
      </Text>
    </View>
  );
});
