import { useLocalSearchParams, useRouter } from 'expo-router';
import Camera from 'lucide-react-native/icons/camera';
import KeyRound from 'lucide-react-native/icons/key-round';
import Link from 'lucide-react-native/icons/link';
import LogOut from 'lucide-react-native/icons/log-out';
import Mail from 'lucide-react-native/icons/mail';
import MonitorSmartphone from 'lucide-react-native/icons/monitor-smartphone';
import Settings2 from 'lucide-react-native/icons/settings-2';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import UserRound from 'lucide-react-native/icons/user-round';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { StackScreen } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Banner, type BannerTone } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { MenuRow } from '@/components/ui/MenuRow';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { ProfileAvatar } from '@/features/account/components/ProfileAvatar';
import {
  useAccountProfile,
  useAccountSecurity,
  useConfirmEmailChange,
  useRemoveAvatar,
  useUploadAvatar,
} from '@/features/account/hooks';
import { memberSince, profileName } from '@/features/account/lib/account';
import { pickAvatarImage } from '@/features/account/lib/pickAvatar';
import { useLogout } from '@/features/auth/hooks/useAuth';
import { confirmAction } from '@/features/settings/lib/confirm';
import { toast } from '@/lib/utils/toast';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

interface Notice {
  tone: BannerTone;
  title?: string;
  message: string;
}

