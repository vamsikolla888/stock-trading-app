import React from 'react';
import { Text, View } from 'react-native';

import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { StatusDot } from '@/features/settings/components/StatusPill';
import { cn } from '@/lib/utils/cn';

import {
  ACTION_VIEW,
  CHECK_TONE,
  CHECK_WORD,
  regimeScoreText,
  regimeTone,
  TONE_STATUS,
  type Tone,
} from '../lib/view';
import type { NextDayReport } from '../types';
import { Kicker, NUM, ToneText } from './parts';

const ACTION_BAR: Record<Tone, string> = {
  good: 'bg-brand-strong dark:bg-brand-strong-dark',
  warn: 'bg-warning-500 dark:bg-warning-dark',
  bad: 'bg-danger-500 dark:bg-danger-dark',
  none: 'bg-ink-faint dark:bg-ink-dark-faint',
};

/**
 * Market first — may we trade at all? The regime (its label and score of ±7), the action it
 * allows (which can be NO TRADE TODAY) with its reason, then each check that made it.
 */
export function RegimeCard({ report }: { report: NextDayReport }) {
  const layout = useScreenLayout();
  const act = ACTION_VIEW[report.action];
  const noTrade = report.action === 'no-trade';

  return (
    <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <Kicker>Market regime</Kicker>
      <View className="mt-1.5 flex-row flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <ToneText tone={regimeTone(report.regime.label)} className="text-[22px] font-bold">
          {report.regime.label}
        </ToneText>
        <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          {`score ${regimeScoreText(report.regime.score)}`}
        </Text>
      </View>

      <View
        accessible
        accessibilityRole={noTrade ? 'alert' : undefined}
        accessibilityLabel={`${act.label}. ${report.actionReason}`}
        className="mt-3 flex-row overflow-hidden rounded-xl bg-surface-sunk dark:bg-surface-sunk-dark"
      >
        <View className={cn('w-[3px]', ACTION_BAR[act.tone])} />
        <View className="flex-1 px-3 py-2.5">
          <Text
            className={cn(
              'font-bold uppercase tracking-wide text-ink dark:text-ink-dark',
              noTrade ? 'text-[15px]' : 'text-[13px]',
            )}
          >
            {act.label}
          </Text>
          {report.actionReason ? (
            <Text className="mt-0.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              {report.actionReason}
            </Text>
          ) : null}
        </View>
      </View>

      {report.regime.checks.length > 0 ? (
        <Grid columns={layout.compact ? 1 : 2} gap={10} equalHeight={false} className="mt-3.5">
          {report.regime.checks.map((check) => (
            <View key={check.key} accessible className="flex-row gap-2.5">
              <View className="pt-[5px]">
                <StatusDot tone={TONE_STATUS[CHECK_TONE[check.state]]} size={7} />
              </View>
              <View className="flex-1">
                <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                  {`${check.label} · ${CHECK_WORD[check.state]}`}
                </Text>
                {check.detail ? (
                  <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                    {check.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </Grid>
      ) : null}
    </View>
  );
}
