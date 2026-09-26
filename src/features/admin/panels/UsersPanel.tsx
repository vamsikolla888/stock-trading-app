import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips, SegmentedControl } from '@/components/ui/Tabs';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import { usePlatformUsers, useUpdatePlatformUser } from '@/features/admin/hooks';
import {
  APPROVAL,
  describeUserChange,
  filterUsers,
  ROLE_LABEL,
  sortUsers,
  userCounts,
  type UserFilter,
} from '@/features/admin/lib/users';
import type {
  PlatformUser,
  PlatformUserApproval,
  PlatformUserRole,
  PlatformUserUpdate,
} from '@/features/admin/types';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { confirmAction } from '@/features/settings/lib/confirm';
import { formatDate } from '@/features/settings/lib/time';
import { toast } from '@/lib/utils/toast';
import { initialsFromEmail } from '@/lib/utils/user';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const PAGE = 40;

const ACCESS_OPTIONS: readonly { key: PlatformUserApproval; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const ROLE_OPTIONS: readonly { key: PlatformUserRole; label: string }[] = [
  { key: 'user', label: 'User' },
  { key: 'admin', label: 'Admin' },
];

function UserRow({
  user,
  isSelf,
  expanded,
  busy,
  onToggle,
  onChange,
}: {
  user: PlatformUser;
  isSelf: boolean;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onChange: (update: PlatformUserUpdate) => void;
}) {
  const { colors } = useTheme();
  const approval = APPROVAL[user.approvalStatus] ?? APPROVAL.pending;
  const meta = [
    `Joined ${formatDate(user.createdAt)}`,
    user.role === 'admin' ? 'Admin' : null,
    isSelf ? 'You' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${user.email}, ${approval.label}, ${meta}`}
        onPress={onToggle}
        className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-brand-wash dark:bg-brand-wash-dark">
          <Text className="text-xs font-bold text-brand-text dark:text-brand-text-dark">
            {initialsFromEmail(user.email)}
          </Text>
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
            {user.email}
          </Text>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {meta}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : user.approvalStatus === 'pending' && !isSelf && !expanded ? (
          <Button
            label="Approve"
            size="sm"
            accessibilityLabel={`Approve ${user.email}`}
            onPress={() => onChange({ approvalStatus: 'approved' })}
          />
        ) : (
          <StatusPill tone={approval.tone} label={approval.label} />
        )}
        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
          <ChevronDown size={16} color={colors.textFaint} />
        </View>
      </Pressable>

      {expanded ? (
        <View className="gap-3 border-t border-line bg-surface-sunk px-3.5 py-3.5 dark:border-line-dark dark:bg-surface-sunk-dark">
          {isSelf ? (
            <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              This is your account. Your own role and access can’t be changed here — ask another
              administrator.
            </Text>
          ) : (
            <>
              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
                  Access
                </Text>
                <SegmentedControl
                  items={ACCESS_OPTIONS}
                  value={user.approvalStatus}
                  onChange={(approvalStatus) => onChange({ approvalStatus })}
                />
              </View>
              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
                  Role · {ROLE_LABEL[user.role] ?? user.role}
                </Text>
                <SegmentedControl
                  items={ROLE_OPTIONS}
                  value={user.role}
                  onChange={(role) => onChange({ role })}
                />
              </View>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Approve sign-ups and assign roles (web: Users & access). */
export function UsersPanel() {
  const { colors } = useTheme();
  const selfId = useAuthStore((state) => state.user?.id ?? null);
  const users = usePlatformUsers();
  const update = useUpdatePlatformUser();
  const [filter, setFilter] = useState<UserFilter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);

  const all = users.data;
  const counts = useMemo(() => (all ? userCounts(all) : null), [all]);
  const visible = useMemo(
    () => (all ? sortUsers(filterUsers(all, filter, query)) : []),
    [all, filter, query],
  );
  const filterItems = useMemo(
    () => [
      { key: 'all' as const, label: `All · ${counts?.all ?? 0}` },
      { key: 'pending' as const, label: `Pending · ${counts?.pending ?? 0}` },
      { key: 'approved' as const, label: `Approved · ${counts?.approved ?? 0}` },
      { key: 'rejected' as const, label: `Rejected · ${counts?.rejected ?? 0}` },
      { key: 'admins' as const, label: `Admins · ${counts?.admins ?? 0}` },
    ],
    [counts],
  );

  const change = (user: PlatformUser, next: PlatformUserUpdate) => {
    const copy = describeUserChange(user, next);
    if (!copy) return;
    confirmAction({
      ...copy,
      onConfirm: () =>
        update.mutate(
          { userId: user.id, update: next },
          {
            onSuccess: (saved) =>
              toast.success(
                'User updated',
                `${saved.email} · ${APPROVAL[saved.approvalStatus]?.label ?? saved.approvalStatus}`,
              ),
            onError: (error) => toast.error('Couldn’t update this user', getErrorMessage(error)),
          },
        ),
    });
  };

  const setFilterAndReset = (next: UserFilter) => {
    setFilter(next);
    setLimit(PAGE);
  };

  return (
    <StackScreen
      title="Users & access"
      subtitle={
        counts
          ? `${counts.all} account${counts.all === 1 ? '' : 's'}${counts.pending ? ` · ${counts.pending} waiting` : ''}`
          : 'Approvals and roles'
      }
      onRefresh={() => users.refetch()}
    >
      {users.isPending ? (
        <ListSkeleton rows={6} />
      ) : !all ? (
        <AdminQueryError what="users" error={users.error} onRetry={() => void users.refetch()} />
      ) : (
        <>
          <Input
            placeholder="Search by email"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setLimit(PAGE);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="search"
            accessibilityLabel="Search users"
            leftIcon={<Search size={18} color={colors.textFaint} />}
            rightIcon={
              query ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={10}
                  onPress={() => setQuery('')}
                >
                  <X size={18} color={colors.textMuted} />
                </Pressable>
              ) : undefined
            }
          />
          <Chips items={filterItems} value={filter} onChange={setFilterAndReset} className="mt-3" />

          <View className="mt-4">
            {visible.length === 0 ? (
              <InlineEmpty
                title={all.length === 0 ? 'No accounts yet' : 'No users match'}
                message={
                  all.length === 0
                    ? 'New sign-ups appear here for approval.'
                    : 'Try another search or filter.'
                }
                action={
                  all.length > 0
                    ? {
                        label: 'Clear filters',
                        onPress: () => {
                          setQuery('');
                          setFilterAndReset('all');
                        },
                      }
                    : undefined
                }
              />
            ) : (
              <>
                <ListCard>
                  {visible.slice(0, limit).map((user, index) => (
                    <View key={user.id}>
                      {index > 0 ? <RowDivider /> : null}
                      <UserRow
                        user={user}
                        isSelf={user.id === selfId}
                        expanded={expanded === user.id}
                        busy={update.isPending && update.variables?.userId === user.id}
                        onToggle={() =>
                          setExpanded((current) => (current === user.id ? null : user.id))
                        }
                        onChange={(next) => change(user, next)}
                      />
                    </View>
                  ))}
                </ListCard>
                {visible.length > limit ? (
                  <Button
                    label={`Show ${Math.min(PAGE, visible.length - limit)} more`}
                    variant="outline"
                    fullWidth
                    className="mt-3"
                    onPress={() => setLimit((current) => current + PAGE)}
                  />
                ) : null}
              </>
            )}
          </View>

          <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            New accounts start as User and Pending, and can’t sign in until approved. Pending
            accounts are listed first. Tap an account to change its access or role.
          </Text>
        </>
      )}
    </StackScreen>
  );
}
