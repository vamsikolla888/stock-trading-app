import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { useAllScansStatus, useRunAllScans } from '../hooks';
import type { AllScansStatus } from '../types';

function progressText(status: AllScansStatus | undefined): string {
  if (status?.builtInRunning && status.customRunning) {
    return 'Built-in screens and custom screeners are both in the queue…';
  }
  if (status?.customRunning) return 'Working through the custom screeners…';
  return 'Built-in screens scanning…';
}

/**
 * "Run all scans": the built-in scan plus a sweep of every custom screener. The two halves are
 * separate jobs — the built-in scan is shared and may already be running for someone else —
 * so the progress line names them separately rather than one vague "scanning…".
 */
export function useRunAllScansControl() {
  // Polling starts only once the POST has resolved; the poll stops itself when idle.
  const [queuedHere, setQueuedHere] = useState(false);
  const runAll = useRunAllScans({ onQueued: () => setQueuedHere(true) });
  const status = useAllScansStatus(queuedHere);
  const running = status.data?.running === true;
  const busy = running || runAll.isPending;

  const start = () =>
    runAll.mutate(undefined, {
      onSuccess: (result) =>
        toast.info(
          result.builtIn.alreadyRunning
            ? 'A built-in scan was already running'
            : `Queued ${result.screenersQueued} screener${result.screenersQueued === 1 ? '' : 's'} + built-in scan`,
          'Match counts update here when the scans finish.',
        ),
      onError: (error) => toast.error("Couldn't start the scans", getErrorMessage(error)),
    });

  return {
    busy,
    start,
    /** A line to show while scanning, or null. */
    progress: busy ? progressText(status.data) : null,
    /** The last run's failure, as the server reported it. */
    lastError: !busy ? (status.data?.lastError ?? null) : null,
  };
}

/** The compact trigger that sits beside the screen's intro line. */
export function RunAllScansButton({
  busy,
  onPress,
  customCount,
}: {
  busy: boolean;
  onPress: () => void;
  customCount: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        customCount > 0
          ? `Run all scans: the built-in screens and ${customCount} custom screener${customCount === 1 ? '' : 's'}`
          : 'Run all scans: the built-in screens'
      }
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      hitSlop={8}
      onPress={onPress}
      className="flex-row items-center gap-1.5 active:opacity-60"
    >
      {busy ? <ActivityIndicator size="small" color={colors.link} /> : null}
      <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
        {busy ? 'Scanning…' : 'Run all scans'}
      </Text>
    </Pressable>
  );
}

export function RunAllScansStatus({
  progress,
  lastError,
}: {
  progress: string | null;
  lastError: string | null;
}) {
  if (!progress && !lastError) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      className="mb-4 rounded-field bg-surface-sunk px-3 py-2.5 dark:bg-surface-sunk-dark"
    >
      <Text
        className={
          lastError
            ? 'text-[13px] leading-[19px] text-danger-600 dark:text-danger-dark'
            : 'text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted'
        }
      >
        {progress ?? lastError}
      </Text>
    </View>
  );
}
