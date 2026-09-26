import { resolveDevUrl } from '@/config/env';

describe('resolveDevUrl', () => {
  const local = 'http://localhost:4000/api/v1';

  it('rewrites localhost to the Metro host on native dev builds', () => {
    expect(resolveDevUrl(local, { isDev: true, platform: 'ios', metroHost: '192.168.1.20' })).toBe(
      'http://192.168.1.20:4000/api/v1',
    );
  });

  it('rewrites 127.0.0.1 and ws:// URLs too', () => {
    expect(
      resolveDevUrl('ws://127.0.0.1:4000', {
        isDev: true,
        platform: 'android',
        metroHost: '10.0.0.5',
      }),
    ).toBe('ws://10.0.0.5:4000');
  });

  it('falls back to the Android emulator host alias when Metro host is unknown', () => {
    expect(resolveDevUrl(local, { isDev: true, platform: 'android' })).toBe(
      'http://10.0.2.2:4000/api/v1',
    );
  });

  it('leaves the URL alone on iOS when Metro host is unknown (the simulator shares localhost)', () => {
    expect(resolveDevUrl(local, { isDev: true, platform: 'ios' })).toBe(local);
  });

  it('never rewrites release builds', () => {
    expect(
      resolveDevUrl(local, { isDev: false, platform: 'android', metroHost: '192.168.1.20' }),
    ).toBe(local);
  });

  it('never rewrites on web, where localhost is the dev machine', () => {
    expect(resolveDevUrl(local, { isDev: true, platform: 'web', metroHost: '192.168.1.20' })).toBe(
      local,
    );
  });

  it('does not touch hosts that merely start with "localhost"', () => {
    const url = 'https://localhost.example.com/api/v1';
    expect(resolveDevUrl(url, { isDev: true, platform: 'ios', metroHost: '192.168.1.20' })).toBe(
      url,
    );
  });

  it('does not touch real hosts', () => {
    const url = 'https://api.example.com/api/v1';
    expect(resolveDevUrl(url, { isDev: true, platform: 'ios', metroHost: '192.168.1.20' })).toBe(
      url,
    );
  });
});
