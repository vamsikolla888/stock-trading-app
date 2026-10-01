import type { CustomScreener, ScreenerScanStatus } from '../types';

/**
 * Whether a screener is being scanned right now — its `runState.active`, which the server reads
 * with the queue consulted, so a scan whose job vanished is `stalled` rather than spinning
 * forever. An older server sends only `status`.
 */
export function isScanActive(
  screener: Pick<CustomScreener, 'status' | 'runState'> | undefined,
): boolean {
  if (!screener) return false;
  if (screener.runState) return screener.runState.active;
  return screener.status === 'queued' || screener.status === 'running';
}

/** The line under "Run all scans" while it works — naming which half is doing what. */
export function scanProgressText(status: ScreenerScanStatus | undefined): string | null {
  if (!status?.running) return null;
  const { builtIn, sweep } = status;
  if (builtIn.waitingLong || sweep.waitingLong) {
    return 'Queued for over two minutes — the screener worker may not be running.';
  }
  const busy = (phase: string) => phase === 'queued' || phase === 'running';
  if (busy(builtIn.phase) && busy(sweep.phase)) {
    return 'Built-in screens and the screener library are both scanning…';
  }
  if (busy(sweep.phase)) {
    return sweep.phase === 'queued'
      ? 'Library sweep queued…'
      : 'Working through the screener library…';
  }
  return builtIn.phase === 'queued' ? 'Built-in scan queued…' : 'Built-in screens scanning…';
}

/** The most recent failure of either half, as the server worded it; null when none. */
export function scanFailure(status: ScreenerScanStatus | undefined): string | null {
  if (!status || status.running) return null;
  if (status.builtIn.phase === 'failed')
    return status.builtIn.lastError ?? 'The built-in scan failed.';
  if (status.sweep.phase === 'failed') return status.sweep.lastError ?? 'The library sweep failed.';
  return null;
}
