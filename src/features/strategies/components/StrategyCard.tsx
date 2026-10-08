import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { trendOf, trendTextClass } from '@/components/market/ChangeText';
import { Sparkline } from '@/components/market/Sparkline';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils/cn';
import { formatPercent } from '@/lib/utils/formatters';

import {
  formatProfitFactor,
  headlineFor,
  sampleVerdict,
  type SampleTone,
  type SortKey,
} from '../lib/ranking';
import type { DeploymentModeTag, StrategySummary } from '../types';
import { ModeChips } from './ModeChips';

const SAMPLE_VARIANT: Record<SampleTone, 'neutral' | 'danger' | 'warning'> = {
  none: 'neutral',
  'too-few': 'danger',
  thin: 'warning',
  ok: 'neutral',
};

interface StrategyCardProps {
  strategy: StrategySummary;
  sort: SortKey;
  duplicated: boolean;
  /** The auto-trade engine is pointed at this strategy. */
  deployed: boolean;
  engineOn: boolean;
  /** Where it is deployed right now (paper wallet / live broker) — PAPER / LIVE chips. */
  modes?: readonly DeploymentModeTag[];
  onPress: () => void;
}

const NO_MODES: readonly DeploymentModeTag[] = [];

/** One strategy: rule phrase, equity sparkline, the sorted-on headline and the sample verdict. */
export const StrategyCard = memo(function StrategyCard({
  strategy,
  sort,
  duplicated,
  deployed,
  engineOn,
  modes = NO_MODES,
  onPress,
}: StrategyCardProps) {
  const m = strategy.metrics;
  const verdict = sampleVerdict(strategy);
  const headline = m ? headlineFor(m, sort) : null;
  const phrase = strategy.chips.join(' · ') || strategy.description || 'No conditions';
  const spark = strategy.equitySpark;

  const badges: {
    label: string;
    variant: 'success' | 'neutral' | 'warning' | 'danger' | 'primary';
  }[] = [];
  if (deployed) {
    badges.push({
      label: engineOn ? 'Trading on paper' : 'Deployed · engine off',
      variant: engineOn ? 'success' : 'neutral',
    });
  }
  const phase = strategy.runState?.phase ?? strategy.status;
  if (phase === 'never-run') badges.push({ label: 'Never backtested', variant: 'neutral' });
  if (phase === 'queued') badges.push({ label: 'Backtest queued…', variant: 'primary' });
  if (phase === 'running') badges.push({ label: 'Backtest running…', variant: 'primary' });
  if (phase === 'stalled')
    badges.push({ label: 'Backtest stalled — run again', variant: 'warning' });
  if (phase === 'failed') badges.push({ label: 'Backtest failed', variant: 'danger' });
  if (strategy.resultsStale && phase === 'complete') {
    badges.push({
      label:
        strategy.staleReason === 'settings' ? 'Settings changed' : 'Rules changed since this run',
      variant: 'warning',
    });
  }
  if (strategy.verdict && strategy.metrics && phase === 'complete') {
    if (strategy.verdict.tone === 'good')
      badges.push({ label: 'Held out of sample', variant: 'success' });
    if (strategy.verdict.tone === 'bad')
      badges.push({ label: 'Failed out of sample', variant: 'danger' });
  }
  if (duplicated) badges.push({ label: 'Duplicate name', variant: 'neutral' });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${strategy.name}${modes.includes('live') ? ', deployed live' : modes.length ? ', deployed on paper' : ''}${headline ? `, ${headline.label} ${headline.value}` : ', not backtested'}`}
      onPress={onPress}
      className="rounded-card border border-line bg-surface p-4 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={2}>
            {strategy.name}
          </Text>
          <ModeChips chips={modes.map((mode) => ({ mode }))} className="mt-1.5" />
          <Text
            className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={2}
          >
            {phrase}
          </Text>
        </View>
        {spark.length > 1 ? <Sparkline data={spark} width={76} height={30} /> : null}
      </View>

      {badges.length > 0 ? (
        <View className="mt-2.5 flex-row flex-wrap gap-1.5">
          {badges.map((badge) => (
            <Badge key={badge.label} label={badge.label} variant={badge.variant} />
          ))}
        </View>
      ) : null}

      {m && headline ? (
        <>
          <View className="mt-3">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
              {headline.label}
            </Text>
            <Text
              className={cn(
                'mt-0.5 text-[24px] font-bold',
                headline.negative
                  ? 'text-danger-600 dark:text-danger-dark'
                  : headline.trend !== undefined
                    ? trendTextClass[trendOf(headline.trend)]
                    : 'text-ink dark:text-ink-dark',
              )}
              style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}
            >
              {headline.value}
            </Text>
          </View>
          <View className="mt-3 flex-row gap-3 border-t border-line pt-3 dark:border-line-dark">
            <Figure label="Win rate" value={formatPercent(m.winRate, 1)} />
            <Figure
              label="Profit factor"
              value={formatProfitFactor(m.profitFactor)}
              sub={m.profitFactor == null ? 'no losers' : undefined}
            />
            <Figure label="Worst fall" value={formatPercent(m.maxDrawdownPct, 1)} negative />
          </View>
          {verdict ? (
            <View className="mt-3">
              <Badge label={verdict.label} variant={SAMPLE_VARIANT[verdict.tone]} />
            </View>
          ) : null}
        </>
      ) : (
        <Text className="mt-3 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
          No backtest yet, so there is nothing to rank it on. Open it to see the rules and run one.
        </Text>
      )}
    </Pressable>
  );
});

function Figure({
  label,
  value,
  sub,
  negative,
}: {
  label: string;
  value: string;
  sub?: string;
  negative?: boolean;
}) {
  return (
    <View className="min-w-0 flex-1">
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className={cn(
          'mt-0.5 text-sm font-semibold',
          negative ? 'text-danger-600 dark:text-danger-dark' : 'text-ink dark:text-ink-dark',
        )}
        style={{ fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
      >
        {value}
      </Text>
      {sub ? (
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{sub}</Text>
      ) : null}
    </View>
  );
}
