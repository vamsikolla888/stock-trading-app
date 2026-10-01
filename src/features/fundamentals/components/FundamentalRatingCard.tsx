import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Section } from '@/components/ui/Section';
import { useTheme } from '@/theme/ThemeProvider';

import { useFundamentalAnalysis } from '../hooks';
import { pct, VERDICT_SHORT, VERDICT_TONE, WORKING_STATES } from '../lib/format';

import { ScoreRing } from './ScoreRing';

/**
 * The fundamental rating at a glance on a stock's Overview — the web puts the analysis right
 * under the price chart. Shares the Fundamentals tab's query, so opening the tab is instant.
 * Hidden when the stock is simply not rated (an ETF, a delisting) or the request fails: the
 * Overview must never grow an error box for a supplementary card.
 */
export function FundamentalRatingCard({
  symbol,
  exchange,
  onOpen,
}: {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const response = useFundamentalAnalysis(symbol, exchange);
  const data = response.data;
  const analysis = data?.analysis ?? null;
  const working = data != null && WORKING_STATES.has(data.state);

  if (!data || (!analysis && !working)) return null;

  return (
    <Section title="Fundamental rating">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          analysis
            ? `Fundamental rating ${analysis.ratingPct == null ? 'unavailable' : `${Math.round(analysis.ratingPct)} percent`}, ${VERDICT_SHORT[analysis.verdict]}. Opens the full analysis`
            : 'Fundamental analysis in progress. Opens the analysis'
        }
        onPress={onOpen}
        className="flex-row items-center gap-3.5 rounded-card border border-line bg-surface p-3.5 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
      >
        {analysis ? (
          <ScoreRing
            value={analysis.ratingPct}
            tone={VERDICT_TONE[analysis.verdict]}
            size={58}
            label=""
          />
        ) : (
          <View className="h-[58px] w-[58px] items-center justify-center">
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
        <View className="min-w-0 flex-1 gap-1">
          {analysis ? (
            <>
              <View className="flex-row">
                <Badge
                  label={VERDICT_SHORT[analysis.verdict]}
                  variant={VERDICT_TONE[analysis.verdict]}
                />
              </View>
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
                Quality {pct(analysis.qualityPct, 0)} · Valuation {pct(analysis.valuationPct, 0)}
                {analysis.knockouts.length > 0 ? ' · red flag' : ''}
              </Text>
            </>
          ) : (
            <>
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                Analysing the fundamentals
              </Text>
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                Financials, scoring and a written review — a minute or two.
              </Text>
            </>
          )}
        </View>
        <ChevronRight size={18} color={colors.textFaint} />
      </Pressable>
    </Section>
  );
}
