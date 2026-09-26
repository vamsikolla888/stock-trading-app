import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export function LoadingSpinner({ fullScreen = false }: { fullScreen?: boolean }) {
  const { colors } = useTheme();

  if (!fullScreen) return <ActivityIndicator color={colors.primary} />;

  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: colors.background }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
