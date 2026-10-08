import {
  cronNextLabel,
  filterLogs,
  hasRunningRun,
  isCronShape,
  jobsSummary,
  logCounts,
  normalizeNewsRun,
  normalizeNewsRuns,
  runDuration,
  runItems,
  runStagesLine,
  STAGE_STATE,
} from '../lib/jobs';
import type { AdminJob, AdminJobLog } from '../types';

function job(over: Partial<AdminJob> = {}): AdminJob {
  return {
    id: 'j',
    label: 'Job',
    queue: 'q',
    jobName: 'n',
    schedule: '0 8 * * 1-5',
    nextRunAt: null,
    note: '',
    manual: true,
    actionLabel: null,
    counts: { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 },
    ...over,
  };
}

const log = (state: string, id = state): AdminJobLog => ({
  id,
  queue: 'q',
  name: 'n',
  state,
  createdAt: null,
  finishedAt: null,
  failedReason: null,
});

describe('schedules', () => {
  it('checks the five-field cron shape', () => {
    expect(isCronShape('0 8 * * 1-5')).toBe(true);
    expect(isCronShape('0 8 * *')).toBe(false);
  });

  it('says when a schedule next runs, or why it does not', () => {
    const fmt = (iso: string) => `at ${iso}`;
    expect(cronNextLabel(job({ nextRunAt: 'X' }), fmt)).toBe('Next at X');
    expect(cronNextLabel(job({ editable: false }), fmt)).toBe('Not registered by any worker');
    expect(cronNextLabel(job(), fmt)).toBe('Activates when the worker starts');
  });
});

describe('jobsSummary', () => {
  it('is unknown until a list has loaded', () => {
    expect(jobsSummary(undefined, undefined)).toEqual({
      scheduled: null,
      registered: null,
      queues: null,
      active: null,
      waiting: null,
      failed: null,
    });
  });

  it('adds up every cron and queue', () => {
    const crons = [
      job({
        nextRunAt: 'x',
        counts: { waiting: 1, active: 1, delayed: 2, completed: 9, failed: 1 },
      }),
      job(),
    ];
    const queues = [
      job({ counts: { waiting: 3, active: 0, delayed: 0, completed: 0, failed: 2 } }),
    ];
    expect(jobsSummary(crons, queues)).toEqual({
      scheduled: 2,
      registered: 1,
      queues: 1,
      active: 1,
      waiting: 6,
      failed: 3,
    });
    expect(jobsSummary(crons, undefined).queues).toBeNull();
  });
});

describe('execution log filter', () => {
  const logs = [log('failed'), log('completed', 'a'), log('completed', 'b'), log('waiting')];
  it('counts each state and filters by it', () => {
    expect(logCounts(logs)).toEqual({ all: 4, failed: 1, active: 0, completed: 2 });
    expect(filterLogs(logs, 'completed').map((l) => l.id)).toEqual(['a', 'b']);
    expect(filterLogs(logs, 'all')).toHaveLength(4);
  });
});

describe('news ingestion runs', () => {
  const raw = {
    runId: 'r1',
    status: 'COMPLETED',
    triggeredBy: 'MANUAL',
    startedAt: '2026-10-05T03:00:00.000Z',
    finishedAt: '2026-10-05T03:00:04.200Z',
    counts: { fetched: 40, inserted: 12, duplicatesInRun: 0, alsoSeenInEarlierRuns: 28 },
    stages: [
      { key: 'source:LiveMint', label: 'LiveMint', status: 'OK', detail: 'ok', itemCount: 30 },
      { key: 'source:ET', label: 'Economic Times', status: 'EMPTY', detail: null, itemCount: 0 },
      { key: 'source:BS', label: 'Business Standard', status: 'FAILED', itemCount: null },
      { key: 'source:X', label: 'X', status: 'WEIRD' },
      { status: 'OK' },
    ],
  };

  it('reads the server’s run, trigger from triggeredBy', () => {
    const run = normalizeNewsRun(raw);
    expect(run).toMatchObject({
      runId: 'r1',
      status: 'COMPLETED',
      trigger: 'MANUAL',
      inserted: 12,
    });
    expect(run?.stages.map((s) => s.status)).toEqual(['OK', 'EMPTY', 'FAILED', 'PENDING']);
    expect(normalizeNewsRun({ runId: 'x' })).toBeNull();
    expect(normalizeNewsRun({ ...raw, triggeredBy: undefined, stages: undefined })).toMatchObject({
      trigger: 'SCHEDULED',
      stages: [],
    });
  });

  it('keeps a page whose total is at least what it holds', () => {
    expect(normalizeNewsRuns({ runs: [raw, { bad: true }], total: 40 })).toMatchObject({
      total: 40,
    });
    expect(normalizeNewsRuns({ runs: [raw] }).total).toBe(1);
    expect(normalizeNewsRuns(null)).toEqual({ runs: [], total: 0 });
  });

  it('times, counts and summarises a run', () => {
    const run = normalizeNewsRun(raw)!;
    expect(runDuration(run)).toBe('4.2s');
    expect(runDuration({ startedAt: 'a', finishedAt: null })).toBe('running');
    expect(
      runDuration({ startedAt: '2026-10-05T03:00:00Z', finishedAt: '2026-10-05T03:01:00Z' }),
    ).toBe('60s');
    expect(
      runDuration({ startedAt: '2026-10-05T03:00:10Z', finishedAt: '2026-10-05T03:00:00Z' }),
    ).toBe('—');
    expect(runItems(run)).toBe(30);
    expect(runStagesLine(run)).toBe('1 of 4 providers returned items · 1 failed');
    expect(runStagesLine({ stages: [] })).toBe('No providers recorded');
    expect(hasRunningRun([{ status: 'COMPLETED' }, { status: 'RUNNING' }])).toBe(true);
    expect(hasRunningRun([])).toBe(false);
  });

  it('never paints an empty provider red', () => {
    expect(STAGE_STATE.EMPTY.tone).toBe('neutral');
    expect(STAGE_STATE.FAILED.tone).toBe('bad');
  });
});
