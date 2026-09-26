import React from 'react';
import { Switch, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { ModalSheet, SheetOption } from '@/features/home/components/ModalSheet';
import { formatNumber, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import {
  breadthShares,
  groupIndices,
  HEAT_PALETTE,
  SORT_OPTIONS,
  type HeatmapSort,
} from '../lib/heatmap';
import type { HeatmapIndexSummary, HeatmapProvider, MarketHeatmapResponse } from '../types';

/** The −3% … +3% colour scale, straight from the tile palette. */
export function HeatmapLegend() {
  const { isDark } = useTheme();
  const palette = isDark ? HEAT_PALETTE.dark : HEAT_PALETTE.light;
  return (
    <View
      accessible
      accessibilityLabel="Colour scale from minus 3 percent, red, to plus 3 percent, green"
      className="flex-row items-center gap-2"
    >
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">−3%</Text>
      <View className="h-2.5 flex-1 flex-row overflow-hidden rounded-full">
        {palette.map((swatch) => (
          <View key={swatch.bg} className="flex-1" style={{ backgroundColor: swatch.bg }} />
        ))}
      </View>
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">+3%</Text>
    </View>
  );
}

/** Index level (or the weighted constituent move) and the advance/decline split. */
export function HeatmapOverview({ data }: { data: MarketHeatmapResponse }) {
  const { indexLevel, breadth, index, timeframe } = data;
  const shares = breadthShares(breadth);
  const move = indexLevel.changePct;
  const hasLevel = indexLevel.ltp !== null;

  return (
    <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {index.label} · {timeframe}
          </Text>
          <Text
            className="mt-1 text-[22px] font-bold text-ink dark:text-ink-dark"
            style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {hasLevel ? formatNumber(indexLevel.ltp) : formatSignedPercent(move)}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            {hasLevel ? (
              <ChangeText value={move} className="text-[13px]">
                {formatSignedPercent(move)}
              </ChangeText>
            ) : null}
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
              {indexLevel.estimated
                ? 'Market-cap weighted move of the constituents'
                : 'Index level'}
            </Text>
          </View>
        </View>
      </View>

      <View className="mt-4">
        <View className="flex-row justify-between gap-2">
          <Text className="text-xs font-semibold text-brand-text dark:text-brand-text-dark">
            {breadth.advances} up
          </Text>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            {breadth.unchanged} flat
          </Text>
          <Text className="text-xs font-semibold text-danger-600 dark:text-danger-dark">
            {breadth.declines} down
          </Text>
        </View>
        <View
          accessible
          accessibilityLabel={`${breadth.advances} advancing, ${breadth.unchanged} unchanged, ${breadth.declines} declining`}
          className="mt-1.5 h-2 flex-row overflow-hidden rounded-full bg-line dark:bg-line-dark"
        >
          <View
            className="bg-brand-strong dark:bg-brand-strong-dark"
            style={{ width: `${shares.advances}%` }}
          />
          <View
            className="bg-ink-faint dark:bg-ink-dark-faint"
            style={{ width: `${shares.unchanged}%` }}
          />
          <View
            className="bg-danger-500 dark:bg-danger-dark"
            style={{ width: `${shares.declines}%` }}
          />
        </View>
        {breadth.unavailable > 0 ? (
          <Text className="mt-1.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
            {breadth.unavailable} without a price for this window
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Every index, grouped by category; indices without imported members can't be picked. */
export function IndexPickerSheet({
  visible,
  indices,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  indices: readonly HeatmapIndexSummary[];
  value: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <ModalSheet visible={visible} title="Choose an index" onClose={onClose}>
      {indices.length === 0 ? (
        <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          The index list isn’t available right now. Pull down on the heatmap to try again.
        </Text>
      ) : null}
      {groupIndices(indices).map((group) => (
        <View key={group.category} className="mb-3">
          <Text className="mb-1 mt-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted">
            {group.label}
          </Text>
          {group.items.map((index) => (
            <SheetOption
              key={index.key}
              label={index.label}
              detail={
                index.unavailable
                  ? 'Membership unavailable'
                  : `${index.constituentCount} stocks · ${index.exchange}`
              }
              selected={index.key === value}
              disabled={index.unavailable && index.key !== value}
              onPress={() => {
                onSelect(index.key);
                onClose();
              }}
            />
          ))}
        </View>
      ))}
    </ModalSheet>
  );
}

const PROVIDERS: readonly { key: HeatmapProvider; label: string; detail: string }[] = [
  { key: 'groww', label: 'Groww', detail: 'Falls back to mStock for missing quotes' },
  { key: 'mstock', label: 'mStock', detail: 'Live quotes from mStock' },
];

/** Grouping, grid order and the live-quote source — the web's toolbar, in one sheet. */
export function HeatmapOptionsSheet({
  visible,
  onClose,
  groupBySector,
  onGroupBySector,
  groupingEnabled,
  sort,
  onSort,
  provider,
  onProvider,
}: {
  visible: boolean;
  onClose: () => void;
  groupBySector: boolean;
  onGroupBySector: (value: boolean) => void;
  groupingEnabled: boolean;
  sort: HeatmapSort;
  onSort: (value: HeatmapSort) => void;
  provider: HeatmapProvider;
  onProvider: (value: HeatmapProvider) => void;
}) {
  const { colors } = useTheme();
  return (
    <ModalSheet visible={visible} title="Heatmap options" onClose={onClose}>
      <View className="flex-row items-center gap-3 py-2">
        <View className="flex-1">
          <Text className="text-[15px] text-ink dark:text-ink-dark">Group by sector</Text>
          <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
            {groupingEnabled ? 'Blocks of stocks from the same sector' : 'Treemap view only'}
          </Text>
        </View>
        <Switch
          accessibilityLabel="Group by sector"
          value={groupBySector}
          disabled={!groupingEnabled}
          onValueChange={onGroupBySector}
          trackColor={{ true: colors.primary, false: colors.borderStrong }}
        />
      </View>

      <Text className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted">
        Grid order
      </Text>
      {SORT_OPTIONS.map((option) => (
        <SheetOption
          key={option.key}
          label={option.label}
          selected={sort === option.key}
          onPress={() => onSort(option.key)}
        />
      ))}
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
        Treemap tiles are always sized by market cap.
      </Text>

      <Text className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted">
        Live prices from
      </Text>
      {PROVIDERS.map((option) => (
        <SheetOption
          key={option.key}
          label={option.label}
          detail={option.detail}
          selected={provider === option.key}
          onPress={() => onProvider(option.key)}
        />
      ))}
    </ModalSheet>
  );
}