/**
 * Profile & security — the account centre (web: /profile). Who you are at the top, with the
 * photo; then everything that controls how this account signs in. Each area is its own screen,
 * because each one asks for a password or a code and deserves the whole screen to do it.
 *
 * Also the landing for the email-change link (`?emailChangeToken=`), which it confirms once.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const authUser = useAuthStore((state) => state.user);
  const params = useLocalSearchParams<{ emailChangeToken?: string | string[] }>();
  const emailChangeToken =
    typeof params.emailChangeToken === 'string' ? params.emailChangeToken : null;

  const profile = useAccountProfile();
  const security = useAccountSecurity();
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const confirmEmail = useConfirmEmailChange();
  const logout = useLogout();
  const [notice, setNotice] = useState<Notice | null>(null);
  const confirmedToken = useRef<string | null>(null);

  // A confirmation link is single-use: confirm it exactly once, then drop it from the route.
  useEffect(() => {
    if (!emailChangeToken || confirmedToken.current === emailChangeToken) return;
    confirmedToken.current = emailChangeToken;
    confirmEmail.mutate(emailChangeToken, {
      onSuccess: ({ profile: updated }) => {
        setNotice({
          tone: 'success',
          title: 'Email updated',
          message: `You now sign in with ${updated.email}. Other devices were signed out.`,
        });
        router.setParams({ emailChangeToken: undefined });
      },
      onError: (error) =>
        setNotice({
          tone: 'error',
          title: 'Couldn’t confirm the email change',
          message: getErrorMessage(error, 'This confirmation link is invalid or has expired.'),
        }),
    });
  }, [confirmEmail, emailChangeToken, router]);

  const data = profile.data;
  const name = profileName(data, authUser?.email);
  const email = data?.email ?? authUser?.email ?? '';
  const isAdmin = (data?.role ?? authUser?.role) === 'admin';
  const photoBusy = upload.isPending || remove.isPending;

  const changePhoto = async () => {
    if (photoBusy) return;
    setNotice(null);
    let picked;
    try {
      picked = await pickAvatarImage();
    } catch {
      toast.error('Couldn’t open your photos', 'Please try again.');
      return;
    }
    if (picked.kind === 'cancelled') return;
    if (picked.kind === 'unavailable') {
      setNotice({
        tone: 'info',
        title: 'Update the app to add a photo',
        message: 'This version of the app can’t open your photo library yet.',
      });
      return;
    }
    if (picked.kind === 'invalid') {
      setNotice({ tone: 'error', message: picked.message });
      return;
    }
    upload.mutate(picked.image, {
      onSuccess: () => toast.success('Photo updated'),
      onError: (error) =>
        setNotice({
          tone: 'error',
          message: getErrorMessage(error, 'Couldn’t upload that photo.'),
        }),
    });
  };

  const removePhoto = () =>
    confirmAction({
      title: 'Remove your photo?',
      message: 'Your initials will show instead.',
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () =>
        remove.mutate(undefined, {
          onSuccess: () => toast.success('Photo removed'),
          onError: (error) => toast.error('Couldn’t remove the photo', getErrorMessage(error)),
        }),
    });

  const confirmSignOut = () =>
    confirmAction({
      title: 'Sign out of this device?',
      message: 'Your other devices stay signed in.',
      confirmLabel: 'Sign out',
      destructive: true,
      onConfirm: () => logout.mutate(),
    });

  const mfa = security.data?.mfa;
  const activeSessions = security.data?.sessions.filter((s) => s.status === 'active').length;

  return (
    <StackScreen
      title="Profile & security"
      onRefresh={() => Promise.all([profile.refetch(), security.refetch()])}
    >
      {notice ? (
        <Banner className="mb-4" tone={notice.tone} title={notice.title} message={notice.message} />
      ) : null}
      {confirmEmail.isPending ? (
        <Banner className="mb-4" tone="info" message="Confirming your new email address…" />
      ) : null}

      {/* ── Identity ── */}
      <View className="items-center rounded-card border border-line bg-surface px-5 pb-5 pt-6 dark:border-line-dark dark:bg-surface-dark">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={data?.avatarUrl ? 'Change profile photo' : 'Add a profile photo'}
          accessibilityState={{ busy: photoBusy }}
          disabled={photoBusy || !data}
          onPress={() => void changePhoto()}
          className="active:opacity-80"
        >
          <ProfileAvatar name={name} avatarUrl={data?.avatarUrl} size="lg" />
          <View className="absolute -bottom-0.5 -right-0.5 h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-brand-strong dark:border-surface-dark dark:bg-brand-strong-dark">
            {photoBusy ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Camera size={15} color="#ffffff" />
            )}
          </View>
        </Pressable>
        <Text
          className="mt-3.5 text-center text-[20px] font-bold text-ink dark:text-ink-dark"
          style={{ letterSpacing: -0.4 }}
          numberOfLines={1}
        >
          {name}
        </Text>
        {email ? (
          <Text
            className="mt-0.5 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={1}
          >
            {email}
          </Text>
        ) : null}
        <View className="mt-2.5 flex-row items-center gap-2">
          <Badge
            label={isAdmin ? 'Administrator' : 'Member'}
            variant={isAdmin ? 'primary' : 'neutral'}
          />
          {data ? (
            <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
              {memberSince(data.createdAt)}
            </Text>
          ) : null}
        </View>
        {data?.bio ? (
          <Text className="mt-3 text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            {data.bio}
          </Text>
        ) : null}
        {data?.avatarUrl ? (
          <Button
            label="Remove photo"
            variant="ghost"
            size="sm"
            className="mt-2"
            disabled={photoBusy}
            onPress={removePhoto}
          />
        ) : null}
      </View>

      {profile.isError && !data ? (
        <InlineError
          className="mt-4"
          what="your profile"
          error={profile.error}
          onRetry={() => void profile.refetch()}
        />
      ) : null}

      {/* ── Account ── */}
      <Section title="Account">
        <ListCard>
          <MenuRow
            Icon={UserRound}
            iconTone="blue"
            title="Personal details"
            subtitle={data?.phone ? `Name, phone and bio · ${data.phone}` : 'Name, phone and bio'}
            onPress={() => router.push('/profile/personal')}
          />
          <RowDivider />
          <MenuRow
            Icon={Mail}
            iconTone="teal"
            title="Email address"
            subtitle={email || 'Your sign-in email'}
            onPress={() => router.push('/profile/email')}
          />
        </ListCard>
      </Section>

      {/* ── Security ── */}
      <Section title="Security">
        <ListCard>
          <MenuRow
            Icon={ShieldCheck}
            iconTone="green"
            title="Two-factor authentication"
            subtitle={
              !mfa
                ? security.isError
                  ? 'Couldn’t check right now'
                  : 'Checking…'
                : mfa.enabled
                  ? `On · ${mfa.recoveryCodesRemaining} recovery code${mfa.recoveryCodesRemaining === 1 ? '' : 's'} left`
                  : 'Off — add an authenticator app'
            }
            right={
              mfa ? (
                <Badge
                  label={mfa.enabled ? 'On' : 'Off'}
                  variant={mfa.enabled ? 'success' : 'warning'}
                />
              ) : undefined
            }
            onPress={() => router.push('/profile/two-factor')}
          />
          <RowDivider />
          <MenuRow
            Icon={KeyRound}
            iconTone="amber"
            title="Password"
            subtitle="Change the password you sign in with"
            onPress={() => router.push('/profile/password')}
          />
          <RowDivider />
          <MenuRow
            Icon={MonitorSmartphone}
            iconTone="violet"
            title="Devices & sessions"
            subtitle={
              activeSessions == null
                ? 'Where your account is signed in'
                : `${activeSessions} signed-in device${activeSessions === 1 ? '' : 's'}`
            }
            onPress={() => router.push('/profile/sessions')}
          />
        </ListCard>
        {mfa && !mfa.enabled ? (
          <View className="mt-3 flex-row items-start gap-2.5 rounded-field bg-warning-wash p-3 dark:bg-warning-wash-dark">
            <ShieldCheck size={16} color={colors.warning} style={{ marginTop: 1 }} />
            <Text className="flex-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
              Turn on two-factor so a stolen password alone can’t open your account.
            </Text>
          </View>
        ) : null}
      </Section>

      {/* ── Elsewhere ── */}
      <Section title="More">
        <ListCard>
          <MenuRow
            Icon={Settings2}
            iconTone="slate"
            title="App settings"
            subtitle="Theme, alerts and preferences"
            onPress={() => router.navigate('/settings')}
          />
          <RowDivider />
          <MenuRow
            Icon={Link}
            iconTone="green"
            title="Broker connections"
            subtitle="Accounts and market data"
            onPress={() => router.push('/brokers')}
          />
        </ListCard>
      </Section>

      <ListCard className="mt-7">
        <MenuRow
          Icon={LogOut}
          title="Sign out"
          subtitle="End the session on this device"
          tone="danger"
          onPress={confirmSignOut}
          right={logout.isPending ? <ActivityIndicator color={colors.danger} /> : <View />}
        />
      </ListCard>
    </StackScreen>
  );
}
