import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';

interface SectionProps {
  title: string;
  action?: { label: string; onPress: () => void };
  /** Right-aligned muted note instead of an action, e.g. "Delayed". */
  note?: string;
  /** Custom right-hand control (e.g. a filter pill); takes precedence over action and note. */
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Section({ title, action, note, right, children, className }: SectionProps) {
  // Conflicting utilities resolve by stylesheet order, not by position in the string, so a
  // caller's own top margin must replace the default rather than be appended to it.
  const hasTopMargin = /(^|\s)(mt|my|m)-/.test(className ?? '');
  return (
    <View className={cn(!hasTopMargin && 'mt-7', className)}>
      <View className="mb-3 flex-row items-baseline justify-between gap-3">
        <Text
          accessibilityRole="header"
          className="text-[17px] font-bold text-ink dark:text-ink-dark"
          style={{ letterSpacing: -0.4 }}
        >
          {title}
        </Text>
        {right ? (
          right
        ) : action ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={action.onPress}
            className="active:opacity-60"
          >
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              {action.label}
            </Text>
          </Pressable>
        ) : note ? (
          <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">{note}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Bordered white container that groups rows (watchlist, holdings, menus). */
export function ListCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={cn(
        'overflow-hidden rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
        className,
      )}
    >
      {children}
    </View>
  );
}

export function RowDivider() {
  return <View className="ml-3.5 h-px bg-line dark:bg-line-dark" />;
}

/** Big page title block used at the top of each tab (eyebrow · title · subtitle). */
export function PageHeading({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View className="mb-5 flex-row items-start justify-between gap-3">
      <View className="flex-1">
        {eyebrow ? (
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted">
            {eyebrow}
          </Text>
        ) : null}
        <Text
          accessibilityRole="header"
          className="text-[26px] font-bold leading-[31px] text-ink dark:text-ink-dark"
          style={{ letterSpacing: -0.8 }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-1 text-[13px] text-ink-muted dark:text-ink-dark-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
