import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { LiveFlash } from '@/components/market/LiveFlash';
import { Sparkline } from '@/components/market/Sparkline';
import { StockLogo } from '@/components/market/StockLogo';
import { overlayQuote } from '@/features/market/lib/liveQuote';
import { useLiveQuote } from '@/features/market/live';
import { formatINR, formatSignedPercent } from '@/lib/utils/formatters';

const NUM = { fontVariant: ['tabular-nums' as const] };

interface StockRowProps {
  symbol: string;
  name?: string | null;
  exchange?: string | null;
  price?: number | null;
  changePercent?: number | null;
  /** The REST row's previous close, when it has one — the live move is measured against it. */
  prevClose?: number | null;
  /** Stream the price live (default). Off for rows that aren't a tradable listing. */
  live?: boolean;
  logoUri?: string | null;
  /** Replaces the "SYMBOL · NSE" line, e.g. "10 shares · Avg ₹1,210". */
  subtitle?: string;
  /** Replaces the price column (e.g. holding value + P&L). */
  right?: React.ReactNode;
  /** Recent closes, oldest first — drawn as a sparkline before the price. */
  trend?: readonly number[];
  onPress?: () => void;
  onLongPress?: () => void;
}

/**
 * Name · meta on the left, price · change on the right — the design's stock-row. The price
 * streams live while the row is on a focused screen (useLiveQuote), measured against the REST
 * row's previous close; until the first tick it shows the REST figures it was given.
 */
export const StockRow = memo(function StockRow({
  symbol,
  name,
  exchange,
  price,
  changePercent,
  prevClose,
  live = true,
  logoUri,
  subtitle,
  right,
  trend,
  onPress,
  onLongPress,
}: StockRowProps) {
  const title = name || symbol;
  const meta = subtitle ?? `${symbol}${exchange ? ` · ${exchange}` : ''}`;
  // A row whose price column is replaced shows no price to stream.
  const quote = useLiveQuote(exchange, symbol, { enabled: live && !right });
  const view = overlayQuote({ price, changePct: changePercent, prevClose }, quote);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${formatINR(view.price)}, ${formatSignedPercent(view.changePct)}`}
      disabled={!onPress && !onLongPress}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      className="min-h-[68px] flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <StockLogo symbol={symbol} uri={logoUri} />
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {trend && trend.length > 1 ? <Sparkline data={trend} /> : null}
      {right ?? (
        <View className="items-end">
          <LiveFlash seq={quote?.seq} dir={quote?.dir}>
            <Text className="text-sm font-semibold text-ink dark:text-ink-dark" style={NUM}>
              {formatINR(view.price)}
            </Text>
          </LiveFlash>
          <ChangeText value={view.changePct} className="mt-0.5 text-xs" style={NUM}>
            {formatSignedPercent(view.changePct)}
          </ChangeText>
        </View>
      )}
    </Pressable>
  );
});
