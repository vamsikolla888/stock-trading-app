import { useColorScheme } from 'nativewind';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button } from '@/components/ui/Button';
import { darkColors, lightColors, palette } from '@/theme/tokens';

interface ErrorScreenProps {
  title?: string;
  message?: string;
  /** Shown in development builds only — raw error text can carry internals. */
  error?: unknown;
  onRetry?: () => void;
  onHome?: () => void;
  /** Covers the whole screen (root crash) rather than filling its parent (one route). */
  fullScreen?: boolean;
}

/** A dipping chart line with a warning badge — "something broke", in the app's own language. */
function BrokenChart({ wash, surface }: { wash: string; surface: string }) {
  return (
    <Svg width={148} height={120} viewBox="0 0 148 120" accessible={false}>
      <Circle cx={74} cy={60} r={56} fill={wash} />
      <Path
        d="M26 70l18-16 14 10 16-22 12 12"
        fill="none"
        stroke={palette.greenStrong}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M92 58l10 14 18 10"
        fill="none"
        stroke={palette.red}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1 8"
      />
      <Circle cx={112} cy={36} r={17} fill={palette.red} stroke={surface} strokeWidth={4} />
      <Path d="M112 27v10" stroke={palette.white} strokeWidth={3.5} strokeLinecap="round" />
      <Circle cx={112} cy={44} r={2.2} fill={palette.white} />
    </Svg>
  );
}

/**
 * The app's error page. Used by the root error boundary (a crash anywhere) and by the
 * route error boundaries (a crash inside one screen, with the menus still around it).
 * Reads the colour scheme from NativeWind rather than ThemeProvider, because the root
 * boundary renders above the providers and must not itself throw.
 */
export function ErrorScreen({
  title = 'Something went wrong',
  message = 'This screen hit an unexpected problem. Your account, holdings and orders are not affected.',
  error,
  onRetry,
  onHome,
  fullScreen = false,
}: ErrorScreenProps) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;
  const detail = __DEV__ && error instanceof Error ? error.message : null;

  const body = (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
      style={{ backgroundColor: colors.background }}
    >
      <View accessibilityRole="alert" className="w-full max-w-[420px] items-center self-center">
        <BrokenChart wash={colors.dangerWash} surface={colors.background} />
        <Text
          accessibilityRole="header"
          className="mt-6 text-center text-[22px] font-bold"
          style={{ color: colors.text, letterSpacing: -0.5 }}
        >
          {title}
        </Text>
        <Text
          className="mt-2 text-center text-[15px] leading-[22px]"
          style={{ color: colors.textMuted }}
        >
          {message}
        </Text>
        {detail ? (
          <View
            className="mt-5 w-full rounded-xl px-3.5 py-3"
            style={{ backgroundColor: colors.surfaceSunk }}
          >
            <Text className="text-xs" style={{ color: colors.textMuted, fontFamily: 'monospace' }}>
              {detail}
            </Text>
          </View>
        ) : null}
        <View className="mt-7 w-full gap-3">
          {onRetry ? <Button label="Try again" size="lg" fullWidth onPress={onRetry} /> : null}
          {onHome ? (
            <Button label="Go to home" variant="outline" size="lg" fullWidth onPress={onHome} />
          ) : null}
        </View>
      </View>
    </ScrollView>
  );

  return fullScreen ? (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>{body}</SafeAreaView>
  ) : (
    <View style={{ flex: 1, backgroundColor: colors.background }}>{body}</View>
  );
}
