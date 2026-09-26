import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

interface SafeScreenProps extends ViewProps {
  edges?: Edge[];
  scroll?: boolean;
}

/** Standard screen container: safe-area aware, theme-aware background, consistent horizontal padding. */
export function SafeScreen({
  edges = ['top', 'bottom'],
  className,
  children,
  ...rest
}: SafeScreenProps) {
  const { colors } = useTheme();

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: colors.background }]}>
      <View className={cn('flex-1 px-4', className)} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
