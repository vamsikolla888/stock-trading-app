import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React from 'react';
import { Pressable, Text, View, type PressableProps } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

interface ListItemProps extends PressableProps {
  title: string;
  subtitle?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
}

export function ListItem({
  title,
  subtitle,
  leftIcon,
  rightElement,
  showChevron = false,
  className,
  ...rest
}: ListItemProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      className={cn(
        'flex-row items-center gap-3 rounded-card bg-surface px-4 py-3 active:bg-surface-sunk dark:bg-surface-dark dark:active:bg-surface-sunk-dark',
        className,
      )}
      {...rest}
    >
      {leftIcon}
      <View className="flex-1">
        <Text className="text-[15px] font-medium text-ink dark:text-ink-dark">{title}</Text>
        {subtitle ? (
          <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">{subtitle}</Text>
        ) : null}
      </View>
      {rightElement}
      {showChevron ? <ChevronRight size={20} color={colors.textFaint} /> : null}
    </Pressable>
  );
}
