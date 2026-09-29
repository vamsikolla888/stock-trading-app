import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';

import {
  matrixCell,
  matrixColumnLabels,
  matrixLegend,
  type CellTone,
  type MatrixMetric,
  type MatrixModel,
} from '../lib/backtest';
import type { SymbolStats } from '../types';

const NAME_WIDTH = 124;
const CELL_WIDTH = 72;
const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 40;

const CELL_TEXT: Record<CellTone, string> = {
  strong: 'font-bold text-brand-text dark:text-brand-text-dark',
  good: 'font-semibold text-brand-text dark:text-brand-text-dark',
  weak: 'font-semibold text-danger-600 dark:text-danger-dark',
  thin: 'text-ink-faint dark:text-ink-dark-faint',
  na: 'text-ink-faint dark:text-ink-dark-faint',
  empty: 'text-ink-faint dark:text-ink-dark-faint',
};

const CELL_FILL: Partial<Record<CellTone, string>> = {
  strong: 'bg-brand-wash dark:bg-brand-wash-dark',
};

export interface MatrixSelection {
  row: number;
  column: string;
  stats: SymbolStats;
}

interface StrategyMatrixGridProps {
  model: MatrixModel;
  names: readonly string[];
  metric: MatrixMetric;
  onOpenStrategy: (row: number) => void;
  onSelectCell: (selection: MatrixSelection) => void;
}

/**
 * Strategies down the side, stocks across the top. The name column stays put while the
 * cells scroll sideways — the one place in the app a grid beats a list, because the point
 * is reading down a column.
 */
export function StrategyMatrixGrid({
  model,
  names,
  metric,
  onOpenStrategy,
  onSelectCell,
}: StrategyMatrixGridProps) {
  const metricName = metric === 'profitFactor' ? 'profit factor' : 'win rate';
  const labels = matrixColumnLabels(model.columns);

  return (
    <View className="flex-row overflow-hidden rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
      <View style={{ width: NAME_WIDTH }} className="border-r border-line dark:border-line-dark">
        <View
          style={{ height: HEADER_HEIGHT }}
          className="justify-center border-b border-line px-3 dark:border-line-dark"
        >
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
            Strategy
          </Text>
        </View>
        {names.map((name, row) => (
          <Pressable
            key={`${row}-${name}`}
            accessibilityRole="button"
            accessibilityLabel={`${name}. Open strategy`}
            onPress={() => onOpenStrategy(row)}
            style={{ height: ROW_HEIGHT }}
            className={cn(
              'justify-center px-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark',
              row > 0 && 'border-t border-line dark:border-line-dark',
            )}
          >
            <Text
              className="text-[13px] font-semibold leading-[17px] text-ink dark:text-ink-dark"
              numberOfLines={2}
            >
              {name}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
        <View>
          <View
            style={{ height: HEADER_HEIGHT }}
            className="flex-row border-b border-line dark:border-line-dark"
          >
            {model.columns.map((key, index) => (
              <View
                key={key}
                style={{ width: CELL_WIDTH }}
                className="items-center justify-center px-1"
              >
                <Text
                  className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {labels[index] ?? key}
                </Text>
              </View>
            ))}
          </View>
          {model.rows.map((statsByKey, row) => (
            <View
              key={`${row}-${names[row] ?? ''}`}
              style={{ height: ROW_HEIGHT }}
              className={cn('flex-row', row > 0 && 'border-t border-line dark:border-line-dark')}
            >
              {model.columns.map((key, index) => {
                const stats = statsByKey.get(key);
                const cell = matrixCell(stats, metric);
                const symbol = labels[index] ?? key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={`${names[row] ?? 'Strategy'} on ${symbol}: ${metricName} ${cell.text}${
                      stats ? `, ${stats.trades} trades` : ''
                    }${cell.tone === 'thin' ? ', too few trades to read' : ''}. Show details`}
                    disabled={!stats}
                    onPress={() => stats && onSelectCell({ row, column: key, stats })}
                    style={{ width: CELL_WIDTH }}
                    className="items-center justify-center p-1 active:opacity-70"
                  >
                    <View
                      className={cn(
                        'min-w-[52px] items-center rounded-md px-1.5 py-1',
                        CELL_FILL[cell.tone],
                      )}
                    >
                      <Text
                        className={cn('text-[13px]', CELL_TEXT[cell.tone])}
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {cell.text}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** The colour key, drawn with the grid's own cell styles so the two cannot drift apart. */
export function MatrixLegend({ metric }: { metric: MatrixMetric }) {
  const items = matrixLegend(metric);
  return (
    <View
      accessible
      accessibilityLabel={`Colour key: ${items.map((item) => item.label).join(', ')}`}
      className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5"
    >
      {items.map((item) => (
        <View key={item.tone} className="flex-row items-center gap-1.5">
          <View className={cn('items-center rounded-md px-1.5 py-0.5', CELL_FILL[item.tone])}>
            <Text
              className={cn('text-[11px]', CELL_TEXT[item.tone])}
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {item.sample}
            </Text>
          </View>
          <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
