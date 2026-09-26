import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { StockLogo } from '@/components/market/StockLogo';
import { formatINR, formatSignedPercent } from '@/lib/utils/formatters';

interface MoverCardProps {
  symbol: string;
  name?: string | null;
  price: number | null;
  changePercent: number | null;
  logoUri?: string;
  onPress: () => void;
}

/** Two-column card from the design's "Top movers" grid. */
export const MoverCard = memo(function MoverCard({
  symbol,
  name,
  price,
  changePercent,
  logoUri,
  onPress,
}: MoverCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name ?? symbol}, ${formatINR(price)}, ${formatSignedPercent(changePercent)}`}
      onPress={onPress}
      className="flex-1 rounded-card border border-line bg-surface p-3.5 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-center gap-2">
        <StockLogo symbol={symbol} uri={logoUri} size="sm" />
        <Text
          className="flex-1 text-xs font-semibold text-ink dark:text-ink-dark"
          numberOfLines={1}
        >
          {symbol}
        </Text>
      </View>
      <Text className="mt-3 text-[15px] font-bold text-ink dark:text-ink-dark">
        {formatINR(price)}
      </Text>
      <ChangeText value={changePercent} className="mt-0.5 text-xs">
        {formatSignedPercent(changePercent)}
      </ChangeText>
    </Pressable>
  );
});
