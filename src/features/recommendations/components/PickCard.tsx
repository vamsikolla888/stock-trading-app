import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import React, { memo, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { Sparkline } from '@/components/market/Sparkline';
import { StockLogo } from '@/components/market/StockLogo';
import { Badge } from '@/components/ui/Badge';
import { Meter } from '@/components/ui/Meter';
import { LevelsRow } from '@/features/insights/components/LevelsRow';
import type { Recommendation, RecommendationReview } from '@/features/insights/types';
import { stockLogoUrl } from '@/features/market/api';
import { useCandles } from '@/features/market/hooks';
import { stockHref } from '@/lib/navigation';
import { formatINR, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { usePickQuote } from '../api';
import { levelProgress, recentCloses, scoreWord, upsidePct, VERDICT } from '../lib/picks';

const RISK_VARIANT = { Low: 'success', Medium: 'warning', High: 'danger' } as const;
const numbers = { fontVariant: ['tabular-nums' as const] };

/** ~24 daily closes. Shares the stock screen's 1Y candle cache, so opening the stock is free. */
function PickTrend({ symbol, exchange }: { symbol: string; exchange: string }) {
  const candles = useCandles(symbol, exchange, '1Y');
  const closes = useMemo(() => recentCloses(candles.data, 24), [candles.data]);
  if (closes.length < 2) return <View style={{ width: 64, height: 26 }} />;
  return <Sparkline data={closes} width={64} height={26} />;
}

interface PickCardProps {
  pick: Recommendation;
  review?: RecommendationReview;
}

/**
 * One research setup: the stock, the engine's setup score (an ordinal 0–100, never a
 * probability), the levels, and the reasons — collapsed so the list stays scannable.
 */
export const PickCard = memo(function PickCard({ pick, review }: PickCardProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  // The published price stays as the fallback when the snapshot has no quote.
  const quote = usePickQuote(pick.sym, pick.exch);
  const price = quote.data?.ltp ?? pick.ltp;
  const change = quote.data?.ltp != null ? (quote.data.changePct ?? null) : null;
  const upside = upsidePct(price, pick.target);
  const progress = levelProgress(price, pick.stop, pick.target);
  const signal =
    pick.why[0]?.head ?? (pick.source === 'historical' ? 'Technical setup' : 'News signal');
  const verdict = review ? VERDICT[review.verdict] : null;

  return (
    <View className="overflow-hidden rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${pick.name}, ${pick.sym}. Setup score ${pick.conf} of 100. Last price ${formatINR(price)}. Open the stock`}
        onPress={() => router.push(stockHref(pick.sym, pick.exch))}
        className="px-4 pt-4 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <View className="flex-row items-start gap-3">
          <StockLogo symbol={pick.sym} uri={stockLogoUrl(pick.sym)} size="lg" />
          <View className="min-w-0 flex-1">
            <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
              {pick.sym}
            </Text>
            <Text
              className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
              numberOfLines={1}
            >
              {pick.name} · {pick.exch}
            </Text>
          </View>
          <View className="items-end">
            <Text
              className="text-[20px] font-bold text-ink dark:text-ink-dark"
              style={[numbers, { letterSpacing: -0.4 }]}
            >
              {pick.conf}
            </Text>
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
              {scoreWord(pick.conf)} score
            </Text>
          </View>
        </View>
        <Meter
          value={pick.conf}
          tone="brand"
          height={4}
          className="mt-3"
          accessibilityLabel={`Setup score ${pick.conf} of 100 — the engine's ranking, not a probability`}
        />

        <View className="mt-3 flex-row items-center gap-3">
          <View className="flex-1">
            <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">Last price</Text>
            <View className="mt-0.5 flex-row items-baseline gap-1.5">
              <Text className="text-base font-bold text-ink dark:text-ink-dark" style={numbers}>
                {formatINR(price)}
              </Text>
              {change !== null ? (
                <ChangeText value={change} className="text-xs" style={numbers}>
                  {formatSignedPercent(change)}
                </ChangeText>
              ) : null}
            </View>
            {upside !== null ? (
              <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                {upside >= 0
                  ? `${formatPercent(upside, 1)} to target`
                  : `${formatPercent(Math.abs(upside), 1)} above target`}
              </Text>
            ) : null}
          </View>
          <PickTrend symbol={pick.sym} exchange={pick.exch} />
        </View>

        <LevelsRow entryLow={pick.lo} entryHigh={pick.hi} target={pick.target} stop={pick.stop} />
      </Pressable>

      <View className="flex-row flex-wrap items-center gap-1.5 px-4 pt-3">
        <Badge label={`${pick.risk} risk`} variant={RISK_VARIANT[pick.risk] ?? 'neutral'} />
        {verdict ? <Badge label={verdict.label} variant={verdict.tone} /> : null}
        <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {signal}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide the reasons' : 'Why this pick'}
        onPress={() => setOpen((value) => !value)}
        className="mt-2 flex-row items-center justify-between border-t border-line px-4 py-3 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
      >
        <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
          {open ? 'Hide details' : 'Why this pick'}
        </Text>
        {open ? (
          <ChevronUp size={16} color={colors.link} />
        ) : (
          <ChevronDown size={16} color={colors.link} />
        )}
      </Pressable>

      {open ? (
        <View className="px-4 pb-4">
          {pick.why.map((reason, index) => (
            <View key={`${index}-${reason.head}`} className="mt-2 flex-row gap-2">
              <Text className="text-[13px] text-ink-faint dark:text-ink-dark-faint">•</Text>
              <View className="flex-1">
                <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                  {reason.head}
                </Text>
                <Text className="mt-0.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
                  {reason.text}
                </Text>
              </View>
            </View>
          ))}

          {progress !== null ? (
            <View className="mt-4">
              <View className="flex-row justify-between">
                <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">Stop</Text>
                <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                  Where the price sits
                </Text>
                <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">Target</Text>
              </View>
              <Meter
                value={progress}
                tone="info"
                height={4}
                className="mt-1.5"
                accessibilityLabel={`Price is ${Math.round(progress)}% of the way from stop to target`}
              />
            </View>
          ) : null}

          {review ? (
            <View className="mt-4 rounded-lg bg-surface-sunk p-3 dark:bg-surface-sunk-dark">
              <Text className="text-xs font-semibold text-ink dark:text-ink-dark">
                {VERDICT[review.verdict].label}
              </Text>
              <Text className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                {review.reasoning}
              </Text>
              {review.contradictions.map((line) => (
                <Text
                  key={line}
                  className="mt-1 text-xs leading-[17px] text-warning-600 dark:text-warning-dark"
                >
                  Against: {line}
                </Text>
              ))}
              {review.invalidation ? (
                <Text className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                  Wrong if: {review.invalidation}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View className="mt-4 gap-1">
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              Hold {pick.hold} · suggested allocation {formatPercent(pick.allocationPercent, 0)} of
              a fully deployed day
            </Text>
            {pick.caveat ? (
              <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
                {pick.caveat}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
});
