import type { StatusTone } from '@/features/settings/lib/status';

import type { PlatformUser, PlatformUserApproval, PlatformUserUpdate } from '../types';

export type UserFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'admins';

export function filterUsers(
  users: readonly PlatformUser[],
  filter: UserFilter,
  query: string,
): PlatformUser[] {
  const q = query.trim().toLowerCase();
  return users.filter((user) => {
    if (q && !user.email.toLowerCase().includes(q)) return false;
    if (filter === 'admins') return user.role === 'admin';
    if (filter === 'all') return true;
    return user.approvalStatus === filter;
  });
}

export function userCounts(users: readonly PlatformUser[]): Record<UserFilter, number> {
  return {
    all: users.length,
    pending: users.filter((user) => user.approvalStatus === 'pending').length,
    approved: users.filter((user) => user.approvalStatus === 'approved').length,
    rejected: users.filter((user) => user.approvalStatus === 'rejected').length,
    admins: users.filter((user) => user.role === 'admin').length,
  };
}

/**
 * Folds a PATCH /admin/users/:id reply into the cached row. The reply is a raw document:
 * an account created before roles existed comes back with no `role` at all, which must not
 * blank the "User" the list already shows — missing fields keep the cached value.
 */
export function mergeUserUpdate(user: PlatformUser, saved: Partial<PlatformUser>): PlatformUser {
  const defined = Object.fromEntries(
    Object.entries(saved).filter(([, value]) => value !== undefined && value !== null),
  ) as Partial<PlatformUser>;
  return { ...user, ...defined };
}

/** Waiting accounts can't sign in until approved; a rejected one is a decision, not a fault —
 *  grey, never red. */
export const APPROVAL: Record<PlatformUserApproval, { label: string; tone: StatusTone }> = {
  pending: { label: 'Waiting', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'neutral' },
};

/** Pending first (they are waiting on someone), then newest. */
export function sortUsers(users: readonly PlatformUser[]): PlatformUser[] {
  const rank: Record<PlatformUserApproval, number> = { pending: 0, approved: 1, rejected: 2 };
  return [...users].sort(
    (a, b) =>
      rank[a.approvalStatus] - rank[b.approvalStatus] ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export const ROLE_LABEL: Record<PlatformUser['role'], string> = {
  user: 'User',
  admin: 'Administrator',
};

export interface UserChangeCopy {
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
}

/**
 * The confirmation for a role or access change — each one changes what a real person can
 * do on the platform, so it says so in plain words. Null when nothing would change.
 */
export function describeUserChange(
  user: Pick<PlatformUser, 'email' | 'role' | 'approvalStatus'>,
  update: PlatformUserUpdate,
): UserChangeCopy | null {
  if (update.role && update.role !== user.role) {
    return update.role === 'admin'
      ? {
          title: 'Make administrator?',
          message: `${user.email} gets full admin access: this console, users and approvals, automations and the live-trading switches.`,
          confirmLabel: 'Make admin',
          destructive: false,
        }
      : {
          title: 'Remove admin access?',
          message: `${user.email} becomes a regular user and loses the admin console straight away.`,
          confirmLabel: 'Remove admin',
          destructive: true,
        };
  }
  if (update.approvalStatus && update.approvalStatus !== user.approvalStatus) {
    if (update.approvalStatus === 'approved') {
      return {
        title: 'Approve this account?',
        message: `${user.email} can sign in straight away.`,
        confirmLabel: 'Approve',
        destructive: false,
      };
    }
    if (update.approvalStatus === 'rejected' && user.approvalStatus === 'approved') {
      // Revoking signs a working account out of the platform.
      return {
        title: 'Revoke access?',
        message: `${user.email} won’t be able to sign in until approved again.`,
        confirmLabel: 'Revoke',
        destructive: true,
      };
    }
    if (update.approvalStatus === 'rejected') {
      return {
        title: 'Reject this account?',
        message: `${user.email} won’t be able to sign in. You can approve it later.`,
        confirmLabel: 'Reject',
        destructive: true,
      };
    }
    return {
      title: 'Move back to waiting?',
      message: `${user.email} can’t sign in until an administrator approves the account again.`,
      confirmLabel: 'Set waiting',
      destructive: true,
    };
  }
  return null;
}
