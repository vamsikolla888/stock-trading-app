import {
  buildConfigPayload,
  resolvePendingRun,
  runStats,
  runStatus,
  runStatusCounts,
  toEnvVarDrafts,
  triggerKind,
  uniqueExecutions,
  workflowKpis,
} from '../lib/workflows';
import type { ExecutionStatus, ExecutionSummary, WorkflowSummary } from '../types';

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

describe('runStatusCounts', () => {
  function workflow(id: string, lastRunStatus: ExecutionStatus | null): WorkflowSummary {
    return {
      id,
      name: id,
      active: true,
      triggerType: 'webhook',
      tags: [],
      lastRunAt: null,
      lastRunStatus,
    };
  }

  it('counts each workflow under its last outcome', () => {
    expect(
      runStatusCounts([
        workflow('a', 'success'),
        workflow('b', 'success'),
        workflow('c', 'error'),
        workflow('d', 'running'),
        workflow('e', null),
      ]),
    ).toEqual({ success: 2, error: 1, running: 1, idle: 1 });
  });

  it('files a status this build does not know under no runs yet', () => {
    const unknown = workflow('x', 'waiting' as ExecutionStatus);
    expect(runStatusCounts([unknown])).toEqual({ success: 0, error: 0, running: 0, idle: 1 });
  });

  it('is all zeros for no workflows', () => {
    expect(runStatusCounts([])).toEqual({ success: 0, error: 0, running: 0, idle: 0 });
  });
});

describe('runStats', () => {
  function run(status: ExecutionStatus, startedAt: string, finishedAt: string | null) {
    return {
      id: startedAt,
      status,
      triggeredBy: 'cron',
      startedAt,
      finishedAt,
    } satisfies ExecutionSummary;
  }

  it('sums up finished runs and leaves running ones out', () => {
    const stats = runStats([
      run('running', '2026-10-04T10:30:00.000Z', null),
      run('success', '2026-10-04T10:15:00.000Z', '2026-10-04T10:15:40.000Z'),
      run('error', '2026-10-04T10:00:00.000Z', '2026-10-04T10:00:10.000Z'),
      run('success', '2026-10-04T09:45:00.000Z', '2026-10-04T09:45:30.000Z'),
    ]);
    expect(stats).toEqual({
      finished: 3,
      succeeded: 2,
      successRate: (2 / 3) * 100,
      avgDurationMs: 80_000 / 3,
      lastSuccessAt: '2026-10-04T10:15:40.000Z',
    });
  });

  it('skips spans it cannot measure and falls back to the start for a success with no end', () => {
    const stats = runStats([run('success', '2026-10-04T10:00:00.000Z', null)]);
    expect(stats.avgDurationMs).toBeNull();
    expect(stats.lastSuccessAt).toBe('2026-10-04T10:00:00.000Z');
  });

  it('has no rate before anything finished', () => {
    expect(runStats([])).toEqual({
      finished: 0,
      succeeded: 0,
      successRate: null,
      avgDurationMs: null,
      lastSuccessAt: null,
    });
  });
});

describe('workflowKpis', () => {
  const now = Date.parse('2026-10-05T10:00:00Z');

  it('leads with the counts, each a tap from the workflows it counts', () => {
    const kpis = workflowKpis(
      { total: 12, active: 9, failedLast24h: 2, lastSuccessAt: '2026-10-05T09:30:00Z' },
      now,
    );
    expect(kpis.map((kpi) => [kpi.label, kpi.value, kpi.filter])).toEqual([
      ['Workflows', '12', 'all'],
      ['Active', '9', 'active'],
      ['Failed · 24h', '2', 'failed'],
      ['Last success', '30m ago', undefined],
    ]);
    expect(kpis[1]?.sub).toBe('3 inactive');
    expect(kpis[2]).toMatchObject({ status: 'bad', sub: 'Show the failing ones' });
    expect(kpis[3]?.sub).toMatch(/IST$/);
  });

  it('reads a clean day as clear, with nothing to filter to', () => {
    const kpis = workflowKpis({ total: 3, active: 3, failedLast24h: 0, lastSuccessAt: null }, now);
    expect(kpis[2]).toMatchObject({ value: '0', status: 'ok', sub: 'Every run succeeded' });
    expect(kpis[2]?.filter).toBeUndefined();
    expect(kpis[3]).toMatchObject({ value: 'None yet', sub: 'Any workflow' });
  });

  it('shows a dash, not zero, for a count the server left out', () => {
    const kpis = workflowKpis(
      { total: 4, active: undefined, failedLast24h: null } as unknown as Parameters<
        typeof workflowKpis
      >[0],
      now,
    );
    expect(kpis[1]).toMatchObject({ value: '—', sub: 'Listening for a trigger' });
    expect(kpis[2]).toMatchObject({ value: '—', sub: 'Not reported' });
    expect(kpis[2]?.status).toBeUndefined();
  });
});
