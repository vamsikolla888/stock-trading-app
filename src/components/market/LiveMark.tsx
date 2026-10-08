import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/lib/utils/cn';

/**
 * Whether a price on screen is streaming: a softly pulsing green dot and "Live" (with the broker
 * it streams from), or — while the market is open and nothing streams — a quiet grey line saying
 * how the price is kept fresh instead. Never alarming: a delayed price is still a real price.
 */
export function LiveMark({
  live,
  via,
  fallback,
  className,
}: {
  live: boolean;
  /** "Groww" / "mStock" — shown after "Live". */
  via?: string | null;
  /** Shown when not live (e.g. "Refreshing every 10 s"); nothing when null. */
  fallback?: string | null;
  className?: string;
}) {
  if (!live && !fallback) return null;
  return (
    <View
      accessible
      accessibilityLabel={live ? `Live price${via ? ` from ${via}` : ''}` : (fallback ?? undefined)}
      className={cn('flex-row items-center gap-1.5', className)}
    >
      {live ? (
        <PulseDot />
      ) : (
        <View className="h-1.5 w-1.5 rounded-full bg-ink-faint dark:bg-ink-dark-faint" />
      )}
      <Text
        className={cn(
          'text-[11px]',
          live
            ? 'font-semibold text-brand-text dark:text-brand-text-dark'
            : 'text-ink-faint dark:text-ink-dark-faint',
        )}
        numberOfLines={1}
      >
        {live ? `Live${via ? ` · ${via}` : ''}` : fallback}
      </Text>
    </View>
  );
}

function PulseDot() {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    opacity.set(withRepeat(withTiming(0.35, { duration: 900 }), -1, true));
  }, [opacity, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={style} className="h-1.5 w-1.5 rounded-full bg-brand" />;
}
