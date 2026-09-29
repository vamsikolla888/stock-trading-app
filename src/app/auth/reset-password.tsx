import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import KeyRound from 'lucide-react-native/icons/key-round';
import React, { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View, type TextInput } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthScreen } from '@/features/auth/components/AuthScreen';
import { PasswordHint } from '@/features/auth/components/PasswordHint';
import { StatusPanel } from '@/features/auth/components/StatusPanel';
import { useResetPassword } from '@/features/auth/hooks/useAuth';
import { applyServerErrors, type ServerErrorBanner } from '@/features/auth/utils/serverErrors';
import { toast } from '@/lib/utils/toast';
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/lib/validators/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { isApiError } from '@/types/api';

// Bounds of the server's reset DTO — anything outside can't be a link we issued.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,512}$/;

/**
 * Opened from the reset email link (/auth/reset-password?token=…). The token is
 * single-use and expires server-side; a successful reset also revokes every existing
 * session for the account.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = typeof params.token === 'string' ? params.token : undefined;
  const resetPassword = useResetPassword();
  const confirmRef = useRef<TextInput>(null);
  const [banner, setBanner] = useState<(ServerErrorBanner & { linkExpired?: boolean }) | null>(
    null,
  );

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const requestNewLink = () => router.replace('/auth/forgot-password');
  const backToSignIn = () => router.dismissTo('/auth/login');

  if (!token || !TOKEN_PATTERN.test(token)) {
    return (
      <AuthScreen
        onBack={backToSignIn}
        footer={
          <View className="gap-1">
            <Button label="Request a new link" size="lg" fullWidth onPress={requestNewLink} />
            <Button
              label="Back to sign in"
              variant="ghost"
              size="lg"
              fullWidth
              onPress={backToSignIn}
            />
          </View>
        }
      >
        <StatusPanel
          tone="warning"
          icon={<KeyRound size={30} color={colors.warning} />}
          title="This link isn't valid"
          message="Open the reset link from your email again, or request a new one."
        />
      </AuthScreen>
    );
  }

  const onSubmit = handleSubmit(({ password }) => {
    setBanner(null);
    resetPassword.mutate(
      { token, password },
      {
        onSuccess: () => {
          toast.success('Password updated', 'Sign in with your new password.');
          backToSignIn();
        },
        onError: (error) => {
          if (isApiError(error) && (error.isAuthError || error.fieldErrors.token)) {
            setBanner({
              tone: 'warning',
              title: 'Link expired',
              message:
                'This reset link has expired or was already used. Request a new one to continue.',
              linkExpired: true,
            });
            return;
          }
          setBanner(applyServerErrors(error, setError, ['password']));
        },
      },
    );
  });

  return (
    <AuthScreen
      title="Set a new password"
      subtitle="For your security, you'll be signed out everywhere else once it's changed."
      onBack={backToSignIn}
    >
      <View className="gap-5">
        {banner ? (
          <Banner
            tone={banner.tone}
            title={banner.title}
            message={banner.message}
            action={
              banner.linkExpired
                ? { label: 'Request a new link', onPress: requestNewLink }
                : undefined
            }
          />
        ) : null}

        <View className="gap-2.5">
          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label="New password"
                placeholder="Choose a strong password"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
                secureToggle
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                passwordRules="minlength: 8; maxlength: 128;"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => confirmRef.current?.focus()}
                autoFocus
              />
            )}
          />
          {!errors.password ? <PasswordHint control={control} name="password" /> : null}
        </View>

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input
              ref={confirmRef}
              label="Confirm new password"
              placeholder="Re-enter your new password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.confirmPassword?.message}
              secureToggle
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
          )}
        />

        <Button
          label="Update password"
          size="lg"
          fullWidth
          loading={resetPassword.isPending}
          onPress={onSubmit}
        />
      </View>
    </AuthScreen>
  );
}
