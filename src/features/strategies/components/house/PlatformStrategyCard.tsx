import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { trendOf, trendTextClass } from '@/components/market/ChangeText';
import { Sparkline } from '@/components/market/Sparkline';
import { cn } from '@/lib/utils/cn';
import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';

import { formatProfitFactor } from '../../lib/ranking';
import type { HouseDeploymentRef, HouseStrategySummary } from '../../types';
import { ModeChips, type ModeChip } from '../ModeChips';

const NUM = { fontVariant: ['tabular-nums' as const] };

/** The caller's running deployments as PAPER / LIVE chips (a stopped one is no chip). */
export function deploymentChips(deployments: readonly HouseDeploymentRef[]): ModeChip[] {
  return deployments
    .filter((d) => d.status !== 'stopped')
    .map((d) => ({ mode: d.mode, paused: d.status === 'paused' }));
}

/**
 * One platform strategy on the Strategies list. Every platform strategy gets the same card and
 * the same four figures, so they compare at a glance whatever their timeframe — plus the stocks
 * its backtest says it works on, which is the question a reader brings here.
 */
export const PlatformStrategyCard = memo(function PlatformStrategyCard({
  strategy,
  onPress,
}: {
  strategy: HouseStrategySummary;
  onPress: () => void;
}) {
  const m = strategy.backtest?.metrics ?? null;
  const spark = strategy.backtest?.equitySpark ?? [];
  const failed = strategy.backtest?.status === 'failed';
  const tags = [strategy.timeframe, strategy.holding].filter(Boolean);
  const chips = deploymentChips(strategy.deployments);
  const scan = strategy.latestScan;
  const footer = [
    strategy.stocks
      ? `${formatNumber(strategy.stocks.works, 0)} of ${formatNumber(strategy.stocks.traded, 0)} stocks work`
      : null,
    strategy.universe || null,
    scan?.status === 'completed'
      ? `${formatNumber(scan.setups, 0)} setup${scan.setups === 1 ? '' : 's'} next session`
      : null,
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${strategy.name}, platform strategy${tags.length ? `, ${tags.join(', ')}` : ''}${chips.some((c) => c.mode === 'live') ? ', deployed live' : chips.length ? ', deployed on paper' : ''}${m ? `, ${formatSignedPercent(m.expectancyPct, 2)} per trade, ${formatPercent(m.winRate, 1)} win rate` : failed ? ', last test failed' : ', not tested yet'}`}
      onPress={onPress}
      className="rounded-card border border-line bg-surface p-4 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={2}>
            {strategy.name}
          </Text>
          {tags.length || chips.length ? (
            <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <View
                  key={tag}
                  className="rounded-full bg-surface-sunk px-2 py-0.5 dark:bg-surface-sunk-dark"
                >
                  <Text className="text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted">
                    {tag}
                  </Text>
                </View>
              ))}
              <ModeChips chips={chips} />
            </View>
          ) : null}
        </View>
        {spark.length > 1 ? <Sparkline data={spark} width={76} height={30} /> : null}
      </View>

      {strategy.description ? (
        <Text
          className="mt-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
          numberOfLines={2}
        >
          {strategy.description}
        </Text>
      ) : null}

      {m ? (
        <View className="mt-3 flex-row gap-3 border-t border-line pt-3 dark:border-line-dark">
          <Figure
            label="Per trade"
            value={formatSignedPercent(m.expectancyPct, 2)}
            trend={m.expectancyPct}
          />
          <Figure label="Win rate" value={formatPercent(m.winRate, 1)} />
          <Figure label="Profit factor" value={formatProfitFactor(m.profitFactor)} />
          <Figure label="Trades" value={formatNumber(m.totalTrades, 0)} />
        </View>
      ) : (
        <Text className="mt-3 text-xs text-ink-faint dark:text-ink-dark-faint">
          {failed ? 'Last test failed.' : 'Not tested yet.'}
        </Text>
      )}

      {m ? (
        <View className="mt-3">
          <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">Works on</Text>
          {strategy.worksOn.length > 0 ? (
            <View className="mt-1.5 flex-row flex-wrap gap-1.5">
              {strategy.worksOn.map((w) => (
                <View
                  key={w.symbol}
                  accessible
                  accessibilityLabel={`${w.symbol}, ${formatSignedPercent(w.avgReturnPct, 2)} a trade over ${w.trades} trades`}
                  className="flex-row items-center gap-1.5 rounded-lg bg-surface-sunk px-2 py-1 dark:bg-surface-sunk-dark"
                >
                  <Text className="text-xs font-semibold text-ink dark:text-ink-dark">
                    {w.symbol}
                  </Text>
                  <Text
                    className={cn('text-xs font-semibold', trendTextClass[trendOf(w.avgReturnPct)])}
                    style={NUM}
                  >
                    {formatSignedPercent(w.avgReturnPct, 2)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="mt-1 text-xs text-ink-faint dark:text-ink-dark-faint">
              No stock clears the bar yet.
            </Text>
          )}
        </View>
      ) : null}

      {footer.length ? (
        <Text
          className="mt-3 text-[11px] text-ink-faint dark:text-ink-dark-faint"
          numberOfLines={2}
          style={NUM}
        >
          {footer.join(' · ')}
        </Text>
      ) : null}
    </Pressable>
  );
});

function Figure({ label, value, trend }: { label: string; value: string; trend?: number }) {
  return (
    <View className="min-w-0 flex-1">
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className={cn(
          'mt-0.5 text-sm font-semibold',
          trend !== undefined ? trendTextClass[trendOf(trend)] : 'text-ink dark:text-ink-dark',
        )}
        style={NUM}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
