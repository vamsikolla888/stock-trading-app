import ChevronDown from 'lucide-react-native/icons/chevron-down';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips, Tabs } from '@/components/ui/Tabs';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import {
  useAdminJobLogs,
  useAdminJobs,
  useAdminNewsRuns,
  useRunAdminJob,
  useTriggerNewsIngestion,
  useUpdateAdminCron,
} from '@/features/admin/hooks';
import { formatCount } from '@/features/admin/lib/format';
import {
  cronNextLabel,
  filterLogs,
  isCronShape,
  jobActivity,
  jobStateTone,
  jobsSummary,
  logCounts,
  RUN_STATE,
  runDuration,
  runItems,
  runStagesLine,
  STAGE_STATE,
  type LogFilter,
} from '@/features/admin/lib/jobs';
import type { AdminJob, AdminJobKind, AdminJobLog, AdminNewsRun } from '@/features/admin/types';
import { monoFont } from '@/features/settings/components/JsonBlock';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { confirmAction } from '@/features/settings/lib/confirm';
import { formatDateTime, relativeTime, relativeToNow } from '@/features/settings/lib/time';
import { useNow } from '@/hooks/useNow';
import { animateNextLayout } from '@/lib/animation';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

type Tab = 'cron' | 'queue' | 'logs' | 'news';
const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'cron', label: 'Schedules' },
  { key: 'queue', label: 'Queues' },
  { key: 'logs', label: 'History' },
  { key: 'news', label: 'News' },
];

const NUM = { fontVariant: ['tabular-nums' as const] };

function JobCard({ job, kind, now }: { job: AdminJob; kind: AdminJobKind; now: number }) {
  const run = useRunAdminJob();
  const saveSchedule = useUpdateAdminCron();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(job.schedule ?? '');
  const activity = jobActivity(job.counts);
  const actionLabel = job.actionLabel ?? 'Run now';
  const validCron = isCronShape(draft);
  const changed = draft.trim() !== (job.schedule ?? '');

  const runNow = () =>
    confirmAction({
      title: `${actionLabel}: ${job.label}?`,
      message: 'The job is queued on the worker straight away and runs against live data.',
      confirmLabel: actionLabel,
      onConfirm: () =>
        run.mutate(
          { kind, id: job.id },
          {
            onSuccess: (result) =>
              toast.success(
                result.enqueued ? 'Job queued' : 'Not queued',
                result.detail ?? (result.jobId ? `Job ${result.jobId}` : undefined),
              ),
            onError: (error) => toast.error('Couldn’t queue the job', getErrorMessage(error)),
          },
        ),
    });

  const save = () =>
    confirmAction({
      title: 'Change the schedule?',
      message: `${job.label} will run on “${draft.trim()}” (IST) from now on.`,
      confirmLabel: 'Save schedule',
      onConfirm: () =>
        saveSchedule.mutate(
          { id: job.id, pattern: draft.trim() },
          {
            onSuccess: () => {
              setEditing(false);
              toast.success('Schedule updated');
            },
            onError: (error) => toast.error('Couldn’t update the schedule', getErrorMessage(error)),
          },
        ),
    });

  return (
    <Card className="gap-3">
      <View>
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark">{job.label}</Text>
        <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {job.queue}
          {job.note ? ` · ${job.note}` : ''}
        </Text>
      </View>

      {kind === 'cron' ? (
        editing ? (
          <View className="gap-2">
            <Input
              label="Cron (IST)"
              value={draft}
              onChangeText={setDraft}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="0 8 * * 1-5"
              error={draft && !validCron ? 'Five fields: minute hour day month weekday' : undefined}
              style={{ fontFamily: monoFont }}
            />
            <View className="flex-row gap-2">
              <Button
                label="Save"
                size="sm"
                disabled={!validCron || !changed}
                loading={saveSchedule.isPending}
                onPress={save}
              />
              <Button
                label="Cancel"
                size="sm"
                variant="ghost"
                onPress={() => {
                  setDraft(job.schedule ?? '');
                  setEditing(false);
                }}
              />
            </View>
          </View>
        ) : (
          <View className="flex-row flex-wrap items-center gap-2">
            <View className="rounded-lg bg-surface-sunk px-2.5 py-1 dark:bg-surface-sunk-dark">
              <Text
                className="text-xs text-ink dark:text-ink-dark"
                style={{ fontFamily: monoFont }}
              >
                {job.schedule ?? 'No schedule'}
              </Text>
            </View>
            <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted">
              {cronNextLabel(job, (iso) => `${formatDateTime(iso)} (${relativeToNow(iso, now)})`)}
            </Text>
          </View>
        )
      ) : null}

      <View>
        <Text className="text-[13px] font-medium text-ink dark:text-ink-dark">
          {activity.primary}
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
          {activity.secondary} (retained)
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {job.manual ? (
          <Button label={actionLabel} size="sm" loading={run.isPending} onPress={runNow} />
        ) : (
          <StatusPill tone="neutral" label="Event-driven" />
        )}
        {kind === 'cron' && job.editable === false ? (
          <StatusPill tone="neutral" label="Set by the worker’s environment" />
        ) : null}
        {kind === 'cron' && !editing && job.editable !== false ? (
          <Button
            label="Edit schedule"
            size="sm"
            variant="outline"
            onPress={() => {
              setDraft(job.schedule ?? '');
              setEditing(true);
            }}
          />
        ) : null}
      </View>
    </Card>
  );
}

