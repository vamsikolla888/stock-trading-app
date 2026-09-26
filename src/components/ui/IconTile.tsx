import React from 'react';
import { View } from 'react-native';

import type { IconComponent } from '@/components/ui/icon';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

export type IconTone = 'green' | 'blue' | 'amber' | 'violet' | 'rose' | 'teal' | 'slate';

/**
 * Icon colour on its tile, light and dark. Each pair keeps the glyph at ≥ 4.5:1 on its
 * own tile, so the tone carries meaning without costing legibility.
 */
const TONES: Record<IconTone, { light: [string, string]; dark: [string, string] }> = {
  green: { light: ['#007854', '#e4f7f0'], dark: ['#00d09c', '#0c2a22'] },
  blue: { light: ['#2f55c8', '#eaf0ff'], dark: ['#8ab0f5', '#15203a'] },
  amber: { light: ['#8a5a00', '#fff3dc'], dark: ['#f5bc57', '#2a2210'] },
  violet: { light: ['#6a47c2', '#f1ecff'], dark: ['#b9a3ff', '#221a33'] },
  rose: { light: ['#b4323f', '#ffebee'], dark: ['#ff8a95', '#2d1519'] },
  teal: { light: ['#0f6f7a', '#e2f6f8'], dark: ['#6fd6e2', '#0f2729'] },
  slate: { light: ['#44506a', '#eef1f6'], dark: ['#b4bccb', '#1e232b'] },
};

const SIZES = {
  sm: { box: 32, radius: 10, icon: 16 },
  md: { box: 40, radius: 12, icon: 20 },
  lg: { box: 48, radius: 15, icon: 22 },
} as const;

interface IconTileProps {
  Icon: IconComponent;
  tone?: IconTone;
  size?: keyof typeof SIZES;
  className?: string;
}

/** A glyph on a soft tinted tile — menus, tools and empty states. */
export function IconTile({ Icon, tone = 'green', size = 'md', className }: IconTileProps) {
  const { isDark } = useTheme();
  const [color, background] = isDark ? TONES[tone].dark : TONES[tone].light;
  const { box, radius, icon } = SIZES[size];

  return (
    <View
      className={cn('items-center justify-center', className)}
      style={{ width: box, height: box, borderRadius: radius, backgroundColor: background }}
    >
      <Icon size={icon} color={color} strokeWidth={2} />
    </View>
  );
}
