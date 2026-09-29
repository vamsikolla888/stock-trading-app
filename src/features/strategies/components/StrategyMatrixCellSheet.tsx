import React from 'react';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';

import { MIN_TRADES_FOR_SYMBOL_STATS, splitMatrixKey } from '../lib/backtest';
import { formatProfitFactor } from '../lib/ranking';
import type { SymbolStats } from '../types';

import { SheetModal } from './SheetModal';

export interface MatrixCellDetail {
  strategyName: string;
  /** The strategy's rules changed after the run these figures came from. */
  stale: boolean;
  /** "EXCHANGE:SYMBOL". */
  column: string;
  stats: SymbolStats;
}

interface StrategyMatrixCellSheetProps {
  visible: boolean;
  /** Kept while the sheet slides out, so it never animates away empty. */
  detail: MatrixCellDetail | null;
  onClose: () => void;
  onOpenStrategy: () => void;
  onOpenStock: () => void;
}

/**
 * One cell of the matrix in full — what the web shows on hover: the trade count behind the
 * number, both metrics, the summed return, and a plain warning when the sample is too thin
 * to read anything into.
 */
export function StrategyMatrixCellSheet({
  visible,
  detail,
  onClose,
  onOpenStrategy,
  onOpenStock,
}: StrategyMatrixCellSheetProps) {
  const stats = detail?.stats;
  const { exchange, symbol } = splitMatrixKey(detail?.column ?? '');
  const thin = stats ? stats.trades < MIN_TRADES_FOR_SYMBOL_STATS : false;

  return (
    <SheetModal
      visible={visible}
      title={symbol || 'Stock'}
      subtitle={detail ? `${detail.strategyName} · ${exchange}` : undefined}
      onClose={onClose}
      footer={
        detail ? (
          <View className="flex-row gap-3">
            <Button label="View stock" variant="outline" className="flex-1" onPress={onOpenStock} />
            <Button label="Open strategy" className="flex-1" onPress={onOpenStrategy} />
          </View>
        ) : undefined
      }
    >
      {stats && detail ? (
        <View className="gap-3">
          {detail.stale ? (
            <Banner
              tone="warning"
              message="The rules changed after this backtest, so these figures describe the previous version. Re-run it for current numbers."
            />
          ) : null}
          {thin ? (
            <Banner
              tone="info"
              message={`Only ${formatNumber(stats.trades, 0)} trade${stats.trades === 1 ? '' : 's'} — under the ${MIN_TRADES_FOR_SYMBOL_STATS} needed to read anything into it, which is why the cell is dimmed.`}
            />
          ) : null}
          <Card className="py-1.5">
            <KeyValueRow label="Trades" value={formatNumber(stats.trades, 0)} />
            <KeyValueRow divider label="Win rate" value={formatPercent(stats.winRate, 0)} />
            <KeyValueRow
              divider
              label="Profit factor"
              hint={
                stats.profitFactor == null
                  ? 'No losing trades, so there is none'
                  : 'Gross win ÷ gross loss'
              }
              value={formatProfitFactor(stats.profitFactor)}
            />
            <KeyValueRow
              divider
              label="Total return"
              hint="Sum of its trades here, net of costs"
              value={formatSignedPercent(stats.totalReturnPct, 1)}
              trend={stats.totalReturnPct}
            />
          </Card>
          <Text className="text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
            From this strategy&apos;s own backtest on daily bars. A past result, not a forecast.
          </Text>
        </View>
      ) : null}
    </SheetModal>
  );
}
