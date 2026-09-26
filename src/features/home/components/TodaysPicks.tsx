import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { memo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { StockLogo } from '@/components/market/StockLogo';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { InsightCard } from '@/components/ui/InsightCard';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { SegmentedControl } from '@/components/ui/Tabs';
import { insightKeys, insightsApi, useTodayPicks } from '@/features/insights/api';
import type { Recommendation, RiskLevel, Signal } from '@/features/insights/types';
import { stockLogoUrl } from '@/features/market/api';
import { stockHref } from '@/lib/navigation';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/formatters';

type Feed = 'picks' | 'signals';

const FEEDS: readonly { key: Feed; label: string }[] = [
  { key: 'picks', label: 'Picks' },
  { key: 'signals', label: 'Screener signals' },
];

const SHOWN = 3;

const RISK_BADGE: Record<RiskLevel, 'success' | 'neutral' | 'danger'> = {
  Low: 'success',
  Medium: 'neutral',
  High: 'danger',
};

const ACTION_BADGE: Record<Signal['action'], 'success' | 'danger' | 'neutral'> = {
  BUY: 'success',
  SELL: 'danger',
  WATCH: 'neutral',
};

const numbers = { fontVariant: ['tabular-nums' as const] };

function Level({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View className="flex-1" accessible accessibilityLabel={`${label} ${value}`}>
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      <Text className={cn('mt-0.5 text-xs font-semibold', tone)} style={numbers} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** One pick: its place in today's list, the published levels, and the engine's first reason. */
const PickCard = memo(function PickCard({
  rank,
  pick,
  onPress,
}: {
  rank: number;
  pick: Recommendation;
  onPress: () => void;
}) {
  const entry =
    pick.lo !== null && pick.hi !== null
      ? `${formatINR(pick.lo, 0)}–${formatINR(pick.hi, 0)}`
      : formatINR(pick.lo ?? pick.hi);
  const why = pick.why[0]?.head;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Pick ${rank}: ${pick.name}, ${pick.risk} risk${why ? `. ${why}` : ''}`}
      onPress={onPress}
      className="rounded-card border border-line bg-surface p-3.5 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-center gap-2.5">
        <View className="h-5 w-5 items-center justify-center rounded-full bg-surface-sunk dark:bg-surface-sunk-dark">
          <Text className="text-[10px] font-bold text-ink-muted dark:text-ink-dark-muted">
            {rank}
          </Text>
        </View>
        <StockLogo symbol={pick.sym} uri={stockLogoUrl(pick.sym)} size="sm" />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
            {pick.sym}
          </Text>
          <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {pick.name} · {pick.allocationPercent}% of the day
            {pick.source === 'historical' ? ' · from the scan' : ''}
          </Text>
        </View>
        <Badge label={`${pick.risk} risk`} variant={RISK_BADGE[pick.risk]} />
      </View>
      <View className="mt-3 flex-row gap-2 rounded-lg bg-surface-sunk px-3 py-2 dark:bg-surface-sunk-dark">
        <Level label="Entry" value={entry} tone="text-ink dark:text-ink-dark" />
        <Level
          label="Target"
          value={formatINR(pick.target)}
          tone="text-brand-text dark:text-brand-text-dark"
        />
        <Level
          label="Stop"
          value={formatINR(pick.stop)}
          tone="text-danger-600 dark:text-danger-dark"
        />
      </View>
      {why ? (
        <Text
          className="mt-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
          numberOfLines={2}
        >
          {why}
        </Text>
      ) : null}
    </Pressable>
  );
});

function PicksFeed() {
  const router = useRouter();
  const today = useTodayPicks();

  if (today.isPending) return <ListSkeleton rows={3} />;
  if (today.error && !today.data) {
    return (
      <InlineError what="today’s picks" error={today.error} onRetry={() => void today.refetch()} />
    );
  }
  const picks = today.data?.recommendations ?? [];
  if (picks.length === 0) {
    return (
      <InsightCard
        kicker="Today’s picks"
        title={today.data?.reason ?? 'No stock cleared every condition today'}
        body="The engine only speaks up when a stock passes all of its checks. Quiet days are part of the process."
        action={{ label: 'See recent history', onPress: () => router.push('/intel') }}
      />
    );
  }
  return (
    <View className="gap-2.5">
      {picks.slice(0, SHOWN).map((pick, index) => (
        <PickCard
          key={`${pick.exch}:${pick.sym}`}
          rank={index + 1}
          pick={pick}
          onPress={() => router.push(stockHref(pick.sym, pick.exch))}
        />
      ))}
      {picks.length > SHOWN ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/intel')}
          className="items-center rounded-card border border-line py-3 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Show all {picks.length} picks
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SignalsFeed() {
  const router = useRouter();
  // Same key as insights' useSignals (shared cache), fetched only once this feed is opened.
  const signals = useQuery({
    queryKey: insightKeys.signals,
    queryFn: insightsApi.signals,
    staleTime: 5 * 60_000,
  });

  if (signals.isPending) return <ListSkeleton rows={3} />;
  if (signals.error && !signals.data) {
    return (
      <InlineError what="signals" error={signals.error} onRetry={() => void signals.refetch()} />
    );
  }
  const list = signals.data?.signals ?? [];
  if (list.length === 0) {
    return (
      <InlineEmpty
        title="No screener fired today"
        message="Signals appear when a screener with a measured track record matches a stock."
        action={{ label: 'Open screeners', onPress: () => router.push('/intel/screeners') }}
      />
    );
  }
  return (
    <ListCard>
      {list.slice(0, SHOWN).map((signal, index) => (
        <View key={`${signal.screenerKey}:${signal.exchange}:${signal.symbol}`}>
          {index > 0 ? <RowDivider /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${signal.symbol}, ${signal.action}, ${signal.screenerName}, ${
              signal.hitRatePct === null
                ? 'no measured rate'
                : `${Math.round(signal.hitRatePct)}% hit rate`
            }`}
            onPress={() => router.push(stockHref(signal.symbol, signal.exchange))}
            className="min-h-[64px] flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
          >
            <StockLogo symbol={signal.symbol} uri={stockLogoUrl(signal.symbol)} size="sm" />
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
                {signal.symbol}
              </Text>
              <Text
                className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                numberOfLines={1}
              >
                {signal.screenerName}
              </Text>
            </View>
            <View className="items-end gap-1">
              <Badge label={signal.action} variant={ACTION_BADGE[signal.action]} />
              <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" style={numbers}>
                {signal.hitRatePct === null
                  ? 'no measured rate'
                  : `${Math.round(signal.hitRatePct)}% hit rate`}
              </Text>
            </View>
          </Pressable>
        </View>
      ))}
    </ListCard>
  );
}