function JobList({ kind }: { kind: AdminJobKind }) {
  const layout = useScreenLayout();
  const jobs = useAdminJobs(kind);
  const now = useNow();
  if (jobs.isPending) return <ListSkeleton rows={3} />;
  if (!jobs.data)
    return <AdminQueryError what="jobs" error={jobs.error} onRetry={() => void jobs.refetch()} />;
  if (jobs.data.length === 0)
    return (
      <InlineEmpty title="No jobs configured" message="This worker has no jobs of this kind." />
    );
  return (
    <Grid columns={layout.columns} gap={layout.compact ? 12 : 16} equalHeight={false}>
      {jobs.data.map((job) => (
        <JobCard key={job.id} job={job} kind={kind} now={now} />
      ))}
    </Grid>
  );
}

function JobHistory() {
  const logs = useAdminJobLogs();
  const [filter, setFilter] = useState<LogFilter>('all');
  const counts = useMemo(() => logCounts(logs.data ?? []), [logs.data]);
  if (logs.isPending) return <ListSkeleton rows={5} />;
  if (!logs.data)
    return (
      <AdminQueryError what="job history" error={logs.error} onRetry={() => void logs.refetch()} />
    );
  if (logs.data.length === 0)
    return (
      <InlineEmpty
        title="No job runs yet"
        message="Retained runs from the cron and queue workers show up here."
      />
    );
  const shown = filterLogs(logs.data, filter);
  return (
    <View>
      <Chips
        items={[
          { key: 'all', label: `All · ${counts.all}` },
          { key: 'failed', label: `Failed · ${counts.failed}` },
          { key: 'active', label: `Running · ${counts.active}` },
          { key: 'completed', label: `Done · ${counts.completed}` },
        ]}
        value={filter}
        onChange={setFilter}
        className="mb-3"
      />
      {shown.length === 0 ? (
        <InlineEmpty title="Nothing matches" message="No retained run is in this state." />
      ) : (
        <JobLogList logs={shown} />
      )}
    </View>
  );
}

