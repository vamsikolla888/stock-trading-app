import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View, type TextInput } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordHint } from '@/features/auth/components/PasswordHint';
import { useRegister } from '@/features/auth/hooks/useAuth';
import { applyServerErrors, type ServerErrorBanner } from '@/features/auth/utils/serverErrors';
import {
  registerSchema,
  type RegisterFormInput,
  type RegisterFormValues,
} from '@/lib/validators/auth';

export function RegisterForm() {
  const router = useRouter();
  const register = useRegister();
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const [banner, setBanner] = useState<ServerErrorBanner | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterFormInput, unknown, RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const onSubmit = handleSubmit(({ email, password: newPassword }) => {
    setBanner(null);
    register.mutate(
      { email, password: newPassword },
      {
        onSuccess: ({ user }) => {
          router.replace({ pathname: '/auth/pending-approval', params: { email: user.email } });
        },
        onError: (error) => setBanner(applyServerErrors(error, setError, ['email', 'password'])),
      },
    );
  });

  return (
    <View className="gap-5">
      {banner ? <Banner tone={banner.tone} title={banner.title} message={banner.message} /> : null}

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
            textContentType="username"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
            autoFocus
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
              label="Create password"
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
            label="Confirm password"
            placeholder="Re-enter your password"
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
        label="Create account"
        size="lg"
        fullWidth
        loading={register.isPending}
        onPress={onSubmit}
      />
    </View>
  );
}
