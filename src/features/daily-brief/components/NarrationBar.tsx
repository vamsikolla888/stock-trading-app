import Pause from 'lucide-react-native/icons/pause';
import Play from 'lucide-react-native/icons/play';
import RotateCcw from 'lucide-react-native/icons/rotate-ccw';
import X from 'lucide-react-native/icons/x';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import type { Narration } from '../useNarration';

/** The pinned mini-player while the brief is being read aloud. */
export function NarrationBar({ narration }: { narration: Narration }) {
  const { colors } = useTheme();
  if (!narration.open) return null;

  const { status } = narration;
  const Icon = status === 'playing' ? Pause : status === 'done' ? RotateCcw : Play;
  const actionLabel = status === 'playing' ? 'Pause' : status === 'done' ? 'Play again' : 'Play';

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Daily Brief narration"
      className="border-t border-line bg-surface px-4 py-2.5 dark:border-line-dark dark:bg-surface-dark"
    >
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          disabled={status === 'loading'}
          onPress={narration.toggle}
          className="h-10 w-10 items-center justify-center rounded-full bg-brand-strong active:opacity-80 dark:bg-brand-strong-dark"
        >
          {status === 'loading' ? (
            <ActivityIndicator color={colors.primaryText} size="small" />
          ) : (
            <Icon
              size={18}
              color={colors.primaryText}
              fill={status === 'playing' || status === 'done' ? 'none' : colors.primaryText}
            />
          )}
        </Pressable>
        <View className="flex-1">
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
            {status === 'loading' ? 'Preparing the brief…' : 'Daily Brief'}
          </Text>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {narration.transcript || 'Read aloud by your device'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Speed ${narration.speed} times. Change speed`}
          onPress={narration.cycleSpeed}
          hitSlop={6}
          className="min-w-[44px] items-center rounded-full border border-line-strong px-2 py-1 active:opacity-70 dark:border-line-dark-strong"
        >
          <Text className="text-xs font-semibold text-ink dark:text-ink-dark">
            {narration.speed}×
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close player"
          onPress={narration.close}
          hitSlop={8}
          className="h-8 w-8 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
        >
          <X size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <View
        className="mt-2 h-1 overflow-hidden rounded-full bg-line dark:bg-line-dark"
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(narration.progress * 100) }}
      >
        <View
          className="h-full rounded-full"
          style={{
            width: `${Math.round(narration.progress * 100)}%`,
            backgroundColor: colors.accent,
          }}
        />
      </View>
    </View>
  );
}
