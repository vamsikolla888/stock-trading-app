import { platformHeadline, serviceDescription, serviceName, serviceState } from '../lib/services';
import type { ServiceHealthRow } from '../types';

function row(over: Partial<ServiceHealthRow> = {}): ServiceHealthRow {
  return {
    service: 'redis',
    ok: true,
    latencyMs: 2,
    detail: null,
    uptimePct: 100,
    checks: 60,
    failures: 0,
    avgLatencyMs: 2,
    lastFailureAt: null,
    series: [],
    ...over,
  };
}

describe('platformHeadline', () => {
  it('says it is still checking before any probe has answered', () => {
    expect(platformHeadline({ down: [], warnings: 0, checked: false })).toEqual({
      tone: 'neutral',
      text: 'Checking the platform…',
    });
  });

  it('names the services that are down, two at most', () => {
    expect(platformHeadline({ down: ['Redis'], warnings: 3, checked: true })).toEqual({
      tone: 'bad',
      text: '1 service down · Redis',
    });
    expect(
      platformHeadline({
        down: ['Redis', 'MongoDB', 'Worker', 'Web search'],
        warnings: 0,
        checked: true,
      }),
    ).toEqual({ tone: 'bad', text: '4 services down · Redis, MongoDB and 2 more' });
  });

  it('flags warnings when everything is up', () => {
    expect(platformHeadline({ down: [], warnings: 1, checked: true })).toEqual({
      tone: 'warn',
      text: '1 check needs attention',
    });
    expect(platformHeadline({ down: [], warnings: 2, checked: true }).text).toBe(
      '2 checks need attention',
    );
  });

  it('is green only when nothing is down or warning', () => {
    expect(platformHeadline({ down: [], warnings: 0, checked: true })).toEqual({
      tone: 'ok',
      text: 'All systems operational',
    });
  });
});

describe('serviceState', () => {
  it('reads up and down from the probe', () => {
    expect(serviceState(row())).toEqual({ tone: 'ok', label: 'Up' });
    expect(serviceState(row({ ok: false }))).toEqual({ tone: 'bad', label: 'Down' });
  });

  it('shows an unmeasured dependency as unknown, never green', () => {
    expect(serviceState(row({ checks: 0, detail: 'no checks yet' }))).toEqual({
      tone: 'neutral',
      label: 'Unknown',
    });
  });
});

describe('service names', () => {
  it('names known probes and passes unknown ones through', () => {
    expect(serviceName('mongo')).toBe('MongoDB');
    expect(serviceName('new-thing')).toBe('new-thing');
    expect(serviceDescription('redis')).toMatch(/PING/);
    expect(serviceDescription('new-thing')).toBeNull();
  });
});
