import React from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';

import { stageSteps, stageSummary, type StepState } from '../lib/view';
import type { RunView } from '../types';

const SEGMENT: Record<StepState, string> = {
  done: 'bg-ink-muted dark:bg-ink-dark-muted',
  // Where a scan stopped is information, not a failure: most scans stop by design.
  stop: 'border border-ink-muted bg-surface dark:border-ink-dark-muted dark:bg-surface-dark',
  run: 'bg-info dark:bg-info-dark',
  todo: 'bg-line dark:bg-line-dark',
};

/**
 * How far one scan got through scan → debate → proposal → risk checks → edge → order: six
 * segments, the stopping point outlined, and one line in words.
 */
export function StageSteps({
  run,
  className,
}: {
  run: Pick<RunView, 'stage' | 'outcome'>;
  className?: string;
}) {
  const steps = stageSteps(run);
  const summary = stageSummary(run);
  const passed = steps.filter((s) => s.state === 'done').length;
  return (
    <View
      accessible
      accessibilityLabel={`How far this scan got: ${steps
        .map(
          (s) =>
            `${s.label} ${s.state === 'done' ? 'passed' : s.state === 'stop' ? 'stopped here' : s.state === 'run' ? 'in progress' : 'not reached'}`,
        )
        .join(', ')}`}
      className={className}
    >
      <View className="flex-row gap-1">
        {steps.map((step) => (
          <View key={step.key} className="flex-1">
            <View className={cn('h-1.5 rounded-full', SEGMENT[step.state])} />
          </View>
        ))}
      </View>
      <View className="mt-1.5 flex-row justify-between gap-2">
        <Text className="text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted">
          {summary}
        </Text>
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {passed} of {steps.length} steps passed
        </Text>
      </View>
    </View>
  );
}
