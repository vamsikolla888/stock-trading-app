import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAuthFlowStore } from '@/features/auth/authFlowStore';
import { endSession, startSession } from '@/features/auth/bootstrapAuth';
import { useAuthStore } from '@/store/authStore';

import { accountApi } from './api';
import { isSafeModeRefusal } from './lib/account';
import type { AccountProfile, ProfileFields, SafeModeState } from './types';

/** Keyed by user, so a different account signing in on this device never sees a cached profile. */
export const accountKeys = {
  all: ['account'] as const,
  profile: (userId: string | undefined) => ['account', 'profile', userId ?? ''] as const,
  security: (userId: string | undefined) => ['account', 'security', userId ?? ''] as const,
  safeModeAll: ['account', 'safe-mode'] as const,
  safeMode: (userId: string | undefined) => ['account', 'safe-mode', userId ?? ''] as const,
};

function useUserId() {
  return useAuthStore((state) => state.user?.id);
}

/** The profile — also behind every avatar in the app, so it is cached for a while. */
export function useAccountProfile() {
  const userId = useUserId();
  return useQuery({
    queryKey: accountKeys.profile(userId),
    queryFn: accountApi.profile,
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  });
}

/** Two-factor state and the device sessions. Fresh on every visit — it is a security screen. */
export function useAccountSecurity(enabled = true) {
  const userId = useUserId();
  return useQuery({
    queryKey: accountKeys.security(userId),
    queryFn: accountApi.security,
    enabled: enabled && Boolean(userId),
    staleTime: 0,
  });
}

/**
 * Safe Mode — the profile switch, the header pill and every live order ticket read this ONE
 * query, so they can never disagree. The SERVER is the guard (it refuses each real placement and
 * modify while it is on); this only says so before anyone presses a button.
 *
 * It belongs to the account, not the device: switched on from the web, it has to reach this phone
 * without a restart — hence the 30 s poll (paused in the background) and the refetch on resume.
 */
export function useSafeMode() {
  const userId = useUserId();
  return useQuery({
    queryKey: accountKeys.safeMode(userId),
    queryFn: accountApi.safeMode,
    enabled: Boolean(userId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * True only when the server has said Safe Mode is ON. Unknown (loading, failed, a server that
 * predates the switch) reads as false: the tickets then fall back to the server's own refusal.
 */
export function useSafeModeOn(): boolean {
  return useSafeMode().data?.enabled === true;
}

/** Nothing optimistic on a safety control: the cache changes only when the server confirms. */
export function useSetSafeMode() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (enabled: boolean) => accountApi.setSafeMode(enabled),
    onSuccess: (state: SafeModeState) =>
      queryClient.setQueryData(accountKeys.safeMode(userId), state),
  });
}

/**
 * An order refused with SAFE_MODE_ON means this device's copy is stale (switched on elsewhere) —
 * re-read it so the switch, the pill and the tickets catch up. Pass to a mutation's onError.
 */
export function useSafeModeRefusalSync(): (error: unknown) => void {
  const queryClient = useQueryClient();
  return useCallback(
    (error: unknown) => {
      if (isSafeModeRefusal(error)) {
        void queryClient.invalidateQueries({ queryKey: accountKeys.safeModeAll });
      }
    },
    [queryClient],
  );
}

/** Every profile write answers with the new profile; it replaces the cache in place. */
function useProfileWrite<TInput>(write: (input: TInput) => Promise<AccountProfile>) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: write,
    onSuccess: (profile) => queryClient.setQueryData(accountKeys.profile(userId), profile),
  });
}

export function useUpdateProfile() {
  return useProfileWrite((input: ProfileFields) => accountApi.updateProfile(input));
}

export function useUploadAvatar() {
  return useProfileWrite((image: Blob) => accountApi.uploadAvatar(image));
}

export function useRemoveAvatar() {
  return useProfileWrite(() => accountApi.removeAvatar());
}

export function useRequestEmailChange() {
  return useMutation({
    mutationFn: ({ email, currentPassword }: { email: string; currentPassword: string }) =>
      accountApi.requestEmailChange(email, currentPassword),
  });
}

/**
 * Applies a confirmed email change. The server revokes the older sessions and hands this one a
 * replacement token pair, which becomes the session — with the new email on the stored user.
 */
export function useConfirmEmailChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => accountApi.confirmEmailChange(token),
    onSuccess: async ({ profile, accessToken, refreshToken }) => {
      await startSession({
        accessToken,
        refreshToken,
        user: { id: profile.id, email: profile.email, role: profile.role },
      });
      queryClient.setQueryData(accountKeys.profile(profile.id), profile);
    },
  });
}

/**
 * A password change revokes every session on the server, this one included — so it ends here
 * too, with a note for the sign-in screen saying why the user is back there.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => accountApi.changePassword(currentPassword, newPassword),
    onSuccess: async () => {
      useAuthFlowStore.getState().setNotice({
        tone: 'success',
        title: 'Password changed',
        message: 'Every device was signed out. Sign in with your new password.',
      });
      await endSession();
    },
  });
}

/** Signs out one device. Signing out THIS one ends the local session as well. */
export function useRevokeSession() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (sessionId: string) => accountApi.revokeSession(sessionId),
    onSuccess: async (result) => {
      if (result.current) {
        await endSession();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: accountKeys.security(userId) });
    },
  });
}

/** Two-factor writes change what the security query reports — refresh it after each. */
function useSecurityWrite<TInput, TResult>(write: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: write,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.security(userId) }),
  });
}

export function useBeginMfaSetup() {
  // Starting a setup changes nothing server-side that the security screen shows.
  return useMutation({
    mutationFn: (currentPassword: string) => accountApi.beginMfaSetup(currentPassword),
  });
}

export function useConfirmMfaSetup() {
  return useSecurityWrite(({ setupToken, code }: { setupToken: string; code: string }) =>
    accountApi.confirmMfaSetup(setupToken, code),
  );
}

export function useDisableMfa() {
  return useSecurityWrite(({ currentPassword, code }: { currentPassword: string; code: string }) =>
    accountApi.disableMfa(currentPassword, code),
  );
}

export function useRegenerateRecoveryCodes() {
  return useSecurityWrite(({ currentPassword, code }: { currentPassword: string; code: string }) =>
    accountApi.regenerateRecoveryCodes(currentPassword, code),
  );
}
