import {
  buildConfigPayload,
  resolvePendingRun,
  runStatus,
  toEnvVarDrafts,
  triggerKind,
  uniqueExecutions,
} from '../lib/workflows';
import type { ExecutionStatus, ExecutionSummary } from '../types';

function execution(id: string, startedAt: string, status: ExecutionStatus = 'success') {
  return {
    id,
    status,
    triggeredBy: 'manual',
    startedAt,
    finishedAt: null,
  } satisfies ExecutionSummary;
}

describe('runStatus', () => {
  it('maps known statuses and a missing one', () => {
    expect(runStatus('error').label).toBe('Failed');
    expect(runStatus(null).label).toBe('No runs yet');
  });

  it('falls back instead of returning undefined for a status it does not know', () => {
    expect(runStatus('waiting' as ExecutionStatus)).toEqual(runStatus(null));
  });
});

describe('triggerKind', () => {
  it('keeps the three known trigger types', () => {
    expect(triggerKind('webhook')).toBe('webhook');
    expect(triggerKind('cron')).toBe('cron');
    expect(triggerKind('manual')).toBe('manual');
  });

  it('treats an unknown type as manual', () => {
    expect(triggerKind('form')).toBe('manual');
  });
});

describe('uniqueExecutions', () => {
  it('flattens pages in order and drops an execution repeated across pages', () => {
    const pages = [
      { items: [execution('3', '2026-09-28T10:02:00Z'), execution('2', '2026-09-28T10:01:00Z')] },
      { items: [execution('2', '2026-09-28T10:01:00Z'), execution('1', '2026-09-28T10:00:00Z')] },
    ];
    expect(uniqueExecutions(pages).map((item) => item.id)).toEqual(['3', '2', '1']);
  });

  it('handles no data yet', () => {
    expect(uniqueExecutions(undefined)).toEqual([]);
  });
});

describe('resolvePendingRun', () => {
  const run = { startedAt: '2026-09-28T10:00:00Z', triggeredBy: 'manual' as const, seenIds: ['1'] };

  it('stays running until a new execution appears', () => {
    expect(resolvePendingRun(run, [execution('1', '2026-09-28T10:00:05Z')]).status).toBe('running');
  });

  it('picks the newest unseen execution started after the tap', () => {
    const resolved = resolvePendingRun(run, [
      execution('2', '2026-09-28T10:00:03Z', 'error'),
      execution('1', '2026-09-28T09:59:00Z'),
    ]);
    expect(resolved).toEqual({ status: 'error', executionId: '2', finishedAt: null });
  });
});

describe('buildConfigPayload', () => {
  it('omits the value of a stored secret nobody retyped', () => {
    const drafts = toEnvVarDrafts([
      { key: 'TOKEN', secret: true, value: null, hasValue: true },
      { key: 'REGION', secret: false, value: 'in', hasValue: true },
    ]);
    expect(buildConfigPayload('notes', drafts)).toEqual({
      notes: 'notes',
      envVars: [
        { key: 'TOKEN', secret: true },
        { key: 'REGION', secret: false, value: 'in' },
      ],
    });
  });
});
