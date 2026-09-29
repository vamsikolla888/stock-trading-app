import React from 'react';
import { Text, View } from 'react-native';

import { Note, PillButton } from '@/features/fno/components/primitives';
import { DASH, dteLabel, expiryLabel, formatStrike, venueOf } from '@/features/fno/lib/format';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatINRCompact, formatQuantity } from '@/lib/utils/formatters';

import { isDerivedSpot, spotSourceLabel } from '../lib/book';
import type { OptionChain } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * Spot, where it came from, and the expiry context. THE SPOT SOURCE IS ALWAYS SHOWN: only
 * `cash-snapshot` is a traded price of the underlying — parity and future spots are
 * back-solved, and every strike's moneyness (the ITM shading below) hangs off this number.
 */
export function PaperChainHeader({
  chain,
  onTradeFuture,
}: {
  chain: OptionChain;
  onTradeFuture: (() => void) | null;
}) {
  const derived = isDerivedSpot(chain.spotSource);
  const future = chain.future;
  return (
    <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
        {chain.underlying} · {chain.isIndex ? 'index options' : 'stock options'} ·{' '}
        {venueOf(chain.exchange)} · spot
      </Text>
      <Text
        className="mt-1 text-2xl font-bold text-ink dark:text-ink-dark"
        style={[NUM, { letterSpacing: -0.5 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {chain.spot != null ? formatINR(chain.spot) : DASH}
      </Text>
      <Text
        className={cn(
          'mt-0.5 text-[11px] font-semibold',
          chain.spot == null
            ? 'text-danger-600 dark:text-danger-dark'
            : derived
              ? 'text-warning-600 dark:text-warning-dark'
              : 'text-ink-faint dark:text-ink-dark-faint',
        )}
        numberOfLines={1}
      >
        Spot: {spotSourceLabel(chain.spotSource)}
      </Text>
      {derived ? (
        <Note className="mt-1">
          Not a traded price of {chain.underlying} — back-solved from derivative quotes, so it can
          differ from the cash market.
        </Note>
      ) : null}

      <View className="mt-3 flex-row border-t border-line pt-3 dark:border-line-dark">
        <Stat label="At the money" value={formatStrike(chain.atmStrike)} />
        <Stat
          label="Expiry"
          value={`${expiryLabel(chain.expiry)} · ${dteLabel(chain.daysToExpiry)}`}
        />
        <Stat
          label="Call / put premium"
          value={`${formatINRCompact(chain.totals.callPremium)} / ${formatINRCompact(chain.totals.putPremium)}`}
        />
      </View>

      <View className="mt-3 flex-row items-center gap-3 border-t border-line pt-3 dark:border-line-dark">
        <View className="min-w-0 flex-1">
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
            {future ? `Future · ${expiryLabel(chain.expiry)}` : 'Future'}
          </Text>
          <Text
            className="mt-0.5 text-[13px] font-semibold text-ink dark:text-ink-dark"
            style={NUM}
            numberOfLines={1}
          >
            {future
              ? `${future.lastPrice != null ? formatINR(future.lastPrice) : DASH} · lot ${formatQuantity(future.lotSize)}`
              : 'No future listed for this expiry'}
          </Text>
        </View>
        {future && onTradeFuture ? (
          <PillButton
            label="Trade future"
            tone="brand"
            onPress={onTradeFuture}
            accessibilityLabel={`Trade the ${chain.underlying} ${expiryLabel(chain.expiry)} future`}
          />
        ) : null}
      </View>

      {chain.spotNote ? <Note className="mt-3">{chain.spotNote}</Note> : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 pr-1">
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className="mt-0.5 text-[13px] font-semibold text-ink dark:text-ink-dark"
        style={NUM}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}
