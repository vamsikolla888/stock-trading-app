import {
  checkProfileDraft,
  groupSecret,
  isSafeModeRefusal,
  profileInitials,
  profileName,
  recoveryCodesText,
  safeModeCaption,
  sessionDevice,
  sessionTitle,
  sortSessions,
} from '@/features/account/lib/account';
import type { AccountSession } from '@/features/account/types';
import { buildUserAgent } from '@/services/api/userAgent';
import { ApiError } from '@/types/api';

function session(overrides: Partial<AccountSession>): AccountSession {
  return {
    id: 'id',
    status: 'active',
    authenticationMethod: 'password',
    deviceName: 'Chrome on Windows / Computer',
    browser: 'Chrome',
    operatingSystem: 'Windows',
    ipAddress: '10.0.0.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
    createdAt: '2026-09-01T10:00:00.000Z',
    lastSeenAt: '2026-09-02T10:00:00.000Z',
    expiresAt: '2026-10-01T10:00:00.000Z',
    revokedAt: null,
    revokeReason: null,
    current: false,
    ...overrides,
  };
}

describe('profile naming', () => {
  it('prefers the chosen display name, else derives one from the email', () => {
    expect(profileName({ displayName: '  Asha Rao ', email: 'x@y.in' })).toBe('Asha Rao');
    expect(profileName({ displayName: '', email: 'vamsi.k@example.com' })).toBe('Vamsi K');
    expect(profileName(null, 'ravi@example.com')).toBe('Ravi');
    expect(profileName(undefined)).toBe('Your account');
  });

  it('makes up to two initials', () => {
    expect(profileInitials('Asha Rao Kumar')).toBe('AR');
    expect(profileInitials('ravi')).toBe('R');
    expect(profileInitials('  ')).toBe('?');
  });
});

describe('checkProfileDraft', () => {
  const saved = { displayName: 'Asha', phone: '', bio: '' };

  it('mirrors the server phone rule', () => {
    expect(
      checkProfileDraft({ displayName: 'Asha', phone: '+91 98765 43210', bio: '' }, saved).valid,
    ).toBe(true);
    expect(
      checkProfileDraft({ displayName: 'Asha', phone: 'call me', bio: '' }, saved).errors.phone,
    ).toBe('Enter a valid phone number');
    // Empty is allowed — it clears the phone.
    expect(checkProfileDraft({ displayName: 'Asha', phone: '  ', bio: '' }, saved).valid).toBe(
      true,
    );
  });

  it('treats surrounding whitespace as no change', () => {
    expect(checkProfileDraft({ displayName: ' Asha ', phone: '', bio: '' }, saved).changed).toBe(
      false,
    );
    expect(checkProfileDraft({ displayName: 'Asha R', phone: '', bio: '' }, saved).changed).toBe(
      true,
    );
  });

  it('enforces the length limits', () => {
    const long = 'x'.repeat(241);
    expect(checkProfileDraft({ displayName: 'A', phone: '', bio: long }, saved).errors.bio).toMatch(
      /240/,
    );
  });
});

