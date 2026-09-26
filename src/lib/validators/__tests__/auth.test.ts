import {
  forgotPasswordSchema,
  loginSchema,
  passwordRequirement,
  registerSchema,
  resetPasswordSchema,
} from '@/lib/validators/auth';

describe('loginSchema', () => {
  it('trims and lowercases the email (the server stores emails lowercased)', () => {
    expect(loginSchema.parse({ email: '  Trader@Example.COM ', password: 'x' })).toEqual({
      email: 'trader@example.com',
      password: 'x',
    });
  });

  it("only requires a password to be present, not today's length rule", () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });

  it('rejects malformed emails', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = { email: 'a@b.co', password: 'correct-horse', confirmPassword: 'correct-horse' };

  it('accepts a valid sign-up', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('enforces the server length bounds (8–128)', () => {
    expect(
      registerSchema.safeParse({ ...valid, password: 'short', confirmPassword: 'short' }).success,
    ).toBe(false);
    const long = 'x'.repeat(129);
    expect(
      registerSchema.safeParse({ ...valid, password: long, confirmPassword: long }).success,
    ).toBe(false);
  });

  it('flags mismatched confirmation on the confirm field', () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: 'different-one' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
  });
});

describe('forgotPasswordSchema / resetPasswordSchema', () => {
  it('normalises the reset email', () => {
    expect(forgotPasswordSchema.parse({ email: ' A@B.CO ' })).toEqual({ email: 'a@b.co' });
  });

  it('requires matching new passwords', () => {
    expect(
      resetPasswordSchema.safeParse({ password: 'new-password', confirmPassword: 'new-password' })
        .success,
    ).toBe(true);
    expect(
      resetPasswordSchema.safeParse({ password: 'new-password', confirmPassword: 'other-pass' })
        .success,
    ).toBe(false);
  });
});

describe('passwordRequirement', () => {
  it('matches the server rule exactly', () => {
    expect(passwordRequirement.test('1234567')).toBe(false);
    expect(passwordRequirement.test('12345678')).toBe(true);
    expect(passwordRequirement.test('x'.repeat(129))).toBe(false);
  });
});
