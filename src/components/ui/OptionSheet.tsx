import Check from 'lucide-react-native/icons/check';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetFrame } from '@/components/ui/SheetFrame';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

interface OptionSheetProps<K extends string> {
  visible: boolean;
  title: string;
  options: readonly { key: K; label: string }[];
  value: K;
  onSelect: (key: K) => void;
  onClose: () => void;
}

/**
 * Bottom sheet with a short single-choice list (filters, sort orders). Closes on pick; scrolls
 * if the list outgrows the screen (a turned phone).
 */
export function OptionSheet<K extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: OptionSheetProps<K>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <SheetFrame
      visible={visible}
      onRequestClose={onClose}
      style={{ paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) }}
      handle={
        <View className="px-5">
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-line-strong dark:bg-line-dark-strong" />
          <Text
            accessibilityRole="header"
            className="mb-2 text-[17px] font-bold text-ink dark:text-ink-dark"
          >
            {title}
          </Text>
        </View>
      }
    >
      <ScrollView
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {options.map((option) => {
          const selected = option.key === value;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                onSelect(option.key);
                onClose();
              }}
              className="min-h-[52px] flex-row items-center justify-between active:opacity-70"
            >
              <Text
                className={cn(
                  'text-[15px]',
                  selected
                    ? 'font-semibold text-brand-text dark:text-brand-text-dark'
                    : 'text-ink dark:text-ink-dark',
                )}
              >
                {option.label}
              </Text>
              {selected ? <Check size={20} color={colors.link} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </SheetFrame>
  );
}
