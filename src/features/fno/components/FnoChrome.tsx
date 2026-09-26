import { useRouter } from 'expo-router';
import Plug from 'lucide-react-native/icons/plug';
import React from 'react';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { IconTile } from '@/components/ui/IconTile';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils/cn';
import { isMarketOpen } from '@/lib/utils/market';

import { useFnoStatus } from '../hooks';
import { ACCESS_COPY, accessProblem, type AccessProblem } from '../lib/access';
import { timeIst } from '../lib/format';
import type { GreeksSource, MarketDataSource } from '../types';

/**
 * The F&O module's always-visible honesty strip: WHERE the numbers came from, WHEN, and
 * what the user's Groww account can do. Every chain/quote response names its source; these
 * render it rather than letting a fallback pass as live Groww data.
 */

/** After this long without a successful refresh during market hours, prices are flagged. */
const STALE_AFTER_MS = 2 * 60_000;

export function sourceLabel(source: MarketDataSource): string {
  return source === 'groww' ? 'Groww live data' : 'Platform feed';
}

/**
 * "Groww live data · as of 10:32:15 IST", with a warning when the last successful refresh
 * is old while the market is open, or the latest refresh failed and cached numbers show.
 */
export function Freshness({
  source,
  greeksSource,
  asOf,
  updatedAt,
  refreshFailed,
  className,
}: {
  source?: MarketDataSource | null;
  greeksSource?: GreeksSource | null;
  /** The server's own timestamp for the data. */
  asOf?: string | null;
  /** When this device last received it (React Query dataUpdatedAt). */
  updatedAt?: number;
  refreshFailed?: boolean;
  className?: string;
}) {
  // Re-read every 30 s so an "as of" line can turn stale without new data arriving.
  const now = useNow(30_000);
  const open = isMarketOpen(new Date(now));
  const stale = open && updatedAt != null && updatedAt > 0 && now - updatedAt > STALE_AFTER_MS;
  const parts = [
    source ? sourceLabel(source) : null,
    greeksSource ? `greeks ${greeksSource === 'groww' ? 'from Groww' : 'calculated'}` : null,
    asOf ? `as of ${timeIst(asOf, true)} IST` : null,
  ].filter(Boolean);

  return (
    <View className={cn('gap-1', className)}>
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <View
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            open && !stale && !refreshFailed ? 'bg-brand' : 'bg-ink-faint dark:bg-ink-dark-faint',
          )}
        />
        <Text className="flex-shrink text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {[open ? 'Market open' : 'Market closed', ...parts].join(' · ')}
        </Text>
      </View>
      {refreshFailed || stale ? (
        <Text className="text-[11px] text-warning-600 dark:text-warning-dark">
          {refreshFailed
            ? "Couldn't refresh — the prices shown may be old."
            : 'No update for a while — the prices shown may be old.'}
        </Text>
      ) : null}
    </View>
  );
}

/** Small source tag for a card header. */
export function SourceTag({ source }: { source: MarketDataSource | null | undefined }) {
  if (!source) return null;
  const groww = source === 'groww';
  return (
    <View
      className={cn(
        'rounded-md px-1.5 py-0.5',
        groww ? 'bg-info-wash dark:bg-info-wash-dark' : 'bg-warning-wash dark:bg-warning-wash-dark',
      )}
    >
      <Text
        className={cn(
          'text-[10px] font-bold',
          groww ? 'text-info dark:text-info-dark' : 'text-warning-600 dark:text-warning-dark',
        )}
      >
        {sourceLabel(source)}
      </Text>
    </View>
  );
}

/**
 * What the user's Groww account can do right now. `quietPlan`: a screen that already labels
 * its prices' source needs no permanent note about the API plan — nothing on it is blocked.
 */
export function GrowwAccessBanner({
  quietPlan = false,
  className,
}: {
  quietPlan?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const status = useFnoStatus();
  const problem = accessProblem(status.data?.groww);
  if (!problem || (quietPlan && problem === 'plan')) return null;
  const copy = ACCESS_COPY[problem];
  return (
    <Banner
      tone={problem === 'plan' ? 'info' : 'warning'}
      title={copy.title}
      message={copy.message}
      action={
        copy.connect
          ? { label: 'Connect broker', onPress: () => router.push('/brokers') }
          : undefined
      }
      className={className}
    />
  );
}

/** Full-width state for an account screen that needs Groww first. */
export function ConnectGroww({
  problem,
  what,
}: {
  problem: Extract<AccessProblem, 'not-connected' | 'session-expired'>;
  what: string;
}) {
  const router = useRouter();
  const expired = problem === 'session-expired';
  return (
    <View className="items-center gap-3 rounded-card border border-line bg-surface px-5 py-8 dark:border-line-dark dark:bg-surface-dark">
      <IconTile Icon={Plug} tone={expired ? 'amber' : 'blue'} size="lg" />
      <Text className="text-center text-base font-bold text-ink dark:text-ink-dark">
        {expired ? 'Your Groww session has expired' : `Connect Groww to see your ${what}`}
      </Text>
      <Text className="text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {expired
          ? `Reconnect Groww to see your F&O ${what} and place orders.`
          : `F&O ${what} come from your own Groww Trading API connection.`}
      </Text>
      <Button
        label={expired ? 'Reconnect Groww' : 'Connect Groww'}
        onPress={() => router.push('/brokers')}
        className="mt-1 self-stretch"
      />
    </View>
  );
}
