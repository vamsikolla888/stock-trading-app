import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { IconComponent } from '@/components/ui/icon';
import { IconTile, type IconTone } from '@/components/ui/IconTile';
import { useTheme } from '@/theme/ThemeProvider';

interface MenuRowProps {
  Icon: IconComponent;
  title: string;
  subtitle?: string;
  onPress: () => void;
  /** Replaces the chevron, e.g. a status badge or a switch. */
  right?: React.ReactNode;
  tone?: 'default' | 'danger';
  /** Tile colour for the icon; menus vary it by entry so rows are easy to tell apart. */
  iconTone?: IconTone;
}

/** Icon · title/subtitle · chevron row from the design's account menus. */
export function MenuRow({
  Icon,
  title,
  subtitle,
  onPress,
  right,
  tone = 'default',
  iconTone = 'green',
}: MenuRowProps) {
  const { colors } = useTheme();
  const danger = tone === 'danger';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      className="min-h-[60px] flex-row items-center gap-3 px-3.5 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <IconTile Icon={Icon} tone={danger ? 'rose' : iconTone} size="sm" />
      <View className="flex-1">
        <Text
          className={
            danger
              ? 'text-sm font-semibold text-danger-600 dark:text-danger-dark'
              : 'text-sm font-semibold text-ink dark:text-ink-dark'
          }
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? <ChevronRight size={18} color={colors.textFaint} />}
    </Pressable>
  );
}
