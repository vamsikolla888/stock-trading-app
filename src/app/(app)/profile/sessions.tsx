import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import Laptop from 'lucide-react-native/icons/laptop';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Smartphone from 'lucide-react-native/icons/smartphone';
import Tablet from 'lucide-react-native/icons/tablet';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { IconTile } from '@/components/ui/IconTile';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { useAccountSecurity, useRevokeSession } from '@/features/account/hooks';
import {
  authMethodLabel,
  sessionDevice,
  sessionTitle,
  sortSessions,
} from '@/features/account/lib/account';
import type { AccountSession } from '@/features/account/types';
import { confirmAction } from '@/features/settings/lib/confirm';
import { cn } from '@/lib/utils/cn';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

const DEVICE_ICON = { phone: Smartphone, tablet: Tablet, computer: Laptop } as const;

function when(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Devices & sessions (web: Profile › Login activity). Every sign-in is its own session, so a
 * device you don't recognise can be signed out without touching the rest. Signing out THIS
 * device ends the session here too.
 */
export default function SessionsScreen() {
  const security = useAccountSecurity();
  const revoke = useRevokeSession();
  const [expanded, setExpanded] = useState<string | null>(null);

  const sessions = useMemo(() => sortSessions(security.data?.sessions ?? []), [security.data]);
  const active = sessions.filter((s) => s.status === 'active');
  const ended = sessions.filter((s) => s.status !== 'active');
  const pendingId = revoke.isPending ? (revoke.variables ?? null) : null;

  const toggle = useCallback((id: string) => setExpanded((open) => (open === id ? null : id)), []);

  const signOut = useCallback(
    (session: AccountSession) => {
      const title = sessionTitle(session);
      confirmAction({
        title: session.current ? 'Sign out of this device?' : `Sign out ${title}?`,
        message: session.current
          ? 'You’ll return to the sign-in screen. Other devices stay signed in.'
          : 'That device will need your password to get back in. Other devices stay signed in.',
        confirmLabel: 'Sign out',
        destructive: true,
        onConfirm: () =>
          revoke.mutate(session.id, {
            onSuccess: (result) => {
              if (!result.current) toast.success('Signed out', `${title} no longer has access.`);
            },
            onError: (error) =>
              toast.error('Couldn’t sign that device out', getErrorMessage(error)),
          }),
      });
    },
    [revoke],
  );

  return (
    <StackScreen
      title="Devices & sessions"
      subtitle="Where your account is signed in"
      onRefresh={() => security.refetch()}
    >
      {security.isPending ? (
        <ListSkeleton rows={3} />
      ) : security.isError && !security.data ? (
        <InlineError
          what="your sessions"
          error={security.error}
          onRetry={() => void security.refetch()}
        />
      ) : sessions.length === 0 ? (
        <View className="items-center gap-3 rounded-card border border-line bg-surface px-5 py-8 dark:border-line-dark dark:bg-surface-dark">
          <IconTile Icon={ShieldCheck} tone="green" size="lg" />
          <Text className="text-center text-base font-bold text-ink dark:text-ink-dark">
            No tracked sessions yet
          </Text>
          <Text className="text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            This sign-in predates session tracking. It will appear here after its next refresh or
            your next sign-in.
          </Text>
        </View>
      ) : (
        <>
          <Text className="mb-4 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            Don’t recognise a device? Sign it out, then change your password.
          </Text>
          <ListCard>
            {active.map((session, index) => (
              <React.Fragment key={session.id}>
                {index > 0 ? <RowDivider /> : null}
                <SessionRow
                  session={session}
                  open={expanded === session.id}
                  busy={pendingId === session.id}
                  disabled={revoke.isPending}
                  onToggle={toggle}
                  onSignOut={signOut}
                />
              </React.Fragment>
            ))}
          </ListCard>
          {ended.length > 0 ? (
            <Section title="Signed out recently" note={`${ended.length}`}>
              <ListCard>
                {ended.map((session, index) => (
                  <React.Fragment key={session.id}>
                    {index > 0 ? <RowDivider /> : null}
                    <SessionRow
                      session={session}
                      open={expanded === session.id}
                      busy={false}
                      disabled
                      onToggle={toggle}
                      onSignOut={signOut}
                    />
                  </React.Fragment>
                ))}
              </ListCard>
            </Section>
          ) : null}
        </>
      )}
    </StackScreen>
  );
}

const SessionRow = memo(function SessionRow({
  session,
  open,
  busy,
  disabled,
  onToggle,
  onSignOut,
}: {
  session: AccountSession;
  open: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
  onSignOut: (session: AccountSession) => void;
}) {
  const { colors } = useTheme();
  const ended = session.status !== 'active';
  const title = sessionTitle(session);
  const Icon = DEVICE_ICON[sessionDevice(session)];
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <View className={cn(ended && 'opacity-60')}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${session.current ? ', this device' : ''}${ended ? ', signed out' : ''}. Last active ${when(session.lastSeenAt)}`}
        onPress={() => onToggle(session.id)}
        className="flex-row gap-3 px-3.5 py-3.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <IconTile Icon={Icon} tone={session.current ? 'green' : 'slate'} size="md" />
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
              {title}
            </Text>
            {session.current ? <Badge label="This device" variant="success" /> : null}
            {ended ? <Badge label="Signed out" variant="neutral" /> : null}
          </View>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {session.ipAddress} · {session.operatingSystem}
          </Text>
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
            Last active {when(session.lastSeenAt)} · {authMethodLabel(session.authenticationMethod)}
          </Text>
        </View>
        <Chevron size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
      </Pressable>

      {open ? (
        <View className="gap-2 px-3.5 pb-3.5">
          <Detail label="Signed in" value={when(session.createdAt)} />
          <Detail label="Last active" value={when(session.lastSeenAt)} />
          <Detail label="Verified with" value={authMethodLabel(session.authenticationMethod)} />
          <Detail label="Expires" value={when(session.expiresAt)} />
          {session.revokeReason ? (
            <Detail
              label="Signed out"
              value={`${session.revokeReason}${session.revokedAt ? ` · ${when(session.revokedAt)}` : ''}`}
            />
          ) : null}
          <Text
            selectable
            className="mt-1 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
          >
            {session.userAgent}
          </Text>
          {!ended ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={session.current ? 'Sign out of this device' : `Sign out ${title}`}
              disabled={disabled}
              onPress={() => onSignOut(session)}
              className="mt-2 h-10 flex-row items-center justify-center gap-2 rounded-field border border-danger-600/40 active:bg-danger-wash disabled:opacity-50 dark:active:bg-danger-wash-dark"
            >
              {busy ? <ActivityIndicator size="small" color={colors.danger} /> : null}
              <Text className="text-sm font-semibold text-danger-600 dark:text-danger-dark">
                {session.current ? 'Sign out of this device' : 'Sign out this device'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      <Text
        className="flex-1 text-right text-xs font-medium text-ink dark:text-ink-dark"
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}
