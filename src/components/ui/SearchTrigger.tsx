import Search from 'lucide-react-native/icons/search';
import React from 'react';
import { Pressable, Text } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

/** Looks like a search field, opens the search screen — typing happens there, with the keyboard up immediately. */
export function SearchTrigger({
  placeholder = 'Search stocks and indices',
  onPress,
  className,
}: {
  placeholder?: string;
  onPress: () => void;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      onPress={onPress}
      className={cn(
        'h-12 flex-row items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark',
        className,
      )}
    >
      <Search size={19} color={colors.textMuted} />
      <Text
        className="flex-1 text-[15px] text-ink-faint dark:text-ink-dark-faint"
        numberOfLines={1}
      >
        {placeholder}
      </Text>
    </Pressable>
  );
}
