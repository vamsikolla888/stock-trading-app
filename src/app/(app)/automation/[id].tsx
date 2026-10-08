import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Play from 'lucide-react-native/icons/play';
import Send from 'lucide-react-native/icons/send';
import Share2 from 'lucide-react-native/icons/share-2';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Share, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid, GridItem, SplitColumns } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { Tabs } from '@/components/ui/Tabs';
import { isDependencyUnavailable } from '@/features/admin/lib/access';
import { ExecutionRow } from '@/features/automations/components/ExecutionRow';
import { WorkflowConfigForm } from '@/features/automations/components/WorkflowConfigForm';
import { TRIGGER_ICON } from '@/features/automations/components/WorkflowRow';
import {
  useDeadlinePassed,
  useRetryExecution,
  useRunWorkflow,
  useSetWorkflowActive,
  useTestWorkflow,
  useWorkflow,
  useWorkflowExecutions,
  useWorkflows,
  workflowKeys,
} from '@/features/automations/hooks';
import {
  isTerminal,
  resolvePendingRun,
  runBlockedReason,
  runStats,
  runStatus,
  TRIGGER_LABEL,
  triggerKind,
  uniqueExecutions,
  watchDeadline,
  type PendingRun,
} from '@/features/automations/lib/workflows';
import type { TestWebhookResult, WorkflowDetail } from '@/features/automations/types';
import { JsonBlock, monoFont } from '@/features/settings/components/JsonBlock';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { SwitchRow } from '@/features/settings/components/SwitchRow';
import { confirmAction } from '@/features/settings/lib/confirm';
import { formatDateTime, formatElapsed, relativeTime } from '@/features/settings/lib/time';
import { useNow } from '@/hooks/useNow';
import { animateNextLayout } from '@/lib/animation';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

type Panel = 'monitor' | 'configure';
const PANELS: readonly { key: Panel; label: string }[] = [
  { key: 'monitor', label: 'Activity' },
  { key: 'configure', label: 'Settings' },
];
const WATCH_POLL_MS = 4_000;

