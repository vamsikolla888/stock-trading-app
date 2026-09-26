import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { OnboardingCarousel } from '@/features/auth/components/OnboardingCarousel';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const markWelcomeSeen = usePreferencesStore((state) => state.markWelcomeSeen);

  const go = (pathname: '/auth/register' | '/auth/login') => {
    markWelcomeSeen();
    router.push(pathname);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View className="h-14 w-full max-w-[440px] flex-row items-center self-center px-5">
        <Logo size="md" />
      </View>

      <View className="w-full max-w-[440px] flex-1 self-center">
        <OnboardingCarousel />
      </View>

      <View className="w-full max-w-[440px] gap-3 self-center px-5 pb-2 pt-1">
        <Button label="Create account" size="lg" fullWidth onPress={() => go('/auth/register')} />
        <Button
          label="I already have an account"
          variant="outline"
          size="lg"
          fullWidth
          onPress={() => go('/auth/login')}
        />
        <Text className="mt-1 text-center text-[11px] leading-[16px] text-ink-faint dark:text-ink-dark-faint">
          Investments in securities are subject to market risks. Read all related documents
          carefully before investing.
        </Text>
      </View>
    </SafeAreaView>
  );
}
