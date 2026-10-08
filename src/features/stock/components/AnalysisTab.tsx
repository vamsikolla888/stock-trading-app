import React, { useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { trendTextClass } from '@/components/market/ChangeText';
import { InsightCard } from '@/components/ui/InsightCard';
import { Section } from '@/components/ui/Section';
import { formatSessionDay } from '@/features/home/lib/istTime';
import type { Recommendation } from '@/features/insights/types';
import { useCandles } from '@/features/market/hooks';
import { candlesErrorMessage } from '@/features/market/lib/chartRanges';
import { technicalHeadline, technicalSummary } from '@/features/market/lib/technicalSummary';
import type { StockDetail } from '@/features/market/types';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import { IndicatorCharts } from './IndicatorCharts';

/** The engine's own reasons, verbatim, and what it is less sure about. */
function WhyThisPick({ pick, batchDate }: { pick: Recommendation; batchDate: string | undefined }) {
  return (
    <Section
      title="Why this pick"
      note={batchDate ? `${formatSessionDay(batchDate)} batch` : undefined}
      className="mt-6"
    >
      <View className="gap-4 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
        {pick.why.map((reason, index) => (
          // Two reasons can share a heading; the position is the stable identity.
          <View key={index}>
            <Text className="text-sm font-semibold text-ink dark:text-ink-dark">{reason.head}</Text>
            <Text className="mt-1 text-[14px] leading-[21px] text-ink dark:text-ink-dark">
              {reason.text}
            </Text>
          </View>
        ))}
        {pick.caveat ? (
          <View className="rounded-xl bg-warning-wash p-3 dark:bg-warning-wash-dark">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-warning-600 dark:text-warning-dark">
              What we are less sure about
            </Text>
            <Text className="mt-1.5 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
              {pick.caveat}
            </Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
        In the engine’s own words. Not investment advice.
      </Text>
    </Section>
  );
}

/**
 * The full case when this listing is in today's batch, then on-device technical readings
 * and charts from real daily bars (the web's maths). No reading is shown that the data can't
 * support. News sentiment lives on the News tab, with the company's news.
 */
export function AnalysisTab({
  detail,
  ltp,
  pick,
  batchDate,
}: {
  detail: StockDetail;
  ltp: number | null;
  pick: Recommendation | undefined;
  batchDate: string | undefined;
}) {
  const { colors } = useTheme();
  // Shares the chart's 1Y cache entry (260 daily bars) — no extra request.
  const daily = useCandles(detail.symbol, detail.exchange, '1Y');
  const readings = useMemo(
    () => (daily.data && daily.data.length > 0 ? technicalSummary(daily.data, ltp) : null),
    [daily.data, ltp],
  );
  const headline = readings ? technicalHeadline(readings) : null;

  return (
    <View>
      {/* First when present: "Read the full case" on the Overview tab lands here. */}
      {pick ? <WhyThisPick pick={pick} batchDate={batchDate} /> : null}

      <Section title="Technical summary" note="Daily bars" className={pick ? undefined : 'mt-6'}>
        {readings ? (
          <View className="overflow-hidden rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
            {readings.map((reading, index) => (
              <View
                key={reading.label}
                accessible
                accessibilityLabel={`${reading.label}: ${reading.value ?? 'not enough history'}. ${reading.note}`}
                className={cn(
                  'flex-row items-center px-3.5 py-3',
                  index > 0 && 'border-t border-line dark:border-line-dark',
                )}
              >
                <Text className="w-24 text-[13px] text-ink-muted dark:text-ink-dark-muted">
                  {reading.label}
                </Text>
                <View className="flex-1">
                  <Text
                    className="text-sm font-semibold text-ink dark:text-ink-dark"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {reading.value ?? '—'}
                  </Text>
                  <Text
                    className={cn(
                      'mt-0.5 text-xs',
                      reading.tone === 'neutral'
                        ? 'text-ink-muted dark:text-ink-dark-muted'
                        : trendTextClass[reading.tone],
                    )}
                  >
                    {reading.note}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : daily.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
            {daily.error
              ? candlesErrorMessage(daily.error)
              : 'Daily history isn’t available for this stock.'}
          </Text>
        )}
      </Section>

      {headline ? (
        <InsightCard
          className="mt-4"
          kicker="Technical read"
          title={headline}
          body="Computed from the stock's own daily prices. It describes the trend — it isn't a recommendation."
        />
      ) : null}

      {daily.data && daily.data.length > 1 ? (
        <Section title="Indicators">
          <IndicatorCharts daily={daily.data} />
        </Section>
      ) : null}
    </View>
  );
}