/**
 * The web Dashboard's "Needs your attention": today's shared recommendation batch, or the
 * screeners that fired. The model's confidence and a screener's measured hit rate are
 * different kinds of number, and each feed says which one it shows.
 */
export function TodaysPicks() {
  const router = useRouter();
  const [feed, setFeed] = useState<Feed>('picks');
  const today = useTodayPicks();
  const session = today.data?.session;
  const count = today.data?.recommendations.length ?? 0;

  return (
    <Section
      title={count > 0 ? `Today’s picks (${count})` : 'Today’s picks'}
      action={{
        label: 'See all',
        onPress: () => router.push(feed === 'picks' ? '/intel' : '/intel/signals'),
      }}
    >
      <SegmentedControl items={FEEDS} value={feed} onChange={setFeed} className="mb-3" />
      {feed === 'picks' && session && session.kind !== 'CURRENT' ? (
        <Text className="mb-2.5 text-xs text-ink-muted dark:text-ink-dark-muted">
          {session.label}
        </Text>
      ) : null}
      {feed === 'picks' ? <PicksFeed /> : <SignalsFeed />}
      <Text className="mt-2.5 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        {feed === 'picks'
          ? 'The same shared batch everyone sees. Levels are the engine’s published ones — confidence is its own score, never measured against outcomes. Not investment advice.'
          : 'Hit rates are measured from each screener’s own past matches. Not investment advice.'}
      </Text>
    </Section>
  );
}
