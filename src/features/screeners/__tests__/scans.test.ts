import { isScanActive, scanFailure, scanProgressText } from '@/features/screeners/lib/scans';
import type { ScanJobState, ScreenerScanStatus } from '@/features/screeners/types';

const idle: ScanJobState = {
  phase: 'idle',
  since: null,
  lastError: null,
  waitingLong: false,
  lastRunAt: null,
};

function status(builtIn: Partial<ScanJobState>, sweep: Partial<ScanJobState>): ScreenerScanStatus {
  const b = { ...idle, ...builtIn };
  const s = { ...idle, ...sweep };
  const busy = (p: string) => p === 'queued' || p === 'running';
  return { builtIn: b, sweep: s, running: busy(b.phase) || busy(s.phase) };
}

describe('isScanActive', () => {
  it('trusts runState, so a vanished job never spins forever', () => {
    expect(
      isScanActive({
        status: 'queued',
        runState: { phase: 'stalled', message: null, active: false },
      }),
    ).toBe(false);
    expect(
      isScanActive({
        status: 'running',
        runState: { phase: 'running', message: null, active: true },
      }),
    ).toBe(true);
  });

  it('falls back to status on an older server', () => {
    expect(isScanActive({ status: 'queued' })).toBe(true);
    expect(isScanActive({ status: 'complete' })).toBe(false);
    expect(isScanActive(undefined)).toBe(false);
  });
});

describe('scanProgressText', () => {
  it('names which half is working', () => {
    expect(scanProgressText(status({ phase: 'running' }, { phase: 'running' }))).toMatch(/both/);
    expect(scanProgressText(status({}, { phase: 'running' }))).toMatch(/library/);
    expect(scanProgressText(status({ phase: 'queued' }, {}))).toMatch(/Built-in scan queued/);
  });

  it('says when a job has waited suspiciously long', () => {
    expect(scanProgressText(status({ phase: 'queued', waitingLong: true }, {}))).toMatch(
      /worker may not be running/,
    );
  });

  it('is silent when nothing runs', () => {
    expect(scanProgressText(status({}, {}))).toBeNull();
  });
});

describe('scanFailure', () => {
  it('reports the server’s own words once idle', () => {
    expect(scanFailure(status({ phase: 'failed', lastError: 'Redis down' }, {}))).toBe(
      'Redis down',
    );
    expect(scanFailure(status({}, { phase: 'failed' }))).toBe('The library sweep failed.');
    expect(scanFailure(status({}, {}))).toBeNull();
  });
});
