import { useMutation } from '@tanstack/react-query';

import { useAuthFlowStore } from '@/features/auth/authFlowStore';
import { signOut, startSession } from '@/features/auth/bootstrapAuth';
import { authApi } from '@/services/api/authApi';
import { useAuthStore } from '@/store/authStore';
import {
  isMfaChallenge,
  type LoginRequest,
  type LoginResult,
  type RegisterRequest,
  type ResetPasswordRequest,
} from '@/types/auth';

/**
 * Signs in. No manual navigation for a finished sign-in: flipping `isAuthenticated` is what
 * moves the user into the app (the root layout's Stack.Protected guards), so there is exactly
 * one place that decides where a signed-in user belongs. With two-factor on, the password step
 * only yields a challenge — it is parked in memory and the caller opens the code screen.
 */
export function useLogin() {
  const setChallenge = useAuthFlowStore((state) => state.setChallenge);

  return useMutation({
    mutationFn: (payload: LoginRequest) => authApi.login(payload),
    onSuccess: async (result: LoginResult, payload) => {
      if (isMfaChallenge(result)) {
        setChallenge({
          challengeToken: result.challengeToken,
          expiresAt: result.expiresAt,
          email: payload.email.trim(),
        });
        return;
      }
      await startSession(result);
    },
  });
}

/** Completes a two-factor sign-in with an authenticator or recovery code. */
export function useVerifyMfa() {
  return useMutation({
    mutationFn: ({ challengeToken, code }: { challengeToken: string; code: string }) =>
      authApi.verifyMfa(challengeToken, code),
    onSuccess: startSession,
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (payload: RegisterRequest) => authApi.register(payload),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => authApi.requestPasswordReset(email),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (payload: ResetPasswordRequest) => authApi.resetPassword(payload),
  });
}

/** Revokes this device's session on the server (best-effort), then signs out locally. */
export function useLogout() {
  return useMutation({ mutationFn: signOut });
}

export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isHydrating = useAuthStore((state) => state.isHydrating);

  return { user, isAuthenticated, isHydrating };
}
