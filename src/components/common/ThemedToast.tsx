import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import Info from 'lucide-react-native/icons/info';
import React from 'react';
import { Text, View } from 'react-native';
import Toast, { type ToastConfig, type ToastConfigParams } from 'react-native-toast-message';

import type { IconComponent } from '@/components/ui/icon';
import { useTheme } from '@/theme/ThemeProvider';
import { palette } from '@/theme/tokens';

type Kind = 'success' | 'error' | 'info';

const KIND: Record<Kind, { Icon: IconComponent; light: string; dark: string }> = {
  success: { Icon: CircleCheck, light: palette.green, dark: palette.darkGreenText },
  error: { Icon: CircleAlert, light: '#ff7a5c', dark: palette.darkRedText },
  info: { Icon: Info, light: '#8ab0e6', dark: palette.darkBlue },
};

/**
 * Snackbar-style toast, Groww-like: a dark pill with a coloured status icon in light mode,
 * a raised surface in dark mode — the library's default is a white card in both.
 */
function Snack({
  kind,
  text1,
  text2,
}: { kind: Kind } & Pick<ToastConfigParams<unknown>, 'text1' | 'text2'>) {
  const { isDark, colors } = useTheme();
  const { Icon, light, dark } = KIND[kind];
  const background = isDark ? colors.surfaceElevated : '#1f2724';
  const title = isDark ? colors.text : palette.white;
  const body = isDark ? colors.textMuted : 'rgba(255,255,255,0.78)';

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="mx-4 w-[92%] max-w-[480px] flex-row items-start gap-3 rounded-2xl px-4 py-3.5"
      style={{
        backgroundColor: background,
        borderWidth: isDark ? 1 : 0,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
        elevation: 6,
      }}
    >
      <Icon size={20} color={isDark ? dark : light} />
      <View className="flex-1">
        {text1 ? (
          <Text className="text-[14px] font-semibold" style={{ color: title }}>
            {text1}
          </Text>
        ) : null}
        {text2 ? (
          <Text className="mt-0.5 text-[13px] leading-[18px]" style={{ color: body }}>
            {text2}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const config: ToastConfig = {
  success: ({ text1, text2 }) => <Snack kind="success" text1={text1} text2={text2} />,
  error: ({ text1, text2 }) => <Snack kind="error" text1={text1} text2={text2} />,
  info: ({ text1, text2 }) => <Snack kind="info" text1={text1} text2={text2} />,
};

export function ThemedToast() {
  return <Toast config={config} position="bottom" bottomOffset={96} />;
}
