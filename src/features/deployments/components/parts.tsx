import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { ModeChips } from '@/features/strategies/components/ModeChips';
import { cn } from '@/lib/utils/cn';

import { brokerName } from '../lib/view';
import type { BrokerId, DeployMode, DeployStatus } from '../types';

export const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * PAPER is a quiet chip; LIVE the red-outlined one that names its broker (strategies'
 * ModeChips). The same words and colours on every screen that shows a deployment.
 */
export function ModeBadge({
  mode,
  broker,
  status,
}: {
  mode: DeployMode;
  broker?: BrokerId | null;
  /** "· paused" is added for a paused deployment. */
  status?: DeployStatus;
}) {
  // One chip everywhere a deployment shows (strategies list, platform cards, this tab), so
  // LIVE always reads the same way: the one red-outlined chip on the screen.
  return (
    <ModeChips
      chips={[
        {
          mode,
          paused: status === 'paused',
          detail: mode === 'live' && broker ? brokerName(broker) : null,
        },
      ]}
    />
  );
}

/** The running deployments' chips in a row (nothing when none runs). */
export function ModeBadges({
  deployments,
}: {
  deployments: readonly { id: string; mode: DeployMode; status: DeployStatus }[];
}) {
  const running = deployments.filter((d) => d.status !== 'stopped');
  if (!running.length) return null;
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {running.map((d) => (
        <ModeBadge key={d.id} mode={d.mode} status={d.status} />
      ))}
    </View>
  );
}

/** A compact bordered action — Pause, Settings, Stop. `danger` only tints the label. */
export function ActionButton({
  label,
  onPress,
  disabled,
  danger,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      className={cn(
        'h-9 items-center justify-center rounded-field border border-line-strong px-3.5 active:bg-surface-sunk dark:border-line-dark-strong dark:active:bg-surface-sunk-dark',
        disabled && 'opacity-50',
      )}
    >
      <Text
        className={cn(
          'text-[13px] font-semibold',
          danger ? 'text-danger-600 dark:text-danger-dark' : 'text-ink dark:text-ink-dark',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A muted footnote line under a card. */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Text
      className={cn('text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint', className)}
    >
      {children}
    </Text>
  );
}

/** A quiet one-line "nothing here" inside a card. */
export function QuietEmpty({ message }: { message: string }) {
  return (
    <View className="rounded-card border border-line bg-surface px-4 py-3.5 dark:border-line-dark dark:bg-surface-dark">
      <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">{message}</Text>
    </View>
  );
}
