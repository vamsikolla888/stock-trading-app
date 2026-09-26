import { useMutation } from '@tanstack/react-query';

import { endSession } from '@/features/auth/bootstrapAuth';
import { secureTokens } from '@/lib/storage/secureTokens';
import { authApi } from '@/services/api/authApi';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import type { LoginRequest, RegisterRequest, ResetPasswordRequest } from '@/types/auth';

/**
 * Signs in and persists the session. No manual navigation: flipping `isAuthenticated`
 * is what moves the user into the app (the root layout's Stack.Protected guards), so
 * there is exactly one place that decides where a signed-in user belongs.
 */
export function useLogin() {
  const setUser = useAuthStore((state) => state.setUser);
  const setLastSignedInEmail = usePreferencesStore((state) => state.setLastSignedInEmail);

  return useMutation({
    mutationFn: (payload: LoginRequest) => authApi.login(payload),
    onSuccess: async ({ user, accessToken, refreshToken }) => {
      await secureTokens.setTokens(accessToken, refreshToken);
      setLastSignedInEmail(user.email);
      setUser(user);
    },
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

/** Local sign-out — the server has no logout endpoint; refresh tokens simply expire unused. */
export function useLogout() {
  return useMutation({ mutationFn: endSession });
}

export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isHydrating = useAuthStore((state) => state.isHydrating);

  return { user, isAuthenticated, isHydrating };
}
