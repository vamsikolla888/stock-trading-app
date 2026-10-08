import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { StatusPill } from '@/features/settings/components/StatusPill';
import { relativeTime } from '@/features/settings/lib/time';

import { jobView, requesterLine } from '../lib/view';
import type { ResearchItem } from '../types';

import { NUM } from './Parts';

/**
 * One research run in the list: its status, the question, who asked, and — once answered — how
 * many verified findings and sources it rests on.
 */
export const ResearchRow = memo(function ResearchRow({
  item,
  now,
  onPress,
}: {
  item: ResearchItem;
  now: number;
  onPress: (item: ResearchItem) => void;
}) {
  const status = jobView(item.status);
  const counts =
    item.findings != null || item.sources != null
      ? `${item.findings ?? '—'} findings · ${item.sources ?? '—'} sources`
      : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.query}. ${status.label}. ${requesterLine(item.requester)}. Read it`}
      onPress={() => onPress(item)}
      className="gap-1.5 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-center gap-2">
        <StatusPill tone={status.tone} label={status.label} />
        <Text
          className="flex-1 text-right text-[11px] text-ink-faint dark:text-ink-dark-faint"
          style={NUM}
          numberOfLines={1}
        >
          {item.createdAt ? relativeTime(item.createdAt, now) : '—'}
        </Text>
      </View>
      <Text
        className="text-sm font-semibold leading-[19px] text-ink dark:text-ink-dark"
        numberOfLines={2}
      >
        {item.query || 'Untitled question'}
      </Text>
      <Text
        className="text-xs text-ink-muted dark:text-ink-dark-muted"
        style={NUM}
        numberOfLines={1}
      >
        {requesterLine(item.requester)}
        {item.depth ? ` · ${item.depth}` : ''}
        {counts ? ` · ${counts}` : ''}
      </Text>
    </Pressable>
  );
});
