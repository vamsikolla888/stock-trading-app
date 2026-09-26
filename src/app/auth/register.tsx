import { useRouter } from 'expo-router';
import React from 'react';

import { AuthScreen, AuthSwitchPrompt } from '@/features/auth/components/AuthScreen';
import { RegisterForm } from '@/features/auth/components/RegisterForm';

export default function RegisterScreen() {
  const router = useRouter();

  return (
    <AuthScreen
      title="Create your account"
      subtitle="It takes less than a minute. Every new account is reviewed before first sign-in."
      footer={
        <AuthSwitchPrompt
          prompt="Already have an account?"
          actionLabel="Sign in"
          onPress={() => router.replace('/auth/login')}
        />
      }
    >
      <RegisterForm />
    </AuthScreen>
  );
}
