import { useRouter } from 'expo-router';
import React from 'react';

import { appConfig } from '@/config/app';
import { AuthScreen, AuthSwitchPrompt } from '@/features/auth/components/AuthScreen';
import { LoginForm } from '@/features/auth/components/LoginForm';

export default function LoginScreen() {
  const router = useRouter();

  return (
    <AuthScreen
      title="Welcome back"
      subtitle={`Sign in to continue to ${appConfig.name}.`}
      footer={
        <AuthSwitchPrompt
          prompt={`New to ${appConfig.name}?`}
          actionLabel="Create account"
          onPress={() => router.replace('/auth/register')}
        />
      }
    >
      <LoginForm />
    </AuthScreen>
  );
}
