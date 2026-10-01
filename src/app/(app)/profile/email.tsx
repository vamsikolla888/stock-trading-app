import MailCheck from 'lucide-react-native/icons/mail-check';
import React, { useRef, useState } from 'react';
import { Text, View, type TextInput } from 'react-native';

import { StackScreen } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAccountProfile, useRequestEmailChange } from '@/features/account/hooks';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage, isApiError } from '@/types/api';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Change the sign-in email. Nothing changes until the NEW address proves it is reachable: the
 * server emails it a one-hour link, and following that link switches the account over (and
 * signs out the other devices). The current password is asked for so an unattended phone
 * can't be used to take the account.
 */
export default function EmailScreen() {
  const { colors } = useTheme();
  const profile = useAccountProfile();
  const authEmail = useAuthStore((state) => state.user?.email);
  const current = profile.data?.email ?? authEmail ?? '';
  const request = useRequestEmailChange();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const next = email.trim().toLowerCase();
  const sameAsCurrent = next !== '' && next === current.toLowerCase();
  const emailError =
    (isApiError(request.error) ? request.error.fieldErrors.email : undefined) ??
    (sameAsCurrent ? 'That’s already your sign-in email' : undefined);
  const passwordError = isApiError(request.error)
    ? request.error.fieldErrors.currentPassword
    : undefined;
  const ready = EMAIL.test(next) && !sameAsCurrent && password.length > 0;

  const submit = () => {
    if (!ready || request.isPending) return;
    setError(null);
    request.mutate(
      { email: next, currentPassword: password },
      {
        onSuccess: () => {
          setSentTo(next);
          setPassword('');
        },
        onError: (err) => {
          const fields = isApiError(err) ? err.fieldErrors : {};
          if (!fields.email && !fields.currentPassword) {
            setError(getErrorMessage(err, 'Couldn’t start the email change.'));
          }
        },
      },
    );
  };

  return (
    <StackScreen title="Email address" subtitle="The email you sign in with">
      <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Current email</Text>
        <Text className="mt-1 text-base font-semibold text-ink dark:text-ink-dark" selectable>
          {current || '—'}
        </Text>
        <Text className="mt-1 text-xs text-brand-text dark:text-brand-text-dark">
          Verified · active
        </Text>
      </View>

      {sentTo ? (
        <View className="mt-6 items-center gap-3 rounded-card border border-line bg-surface px-5 py-7 dark:border-line-dark dark:bg-surface-dark">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-wash dark:bg-brand-wash-dark">
            <MailCheck size={26} color={colors.link} />
          </View>
          <Text className="text-center text-lg font-bold text-ink dark:text-ink-dark">
            Check your new inbox
          </Text>
          <Text className="text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            We sent a confirmation link to{' '}
            <Text className="font-semibold text-ink dark:text-ink-dark">{sentTo}</Text>. It works
            for one hour. Until you open it, you keep signing in with {current}.
          </Text>
          <Button
            label="Use a different address"
            variant="ghost"
            size="sm"
            onPress={() => {
              setSentTo(null);
              setEmail('');
              request.reset();
            }}
          />
        </View>
      ) : (
        <View className="mt-6 gap-5">
          <Input
            label="New email address"
            placeholder="you@example.com"
            value={email}
            onChangeText={(text) => {
              setError(null);
              if (request.error) request.reset();
              setEmail(text);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={emailError}
          />
          <Input
            ref={passwordRef}
            label="Current password"
            placeholder="To confirm it’s you"
            value={password}
            onChangeText={(text) => {
              setError(null);
              setPassword(text);
            }}
            secureToggle
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="send"
            onSubmitEditing={submit}
            error={passwordError}
          />
          {error ? <Banner tone="error" message={error} /> : null}
          <Button
            label="Send confirmation link"
            size="lg"
            fullWidth
            loading={request.isPending}
            disabled={!ready}
            onPress={submit}
          />
          <Text className="text-center text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
            We verify the new address before moving your account. Other devices are signed out once
            the change is confirmed.
          </Text>
        </View>
      )}
    </StackScreen>
  );
}
