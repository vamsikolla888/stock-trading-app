import React, { memo } from 'react';
import { Pressable, Text } from 'react-native';

import { formatINR, formatNumber, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { heatSwatch, tileDetail, type TileDetail } from '../lib/heatmap';
import type { HeatmapStock } from '../types';

interface HeatmapTileProps {
  stock: HeatmapStock;
  width: number;
  height: number;
  onPress: (stock: HeatmapStock) => void;
  /** Absolute position inside the treemap; omitted in the grid. */
  left?: number;
  top?: number;
}

const SYMBOL_SIZE: Record<TileDetail, number> = { none: 0, symbol: 10, compact: 11, full: 13 };

/** One constituent: colour = move over the timeframe, and as much text as the tile can hold. */
export const HeatmapTile = memo(function HeatmapTile({
  stock,
  width,
  height,
  onPress,
  left,
  top,
}: HeatmapTileProps) {
  const { isDark } = useTheme();
  const swatch = heatSwatch(stock.changePct, isDark);
  const detail = tileDetail(width, height);
  const pct = formatSignedPercent(stock.changePct);
  const positioned = left !== undefined && top !== undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stock.symbol}, ${stock.companyName ?? 'company name unavailable'}, ${pct}`}
      accessibilityHint="Opens the stock"
      onPress={() => onPress(stock)}
      className="items-center justify-center overflow-hidden rounded-[4px] active:opacity-75"
      style={[
        { backgroundColor: swatch.bg, width, height, paddingHorizontal: 3 },
        positioned ? { position: 'absolute', left, top } : null,
      ]}
    >
      {detail !== 'none' ? (
        <Text
          numberOfLines={1}
          style={{ color: swatch.fg, fontSize: SYMBOL_SIZE[detail], fontWeight: '700' }}
        >
          {stock.symbol}
        </Text>
      ) : null}
      {detail === 'compact' || detail === 'full' ? (
        <Text
          numberOfLines={1}
          style={{
            color: swatch.fg,
            fontSize: detail === 'full' ? 12 : 10,
            fontWeight: '600',
            fontVariant: ['tabular-nums'],
            marginTop: 1,
          }}
        >
          {pct}
        </Text>
      ) : null}
      {detail === 'full' ? (
        <Text
          numberOfLines={1}
          style={{
            color: swatch.fg,
            fontSize: 10,
            opacity: 0.9,
            fontVariant: ['tabular-nums'],
            marginTop: 1,
          }}
        >
          {stock.ltp !== null && stock.ltp >= 10_000
            ? `₹${formatNumber(stock.ltp, 0)}`
            : formatINR(stock.ltp)}
        </Text>
      ) : null}
    </Pressable>
  );
});
