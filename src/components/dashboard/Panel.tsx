import React from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';

/**
 * The dashboard's one container: a titled card. A one-line title, an optional muted meta beside
 * it, and a control on the right (a range switch, a link). Content sits on the card's padding;
 * `flush` lets a list run edge to edge with its own dividers.
 */
export function Panel({
  title,
  meta,
  right,
  footer,
  flush = false,
  children,
  className,
}: {
  title?: string;
  meta?: string;
  right?: React.ReactNode;
  footer?: string;
  flush?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const header =
    title || right ? (
      <View className={cn('flex-row items-center gap-3', flush ? 'px-4 pb-2 pt-3.5' : 'mb-3')}>
        <View className="flex-1 flex-row flex-wrap items-baseline gap-x-2">
          {title ? (
            <Text
              accessibilityRole="header"
              className="text-[15px] font-semibold text-ink dark:text-ink-dark"
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : null}
          {meta ? (
            <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    ) : null;

  return (
    <View
      className={cn(
        'overflow-hidden rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
        !flush && 'p-4',
        className,
      )}
    >
      {header}
      {children}
      {footer ? (
        <Text
          className={cn(
            'text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint',
            flush ? 'px-4 pb-3.5 pt-2' : 'mt-3',
          )}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** A section title above a run of panels — "Services", "Console". */
export function GroupTitle({
  title,
  right,
  className,
}: {
  title: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('mb-3 mt-8 flex-row items-center justify-between gap-3', className)}>
      <Text
        accessibilityRole="header"
        className="text-[17px] font-bold text-ink dark:text-ink-dark"
        style={{ letterSpacing: -0.4 }}
      >
        {title}
      </Text>
      {right}
    </View>
  );
}
