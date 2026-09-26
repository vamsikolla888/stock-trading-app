import React, { memo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

import type { MiniCandle } from '../types';

/**
 * The small intraday candlestick chart on an Explore tile — the latest session only (the
 * server trims it). Drawn at the box's measured width rather than stretched: a stretched
 * body is a different candle, and at this size the shape is all the chart says. The price
 * and change printed beside it carry the information for anyone who cannot tell the colours.
 */
export const MiniCandles = memo(function MiniCandles({
  candles,
  height = 40,
  label,
}: {
  candles: readonly MiniCandle[];
  height?: number;
  label: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  if (!candles.length) return null;

  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    lo = Math.min(lo, c.l);
    hi = Math.max(hi, c.h);
  }
  const span = hi - lo || 1;
  const pad = 2;
  const slot = width / Math.max(candles.length, 12);
  const body = Math.max(1.5, Math.min(5, slot * 0.55));
  const y = (v: number) => pad + ((hi - v) / span) * (height - pad * 2);
  const first = candles[0];
  const last = candles[candles.length - 1];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label}: ${candles.length} intraday candles, from ${first?.o ?? '—'} to ${last?.c ?? '—'}`}
      style={{ height }}
      onLayout={(event) => {
        const next = Math.floor(event.nativeEvent.layout.width);
        if (next > 0 && next !== width) setWidth(next);
      }}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {candles.map((c, i) => {
            const x = slot * i + slot / 2;
            const up = c.c >= c.o;
            const color = up ? colors.accent : colors.loss;
            const top = y(Math.max(c.o, c.c));
            return (
              <React.Fragment key={c.t}>
                <Line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={1} />
                <Rect
                  x={x - body / 2}
                  y={top}
                  width={body}
                  height={Math.max(1, y(Math.min(c.o, c.c)) - top)}
                  fill={color}
                  rx={0.5}
                />
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
});
