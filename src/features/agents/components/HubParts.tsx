import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { IconComponent } from '@/components/ui/icon';
import { IconTile, type IconTone } from '@/components/ui/IconTile';
import { StatusDot, StatusPill, type StatusTone } from '@/features/settings/components/StatusPill';
import { relativeTime } from '@/features/settings/lib/time';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import { AGENT_NAME, toneOf } from '../lib/view';
import type { ActivityEvent } from '../types';

import { NUM } from './Parts';

/**
 * One agent on the hub: what it is, whether it is working, its headline numbers and the last
 * thing it did. The whole card opens that agent's screen.
 */
export function AgentCard({
  Icon,
  iconTone,
  title,
  status,
  role,
  latest,
  onPress,
  children,
  className,
}: {
  Icon: IconComponent;
  iconTone: IconTone;
  title: string;
  status: { tone: StatusTone; label: string };
  role: string;
  /** The last thing it did — a tone dot, a line and when. */
  latest: { tone: StatusTone; text: string; at: string | null; now: number } | { empty: string };
  onPress: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${status.label}. Open ${title.toLowerCase()}`}
      onPress={onPress}
      className={cn(
        'rounded-card border border-line bg-surface p-4 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark',
        className,
      )}
    >
      <View className="flex-row items-center gap-3">
        <IconTile Icon={Icon} tone={iconTone} size="sm" />
        <View className="min-w-0 flex-1 gap-1">
          <Text
            accessibilityRole="header"
            className="text-[15px] font-semibold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {title}
          </Text>
          <StatusPill tone={status.tone} label={status.label} />
        </View>
        <ChevronRight size={18} color={colors.textFaint} />
      </View>
      <Text
        className="mt-3 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
        numberOfLines={3}
      >
        {role}
      </Text>
      <View className="mt-3.5">{children}</View>
      <View className="mt-3.5 flex-row items-center gap-2 border-t border-line pt-3 dark:border-line-dark">
        {'empty' in latest ? (
          <Text className="flex-1 text-xs text-ink-faint dark:text-ink-dark-faint">
            {latest.empty}
          </Text>
        ) : (
          <>
            <StatusDot tone={latest.tone} size={7} />
            <Text className="flex-1 text-xs text-ink dark:text-ink-dark" numberOfLines={1}>
              {latest.text}
            </Text>
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
              {relativeTime(latest.at, latest.now)}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

/** One line of the merged activity feed; tappable when the app has a screen for its record. */
export function ActivityRow({
  event,
  now,
  onPress,
  divider,
}: {
  event: ActivityEvent;
  now: number;
  onPress: (() => void) | null;
  divider: boolean;
}) {
  const body = (
    <>
      <View className="pt-1.5">
        <StatusDot tone={toneOf(event.tone)} size={8} />
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-baseline gap-2">
          <Text
            className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark"
            numberOfLines={2}
          >
            {event.title}
          </Text>
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            {relativeTime(event.at, now)}
          </Text>
        </View>
        <Text
          className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
          numberOfLines={1}
          style={NUM}
        >
          {AGENT_NAME[event.agent]}
          {event.detail ? ` · ${event.detail}` : ''}
        </Text>
      </View>
    </>
  );
  const frame = cn(
    'flex-row gap-3 px-4 py-3',
    divider && 'border-t border-line dark:border-line-dark',
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${AGENT_NAME[event.agent]}: ${event.title}${event.detail ? `, ${event.detail}` : ''}`}
      onPress={onPress}
      className={cn(frame, 'active:bg-surface-sunk dark:active:bg-surface-sunk-dark')}
    >
      {body}
    </Pressable>
  ) : (
    <View accessible className={frame}>
      {body}
    </View>
  );
}
