import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, Text, View, type TextInput } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthFlowStore } from '@/features/auth/authFlowStore';
import { useLogin } from '@/features/auth/hooks/useAuth';
import { applyServerErrors, type ServerErrorBanner } from '@/features/auth/utils/serverErrors';
import { loginSchema, type LoginFormInput, type LoginFormValues } from '@/lib/validators/auth';
import { usePreferencesStore } from '@/store/preferencesStore';
import { isMfaChallenge } from '@/types/auth';

export function LoginForm() {
  const router = useRouter();
  const login = useLogin();
  const lastSignedInEmail = usePreferencesStore((state) => state.lastSignedInEmail);
  const passwordRef = useRef<TextInput>(null);
  // A one-shot message left by whatever signed us out (e.g. a password change).
  const [banner, setBanner] = useState<ServerErrorBanner | null>(
    () => useAuthFlowStore.getState().notice,
  );
  useEffect(() => useAuthFlowStore.getState().clearNotice(), []);

  const {
    control,
    handleSubmit,
    getValues,
    setError,
    formState: { errors },
  } = useForm<LoginFormInput, unknown, LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: lastSignedInEmail ?? '', password: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const onSubmit = handleSubmit((values) => {
    setBanner(null);
    login.mutate(values, {
      // A finished sign-in needs nothing here (the guards move us into the app); a
      // two-factor account continues on the code screen.
      onSuccess: (result) => {
        if (isMfaChallenge(result)) router.push('/auth/two-factor');
      },
      onError: (error) => setBanner(applyServerErrors(error, setError, ['email', 'password'])),
    });
  });

  const openForgotPassword = () => {
    const email = getValues('email').trim();
    router.push({ pathname: '/auth/forgot-password', params: email ? { email } : {} });
  };

  // Fields at the top, the primary action at the bottom of the screen (riding above the
  // keyboard when it's up) — the spacer collapses as the keyboard takes the room.
  return (
    <View className="flex-1">
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
              onChangeText={(text) => {
                if (banner) setBanner(null);
                onChange(text);
              }}
              onBlur={onBlur}
              error={errors.email?.message}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              importantForAutofill="yes"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              autoFocus={!lastSignedInEmail}
            />
          )}
        />

        <View className="gap-2.5">
          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                ref={passwordRef}
                label="Password"
                placeholder="Enter your password"
                value={value}
                onChangeText={(text) => {
                  if (banner) setBanner(null);
                  onChange(text);
                }}
                onBlur={onBlur}
                error={errors.password?.message}
                secureToggle
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                importantForAutofill="yes"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                autoFocus={Boolean(lastSignedInEmail)}
              />
            )}
          />
          <Pressable
            accessibilityRole="link"
            hitSlop={10}
            onPress={openForgotPassword}
            className="self-end active:opacity-60"
          >
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              Forgot password?
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="min-h-8 flex-1" />
      <Button label="Sign in" size="lg" fullWidth loading={login.isPending} onPress={onSubmit} />
    </View>
  );
}
