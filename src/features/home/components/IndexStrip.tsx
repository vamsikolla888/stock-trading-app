import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { underlyingHref } from '@/features/fno/lib/explore';
import { indexUnderlying } from '@/features/fno/lib/underlying';
import { indexChange } from '@/features/home/lib/indexChange';
import { formatNextOpen, nextMarketOpen } from '@/features/home/lib/istTime';
import type { IndexQuote } from '@/features/market/types';
import { useNow } from '@/hooks/useNow';
import { EMPTY_VALUE, formatNumber, formatPercent } from '@/lib/utils/formatters';

interface IndexStripProps {
  indices: readonly IndexQuote[];
  marketOpen: boolean;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}

const MINUS = '−';

/** Index moves are points, not rupees: "+205.10 (0.84%)". */
function formatMove(points: number | null, pct: number | null): string {
  if (points === null) return EMPTY_VALUE;
  const sign = points > 0 ? '+' : points < 0 ? MINUS : '';
  const move = `${sign}${formatNumber(Math.abs(points))}`;
  return pct === null ? move : `${move} (${formatPercent(Math.abs(pct))})`;
}

/**
 * Groww's index ticker: one compact card per index — name on top, level and move beneath.
 * No per-card sparkline: the platform has no intraday index history, and a line drawn
 * without data would be decoration posing as data.
 */
export function IndexStrip({ indices, marketOpen, isLoading, error, onRetry }: IndexStripProps) {
  const router = useRouter();
  const now = useNow();
  if (!isLoading && indices.length === 0) {
    return error ? <InlineError what="market indices" error={error} onRetry={onRetry} /> : null;
  }

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-5"
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
      >
        {isLoading
          ? Array.from({ length: 3 }, (_, index) => (
              <View
                key={index}
                className="h-[62px] w-[172px] gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 dark:border-line-dark dark:bg-surface-dark"
              >
                <View className="h-3 w-16 rounded bg-line dark:bg-line-dark" />
                <View className="h-3 w-28 rounded bg-line dark:bg-line-dark" />
              </View>
            ))
          : indices.map((index) => {
              const { points, pct } = indexChange(index);
              const label = index.label ?? index.symbol;
              const move = formatMove(points, pct);
              // An index with derivatives opens its own chart screen; one without has none.
              const fno = indexUnderlying(index.exchange, index.symbol);
              return (
                <Pressable
                  key={`${index.exchange}:${index.symbol}`}
                  accessibilityRole={fno ? 'button' : undefined}
                  accessibilityLabel={`${label}, ${formatNumber(index.ltp)}, ${move}`}
                  accessibilityHint={fno ? 'Opens the chart' : undefined}
                  disabled={!fno}
                  onPress={() => fno && router.push(underlyingHref(fno.exchange, fno.underlying))}
                  className="min-w-[172px] rounded-xl border border-line bg-surface px-3.5 py-3 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
                >
                  <Text
                    className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                  <View className="mt-1 flex-row items-baseline gap-1.5">
                    <Text
                      className="text-[13px] text-ink dark:text-ink-dark"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {formatNumber(index.ltp)}
                    </Text>
                    <ChangeText
                      value={points}
                      className="text-xs"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {move}
                    </ChangeText>
                  </View>
                </Pressable>
              );
            })}
      </ScrollView>
      {!isLoading ? (
        <View className="mt-2 flex-row items-center gap-1.5">
          <View
            className={
              marketOpen
                ? 'h-1.5 w-1.5 rounded-full bg-brand'
                : 'h-1.5 w-1.5 rounded-full bg-ink-faint dark:bg-ink-dark-faint'
            }
          />
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
            {marketOpen
              ? 'Market open · live'
              : `Market closed · opens ${formatNextOpen(nextMarketOpen(new Date(now)), new Date(now))} IST`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
