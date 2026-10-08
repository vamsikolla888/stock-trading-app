import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { IconComponent } from '@/components/ui/icon';
import { IconTile, type IconTone } from '@/components/ui/IconTile';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * An entry into a deeper screen, as a tile for a grid: icon, title, one muted line, and a
 * badge when something there needs attention ("2 waiting").
 */
export function NavTile({
  Icon,
  tone,
  title,
  subtitle,
  badge,
  onPress,
  className,
}: {
  Icon: IconComponent;
  tone: IconTone;
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
  className?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${badge ? `, ${badge}` : ''}. ${subtitle}`}
      onPress={onPress}
      className={cn(
        'min-h-[76px] flex-row items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark',
        className,
      )}
    >
      <IconTile Icon={Icon} tone={tone} size="md" />
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text
            className="flex-shrink text-sm font-semibold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {title}
          </Text>
          {badge ? (
            <View className="rounded-full bg-warning-wash px-2 py-0.5 dark:bg-warning-wash-dark">
              <Text className="text-[10px] font-bold text-warning-600 dark:text-warning-dark">
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textFaint} />
    </Pressable>
  );
}
