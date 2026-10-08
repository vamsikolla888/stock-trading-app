import React from 'react';
import { Text, View } from 'react-native';

import { StatusDot } from '@/features/settings/components/StatusPill';
import { formatClock } from '@/features/settings/lib/time';

import { traceStepView } from '../lib/view';
import type { TraceStep } from '../types';
import { NUM } from './parts';

/**
 * A scan's steps as the bot recorded them (ai-autotrade.mode.ts TraceStep): what each check read
 * and compared, and whether it passed. "Noted" is a check a TEST scan reported without stopping
 * on it (market closed, an open position) so the rest of the pipeline could run.
 */
export function TraceList({ trace }: { trace: readonly TraceStep[] }) {
  if (trace.length === 0) {
    return (
      <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
        No step log for this scan (recorded before step logging).
      </Text>
    );
  }
  return (
    <View>
      {trace.map((step, index) => {
        const view = traceStepView(step);
        return (
          <View
            key={`${step.step}-${index}`}
            accessible
            accessibilityLabel={`${view.label}, ${view.verdict}. ${step.detail}`}
            className={index === 0 ? 'py-2.5' : 'border-t border-line py-2.5 dark:border-line-dark'}
          >
            <View className="flex-row items-center gap-2">
              <StatusDot tone={view.tone} size={7} />
              <Text className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark">
                {view.label}
              </Text>
              <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                {view.verdict}
              </Text>
              {step.at ? (
                <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
                  {formatClock(step.at)}
                </Text>
              ) : null}
            </View>
            {view.first ? (
              <Text className="ml-[15px] mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                {view.first}
              </Text>
            ) : null}
            {view.rest.map((line, j) => (
              <Text
                key={j}
                className="ml-[15px] mt-0.5 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint"
              >
                • {line}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}
