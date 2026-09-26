import React, { useMemo, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';

import { layoutHeatmap, treemapHeight } from '../lib/heatmap';
import type { HeatmapStock } from '../types';

import { HeatmapTile } from './HeatmapTile';

const GAP = 1;

interface HeatmapTreemapProps {
  stocks: readonly HeatmapStock[];
  groupBySector: boolean;
  onOpen: (stock: HeatmapStock) => void;
}

/**
 * Market-cap treemap drawn with plain Views, so every tile is a real, accessible button
 * that responds to a tap (a single SVG would need its own hit-testing). Measures its width
 * and grows taller with the tile count.
 */
export function HeatmapTreemap({ stocks, groupBySector, onOpen }: HeatmapTreemapProps) {
  const [width, setWidth] = useState(0);
  const height = treemapHeight(width, stocks.length);

  const layout = useMemo(
    () => layoutHeatmap(stocks, width, height, groupBySector),
    [stocks, width, height, groupBySector],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  return (
    <View
      onLayout={onLayout}
      accessibilityLabel={`Heatmap of ${stocks.length} stocks, sized by market capitalisation`}
      className="overflow-hidden rounded-card bg-surface-sunk dark:bg-surface-sunk-dark"
      style={{ height: height || 360 }}
    >
      {layout.labels.map((label) => (
        <Text
          key={label.sector}
          numberOfLines={1}
          accessible={false}
          className="absolute text-[10px] font-bold uppercase tracking-wide text-ink-muted dark:text-ink-dark-muted"
          style={{ left: label.x + 5, top: label.y + 3, maxWidth: label.width - 10 }}
        >
          {label.sector}
        </Text>
      ))}
      {layout.tiles.map((rect) => (
        <HeatmapTile
          key={`${rect.data.exchange}:${rect.data.symbol}`}
          stock={rect.data}
          left={rect.x + GAP}
          top={rect.y + GAP}
          width={Math.max(0, rect.width - GAP * 2)}
          height={Math.max(0, rect.height - GAP * 2)}
          onPress={onOpen}
        />
      ))}
    </View>
  );
}
