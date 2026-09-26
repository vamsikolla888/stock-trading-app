import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Hand from 'lucide-react-native/icons/hand';
import Webhook from 'lucide-react-native/icons/webhook';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { IconComponent } from '@/components/ui/icon';
import { IconTile, type IconTone } from '@/components/ui/IconTile';
import { runStatus, TRIGGER_LABEL } from '@/features/automations/lib/workflows';
import type { WorkflowSummary, WorkflowTriggerType } from '@/features/automations/types';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { relativeTime } from '@/features/settings/lib/time';
import { useTheme } from '@/theme/ThemeProvider';

export const TRIGGER_ICON: Record<WorkflowTriggerType, { Icon: IconComponent; tone: IconTone }> = {
  webhook: { Icon: Webhook, tone: 'blue' },
  cron: { Icon: CalendarClock, tone: 'violet' },
  manual: { Icon: Hand, tone: 'slate' },
};

export function WorkflowRow({
  workflow,
  now,
  onPress,
}: {
  workflow: WorkflowSummary;
  /** Current time from the list's useNow, for "3m ago". */
  now: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const status = runStatus(workflow.lastRunStatus);
  const trigger = TRIGGER_ICON[workflow.triggerType];
  const meta = [
    TRIGGER_LABEL[workflow.triggerType],
    workflow.active ? null : 'Inactive',
    workflow.lastRunAt ? relativeTime(workflow.lastRunAt, now) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${workflow.name}, ${status.label}, ${meta}`}
      onPress={onPress}
      className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <IconTile Icon={trigger.Icon} tone={trigger.tone} size="sm" />
      <View className="flex-1 gap-1.5">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={2}>
          {workflow.name}
        </Text>
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <StatusPill tone={status.tone} label={status.label} />
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </View>
      <ChevronRight size={18} color={colors.textFaint} />
    </Pressable>
  );
}
