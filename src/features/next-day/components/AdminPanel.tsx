import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { RowDivider } from '@/components/ui/Section';
import { confirmAction } from '@/features/settings/lib/confirm';
import { adminActionError } from '@/features/strategies/lib/houseView';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';

import { useNextDayAction } from '../hooks';
import { ADMIN_ACTIONS } from '../lib/view';
import type { NextDayAction } from '../types';

/** Admin: queue one of the next-day jobs on the screener worker, each behind a confirmation. */
export function useRunNextDayAction() {
  const mutation = useNextDayAction();
  const run = (action: NextDayAction) => {
    const spec = ADMIN_ACTIONS.find((a) => a.action === action);
    if (!spec) return;
    confirmAction({
      title: `${spec.label}?`,
      message: spec.confirm,
      confirmLabel: 'Queue it',
      onConfirm: () =>
        mutation.mutate(
          { action, body: spec.body },
          {
            onSuccess: (result) =>
              result.queued
                ? toast.info('Queued', `${spec.queued} runs on the screener worker.`)
                : toast.info('Already queued', 'One is waiting or running.'),
            onError: (error) => toast.error('Couldn’t queue it', adminActionError(error)),
          },
        ),
    });
  };
  return { run, busy: mutation.isPending, pending: mutation.variables?.action ?? null };
}

/** The four next-day jobs an administrator can start by hand (the crons run them otherwise). */
export function AdminPanel({ className }: { className?: string }) {
  const { colors } = useTheme();
  const { run, busy, pending } = useRunNextDayAction();
  return (
    <Panel title="Admin" meta="Queued on the screener worker" flush className={className}>
      {ADMIN_ACTIONS.map((spec, index) => (
        <View key={spec.action}>
          {index > 0 ? <RowDivider /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${spec.label}. ${spec.detail}`}
            disabled={busy}
            onPress={() => run(spec.action)}
            className="min-h-[52px] flex-row items-center gap-3 px-4 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
          >
            <View className="flex-1">
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                {spec.label}
              </Text>
              <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                {spec.detail}
              </Text>
            </View>
            {busy && pending === spec.action ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <ChevronRight size={16} color={colors.textFaint} />
            )}
          </Pressable>
        </View>
      ))}
    </Panel>
  );
}
