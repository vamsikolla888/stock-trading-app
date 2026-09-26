import React, { useEffect } from 'react';
import { type DimensionValue, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/lib/utils/cn';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}

const roundedMap = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
} as const;

export function Skeleton({
  width = '100%',
  height = 16,
  rounded = 'md',
  className,
}: SkeletonProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[{ width, height }, animatedStyle]}>
      <View
        className={cn('h-full w-full bg-line dark:bg-line-dark', roundedMap[rounded], className)}
      />
    </Animated.View>
  );
}

export function SkeletonListItem() {
  return (
    <View className="flex-row items-center gap-3 rounded-card bg-surface p-4 dark:bg-surface-dark">
      <Skeleton width={48} height={48} rounded="full" />
      <View className="flex-1 gap-2">
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={12} />
      </View>
      <Skeleton width={60} height={24} />
    </View>
  );
}
