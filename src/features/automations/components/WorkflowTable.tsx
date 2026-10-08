import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { IconTile } from '@/components/ui/IconTile';
import { runStatus, TRIGGER_LABEL, triggerKind } from '@/features/automations/lib/workflows';
import type { WorkflowSummary } from '@/features/automations/types';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { formatDateTime, relativeTime } from '@/features/settings/lib/time';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import { TRIGGER_ICON } from './WorkflowRow';

/**
 * The workflows as a table, for a window wide enough to compare them across: name, trigger,
 * last outcome, when it last ran and its tags, one row each. A phone gets WorkflowRow instead.
 * The tags column appears only when there is room for it.
 */
export function WorkflowTable({
  workflows,
  now,
  showTags,
  onOpen,
}: {
  workflows: readonly WorkflowSummary[];
  now: number;
  showTags: boolean;
  onOpen: (workflow: WorkflowSummary) => void;
}) {
  const { colors } = useTheme();
  const head =
    'text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-ink-dark-faint';
  return (
    <View className="overflow-hidden rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
      <View className="flex-row items-center gap-4 border-b border-line bg-surface-sunk px-4 py-2.5 dark:border-line-dark dark:bg-surface-sunk-dark">
        <Text className={cn(head, 'flex-1')}>Workflow</Text>
        <Text className={cn(head, 'w-24')}>Trigger</Text>
        <Text className={cn(head, 'w-28')}>Last run</Text>
        <Text className={cn(head, 'w-32')}>When</Text>
        {showTags ? <Text className={cn(head, 'w-40')}>Tags</Text> : null}
        <View className="w-4" />
      </View>
      {workflows.map((workflow, index) => {
        const status = runStatus(workflow.lastRunStatus);
        const kind = triggerKind(workflow.triggerType);
        const trigger = TRIGGER_ICON[kind];
        return (
          <Pressable
            key={workflow.id}
            accessibilityRole="button"
            accessibilityLabel={`${workflow.name}, ${status.label}, ${TRIGGER_LABEL[kind]}`}
            onPress={() => onOpen(workflow)}
            className={cn(
              'flex-row items-center gap-4 px-4 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark',
              index > 0 && 'border-t border-line dark:border-line-dark',
            )}
          >
            <View className="flex-1 flex-row items-center gap-3">
              <IconTile Icon={trigger.Icon} tone={trigger.tone} size="sm" />
              <View className="flex-1">
                <Text
                  className="text-sm font-semibold text-ink dark:text-ink-dark"
                  numberOfLines={1}
                >
                  {workflow.name}
                </Text>
                {!workflow.active ? (
                  <Text className="mt-0.5 text-xs text-ink-faint dark:text-ink-dark-faint">
                    Inactive — not listening
                  </Text>
                ) : null}
              </View>
            </View>
            <Text className="w-24 text-[13px] text-ink-muted dark:text-ink-dark-muted">
              {TRIGGER_LABEL[kind]}
            </Text>
            <View className="w-28">
              <StatusPill tone={status.tone} label={status.label} />
            </View>
            <View className="w-32">
              <Text className="text-[13px] text-ink dark:text-ink-dark" numberOfLines={1}>
                {workflow.lastRunAt ? relativeTime(workflow.lastRunAt, now) : '—'}
              </Text>
              {workflow.lastRunAt ? (
                <Text
                  className="text-[11px] text-ink-faint dark:text-ink-dark-faint"
                  numberOfLines={1}
                >
                  {formatDateTime(workflow.lastRunAt)}
                </Text>
              ) : null}
            </View>
            {showTags ? (
              <View className="w-40 flex-row flex-wrap gap-1">
                {workflow.tags.length === 0 ? (
                  <Text className="text-[13px] text-ink-faint dark:text-ink-dark-faint">—</Text>
                ) : (
                  workflow.tags.slice(0, 3).map((tag) => (
                    <View
                      key={tag}
                      className="rounded-md bg-surface-sunk px-1.5 py-0.5 dark:bg-surface-sunk-dark"
                    >
                      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                        {tag}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            ) : null}
            <ChevronRight size={16} color={colors.textFaint} />
          </Pressable>
        );
      })}
    </View>
  );
}
