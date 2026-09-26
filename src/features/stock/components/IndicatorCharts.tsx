import React, { memo, useMemo, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { BarChart } from '@/components/charts/BarChart';
import { SegmentedControl } from '@/components/ui/Tabs';
import { formatSessionDay, istDayKey } from '@/features/home/lib/istTime';
import { rsi } from '@/features/market/lib/indicators';
import type { Candle } from '@/features/market/types';
import { useTheme } from '@/theme/ThemeProvider';

import { rsiPath } from '../lib/priceView';

type Indicator = 'volume' | 'rsi';

const INDICATORS: readonly { key: Indicator; label: string }[] = [
  { key: 'volume', label: 'Volume' },
  { key: 'rsi', label: 'RSI (14)' },
];

const BARS = 60;
const HEIGHT = 130;

/** RSI on a fixed 0–100 axis with the 30 / 70 bands dashed in. */
const RsiChart = memo(function RsiChart({ values }: { values: readonly number[] }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const path = useMemo(() => rsiPath(values, width, HEIGHT), [values, width]);
  const bandY = (level: number) => 2 + (1 - level / 100) * (HEIGHT - 4);
  const last = values[values.length - 1];

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setWidth(Math.floor(event.nativeEvent.layout.width))}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`RSI over the last ${values.length} sessions${
        last !== undefined ? `, latest ${last.toFixed(1)}` : ''
      }`}
      style={{ height: HEIGHT }}
    >
      {width > 0 && path ? (
        <Svg width={width} height={HEIGHT}>
          {[70, 30].map((level) => (
            <Line
              key={level}
              x1={0}
              x2={width}
              y1={bandY(level)}
              y2={bandY(level)}
              stroke={colors.borderStrong}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ))}
          <Path
            d={path}
            fill="none"
            stroke={colors.info}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
      <Text
        className="absolute right-0 text-[10px] text-ink-faint dark:text-ink-dark-faint"
        style={{ top: bandY(70) - 14 }}
      >
        70
      </Text>
      <Text
        className="absolute right-0 text-[10px] text-ink-faint dark:text-ink-dark-faint"
        style={{ top: bandY(30) + 2 }}
      >
        30
      </Text>
    </View>
  );
});

/** Daily volume bars or RSI (14), from the same real daily bars as the technical readings. */
export function IndicatorCharts({ daily }: { daily: readonly Candle[] }) {
  const [indicator, setIndicator] = useState<Indicator>('volume');

  const bars = useMemo(
    () =>
      daily.slice(-BARS).map((candle) => ({
        label: formatSessionDay(istDayKey(candle.time * 1000) ?? ''),
        value: candle.volume,
      })),
    [daily],
  );
  const hasVolume = bars.some((bar) => bar.value > 0);
  const rsiValues = useMemo(
    () =>
      rsi(daily.map((candle) => candle.close))
        .filter((value): value is number => value !== null)
        .slice(-90),
    [daily],
  );

  return (
    <View className="rounded-card border border-line bg-surface p-3.5 dark:border-line-dark dark:bg-surface-dark">
      <SegmentedControl
        items={INDICATORS}
        value={indicator}
        onChange={setIndicator}
        className="mb-3"
      />
      {indicator === 'volume' ? (
        hasVolume ? (
          <BarChart
            bars={bars}
            height={HEIGHT}
            accessibilityLabel={`Traded volume over the last ${bars.length} sessions`}
          />
        ) : (
          <Text className="py-8 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
            No traded volume in this history.
          </Text>
        )
      ) : rsiValues.length > 1 ? (
        <RsiChart values={rsiValues} />
      ) : (
        <Text className="py-8 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          RSI (14) needs at least 15 sessions of history.
        </Text>
      )}
      <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
        {indicator === 'volume'
          ? `Shares traded per session, last ${bars.length} sessions.`
          : 'Above 70 is often read as overbought, below 30 as oversold. Computed from real closes.'}
      </Text>
    </View>
  );
}
