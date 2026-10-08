import { ApiError } from '@/types/api';

import { isAdminDenied, isDependencyUnavailable } from '../lib/access';
import { bucketLabel, failedCallsLabel, failureTone } from '../lib/format';
import { usageBucketLabel } from '../lib/usage';
import { mergeUserUpdate } from '../lib/users';
import type { PlatformUser } from '../types';

const user: PlatformUser = {
  id: 'u1',
  email: 'a@example.com',
  role: 'user',
  approvalStatus: 'pending',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('mergeUserUpdate', () => {
  it('applies the fields the server returned', () => {
    expect(mergeUserUpdate(user, { id: 'u1', approvalStatus: 'approved' }).approvalStatus).toBe(
      'approved',
    );
  });

  it('keeps cached fields the reply left out (a pre-role account has no `role`)', () => {
    const merged = mergeUserUpdate(user, {
      id: 'u1',
      role: undefined,
      approvalStatus: 'approved',
    });
    expect(merged.role).toBe('user');
    expect(merged.email).toBe('a@example.com');
  });
});

describe('isAdminDenied', () => {
  it('recognises the server refusing the admin role', () => {
    expect(
      isAdminDenied(
        new ApiError({ status: 401, code: 'AUTH_INVALID', message: 'Admin access required' }),
      ),
    ).toBe(true);
  });

  it('does not treat an expired session as a role problem', () => {
    expect(
      isAdminDenied(
        new ApiError({ status: 401, code: 'AUTH_EXPIRED', message: 'Session expired' }),
      ),
    ).toBe(false);
  });

  it('spots an unconfigured dependency by its code', () => {
    expect(
      isDependencyUnavailable(
        new ApiError({ status: 503, code: 'DEPENDENCY_UNAVAILABLE', message: 'x' }),
      ),
    ).toBe(true);
  });
});

describe('bucket labels', () => {
  it('labels hourly and daily buckets in IST and tolerates garbage', () => {
    // 05:00Z is 10:30 IST; 2026-09-27T18:30:00Z is midnight IST on 28 Sept.
    expect(bucketLabel('2026-09-28T05:00:00.000Z', 'hour')).toBe('10:30');
    expect(bucketLabel('2026-09-27T18:30:00.000Z', 'day')).toMatch(/^28 Sep/);
    expect(bucketLabel('not a date', 'day')).toBe('');
  });

  it('reads AI-usage buckets (IST midnights) as the IST day', () => {
    expect(usageBucketLabel('2026-09-27T18:30:00.000Z', 'day')).toMatch(/^28 Sep/);
    expect(usageBucketLabel('2026-09-27T18:30:00.000Z', 'week')).toMatch(/^w\/c 28 Sep/);
    expect(usageBucketLabel('', 'month')).toBe('');
  });
});

describe('failureTone', () => {
  it('stays plain for no failures or noise under 1%', () => {
    expect(failureTone(0, 7283)).toBeUndefined();
    expect(failureTone(16, 7283)).toBeUndefined();
    expect(failureTone(3, 0)).toBeUndefined();
  });

  it('warns from 1% and alarms from 5%', () => {
    expect(failureTone(1, 100)).toBe('warn');
    expect(failureTone(4, 100)).toBe('warn');
    expect(failureTone(5, 100)).toBe('bad');
  });
});

describe('failedCallsLabel', () => {
  it('gives the count and its share', () => {
    expect(failedCallsLabel(0, 10)).toBe('All answered');
    expect(failedCallsLabel(16, 7283)).toBe('16 failed · 0.2%');
    expect(failedCallsLabel(1, 5000)).toBe('1 failed · <0.1%');
    expect(failedCallsLabel(30, 100)).toBe('30 failed · 30%');
  });
});
