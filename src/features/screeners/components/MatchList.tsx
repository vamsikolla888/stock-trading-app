import { useRouter } from 'expo-router';
import React, { memo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { LiveFlash } from '@/components/market/LiveFlash';
import { Sparkline } from '@/components/market/Sparkline';
import { StockLogo } from '@/components/market/StockLogo';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { stockLogoUrl } from '@/features/market/api';
import { overlayQuote } from '@/features/market/lib/liveQuote';
import { useLiveQuote } from '@/features/market/live';
import { stockHref } from '@/lib/navigation';
import { formatINR, formatNumber, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { matchTrend, metricSummary } from '../lib/metrics';
import type { ScreenerMatch } from '../types';

/** Rows revealed per "Show more" — the list is already fetched, so this only limits drawing. */
export const MATCH_PAGE_SIZE = 20;

const numbers = { fontVariant: ['tabular-nums' as const] };

/**
 * One match: the stock, the figures that satisfied the screen, a ~30-close trend and the
 * price — the scan's, then the live feed's. The sparkline is coloured by its own window, so a
 * green day inside a falling month never draws a red line under a green number.
 */
const MatchRow = memo(function MatchRow({ match }: { match: ScreenerMatch }) {
  const router = useRouter();
  const { colors } = useTheme();
  const trend = matchTrend(match);
  const evidence = metricSummary(match.metrics, 3);
  const index = match.indices?.primary?.shortLabel;
  const first = trend[0];
  const last = trend[trend.length - 1];
  const trendColor =
    first !== undefined && last !== undefined && last < first ? colors.loss : colors.gain;
  const quote = useLiveQuote(match.exchange, match.symbol);
  const view = overlayQuote({ price: match.ltp, changePct: match.changePct }, quote);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${match.companyName ?? match.symbol} on ${match.exchange}, ${formatINR(view.price)}, ${formatSignedPercent(view.changePct)}${evidence ? `. ${evidence}` : ''}`}
      onPress={() => router.push(stockHref(match.symbol, match.exchange))}
      className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <StockLogo symbol={match.symbol} uri={stockLogoUrl(match.symbol)} />
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
          {match.companyName || match.symbol}
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {match.symbol} · {match.exchange}
          {index ? ` · ${index}` : ''}
        </Text>
        {evidence ? (
          <Text
            className="mt-1 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
            numberOfLines={2}
            style={numbers}
          >
            {evidence}
          </Text>
        ) : null}
      </View>
      {trend.length > 1 ? <Sparkline data={trend} color={trendColor} /> : null}
      <View className="items-end">
        <LiveFlash seq={quote?.seq} dir={quote?.dir}>
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark" style={numbers}>
            {formatINR(view.price)}
          </Text>
        </LiveFlash>
        <ChangeText value={view.changePct} className="mt-0.5 text-xs" style={numbers}>
          {formatSignedPercent(view.changePct)}
        </ChangeText>
      </View>
    </Pressable>
  );
});

interface MatchListProps {
  matches: readonly ScreenerMatch[];
  /** True total found by the scan; can exceed `matches.length` when the stored list is capped. */
  matchCount: number;
  /** What the capped list kept, when a cap is in play — differs by screener kind. */
  cappedNote?: string;
}

/**
 * The matches of one screener, built-in or custom. Parents remount it (a `key` per screener)
 * so a long list's "Show more" never carries over to a shorter one.
 */
export function MatchList({ matches, matchCount, cappedNote }: MatchListProps) {
  const [shown, setShown] = useState(MATCH_PAGE_SIZE);
  if (matches.length === 0) return null;

  const visible = matches.slice(0, shown);
  const remaining = matches.length - visible.length;
  const capped = matchCount > matches.length;

  return (
    <View>
      <ListCard>
        {visible.map((match, index) => (
          <View key={`${match.exchange}:${match.symbol}`}>
            {index > 0 ? <RowDivider /> : null}
            <MatchRow match={match} />
          </View>
        ))}
      </ListCard>

      {remaining > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShown((n) => n + MATCH_PAGE_SIZE)}
          className="mt-2 self-center px-3 py-2 active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Show {Math.min(MATCH_PAGE_SIZE, remaining)} more
          </Text>
        </Pressable>
      ) : null}

      <Text
        className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint"
        style={numbers}
      >
        Showing {formatNumber(visible.length, 0)} of {formatNumber(matches.length, 0)}
        {capped
          ? ` · ${formatNumber(matchCount, 0)} matched, top ${formatNumber(matches.length, 0)} kept`
          : ''}
        . Prices are from the last scan — open a stock for its live price.
      </Text>
      {capped && cappedNote ? (
        <Text className="mt-1.5 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
          {cappedNote}
        </Text>
      ) : null}
    </View>
  );
}
