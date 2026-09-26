import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { PriceChart, type ChartPoint } from '@/components/market/PriceChart';
import { Card } from '@/components/ui/Card';
import { Donut } from '@/components/ui/Donut';
import { KpiGrid } from '@/components/ui/KpiGrid';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { RangeSelector } from '@/components/ui/Tabs';
import { Caveats, Note } from '@/features/trading/components/Sheet';
import { formatINR, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { usePortfolioHistory } from '../hooks';
import { largestHolding, topPerformer } from '../lib/book';
import { formatDay, istDateOf } from '../lib/dates';
import { CHART_PALETTES, sectorAllocation, type HoldingView } from '../lib/portfolio';
import type { PortfolioHistoryScope } from '../types';

import { formatReturn, useMask } from './BookSummaryCard';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };

type RangeKey = '1W' | '1M' | '3M' | '6M' | '1Y';
const RANGES: readonly { key: RangeKey; label: string; days: number }[] = [
  { key: '1W', label: '1W', days: 7 },
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 90 },
  { key: '6M', label: '6M', days: 180 },
  { key: '1Y', label: '1Y', days: 365 },
];

/**
 * Today's holdings re-priced over past closes — NOT the account's recorded history (there's
 * no order log for a broker account). The server's caveats say so and are always shown.
 */
function HistoryCard({ scope }: { scope: PortfolioHistoryScope }) {
  const mask = useMask();
  const [range, setRange] = useState<RangeKey>('6M');
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const days = RANGES.find((item) => item.key === range)?.days ?? 180;
  const history = usePortfolioHistory(days, scope);
  const onScrub = useCallback((point: ChartPoint | null) => setScrub(point), []);

  const points = useMemo<ChartPoint[]>(
    () =>
      (history.data?.points ?? []).map((point) => ({ time: point.t * 1000, value: point.value })),
    [history.data],
  );
  const first = points[0];
  const last = points[points.length - 1];
  const shown = scrub ?? last;
  const change = first && shown ? shown.value - first.value : null;
  const changePct =
    first && change !== null && first.value > 0 ? (change / first.value) * 100 : null;

  return (
    <Card>
      {history.isPending ? (
        <View className="gap-3">
          <Skeleton width="45%" height={22} />
          <Skeleton height={170} />
        </View>
      ) : history.error && !history.data ? (
        <InlineError
          what="the performance curve"
          error={history.error}
          onRetry={() => void history.refetch()}
          className="border-0 px-0"
        />
      ) : points.length < 2 ? (
        <Text className="py-6 text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          {history.data?.curveUnavailableReason ?? 'Not enough price history to draw a curve yet.'}
        </Text>
      ) : (
        <View style={{ opacity: history.isPlaceholderData ? 0.6 : 1 }}>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            {shown ? formatDay(istDateOf(new Date(shown.time).toISOString())) : ''}
          </Text>
          <Text className="mt-0.5 text-xl font-bold text-ink dark:text-ink-dark" style={NUMBERS}>
            {shown ? mask(formatINR(shown.value)) : '—'}
          </Text>
          <ChangeText value={change} className="mt-0.5 text-xs" style={NUMBERS}>
            {mask(formatReturn(change, changePct))} over this range
          </ChangeText>
          <View className="mt-3">
            <PriceChart points={points} height={170} onScrub={onScrub} />
          </View>
          {!history.data?.curveComplete ? (
            <Note>Includes carried-forward prices on days a stock had no close.</Note>
          ) : null}
        </View>
      )}
      <RangeSelector
        items={RANGES}
        value={range}
        onChange={setRange}
        className="mt-3 justify-between"
      />
      <Caveats items={history.data?.caveats ?? []} className="mt-3 gap-1.5" />
    </Card>
  );
}

/**
 * The web's Analytics block for one broker: performance curve, sector allocation, and the
 * top performer / largest holding.
 */
export function PerformanceSection({
  holdings,
  scope,
  showHistory = true,
}: {
  holdings: readonly HoldingView[];
  scope: PortfolioHistoryScope;
  showHistory?: boolean;
}) {
  const { isDark } = useTheme();
  const mask = useMask();
  const palette = isDark ? CHART_PALETTES.dark : CHART_PALETTES.light;
  const segments = useMemo(() => sectorAllocation(holdings, 5, palette), [holdings, palette]);
  const top = topPerformer(holdings);
  const largest = largestHolding(holdings);

  return (
    <View>
      {showHistory ? (
        <Section title="Performance history" className="mt-0">
          <HistoryCard scope={scope} />
        </Section>
      ) : null}

      <Section title="Sector allocation" note="by current value">
        <Card>
          {segments.length > 0 ? (
            <Donut segments={segments} />
          ) : (
            <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
              No holdings to break down yet.
            </Text>
          )}
        </Card>
      </Section>

      <KpiGrid
        className="mt-3"
        items={[
          {
            label: 'Top performer',
            value: top ? top.symbol : '—',
            sub: top ? `${formatSignedPercent(top.pnlPct)} overall` : undefined,
          },
          {
            label: 'Largest holding',
            value: largest ? largest.symbol : '—',
            sub: largest ? mask(formatINR(largest.value ?? largest.invested)) : undefined,
          },
        ]}
      />
    </View>
  );
}
