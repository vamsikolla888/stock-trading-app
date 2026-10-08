import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';
import { isServerOutdated } from '@/services/api/contract';

import type { CompanyProfile, CompanyProfileResponse } from '../types';

/** The pieces every company card on the stock page shares. */

export const NUM = { fontVariant: ['tabular-nums' as const] };

export interface ProfileQuery {
  data?: CompanyProfileResponse;
  error: unknown;
  isPending: boolean;
  refetch: () => unknown;
}

/** True when the connected server has no company profile at all — every card stays hidden. */
export function profileMissingOnServer(query: ProfileQuery): boolean {
  return !query.data && isServerOutdated(query.error);
}

export function CardFrame({ children }: { children: React.ReactNode }) {
  return (
    <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      {children}
    </View>
  );
}

export function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <CardFrame>
      <View className="gap-3" accessibilityLabel="Loading company data">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} height={14} width={i % 2 ? '70%' : '100%'} />
        ))}
      </View>
    </CardFrame>
  );
}

export function CardNote({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
      {children}
    </Text>
  );
}

/**
 * Renders a card's body once the profile is there; until then its state — loading, a failed
 * request with a retry, or the server's own reason (an ETF has no shareholding; Groww has no page).
 */
export function ProfileGate({
  query,
  rows,
  children,
}: {
  query: ProfileQuery;
  rows?: number;
  children: (profile: CompanyProfile) => React.ReactNode;
}) {
  if (query.isPending) return <CardSkeleton rows={rows} />;
  const profile = query.data?.profile;
  if (profile) return <>{children(profile)}</>;
  return (
    <View className="items-center gap-1.5 rounded-card border border-dashed border-line-strong px-4 py-5 dark:border-line-dark-strong">
      <Text className="text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {query.data?.message ??
          (query.error
            ? 'Company data couldn’t be loaded just now.'
            : 'No company data is available for this stock.')}
      </Text>
      {query.error && !query.data ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => void query.refetch()}
          className="active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Try again
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
