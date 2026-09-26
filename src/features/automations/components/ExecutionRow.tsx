import ChevronDown from 'lucide-react-native/icons/chevron-down';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useWorkflowExecution } from '@/features/automations/hooks';
import { runStatus, TRIGGERED_BY_LABEL } from '@/features/automations/lib/workflows';
import type { ExecutionStage, ExecutionSummary } from '@/features/automations/types';
import { JsonBlock, monoFont } from '@/features/settings/components/JsonBlock';
import { StatusDot, StatusPill } from '@/features/settings/components/StatusPill';
import type { StatusTone } from '@/features/settings/lib/status';
import { durationBetween, formatDateTime, relativeTime } from '@/features/settings/lib/time';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const STAGE: Record<ExecutionStage['status'], { tone: StatusTone; label: string }> = {
  PENDING: { tone: 'neutral', label: 'Waiting' },
  OK: { tone: 'ok', label: 'Done' },
  FAILED: { tone: 'bad', label: 'Failed' },
};

function StageList({ stages }: { stages: readonly ExecutionStage[] }) {
  if (stages.length === 0) return null;
  return (
    <View className="gap-2.5">
      <Text className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">Steps</Text>
      {stages.map((stage) => {
        const meta = STAGE[stage.status] ?? STAGE.PENDING;
        const took =
          stage.startedAt && stage.finishedAt && stage.startedAt !== stage.finishedAt
            ? durationBetween(stage.startedAt, stage.finishedAt)
            : null;
        return (
          <View key={stage.key} className="flex-row gap-2.5">
            <View className="pt-1.5">
              <StatusDot tone={meta.tone} />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                {stage.label}
              </Text>
              <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                {[meta.label, took, stage.detail].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ExecutionDetailPanel({
  workflowId,
  execution,
  onRetry,
  retrying,
}: {
  workflowId: string;
  execution: ExecutionSummary;
  onRetry?: () => void;
  retrying: boolean;
}) {
  const { colors } = useTheme();
  const detail = useWorkflowExecution(workflowId, execution.id);

  return (
    <View className="gap-4 border-t border-line bg-surface-sunk px-3.5 py-3.5 dark:border-line-dark dark:bg-surface-sunk-dark">
      <View className="gap-1">
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          Started {formatDateTime(execution.startedAt)} IST
        </Text>
        <Text
          selectable
          className="text-xs text-ink-faint dark:text-ink-dark-faint"
          style={{ fontFamily: monoFont }}
        >
          Execution {execution.id}
        </Text>
      </View>
      {detail.isPending ? (
        <View className="items-center py-3">
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : detail.error ? (
        <Text className="text-[13px] text-danger-600 dark:text-danger-dark">
          {getErrorMessage(detail.error, 'Couldn’t load this run.')}
        </Text>
      ) : detail.data ? (
        <>
          {detail.data.errorMessage ? (
            <Text
              selectable
              className="text-[13px] leading-[19px] text-danger-600 dark:text-danger-dark"
            >
              {detail.data.errorMessage}
            </Text>
          ) : null}
          <StageList stages={detail.data.stages ?? []} />
          <JsonBlock label="Input" value={detail.data.input} />
          <JsonBlock label="Output" value={detail.data.output} />
        </>
      ) : null}
      {onRetry ? (
        <Button
          label="Run again"
          variant="outline"
          size="sm"
          className="self-start"
          loading={retrying}
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}

export function ExecutionRow({
  workflowId,
  execution,
  now,
  expanded,
  onToggle,
  onRetry,
  retrying = false,
}: {
  workflowId: string;
  execution: ExecutionSummary;
  /** Current time from the screen's useNow, for "3m ago". */
  now: number;
  expanded: boolean;
  onToggle: () => void;
  /** Offered on failed runs only — it starts a fresh run, n8n has no replay. */
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { colors } = useTheme();
  const status = runStatus(execution.status);
  const started = relativeTime(execution.startedAt, now);
  const meta = [
    TRIGGERED_BY_LABEL[execution.triggeredBy] ?? execution.triggeredBy,
    execution.status === 'running'
      ? 'in progress'
      : durationBetween(execution.startedAt, execution.finishedAt),
  ].join(' · ');

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${status.label} run, ${started}, ${meta}`}
        onPress={onToggle}
        className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <View className="flex-1 gap-1">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">{started}</Text>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <StatusPill tone={status.tone} label={status.label} />
        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
          <ChevronDown size={18} color={colors.textFaint} />
        </View>
      </Pressable>
      {expanded ? (
        <ExecutionDetailPanel
          workflowId={workflowId}
          execution={execution}
          onRetry={execution.status === 'error' ? onRetry : undefined}
          retrying={retrying}
        />
      ) : null}
    </View>
  );
}
