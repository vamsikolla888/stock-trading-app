import { getJwtExpiry, isTokenExpiring } from '@/lib/auth/jwt';

function makeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

describe('getJwtExpiry', () => {
  it('reads the exp claim', () => {
    expect(getJwtExpiry(makeJwt({ sub: 'u1', exp: 1_900_000_000 }))).toBe(1_900_000_000);
  });

  it.each(['not-a-jwt', 'a.b.c', makeJwt({ sub: 'u1' }), makeJwt({ exp: 'soon' })])(
    'returns null for unreadable token %p',
    (token) => {
      expect(getJwtExpiry(token)).toBeNull();
    },
  );
});

describe('isTokenExpiring', () => {
  const now = 1_800_000_000_000;

  it('is true inside the skew window', () => {
    expect(isTokenExpiring(makeJwt({ exp: now / 1000 + 20 }), 30, now)).toBe(true);
  });

  it('is true once expired', () => {
    expect(isTokenExpiring(makeJwt({ exp: now / 1000 - 5 }), 30, now)).toBe(true);
  });

  it('is false with time to spare', () => {
    expect(isTokenExpiring(makeJwt({ exp: now / 1000 + 600 }), 30, now)).toBe(false);
  });

  it('treats an unknown expiry as not expiring (the 401 path still covers it)', () => {
    expect(isTokenExpiring('opaque-token', 30, now)).toBe(false);
  });
});
