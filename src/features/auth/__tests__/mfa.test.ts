import {
  challengeSecondsLeft,
  isMfaCodeReady,
  normaliseMfaCode,
  useAuthFlowStore,
} from '@/features/auth/authFlowStore';
import { isMfaChallenge } from '@/types/auth';

describe('normaliseMfaCode', () => {
  it('keeps six digits of an authenticator code, whatever was pasted', () => {
    expect(normaliseMfaCode('123 456', 'totp')).toBe('123456');
    expect(normaliseMfaCode('12a3-4567', 'totp')).toBe('123456');
  });

  it('upper-cases a recovery code and keeps its dashes', () => {
    expect(normaliseMfaCode('ab12-cd34 ef56', 'recovery')).toBe('AB12-CD34EF56');
  });
});

describe('isMfaCodeReady', () => {
  it('needs exactly six digits for an authenticator code', () => {
    expect(isMfaCodeReady('12345', 'totp')).toBe(false);
    expect(isMfaCodeReady('123456', 'totp')).toBe(true);
  });

  it('needs a plausible recovery code', () => {
    expect(isMfaCodeReady('AB12-', 'recovery')).toBe(false);
    expect(isMfaCodeReady('AB12-CD34-EF56', 'recovery')).toBe(true);
  });
});

describe('challengeSecondsLeft', () => {
  it('counts down to the server’s expiry and floors at zero', () => {
    const now = Date.parse('2026-10-01T10:00:00.000Z');
    expect(challengeSecondsLeft('2026-10-01T10:05:00.000Z', now)).toBe(300);
    expect(challengeSecondsLeft('2026-10-01T09:59:00.000Z', now)).toBe(0);
    expect(challengeSecondsLeft('not a date', now)).toBe(0);
  });
});

describe('login results', () => {
  it('tells a challenge from a session', () => {
    expect(isMfaChallenge({ mfaRequired: true, challengeToken: 't', expiresAt: 'x' })).toBe(true);
    expect(
      isMfaChallenge({
        accessToken: 'a',
        refreshToken: 'r',
        user: { id: '1', email: 'e', role: 'user' },
      }),
    ).toBe(false);
  });
});

describe('auth flow store', () => {
  it('holds a notice until the sign-in screen clears it', () => {
    useAuthFlowStore.getState().setNotice({ tone: 'success', message: 'Password changed' });
    expect(useAuthFlowStore.getState().notice?.message).toBe('Password changed');
    useAuthFlowStore.getState().clearNotice();
    expect(useAuthFlowStore.getState().notice).toBeNull();
  });
});
