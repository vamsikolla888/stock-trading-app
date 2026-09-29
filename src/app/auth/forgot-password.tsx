import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MailCheck from 'lucide-react-native/icons/mail-check';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { appConfig } from '@/config/app';
import { AuthScreen } from '@/features/auth/components/AuthScreen';
import { StatusPanel } from '@/features/auth/components/StatusPanel';
import { useForgotPassword } from '@/features/auth/hooks/useAuth';
import { applyServerErrors, type ServerErrorBanner } from '@/features/auth/utils/serverErrors';
import { useCountdown } from '@/hooks/useCountdown';
import { toast } from '@/lib/utils/toast';
import {
  forgotPasswordSchema,
  type ForgotPasswordFormInput,
  type ForgotPasswordFormValues,
} from '@/lib/validators/auth';
import { useTheme } from '@/theme/ThemeProvider';

const { resetResendCooldownSeconds, resetLinkTtlMinutes } = appConfig.auth;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  // Prefilled from sign-in; a repeated query param arrives as an array — ignore it then.
  const initialEmail = typeof params.email === 'string' ? params.email : '';
  const forgotPassword = useForgotPassword();
  const { remaining, start: startCooldown } = useCountdown();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [banner, setBanner] = useState<ServerErrorBanner | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotPasswordFormInput, unknown, ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: initialEmail },
  });

  const send = (email: string, isResend = false) => {
    setBanner(null);
    forgotPassword.mutate(email, {
      onSuccess: () => {
        setSentTo(email);
        startCooldown(resetResendCooldownSeconds);
        if (isResend) toast.success('Link sent again', `Check ${email}`);
      },
      onError: (error) => {
        const next = applyServerErrors(error, setError, ['email']);
        if (isResend) {
          if (next) toast.error('Could not resend', next.message);
        } else {
          setBanner(next);
        }
      },
    });
  };

  const onSubmit = handleSubmit(({ email }) => send(email));
  const backToSignIn = () => router.dismissTo('/auth/login');

  if (sentTo) {
    return (
      <AuthScreen
        onBack={backToSignIn}
        footer={
          <View className="gap-1">
            <Button label="Back to sign in" size="lg" fullWidth onPress={backToSignIn} />
            <Button
              label={remaining > 0 ? `Resend link in ${remaining}s` : 'Resend link'}
              variant="ghost"
              size="lg"
              fullWidth
              disabled={remaining > 0}
              loading={forgotPassword.isPending}
              onPress={() => send(sentTo, true)}
            />
          </View>
        }
      >
        <StatusPanel
          icon={<MailCheck size={30} color={colors.link} />}
          title="Check your inbox"
          message={
            <>
              If an account exists for{' '}
              <Text className="font-semibold text-ink dark:text-ink-dark">{sentTo}</Text>, you'll
              get a link to reset your password. It expires in {resetLinkTtlMinutes} minutes.
            </>
          }
        >
          <Text className="text-center text-[13px] text-ink-faint dark:text-ink-dark-faint">
            Can't find it? Check your spam or promotions folder.
          </Text>
          <Button label="Use a different email" variant="link" onPress={() => setSentTo(null)} />
        </StatusPanel>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send you a link to set a new password."
    >
      <View className="gap-5">
        {banner ? (
          <Banner tone={banner.tone} title={banner.title} message={banner.message} />
        ) : null}
        <Controller
          control={control}
          name="email"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input
              label="Email"
              placeholder="you@example.com"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.email?.message}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={onSubmit}
              autoFocus={!initialEmail}
            />
          )}
        />
        <Button
          label="Send reset link"
          size="lg"
          fullWidth
          loading={forgotPassword.isPending}
          onPress={onSubmit}
        />
      </View>
    </AuthScreen>
  );
}
