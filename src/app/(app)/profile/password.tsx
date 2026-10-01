import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import React, { useRef, useState } from 'react';
import { Text, View, type TextInput } from 'react-native';

import { StackScreen } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { appConfig } from '@/config/app';
import { useChangePassword } from '@/features/account/hooks';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage, isApiError } from '@/types/api';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

const { passwordMinLength, passwordMaxLength } = appConfig.auth;

/**
 * Change the password. The server revokes every session on success — this device included —
 * so the screen says so before the button, and the sign-in screen explains it afterwards.
 */
export default function PasswordScreen() {
  const { colors } = useTheme();
  const change = useChangePassword();
  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const serverField = (field: string) =>
    isApiError(change.error) ? change.error.fieldErrors[field] : undefined;
  const tooShort = next.length > 0 && next.length < passwordMinLength;
  const reused = next.length > 0 && next === current;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready =
    current.length > 0 &&
    next.length >= passwordMinLength &&
    next.length <= passwordMaxLength &&
    !reused &&
    confirm === next;

  const submit = () => {
    if (!ready || change.isPending) return;
    setError(null);
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        // Success signs this device out; the sign-in screen carries the explanation.
        onError: (err) => {
          const fields = isApiError(err) ? err.fieldErrors : {};
          if (!fields.currentPassword && !fields.newPassword) {
            setError(getErrorMessage(err, 'Couldn’t change your password.'));
          }
        },
      },
    );
  };

  const clearError = () => {
    setError(null);
    if (change.error) change.reset();
  };

  return (
    <StackScreen title="Password" subtitle="Change the password you sign in with">
      <View className="gap-5">
        <Input
          label="Current password"
          value={current}
          onChangeText={(text) => {
            clearError();
            setCurrent(text);
          }}
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => newRef.current?.focus()}
          error={serverField('currentPassword')}
        />
        <Input
          ref={newRef}
          label="New password"
          value={next}
          onChangeText={(text) => {
            clearError();
            setNext(text);
          }}
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={passwordMaxLength}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
          error={
            serverField('newPassword') ??
            (reused ? 'Choose a password you have not just used' : undefined) ??
            (tooShort ? `At least ${passwordMinLength} characters` : undefined)
          }
          helperText={`At least ${passwordMinLength} characters. Avoid one you use elsewhere.`}
        />
        <Input
          ref={confirmRef}
          label="Confirm new password"
          value={confirm}
          onChangeText={(text) => {
            clearError();
            setConfirm(text);
          }}
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={passwordMaxLength}
          returnKeyType="done"
          onSubmitEditing={submit}
          error={mismatch ? 'The new passwords don’t match' : undefined}
        />

        <View className="flex-row gap-2.5 rounded-field bg-warning-wash p-3 dark:bg-warning-wash-dark">
          <ShieldAlert size={18} color={colors.warning} style={{ marginTop: 1 }} />
          <Text className="flex-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
            <Text className="font-semibold">Every device will be signed out</Text>, this one
            included. You’ll sign in again with the new password.
          </Text>
        </View>

        {error ? <Banner tone="error" message={error} /> : null}

        <Button
          label="Update password"
          size="lg"
          fullWidth
          loading={change.isPending}
          disabled={!ready}
          onPress={submit}
        />
      </View>
    </StackScreen>
  );
}