describe('sessions', () => {
  it('names this app’s sessions after the phone, others by the server’s label', () => {
    expect(
      sessionTitle(
        session({
          userAgent: 'Stocks/1.0.0 (Linux; Android 14; Pixel 7) Mobile',
          operatingSystem: 'Android',
        }),
      ),
    ).toBe('Stocks app · Pixel 7');
    expect(
      sessionTitle(
        session({
          userAgent: 'Stocks/1.0.0 (iPhone 15; iPhone OS 17.4) Mobile',
          operatingSystem: 'iOS',
        }),
      ),
    ).toBe('Stocks app · iPhone 15');
    expect(
      sessionTitle(
        session({
          userAgent: 'Stocks/1.0.0 (Linux; Android 14) Mobile',
          operatingSystem: 'Android',
        }),
      ),
    ).toBe('Stocks app · Android');
    expect(sessionTitle(session({}))).toBe('Chrome on Windows / Computer');
  });

  it('classifies the device for its icon', () => {
    expect(sessionDevice(session({}))).toBe('computer');
    expect(sessionDevice(session({ deviceName: 'Safari on iOS / Mobile' }))).toBe('phone');
    expect(sessionDevice(session({ deviceName: 'Safari on iOS / Tablet' }))).toBe('tablet');
  });

  it('puts this device first, then activity, signed-out last', () => {
    const sorted = sortSessions([
      session({ id: 'old', lastSeenAt: '2026-09-01T00:00:00Z' }),
      session({ id: 'revoked', status: 'revoked', lastSeenAt: '2026-09-09T00:00:00Z' }),
      session({ id: 'recent', lastSeenAt: '2026-09-05T00:00:00Z' }),
      session({ id: 'me', current: true, lastSeenAt: '2026-08-01T00:00:00Z' }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(['me', 'recent', 'old', 'revoked']);
  });
});

describe('two-factor helpers', () => {
  it('groups a setup key in fours', () => {
    expect(groupSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
    expect(groupSecret('JBSW Y3DP')).toBe('JBSW Y3DP');
  });

  it('writes the recovery codes out for saving', () => {
    const text = recoveryCodesText('Stocks', 'a@b.in', ['AAAA-BBBB-CCCC', 'DDDD-EEEE-FFFF']);
    expect(text).toContain('Stocks recovery codes for a@b.in');
    expect(text).toContain('AAAA-BBBB-CCCC\nDDDD-EEEE-FFFF');
  });
});

describe('buildUserAgent', () => {
  const base = { appName: 'Stocks', version: '1.0.0' };

  it('produces a UA the server parses as the right OS and form factor', () => {
    expect(
      buildUserAgent({ ...base, platform: 'android', osVersion: '14', model: 'Pixel 7' }),
    ).toBe('Stocks/1.0.0 (Linux; Android 14; Pixel 7) Mobile');
    expect(
      buildUserAgent({ ...base, platform: 'ios', osVersion: '17.4', model: 'iPhone 15' }),
    ).toBe('Stocks/1.0.0 (iPhone 15; iPhone OS 17.4) Mobile');
    expect(buildUserAgent({ ...base, platform: 'ios', osVersion: '17.4', model: 'iPad Pro' })).toBe(
      'Stocks/1.0.0 (iPad Pro; iPadOS 17.4) Mobile',
    );
  });

  it('keeps a model name from breaking the comment section', () => {
    expect(
      buildUserAgent({ ...base, platform: 'android', osVersion: null, model: 'Galaxy (S23; 5G)' }),
    ).toBe('Stocks/1.0.0 (Linux; Android ?; Galaxy S23 5G) Mobile');
  });
});

describe('Safe Mode helpers', () => {
  it('recognises only the server’s Safe Mode refusal', () => {
    expect(
      isSafeModeRefusal(
        new ApiError({ status: 403, code: 'SAFE_MODE_ON', message: 'Safe Mode is on' }),
      ),
    ).toBe(true);
    expect(
      isSafeModeRefusal(
        new ApiError({ status: 403, code: 'LIVE_TRADING_DISABLED', message: 'Off' }),
      ),
    ).toBe(false);
    expect(isSafeModeRefusal(new Error('network'))).toBe(false);
    expect(isSafeModeRefusal(null)).toBe(false);
  });

  it('says what the switch is doing, never guessing before the server answers', () => {
    const base = { known: true, failed: false, saving: false, enabled: false };
    expect(safeModeCaption({ ...base, known: false })).toBe('Checking…');
    expect(safeModeCaption({ ...base, known: false, failed: true })).toBe(
      'Couldn’t check right now',
    );
    expect(safeModeCaption({ ...base, saving: true })).toBe('Saving…');
    expect(safeModeCaption({ ...base, enabled: true })).toMatch(/^On — real orders are blocked/);
    expect(safeModeCaption(base)).toMatch(/^Off — real orders are allowed/);
  });
});
