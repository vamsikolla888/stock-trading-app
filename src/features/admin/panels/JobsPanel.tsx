import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Tabs } from '@/components/ui/Tabs';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import {
  useAdminJobLogs,
  useAdminJobs,
  useRunAdminJob,
  useUpdateAdminCron,
} from '@/features/admin/hooks';
import { isCronShape, jobActivity, jobStateTone } from '@/features/admin/lib/jobs';
import type { AdminJob, AdminJobKind } from '@/features/admin/types';
import { monoFont } from '@/features/settings/components/JsonBlock';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { confirmAction } from '@/features/settings/lib/confirm';
import { formatDateTime, relativeToNow } from '@/features/settings/lib/time';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage } from '@/types/api';

type Tab = 'cron' | 'queue' | 'logs';
const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'cron', label: 'Schedules' },
  { key: 'queue', label: 'Queues' },
  { key: 'logs', label: 'History' },
];

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
              {job.nextRunAt
                ? `Next ${formatDateTime(job.nextRunAt)} (${relativeToNow(job.nextRunAt, now)})`
                : 'Starts when the worker runs'}
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
        {kind === 'cron' && !editing ? (
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
    <View className="gap-3">
      {jobs.data.map((job) => (
        <JobCard key={job.id} job={job} kind={kind} now={now} />
      ))}
    </View>
  );
}

function JobHistory() {
  const logs = useAdminJobLogs();
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
  return (
    <ListCard>
      {logs.data.map((log, index) => (
        <View key={`${log.queue}-${log.id}`}>
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

/** Worker schedules, on-demand queues and recent runs (web: Jobs & runs → Job control). */
export function JobsPanel() {
  const [tab, setTab] = useState<Tab>('cron');
  const crons = useAdminJobs('cron', tab === 'cron');
  const queues = useAdminJobs('queue', tab === 'queue');
  const logs = useAdminJobLogs(tab === 'logs');

  const onRefresh = () =>
    tab === 'cron' ? crons.refetch() : tab === 'queue' ? queues.refetch() : logs.refetch();

  return (
    <StackScreen
      title="Jobs & schedules"
      subtitle="Worker jobs · times in IST"
      onRefresh={onRefresh}
    >
      <Tabs items={TABS} value={tab} onChange={setTab} />
      <View className="mt-4">
        {tab === 'logs' ? <JobHistory /> : <JobList key={tab} kind={tab} />}
      </View>
      <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        {tab === 'logs'
          ? 'The latest retained runs across cron and queue workers, newest first.'
          : tab === 'cron'
            ? 'Schedules are five-part cron expressions in Asia/Kolkata time.'
            : 'Event-driven queues are fed by the app and can’t be run without a payload.'}
      </Text>
    </StackScreen>
  );
}
