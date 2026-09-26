import { useRouter } from 'expo-router';
import BriefcaseBusiness from 'lucide-react-native/icons/briefcase-business';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import type { PortfolioOverview } from '@/features/portfolio/hooks';
import { formatINR, formatPercent, formatSignedINR, MASKED_VALUE } from '@/lib/utils/formatters';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useTheme } from '@/theme/ThemeProvider';

/** "+₹18,260 (1.49%)" — sign on the amount, the percent in brackets, as Groww prints returns. */
function formatReturn(abs: number | null, pct: number | null): string {
  if (abs === null) return '—';
  return pct === null
    ? formatSignedINR(abs)
    : `${formatSignedINR(abs)} (${formatPercent(Math.abs(pct))})`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-1.5">
      <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      {children}
    </View>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={styles.numbers}>
      {children}
    </Text>
  );
}

function LoadingCard() {
  return (
    <View
      accessibilityLabel="Loading your holdings"
      className="gap-3 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark"
    >
      <View className="h-3 w-24 rounded bg-line dark:bg-line-dark" />
      <View className="h-7 w-40 rounded-md bg-line dark:bg-line-dark" />
      <View className="mt-2 h-3 w-full rounded bg-line dark:bg-line-dark" />
      <View className="h-3 w-full rounded bg-line dark:bg-line-dark" />
    </View>
  );
}

const EMPTY_COPY: Record<
  'connected' | 'session-expired' | 'other',
  { title: string; body: string }
> = {
  connected: {
    title: 'No holdings yet',
    body: 'Stocks you buy show up here with their value and returns.',
  },
  'session-expired': {
    title: 'Reconnect to see your holdings',
    body: 'Broker sessions reset every night. Enter today’s code to refresh your holdings.',
  },
  other: {
    title: 'Your investments show up here',
    body: 'Connect your broker for live holdings, or practise risk-free with paper trading.',
  },
};

/** No book to show: what to do next depends on whether a broker is connected at all. */
function EmptyCard({ brokerState }: { brokerState: PortfolioOverview['brokerState'] }) {
  const router = useRouter();
  const { colors } = useTheme();
  const kind =
    brokerState === 'connected' || brokerState === 'session-expired' ? brokerState : 'other';
  const copy = EMPTY_COPY[kind];
  const primary =
    kind === 'connected'
      ? { label: 'Explore stocks', onPress: () => router.navigate('/explore') }
      : {
          label: kind === 'session-expired' ? 'Reconnect broker' : 'Connect broker',
          onPress: () => router.push('/brokers'),
        };

  return (
    <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-wash dark:bg-brand-wash-dark">
          <BriefcaseBusiness size={20} color={colors.link} />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">
            {copy.title}
          </Text>
          <Text className="mt-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            {copy.body}
          </Text>
        </View>
      </View>
      <View className="mt-4 flex-row gap-2.5">
        <Button className="flex-1" size="sm" label={primary.label} onPress={primary.onPress} />
        <Button
          className="flex-1"
          size="sm"
          variant="outline"
          label="Paper trade"
          onPress={() => router.push('/trade/paper')}
        />
      </View>
    </View>
  );
}

/**
 * Groww-style holdings summary: current value with a privacy toggle, then the returns
 * breakdown as label/value rows. Tapping the card opens Portfolio.
 */
export function HoldingsCard({ overview }: { overview: PortfolioOverview }) {
  const router = useRouter();
  const { colors } = useTheme();
  const hideValues = usePreferencesStore((state) => state.hideValues);
  const toggleHideValues = usePreferencesStore((state) => state.toggleHideValues);
  const mask = (text: string) => (hideValues ? MASKED_VALUE : text);
  const VisibilityIcon = hideValues ? EyeOff : Eye;

  const { source, totals, day, availableCash, holdings, brokerState } = overview;
  const openPortfolio = () => router.navigate('/trade/mstock');

  let body: React.ReactNode;
  if (overview.isLoading) {
    body = <LoadingCard />;
  } else if (overview.error) {
    body = (
      <InlineError
        what="your holdings"
        error={overview.error}
        onRetry={() => void overview.refetch()}
      />
    );
  } else if (source === 'none' || !totals) {
    body = <EmptyCard brokerState={brokerState} />;
  } else {
    // Hand-tracked holdings can lack a live price; show what was invested rather than
    // pass the cost off as today's value.
    const priced = totals.value !== null;
    // The eye toggle sits outside the card's pressable area: a control nested inside an
    // accessible button is unreachable with VoiceOver (and invalid markup on web).
    body = (
      <View className="overflow-hidden rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
        <View className="flex-row items-center gap-2 px-4 pt-4">
          <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
            {priced ? 'Current value' : 'Invested value'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hideValues ? 'Show portfolio values' : 'Hide portfolio values'}
            hitSlop={12}
            onPress={toggleHideValues}
          >
            <VisibilityIcon size={16} color={colors.textMuted} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens your portfolio"
          onPress={openPortfolio}
          className="px-4 pb-4 pt-1 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
        >
          <View className="flex-row items-center gap-2">
            <Text
              className="flex-1 text-[26px] font-bold text-ink dark:text-ink-dark"
              style={[styles.numbers, { letterSpacing: -0.8 }]}
              accessibilityLabel={hideValues ? 'Value hidden' : undefined}
            >
              {mask(formatINR(totals.value ?? totals.invested))}
            </Text>
            <ChevronRight size={18} color={colors.textFaint} />
          </View>

          <View className="my-3 h-px bg-line dark:bg-line-dark" />

          {day ? (
            <Row label="1D returns">
              <ChangeText value={day.abs} className="text-[13px]" style={styles.numbers}>
                {mask(formatReturn(day.abs, day.pct))}
              </ChangeText>
            </Row>
          ) : null}
          <Row label="Total returns">
            {totals.pnl !== null ? (
              <ChangeText value={totals.pnl} className="text-[13px]" style={styles.numbers}>
                {mask(formatReturn(totals.pnl, totals.pnlPct))}
              </ChangeText>
            ) : (
              <Value>Price unavailable</Value>
            )}
          </Row>
          {priced ? (
            <Row label="Invested">
              <Value>{mask(formatINR(totals.invested))}</Value>
            </Row>
          ) : null}
          {source === 'broker' && availableCash !== null ? (
            <Row label="Available funds">
              <Value>{mask(formatINR(availableCash))}</Value>
            </Row>
          ) : null}

          {overview.stale ? (
            <Text className="mt-2 text-xs text-ink-faint dark:text-ink-dark-faint">
              Showing last known values — the broker was slow to respond.
            </Text>
          ) : source === 'manual' ? (
            <Text className="mt-2 text-xs text-ink-faint dark:text-ink-dark-faint">
              Holdings you track by hand. Connect a broker for live values.
            </Text>
          ) : null}
        </Pressable>
      </View>
    );
  }

  const count = holdings.length;
  return (
    <Section
      className="mt-6"
      title={count > 0 ? `Holdings (${count})` : 'Holdings'}
      action={count > 0 ? { label: 'View all', onPress: openPortfolio } : undefined}
    >
      {body}
    </Section>
  );
}

const styles = {
  numbers: { fontVariant: ['tabular-nums' as const] },
};
