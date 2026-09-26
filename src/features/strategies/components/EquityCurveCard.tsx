import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { PriceChart, type ChartPoint } from '@/components/market/PriceChart';
import { Card } from '@/components/ui/Card';
import { RangeSelector } from '@/components/ui/Tabs';
import { formatIst } from '@/features/insights/lib/dates';
import { formatNumber, formatSignedPercent } from '@/lib/utils/formatters';

import { EQUITY_RANGES, equityPoints, type EquityRange } from '../lib/backtest';
import type { EquityPoint } from '../types';

const dateOf = (ms: number) => formatIst(ms, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The backtest's equity curve — a portfolio INDEXED TO 100 (equal-weight slots, no rupee
 * account behind it), so every readout is a percentage of that base, never rupees.
 */
export function EquityCurveCard({ points }: { points: readonly EquityPoint[] }) {
  const [range, setRange] = useState<EquityRange>('ALL');
  const [active, setActive] = useState<ChartPoint | null>(null);
  const chart = useMemo(() => equityPoints(points, range), [points, range]);

  if (chart.length < 2) {
    return (
      <Card>
        <Text className="text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Not enough of a curve to plot yet.
        </Text>
      </Card>
    );
  }

  const first = chart[0]!;
  const last = chart[chart.length - 1]!;
  const values = chart.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // The starting level, drawn only when it sits inside the plotted band.
  const baseline = 100 >= min && 100 <= max ? 100 : null;
  const rangeChange = first.value > 0 ? (last.value / first.value - 1) * 100 : null;

  return (
    <Card>
      <View className="flex-row items-start justify-between gap-3" accessibilityLiveRegion="polite">
        <View className="flex-1">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            {active ? dateOf(active.time) : 'Portfolio indexed to 100'}
          </Text>
          <Text
            className="mt-0.5 text-[20px] font-bold text-ink dark:text-ink-dark"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatNumber((active ?? last).value, 2)}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            {active ? 'vs start (100)' : 'Over this range'}
          </Text>
          {active ? (
            <ChangeText
              value={active.value - 100}
              className="mt-0.5 text-sm"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {formatSignedPercent(active.value - 100, 2)}
            </ChangeText>
          ) : (
            <ChangeText
              value={rangeChange}
              className="mt-0.5 text-sm"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {formatSignedPercent(rangeChange, 2)}
            </ChangeText>
          )}
        </View>
      </View>
      <View className="mt-3">
        <PriceChart points={chart} height={190} baseline={baseline} onScrub={setActive} />
      </View>
      <View className="mt-2 flex-row justify-between">
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {dateOf(first.time)}
        </Text>
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {dateOf(last.time)}
        </Text>
      </View>
      <RangeSelector
        items={EQUITY_RANGES}
        value={range}
        onChange={setRange}
        className="mt-3 justify-center"
      />
    </Card>
  );
}
