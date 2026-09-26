import { useRouter } from 'expo-router';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  rightElement?: React.ReactNode;
}

export function Header({ title, showBack = false, rightElement }: HeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }}
      className="border-b"
    >
      <View className="h-14 flex-row items-center justify-between px-4">
        <View className="w-10">
          {showBack && router.canGoBack() ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={12}
              onPress={() => router.back()}
            >
              <ChevronLeft size={26} color={colors.text} />
            </Pressable>
          ) : null}
        </View>
        <Text className="flex-1 text-center text-lg font-semibold text-ink dark:text-ink-dark">
          {title}
        </Text>
        <View className="w-10 items-end">{rightElement}</View>
      </View>
    </View>
  );
}
