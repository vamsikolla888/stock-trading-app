import React, { useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { trendTextClass } from '@/components/market/ChangeText';
import { InsightCard } from '@/components/ui/InsightCard';
import { Section } from '@/components/ui/Section';
import { formatIstDateTime, formatSessionDay } from '@/features/home/lib/istTime';
import type { Recommendation } from '@/features/insights/types';
import { useCandles, useSentiment } from '@/features/market/hooks';
import { technicalHeadline, technicalSummary } from '@/features/market/lib/technicalSummary';
import type { StockDetail } from '@/features/market/types';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import {
  formatNet,
  MOOD_LABEL,
  sentimentMood,
  sentimentSymbols,
  type SentimentMood,
} from '../lib/priceView';

import { IndicatorCharts } from './IndicatorCharts';

const MOOD_TEXT: Record<SentimentMood, string> = {
  positive: 'text-brand-text dark:text-brand-text-dark',
  negative: 'text-danger-600 dark:text-danger-dark',
  mixed: 'text-ink dark:text-ink-dark',
};

function SentimentSection({ detail }: { detail: StockDetail }) {
  const { colors } = useTheme();
  const symbols = useMemo(
    () => sentimentSymbols(detail.symbol, detail.listings),
    [detail.symbol, detail.listings],
  );
  const sentiment = useSentiment(symbols);
  const data = sentiment.data;

  let body: React.ReactNode;
  if (sentiment.isPending) {
    body = <ActivityIndicator color={colors.accent} />;
  } else if (sentiment.error && !data) {
    body = (
      <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
        News sentiment couldn’t be loaded just now. {getErrorMessage(sentiment.error)}
      </Text>
    );
  } else if (!data || data.articles === 0 || data.net === null) {
    body = (
      <View className="rounded-card border border-dashed border-line-strong p-4 dark:border-line-dark-strong">
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No analysed news about this company in the last {data?.days ?? 30} days.
        </Text>
      </View>
    );
  } else {
    const mood = sentimentMood(data.net);
    const total = data.articles || 1;
    const latest = formatIstDateTime(data.latestAt);
    body = (
      <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
        <View className="flex-row items-baseline gap-2">
          <Text
            className={cn('text-[30px] font-bold', MOOD_TEXT[mood])}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatNet(data.net)}
          </Text>
          <Text className={cn('text-sm font-semibold', MOOD_TEXT[mood])}>{MOOD_LABEL[mood]}</Text>
        </View>
        <View
          accessible
          accessibilityLabel={`${data.positive} positive, ${data.neutral} neutral, ${data.negative} negative`}
          className="mt-3 h-2 flex-row overflow-hidden rounded-full bg-line dark:bg-line-dark"
        >
          <View
            className="bg-brand-strong dark:bg-brand-strong-dark"
            style={{ width: `${(data.positive / total) * 100}%` }}
          />
          <View
            className="bg-ink-faint dark:bg-ink-dark-faint"
            style={{ width: `${(data.neutral / total) * 100}%` }}
          />
          <View
            className="bg-danger-500 dark:bg-danger-dark"
            style={{ width: `${(data.negative / total) * 100}%` }}
          />
        </View>
        <Text className="mt-2 text-xs text-ink-muted dark:text-ink-dark-muted">
          {data.positive} positive · {data.neutral} neutral · {data.negative} negative
          {latest ? ` · latest ${latest} IST` : ''}
        </Text>
        <Text className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Net = (positive − negative) ÷ articles, from each article’s AI analysis
          {data.models.length ? ` (${data.models.join(', ')})` : ''}.
        </Text>
      </View>
    );
  }

  return (
    <Section
      title="News sentiment"
      note={
        data && data.articles > 0
          ? `${data.articles} article${data.articles === 1 ? '' : 's'} · ${data.days} days`
          : undefined
      }
    >
      {body}
    </Section>
  );
}

/** The engine's own reasons, verbatim, and what it is less sure about. */
function WhyThisPick({ pick, batchDate }: { pick: Recommendation; batchDate: string | undefined }) {
  return (
    <Section
      title="Why this pick"
      note={batchDate ? `${formatSessionDay(batchDate)} batch` : undefined}
      className="mt-6"
    >
      <View className="gap-4 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
        {pick.why.map((reason) => (
          <View key={reason.head}>
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
 * and charts from real daily bars (the web's maths) and 30-day news sentiment. No reading
 * is shown that the data can't support.
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
  // Shares the chart's 1Y cache entry (250 daily bars) — no extra request.
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
              ? `Daily history couldn’t be loaded. ${getErrorMessage(daily.error)}`
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

      <SentimentSection detail={detail} />
    </View>
  );
}