function JobLogList({ logs }: { logs: readonly AdminJobLog[] }) {
  return (
    <ListCard>
      {logs.map((log, index) => (
        // The server reads each queue's states one after another, so a job that moves on
        // mid-read can be listed twice — the index keeps the key unique.
        <View key={`${log.queue}-${log.id}-${index}`}>
          {index > 0 ? <RowDivider /> : null}
          <View className="gap-1.5 px-3.5 py-3">
            <View className="flex-row items-center gap-2">
              <Text
                className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark"
                numberOfLines={1}
              >
                {log.name}
              </Text>
              <StatusPill tone={jobStateTone(log.state)} label={log.state} />
            </View>
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              {log.queue} · {log.createdAt ? formatDateTime(log.createdAt) : '—'}
            </Text>
            {log.failedReason ? (
              <Text
                className="text-xs leading-[17px] text-danger-600 dark:text-danger-dark"
                numberOfLines={4}
                selectable
              >
                {log.failedReason}
              </Text>
            ) : log.finishedAt ? (
              <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
                Finished {formatDateTime(log.finishedAt)}
              </Text>
            ) : (
              <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">In progress</Text>
            )}
          </View>
        </View>
      ))}
    </ListCard>
  );
}

/** One ingestion batch: when, how it went, and (expanded) every provider's stage. */
function NewsRunRow({ run, now }: { run: AdminNewsRun; now: number }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const state = RUN_STATE[run.status];
  const items = runItems(run);
  const trigger = run.trigger === 'MANUAL' ? 'Manual' : 'Scheduled';
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${trigger} run, ${formatDateTime(run.startedAt)}, ${state.label}. ${open ? 'Hide' : 'Show'} providers`}
        onPress={() => {
          animateNextLayout();
          setOpen((current) => !current);
        }}
        className="gap-1 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <View className="flex-row items-center gap-2">
          <Text
            className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {formatDateTime(run.startedAt)}
          </Text>
          <StatusPill tone={state.tone} label={state.label} />
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <ChevronDown size={16} color={colors.textFaint} />
          </View>
        </View>
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
          {[
            trigger,
            runDuration(run),
            `${formatCount(items)} item${items === 1 ? '' : 's'}`,
            run.inserted != null ? `${formatCount(run.inserted)} new` : null,
            relativeTime(run.startedAt, now),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {runStagesLine(run)}
        </Text>
        {run.errorMessage ? (
          <Text
            className="text-xs leading-[17px] text-danger-600 dark:text-danger-dark"
            numberOfLines={3}
            selectable
          >
            {run.errorMessage}
          </Text>
        ) : null}
      </Pressable>
      {open ? (
        <View className="border-t border-line bg-surface-sunk px-3.5 py-2 dark:border-line-dark dark:bg-surface-sunk-dark">
          {run.stages.length === 0 ? (
            <Text className="py-1.5 text-xs text-ink-muted dark:text-ink-dark-muted">
              No stages recorded for this run.
            </Text>
          ) : (
            run.stages.map((stage) => {
              const stageState = STAGE_STATE[stage.status];
              return (
                <View key={stage.key} className="flex-row items-center gap-3 py-1.5">
                  <View className="flex-1">
                    <Text className="text-[13px] text-ink dark:text-ink-dark" numberOfLines={1}>
                      {stage.label}
                    </Text>
                    <Text
                      className="text-[11px] text-ink-muted dark:text-ink-dark-muted"
                      numberOfLines={2}
                    >
                      {stage.detail ?? '—'}
                      {stage.itemCount != null ? ` · ${formatCount(stage.itemCount)} items` : ''}
                    </Text>
                  </View>
                  <StatusPill tone={stageState.tone} label={stageState.label} />
                </View>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}

/** News ingestion runs with their per-provider timeline (web: Jobs › News ingestion). */
function NewsRuns() {
  const runs = useAdminNewsRuns(15);
  const trigger = useTriggerNewsIngestion();
  const now = useNow(30_000);

  const start = () =>
    confirmAction({
      title: 'Start a news ingestion run?',
      message:
        'Every provider’s n8n workflow fetches its feed now and reports back here. It returns at once; the timeline fills in over the next minutes.',
      confirmLabel: 'Start run',
      onConfirm: () =>
        trigger.mutate(undefined, {
          onSuccess: () => toast.success('News ingestion started'),
          onError: (error) => toast.error('Couldn’t start a run', getErrorMessage(error)),
        }),
    });

  return (
    <View>
      <View className="mb-3 flex-row items-center gap-3">
        <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
          {runs.data
            ? `${formatCount(runs.data.total)} runs recorded · each provider reports back from n8n`
            : 'Each provider reports back from n8n'}
        </Text>
        <Button label="Run news ingest" size="sm" loading={trigger.isPending} onPress={start} />
      </View>
      {runs.isPending ? (
        <ListSkeleton rows={4} />
      ) : !runs.data ? (
        <AdminQueryError
          what="ingestion runs"
          error={runs.error}
          onRetry={() => void runs.refetch()}
        />
      ) : runs.data.runs.length === 0 ? (
        <InlineEmpty
          title="No ingestion runs yet"
          message="Start one and its per-provider timeline appears here."
        />
      ) : (
        <ListCard>
          {runs.data.runs.map((run, index) => (
            <View key={run.runId}>
              {index > 0 ? <RowDivider /> : null}
              <NewsRunRow run={run} now={now} />
            </View>
          ))}
        </ListCard>
      )}
    </View>
  );
}

const FOOTNOTE: Record<Tab, string> = {
  cron: 'Schedules are five-part cron expressions in Asia/Kolkata time.',
  queue: 'Event-driven queues are fed by the app and can’t be run without a payload.',
  logs: 'The latest retained runs across cron and queue workers, newest first.',
  news: 'A provider marked Empty ran and returned nothing — the normal outcome for sites that block automated readers. Only Failed means its workflow errored or never reported back.',
};

/** Worker schedules, on-demand queues, recent runs and news ingestion (web: Jobs & schedules). */
export function JobsPanel() {
  const [tab, setTab] = useState<Tab>('cron');
  const layout = useScreenLayout();
  // Both lists feed the headline numbers, so both load whatever tab is open.
  const crons = useAdminJobs('cron');
  const queues = useAdminJobs('queue');
  const logs = useAdminJobLogs(tab === 'logs');
  const news = useAdminNewsRuns(15, tab === 'news');
  const summary = jobsSummary(crons.data, queues.data);

  const onRefresh = () =>
    Promise.all([
      crons.refetch(),
      queues.refetch(),
      tab === 'logs' ? logs.refetch() : null,
      tab === 'news' ? news.refetch() : null,
    ]);

  const value = (n: number | null) => (n == null ? '—' : formatCount(n));

  return (
    <StackScreen
      title="Jobs & schedules"
      subtitle="Live worker queues · times in IST"
      onRefresh={onRefresh}
      fill
    >
      <Grid columns={layout.compact ? 2 : 4} gap={12} className="mb-4">
        <StatTile
          label="Scheduled jobs"
          value={value(summary.scheduled)}
          sub={
            summary.registered != null
              ? `${summary.registered} registered${summary.queues != null ? ` · ${summary.queues} queues` : ''}`
              : undefined
          }
          onPress={() => setTab('cron')}
        />
        <StatTile
          label="Running now"
          value={value(summary.active)}
          status={summary.active ? 'info' : undefined}
          sub="Across every queue"
          onPress={() => setTab('queue')}
        />
        <StatTile label="Waiting" value={value(summary.waiting)} sub="Queued or delayed" />
        <StatTile
          label="Failed"
          value={value(summary.failed)}
          status={summary.failed == null ? undefined : summary.failed > 0 ? 'warn' : 'ok'}
          sub="Retained by the queues"
          onPress={() => setTab('logs')}
        />
      </Grid>
      <View style={layout.compact ? undefined : { maxWidth: 560 }}>
        <Tabs items={TABS} value={tab} onChange={setTab} />
      </View>
      <View className="mt-4">
        {tab === 'logs' ? (
          <JobHistory />
        ) : tab === 'news' ? (
          <NewsRuns />
        ) : (
          <JobList key={tab} kind={tab} />
        )}
      </View>
      <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        {FOOTNOTE[tab]}
      </Text>
    </StackScreen>
  );
}
