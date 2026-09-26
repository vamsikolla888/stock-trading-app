import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { Sparkline } from '@/components/market/Sparkline';
import { StockLogo } from '@/components/market/StockLogo';
import { formatINR, formatSignedPercent } from '@/lib/utils/formatters';

interface StockRowProps {
  symbol: string;
  name?: string | null;
  exchange?: string | null;
  price?: number | null;
  changePercent?: number | null;
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

/** Name · meta on the left, price · change on the right — the design's stock-row. */
export const StockRow = memo(function StockRow({
  symbol,
  name,
  exchange,
  price,
  changePercent,
  logoUri,
  subtitle,
  right,
  trend,
  onPress,
  onLongPress,
}: StockRowProps) {
  const title = name || symbol;
  const meta = subtitle ?? `${symbol}${exchange ? ` · ${exchange}` : ''}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${formatINR(price)}, ${formatSignedPercent(changePercent)}`}
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
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
            {formatINR(price)}
          </Text>
          <ChangeText value={changePercent} className="mt-0.5 text-xs">
            {formatSignedPercent(changePercent)}
          </ChangeText>
        </View>
      )}
    </Pressable>
  );
});
