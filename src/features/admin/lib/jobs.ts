import type { StatusTone } from '@/features/settings/lib/status';

import type { AdminJob } from '../types';

/**
 * A five-field cron expression (minute hour day month weekday), as the worker expects.
 * Only the shape is checked here — the server validates the fields themselves and its
 * message is shown if it refuses.
 */
export function isCronShape(pattern: string): boolean {
  const trimmed = pattern.trim();
  if (trimmed.length < 9 || trimmed.length > 100) return false;
  const fields = trimmed.split(/\s+/);
  return fields.length === 5 && fields.every((field) => /^[\d*/,\-A-Za-z?LW#]+$/.test(field));
}

/** "2 active · 3 queued" and "1 failed · 40 completed". */
export function jobActivity(counts: AdminJob['counts']): { primary: string; secondary: string } {
  return {
    primary: `${counts.active} active · ${counts.waiting + counts.delayed} queued`,
    secondary: `${counts.failed} failed · ${counts.completed} completed`,
  };
}

export function jobStateTone(state: string): StatusTone {
  if (state === 'completed') return 'ok';
  if (state === 'failed') return 'bad';
  if (state === 'active') return 'info';
  return 'neutral';
}
