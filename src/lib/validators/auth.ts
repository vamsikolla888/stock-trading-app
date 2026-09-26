import { z } from 'zod';

import { appConfig } from '@/config/app';

const { passwordMinLength, passwordMaxLength } = appConfig.auth;

// Mirrors the server DTOs (server/src/modules/auth/auth.dto.ts). The server stores
// emails lowercased and its DTOs are `.strict()` — send exactly these fields, nothing more.
const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .email('Enter a valid email address')
  .transform((value) => value.toLowerCase());

const newPassword = z
  .string()
  .min(passwordMinLength, `Use at least ${passwordMinLength} characters`)
  .max(passwordMaxLength, `Use at most ${passwordMaxLength} characters`);

export const loginSchema = z.object({
  email,
  // Sign-in only checks presence — the server is the authority on what's valid, and
  // older accounts may predate today's rules.
  password: z.string().min(1, 'Enter your password'),
});

export type LoginFormInput = z.input<typeof loginSchema>;
export type LoginFormValues = z.output<typeof loginSchema>;

export const registerSchema = z
  .object({
    email,
    password: newPassword,
    confirmPassword: z.string().min(1, 'Re-enter your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export type RegisterFormInput = z.input<typeof registerSchema>;
export type RegisterFormValues = z.output<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email });

export type ForgotPasswordFormInput = z.input<typeof forgotPasswordSchema>;
export type ForgotPasswordFormValues = z.output<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string().min(1, 'Re-enter your new password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

/**
 * Live hint shown under new-password fields. Deliberately limited to what the server
 * enforces — a checklist item that can stay unmet while submit still succeeds only
 * teaches people to ignore the checklist.
 */
export const passwordRequirement = {
  label: `At least ${passwordMinLength} characters`,
  test: (value: string) => value.length >= passwordMinLength && value.length <= passwordMaxLength,
};
