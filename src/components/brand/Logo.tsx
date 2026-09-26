import React, { memo, useId } from 'react';
import { Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { appConfig } from '@/config/app';
import { cn } from '@/lib/utils/cn';
import { palette } from '@/theme/tokens';

// The brand mark: a bold rising arrow over three soft volume bars on a mint-to-emerald
// gradient tile. The same geometry (30-unit tile) is rasterized into the app icon, splash
// and favicon by scripts/generate-brand-assets.py — change both together.
export const MARK_GRADIENT = { from: '#1fd1a0', to: '#00805e' } as const;
export const MARK_TREND = 'M6.8 19.2L12 14l3.6 3.2 7.6-7.6';
export const MARK_ARROW = 'M18.6 9.6h4.6v4.6';
export const MARK_BARS = [
  { x: 7.6, y: 21, width: 2.8, height: 2 },
  { x: 13.2, y: 19.5, width: 2.8, height: 3.5 },
  { x: 18.8, y: 16.5, width: 2.8, height: 6.5 },
] as const;

interface LogoMarkProps {
  size?: number;
}

export const LogoMark = memo(function LogoMark({ size = 32 }: LogoMarkProps) {
  // Gradient ids are document-global on web; keep each instance's own.
  const gradientId = `mark-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" accessible={false}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={MARK_GRADIENT.from} />
          <Stop offset="1" stopColor={MARK_GRADIENT.to} />
        </LinearGradient>
      </Defs>
      <Rect width={30} height={30} rx={9} fill={`url(#${gradientId})`} />
      {MARK_BARS.map((bar) => (
        <Rect key={bar.x} {...bar} rx={1} fill={palette.white} fillOpacity={0.3} />
      ))}
      <Path
        d={MARK_TREND}
        fill="none"
        stroke={palette.white}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d={MARK_ARROW}
        fill="none"
        stroke={palette.white}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
});

type LogoSize = 'sm' | 'md' | 'lg';

const sizes: Record<LogoSize, { mark: number; text: string; gap: string }> = {
  sm: { mark: 28, text: 'text-base', gap: 'gap-2' },
  md: { mark: 32, text: 'text-lg', gap: 'gap-2.5' },
  lg: { mark: 56, text: 'text-3xl', gap: 'gap-3' },
};

interface LogoProps {
  size?: LogoSize;
  /** Stack the wordmark under the mark (splash-style) instead of beside it. */
  stacked?: boolean;
  className?: string;
}

export const Logo = memo(function Logo({ size = 'md', stacked = false, className }: LogoProps) {
  const { mark, text, gap } = sizes[size];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={appConfig.name}
      className={cn(stacked ? 'items-center' : 'flex-row items-center', gap, className)}
    >
      <LogoMark size={mark} />
      <Text
        className={cn('font-bold tracking-tight text-ink dark:text-ink-dark', text)}
        style={{ letterSpacing: -0.5 }}
      >
        {appConfig.name}
      </Text>
    </View>
  );
});
