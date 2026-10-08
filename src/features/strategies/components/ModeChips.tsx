import React from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';

import type { DeploymentModeTag } from '../types';

export interface ModeChip {
  mode: DeploymentModeTag;
  paused?: boolean;
  /** A short qualifier after the word, e.g. the live broker: "LIVE · mStock". */
  detail?: string | null;
}

const STYLE: Record<DeploymentModeTag, { box: string; text: string; dot: string }> = {
  paper: {
    box: 'bg-success-wash dark:bg-success-wash-dark',
    text: 'text-brand-text dark:text-brand-text-dark',
    dot: 'bg-brand-strong dark:bg-brand-text-dark',
  },
  live: {
    box: 'border border-danger-500 bg-danger-wash dark:border-danger-dark dark:bg-danger-wash-dark',
    text: 'text-danger-600 dark:text-danger-dark',
    dot: 'bg-danger-500 dark:bg-danger-dark',
  },
};

/**
 * Where a strategy is deployed right now: PAPER (the paper wallet) or LIVE (the user's broker,
 * real money). LIVE is the one red-outlined chip on the screen and says so to a screen reader,
 * so it can never pass for paper; both stay small and quiet.
 */
export function ModeChips({
  chips,
  className,
}: {
  chips: readonly ModeChip[];
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <View className={cn('flex-row flex-wrap gap-1.5', className)}>
      {chips.map((chip, index) => {
        const style = STYLE[chip.mode];
        const word = chip.mode === 'live' ? 'LIVE' : 'PAPER';
        return (
          <View
            key={`${chip.mode}-${index}`}
            accessible
            accessibilityLabel={
              chip.mode === 'live'
                ? `Deployed live, real money${chip.detail ? ` at ${chip.detail}` : ''}${chip.paused ? ', paused' : ''}`
                : `Deployed on paper${chip.paused ? ', paused' : ''}`
            }
            className={cn('flex-row items-center gap-1 rounded-full px-2 py-0.5', style.box)}
          >
            <View className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
            <Text
              className={cn('text-[11px] font-bold', style.text)}
              style={{ letterSpacing: 0.5 }}
            >
              {word}
              {chip.detail ? (
                <Text className="font-semibold" style={{ letterSpacing: 0 }}>
                  {` · ${chip.detail}`}
                </Text>
              ) : null}
              {chip.paused ? (
                <Text className="font-semibold" style={{ letterSpacing: 0 }}>
                  {' · paused'}
                </Text>
              ) : null}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
