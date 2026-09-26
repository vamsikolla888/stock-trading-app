import React from 'react';
import { Text, View } from 'react-native';

import { Caveats, Disclosure, Note } from '@/features/fno/components/primitives';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatNumber, formatSignedINR } from '@/lib/utils/formatters';

import type { ProbabilityAnalysis } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

/**
 * Odds at expiry for the payoff drawn above it. A MODEL OUTPUT, NOT A BACKTEST: lognormal,
 * from the market's own implied volatility — the platform has no historical premium data to
 * measure a real win rate against, and the caveats say so on every render.
 */
export function ProbabilityPanel({ probability }: { probability: ProbabilityAnalysis | null }) {
  if (!probability || probability.probabilityOfProfit == null) {
    return (
      <Note>
        No probability estimate — it needs an implied volatility to model from, which an untraded or
        futures-only leg does not have.
      </Note>
    );
  }
  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <View className="flex-1 rounded-xl bg-surface-sunk px-3 py-2.5 dark:bg-surface-sunk-dark">
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
            Probability of profit
          </Text>
          <Text className="mt-0.5 text-lg font-bold text-ink dark:text-ink-dark" style={NUM}>
            {pct(probability.probabilityOfProfit)}
          </Text>
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
            modelled, not measured
          </Text>
        </View>
        <View className="flex-1 rounded-xl bg-surface-sunk px-3 py-2.5 dark:bg-surface-sunk-dark">
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
            Expected value
          </Text>
          <Text
            className="mt-0.5 text-lg font-bold text-ink dark:text-ink-dark"
            style={NUM}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {probability.expectedValue != null ? formatSignedINR(probability.expectedValue) : '—'}
          </Text>
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
            probability-weighted
          </Text>
        </View>
      </View>

      {probability.bands.length > 0 ? (
        <View className="overflow-hidden rounded-lg border border-line dark:border-line-dark">
          <View className="flex-row bg-surface-sunk px-3 py-1.5 dark:bg-surface-sunk-dark">
            <Text className="flex-[1.4] text-[11px] text-ink-faint dark:text-ink-dark-faint">
              Underlying at expiry
            </Text>
            <Text className="flex-[0.7] text-right text-[11px] text-ink-faint dark:text-ink-dark-faint">
              Odds
            </Text>
            <Text className="flex-1 text-right text-[11px] text-ink-faint dark:text-ink-dark-faint">
              Payoff
            </Text>
          </View>
          {probability.bands.map((b) => (
            <View
              key={`${b.rangeLow}-${b.rangeHigh}`}
              accessible
              accessibilityLabel={`Between ${formatNumber(b.rangeLow, 0)} and ${formatNumber(b.rangeHigh, 0)}: ${pct(b.probability)} odds, payoff ${formatINR(b.avgProfit)}`}
              className="flex-row border-t border-line px-3 py-1.5 dark:border-line-dark"
            >
              <Text className="flex-[1.4] text-xs text-ink dark:text-ink-dark" style={NUM}>
                {formatNumber(b.rangeLow, 0)} – {formatNumber(b.rangeHigh, 0)}
              </Text>
              <Text
                className="flex-[0.7] text-right text-xs text-ink dark:text-ink-dark"
                style={NUM}
              >
                {pct(b.probability)}
              </Text>
              <Text
                className={cn(
                  'flex-1 text-right text-xs font-semibold',
                  b.avgProfit >= 0
                    ? 'text-brand-text dark:text-brand-text-dark'
                    : 'text-danger-600 dark:text-danger-dark',
                )}
                style={NUM}
              >
                {formatSignedINR(b.avgProfit)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {probability.caveats.length > 0 ? (
        <Disclosure
          title="What this probability assumes"
          meta={`${probability.caveats.length} thing${probability.caveats.length === 1 ? '' : 's'}`}
        >
          <Caveats items={probability.caveats} />
        </Disclosure>
      ) : null}
    </View>
  );
}
