import React, { memo } from 'react';
import { Text, View } from 'react-native';

import { barTimeLabel } from '@/features/fno/lib/candles';
import type { Candle } from '@/features/market/types';
import { cn } from '@/lib/utils/cn';
import { formatCompactNumber, formatNumber, formatSignedPercent } from '@/lib/utils/formatters';

import type { LegendValue } from '../lib/payload';

const NUM = { fontVariant: ['tabular-nums' as const] };

interface ChartLegendProps {
  bar: Candle | undefined;
  /** The bar before it, for the bar's own move. */
  previous: Candle | undefined;
  values: readonly LegendValue[];
  intraday: boolean;
  /** True while the user's finger is on the chart (the legend then describes that bar). */
  scrubbing: boolean;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
      {label} <Text className="font-semibold text-ink dark:text-ink-dark">{value}</Text>
    </Text>
  );
}

/**
 * The bar under the finger — or the latest when nothing is touched — as a terminal reads it:
 * O H L C, the bar's own move, volume, and each study's value there in its line colour.
 */
export const ChartLegend = memo(function ChartLegend({
  bar,
  previous,
  values,
  intraday,
  scrubbing,
}: ChartLegendProps) {
  if (!bar) return <View className="h-[38px]" />;
  const move =
    previous && previous.close > 0 ? ((bar.close - previous.close) / previous.close) * 100 : null;
  const rising = move === null ? bar.close >= bar.open : move >= 0;

  return (
    <View
      className="min-h-[38px] justify-center gap-1 px-4 py-1.5"
      accessibilityLiveRegion="polite"
    >
      <View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-0.5">
        <Text
          className={cn(
            'text-[11px] font-semibold',
            scrubbing ? 'text-ink dark:text-ink-dark' : 'text-ink-muted dark:text-ink-dark-muted',
          )}
          style={NUM}
        >
          {scrubbing ? barTimeLabel(bar.time, intraday) : 'Latest'}
        </Text>
        <Field label="O" value={formatNumber(bar.open)} />
        <Field label="H" value={formatNumber(bar.high)} />
        <Field label="L" value={formatNumber(bar.low)} />
        <Field label="C" value={formatNumber(bar.close)} />
        {move !== null ? (
          <Text
            className={cn(
              'text-[11px] font-semibold',
              rising
                ? 'text-brand-text dark:text-brand-text-dark'
                : 'text-danger-600 dark:text-danger-dark',
            )}
            style={NUM}
          >
            {formatSignedPercent(move)}
          </Text>
        ) : null}
        {bar.volume > 0 ? <Field label="Vol" value={formatCompactNumber(bar.volume)} /> : null}
      </View>
      {values.length > 0 ? (
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-0.5">
          {values.map((entry) => (
            <View key={entry.label} className="flex-row items-center gap-1">
              <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
              <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
                {entry.label}{' '}
                <Text className="font-semibold" style={{ color: entry.color }}>
                  {formatNumber(entry.value)}
                </Text>
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
});