function TriggerCard({ workflow }: { workflow: WorkflowDetail }) {
  const { colors } = useTheme();
  const kind = triggerKind(workflow.triggerType);
  const trigger = TRIGGER_ICON[kind];

  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-3">
        <IconTile Icon={trigger.Icon} tone={trigger.tone} size="sm" />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
            {TRIGGER_LABEL[kind]} trigger
          </Text>
          <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
            {workflow.triggerType === 'cron'
              ? (workflow.cronSummary ?? 'Runs on a schedule set in n8n')
              : workflow.triggerType === 'webhook'
                ? 'Runs when this URL is called'
                : 'Started from n8n’s own editor only'}
          </Text>
        </View>
      </View>
      {workflow.triggerType === 'webhook' && workflow.webhookUrl ? (
        <View className="flex-row items-center gap-2 rounded-field bg-surface-sunk px-3 py-2.5 dark:bg-surface-sunk-dark">
          <Text
            selectable
            className="flex-1 text-xs text-ink dark:text-ink-dark"
            style={{ fontFamily: monoFont }}
            numberOfLines={3}
          >
            {workflow.webhookUrl}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share webhook URL"
            hitSlop={10}
            onPress={() => void Share.share({ message: workflow.webhookUrl ?? '' })}
            className="h-8 w-8 items-center justify-center rounded-full active:bg-surface dark:active:bg-surface-dark"
          >
            <Share2 size={16} color={colors.link} />
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

function TestResultCard({
  result,
  error,
}: {
  result: TestWebhookResult | null;
  error: string | null;
}) {
  return (
    <Card className="mt-3 gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark">Test response</Text>
        {result ? (
          <StatusPill
            tone={result.ok ? 'ok' : 'bad'}
            label={result.status ? `HTTP ${result.status}` : 'No response'}
          />
        ) : null}
      </View>
      {error ? (
        <Text className="text-[13px] text-danger-600 dark:text-danger-dark">{error}</Text>
      ) : null}
      {result ? <JsonBlock value={result.body ?? null} /> : null}
    </Card>
  );
}

/** A pane's quiet label when Activity and Settings sit side by side. */
function PaneTitle({ label }: { label: string }) {
  return (
    <Text
      accessibilityRole="header"
      className="mb-1 text-xs font-semibold uppercase text-ink-faint dark:text-ink-dark-faint"
      style={{ letterSpacing: 0.6 }}
    >
      {label}
    </Text>
  );
}

export default function AutomationDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  // A deep link or stale route can arrive without an id (or with it repeated); without one
  // the queries never start, so the screen says so instead of loading forever.
  const id = typeof params.id === 'string' && params.id.trim() ? params.id : undefined;
  const router = useRouter();
  const { colors } = useTheme();
  const layout = useScreenLayout();
  const now = useNow();
  const queryClient = useQueryClient();
  const workflow = useWorkflow(id);
  const [panel, setPanel] = useState<Panel>('monitor');
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestWebhookResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // A run started here is watched until n8n reports it finished, for at most RUN_WATCH_MS.
  const watchExpired = useDeadlinePassed(pendingRun ? watchDeadline(pendingRun) : null);
  const watchedRun = pendingRun && !watchExpired ? pendingRun : null;
  const executions = useWorkflowExecutions(id, {
    pollMs: WATCH_POLL_MS,
    pollWhile: watchedRun
      ? (loaded) => !isTerminal(resolvePendingRun(watchedRun, loaded).status)
      : undefined,
  });

  const setActive = useSetWorkflowActive();
  const run = useRunWorkflow();
  const test = useTestWorkflow();
  const retry = useRetryExecution();

  const items = useMemo(() => uniqueExecutions(executions.data?.pages), [executions.data]);
  const stats = useMemo(() => runStats(items), [items]);
  const resolved = pendingRun ? resolvePendingRun(pendingRun, items) : null;
  const runFinished = resolved ? isTerminal(resolved.status) : false;
  const watching = watchedRun !== null && !runFinished;
  // Keeps the list row's "last run" in step while a run is being watched.
  useWorkflows({ pollMs: watching ? WATCH_POLL_MS * 2 : false });

  // Once n8n reports the outcome, refresh the header's "last run" and say how it went.
  const finishedStatus = runFinished ? resolved?.status : undefined;
  useEffect(() => {
    if (!finishedStatus || !id) return;
    void queryClient.invalidateQueries({ queryKey: workflowKeys.detail(id) });
    if (finishedStatus === 'success') toast.success('Run succeeded');
    else toast.error('Run failed', 'Open it under Recent runs for the details.');
  }, [finishedStatus, id, queryClient]);

  const detail = workflow.data;
  const blocked = detail
    ? runBlockedReason({ active: detail.active, triggerType: triggerKind(detail.triggerType) })
    : null;

  const onRefresh = () => Promise.all([workflow.refetch(), executions.refetch()]);

  const toggleActive = (next: boolean) => {
    if (!detail) return;
    confirmAction({
      title: next ? `Activate “${detail.name}”?` : `Deactivate “${detail.name}”?`,
      message: next
        ? 'Its schedule and webhook start listening again on the shared n8n instance.'
        : 'Its schedule and webhook stop until someone activates it again. Runs in progress finish.',
      confirmLabel: next ? 'Activate' : 'Deactivate',
      destructive: !next,
      onConfirm: () =>
        setActive.mutate(
          { id: detail.id, active: next },
          {
            onSuccess: (updated) =>
              toast.success(updated.active ? 'Workflow activated' : 'Workflow deactivated'),
            onError: (error) => toast.error('Couldn’t change it', getErrorMessage(error)),
          },
        ),
    });
  };

  const startRun = () => {
    if (!detail) return;
    confirmAction({
      title: `Run “${detail.name}” now?`,
      message: 'This starts a real run on n8n, exactly as if its webhook were called.',
      confirmLabel: 'Run now',
      onConfirm: () => {
        setRunError(null);
        const startedAt = new Date().toISOString();
        const seenIds = items.map((execution) => execution.id);
        run.mutate(detail.id, {
          onSuccess: () => setPendingRun({ startedAt, triggeredBy: 'manual', seenIds }),
          onError: (error) => setRunError(getErrorMessage(error, 'Couldn’t start this workflow.')),
        });
      },
    });
  };

  const sendTest = () => {
    if (!detail) return;
    confirmAction({
      title: 'Send a test payload?',
      message: 'The webhook runs with an empty test payload and its response is shown here.',
      confirmLabel: 'Send test',
      onConfirm: () => {
        setTestError(null);
        setTestResult(null);
        test.mutate(detail.id, {
          onSuccess: setTestResult,
          onError: (error) => setTestError(getErrorMessage(error, 'Couldn’t reach this workflow.')),
        });
      },
    });
  };

  const retryExecution = (executionId: string) => {
    if (!detail) return;
    confirmAction({
      title: 'Run it again?',
      message: 'n8n can’t replay a past run, so this starts a fresh run of the workflow’s webhook.',
      confirmLabel: 'Run again',
      onConfirm: () => {
        setRunError(null);
        const startedAt = new Date().toISOString();
        const seenIds = items.map((execution) => execution.id);
        retry.mutate(
          { id: detail.id, executionId },
          {
            onSuccess: () => {
              setPendingRun({ startedAt, triggeredBy: 'retry', seenIds });
              toast.info('Run started', 'Watching for the result.');
            },
            onError: (error) => toast.error('Couldn’t start the run', getErrorMessage(error)),
          },
        );
      },
    });
  };

  const showRunPanel = pendingRun !== null;
  const runMeta = resolved ? runStatus(resolved.status) : null;

  // Wide windows show Activity and Settings side by side (web: SPLIT_DETAIL_AT); narrower
  // ones keep them behind the switch, and Activity splits into two columns on a tablet.
  const sideBySide = layout.columns === 3;

  const monitor = detail ? (
    <SplitColumns
      split={!layout.compact && !sideBySide}
      left={
        <>
          <Text className="mt-4 text-[13px] leading-5 text-ink-muted dark:text-ink-dark-muted">
            {detail.notes || 'No description yet — add one under Settings.'}
          </Text>

          {stats.finished > 0 ? (
            <Grid columns={layout.compact ? 2 : 3} gap={10} className="mt-4">
              <StatTile
                label="Success"
                value={`${Math.round(stats.successRate ?? 0)}%`}
                status={stats.succeeded === stats.finished ? 'ok' : 'warn'}
                sub={`${stats.succeeded} of ${stats.finished} runs`}
              />
              <StatTile
                label="Avg run"
                value={stats.avgDurationMs != null ? formatElapsed(stats.avgDurationMs) : '—'}
                sub="Start to finish"
              />
              {/* Its relative time needs a full row on a phone. */}
              <GridItem span={layout.compact ? 2 : 1}>
                <StatTile
                  label="Last success"
                  value={stats.lastSuccessAt ? relativeTime(stats.lastSuccessAt, now) : 'None'}
                  status={stats.lastSuccessAt ? undefined : 'bad'}
                  sub={stats.lastSuccessAt ? formatDateTime(stats.lastSuccessAt) : 'In these runs'}
                />
              </GridItem>
            </Grid>
          ) : null}

          <View className="mt-4">
            <TriggerCard workflow={detail} />
          </View>

          <View className="mt-3 flex-row gap-2.5">
            <Button
              label="Run now"
              className="flex-1"
              leftIcon={<Play size={16} color={colors.primaryText} />}
              disabled={Boolean(blocked) || watching}
              loading={run.isPending}
              onPress={startRun}
            />
            <Button
              label="Send test"
              variant="outline"
              className="flex-1"
              leftIcon={<Send size={16} color={colors.text} />}
              disabled={Boolean(blocked)}
              loading={test.isPending}
              onPress={sendTest}
            />
          </View>
          {blocked ? (
            <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
              {blocked}
            </Text>
          ) : null}

          {runError ? <Banner tone="error" message={runError} className="mt-3" /> : null}

          {showRunPanel && runMeta && resolved ? (
            <Card className="mt-3 gap-2">
              <View className="flex-row items-center gap-2.5">
                {resolved.status === 'running' ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : null}
                <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
                  {resolved.status === 'running'
                    ? 'Running…'
                    : resolved.status === 'success'
                      ? 'Run succeeded'
                      : 'Run failed'}
                </Text>
                <StatusPill tone={runMeta.tone} label={runMeta.label} />
              </View>
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                Started {formatDateTime(pendingRun?.startedAt)} IST
                {resolved.executionId
                  ? ` · execution ${resolved.executionId}`
                  : ' · waiting for n8n to report it'}
              </Text>
              {watchExpired && resolved.status === 'running' ? (
                <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
                  Still no result — pull to refresh the history below.
                </Text>
              ) : null}
            </Card>
          ) : null}

          {testResult || testError ? (
            <TestResultCard result={testResult} error={testError} />
          ) : null}
        </>
      }
      right={
        <Section title="Recent runs" className={layout.compact || sideBySide ? undefined : 'mt-4'}>
          {executions.isPending ? (
            <ListSkeleton rows={3} />
          ) : executions.error && items.length === 0 ? (
            <InlineError
              what="run history"
              error={executions.error}
              onRetry={() => void executions.refetch()}
            />
          ) : items.length === 0 ? (
            <InlineEmpty
              title="No runs yet"
              message={
                detail.triggerType === 'webhook'
                  ? 'Start the first one with Run now, or wait for its webhook to be called.'
                  : detail.triggerType === 'cron'
                    ? 'It runs on its own schedule — runs appear here once it fires.'
                    : 'Start it from n8n’s editor; runs appear here afterwards.'
              }
            />
          ) : (
            <>
              <ListCard>
                {items.map((execution, index) => (
                  <View key={execution.id}>
                    {index > 0 ? <RowDivider /> : null}
                    <ExecutionRow
                      workflowId={detail.id}
                      execution={execution}
                      now={now}
                      expanded={expanded === execution.id}
                      onToggle={() => {
                        animateNextLayout();
                        setExpanded((current) => (current === execution.id ? null : execution.id));
                      }}
                      onRetry={blocked ? undefined : () => retryExecution(execution.id)}
                      retrying={retry.isPending}
                    />
                  </View>
                ))}
              </ListCard>
              {executions.hasNextPage ? (
                <Button
                  label="Load older runs"
                  variant="outline"
                  className="mt-3"
                  fullWidth
                  loading={executions.isFetchingNextPage}
                  onPress={() => void executions.fetchNextPage()}
                />
              ) : null}
              {executions.isFetchNextPageError ? (
                <Text className="mt-2 text-[13px] text-danger-600 dark:text-danger-dark">
                  Couldn’t load older runs. Try again.
                </Text>
              ) : null}
            </>
          )}
        </Section>
      }
    />
  ) : null;

  return (
    <StackScreen
      title={detail?.name ?? 'Automation'}
      subtitle={
        detail
          ? `${TRIGGER_LABEL[triggerKind(detail.triggerType)]} · ${detail.active ? 'Active' : 'Inactive'}`
          : undefined
      }
      onRefresh={id ? onRefresh : undefined}
      fill
    >
      {!id ? (
        <InlineEmpty
          title="Workflow not found"
          message="This link doesn’t point to a workflow. Open it from the Automations list."
          action={{
            label: 'Open Automations',
            onPress: () => router.replace('/settings/automations'),
          }}
        />
      ) : workflow.isPending ? (
        <ListSkeleton rows={3} />
      ) : !detail && isDependencyUnavailable(workflow.error) ? (
        <InlineEmpty
          title="Automations aren’t connected"
          message="The server isn’t connected to its n8n instance right now. Pull to refresh once it is."
        />
      ) : !detail ? (
        <InlineError
          what="this workflow"
          error={workflow.error}
          onRetry={() => void workflow.refetch()}
        />
      ) : (
        <>
          <ListCard>
            <View className="gap-2 px-3.5 pb-1 pt-3.5">
              <View className="flex-row flex-wrap items-center gap-2">
                <StatusPill
                  tone={runStatus(detail.lastRunStatus).tone}
                  label={`Last run: ${runStatus(detail.lastRunStatus).label}`}
                />
                {detail.lastRunAt ? (
                  <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                    {relativeTime(detail.lastRunAt, now)}
                  </Text>
                ) : null}
              </View>
              {detail.tags.length > 0 ? (
                <View className="flex-row flex-wrap gap-1.5">
                  {detail.tags.map((tag) => (
                    <View
                      key={tag}
                      className="rounded-full border border-line px-2.5 py-0.5 dark:border-line-dark"
                    >
                      <Text className="text-[11px] font-medium text-ink-muted dark:text-ink-dark-muted">
                        {tag}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <SwitchRow
              title="Active"
              subtitle={
                detail.active ? 'Listening for its trigger' : 'Not listening — runs won’t start'
              }
              value={detail.active}
              disabled={setActive.isPending}
              onValueChange={toggleActive}
            />
          </ListCard>

          {sideBySide ? (
            // Wide enough: Activity and Settings side by side, no switch between them.
            <View className="mt-6 flex-row items-start" style={{ columnGap: 32 }}>
              <View className="flex-1">
                <PaneTitle label="Activity" />
                {monitor}
              </View>
              <View className="flex-1 border-l border-line pl-8 dark:border-line-dark">
                <PaneTitle label="Settings" />
                <WorkflowConfigForm workflow={detail} />
              </View>
            </View>
          ) : (
            <>
              <Tabs items={PANELS} value={panel} onChange={setPanel} className="mt-4" />
              {panel === 'configure' ? (
                // A form reads best at a line length, not stretched across a wide window.
                <View style={layout.compact ? undefined : { maxWidth: 720 }}>
                  <WorkflowConfigForm workflow={detail} />
                </View>
              ) : (
                monitor
              )}
            </>
          )}
        </>
      )}
    </StackScreen>
  );
}
