import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { trendOf, trendTextClass } from '@/components/market/ChangeText';
import { formatIstTime } from '@/features/home/lib/istTime';
import { cn } from '@/lib/utils/cn';
import { formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import type { DataMeta } from '../types';

/**
 * One brief section: a heading with a one-line description of what kind of information it
 * is (observed, calculated, or model interpretation — the brief keeps them apart), an
 * optional link to the full screen, and the content in a card.
 */
export function BriefSection({
  title,
  caption,
  action,
  children,
  bare = false,
}: {
  title: string;
  caption?: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
  /** Render children without the card, for content that brings its own (a carousel). */
  bare?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View className="mt-7">
      <View className="mb-3 flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Text
            accessibilityRole="header"
            className="text-[17px] font-bold text-ink dark:text-ink-dark"
            style={{ letterSpacing: -0.4 }}
          >
            {title}
          </Text>
          {caption ? (
            <Text className="mt-0.5 text-xs text-ink-faint dark:text-ink-dark-faint">
              {caption}
            </Text>
          ) : null}
        </View>
        {action ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={action.label}
            hitSlop={10}
            onPress={action.onPress}
            className="flex-row items-center active:opacity-60"
          >
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              {action.label}
            </Text>
            <ChevronRight size={15} color={colors.link} />
          </Pressable>
        ) : null}
      </View>
      {bare ? (
        children
      ) : (
        <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
          {children}
        </View>
      )}
    </View>
  );
}

/** "Source · 15:42 · delayed" — every figure in the brief says where and when it's from. */
export function MetaLine({
  source,
  timestamp,
  delayed,
  className,
}: {
  source: string;
  timestamp?: string | null;
  delayed?: boolean;
  className?: string;
}) {
  const time = formatIstTime(timestamp);
  const parts = [source, time ? `${time} IST` : null, delayed ? 'delayed' : null].filter(Boolean);
  return (
    <Text
      className={cn('text-[11px] text-ink-faint dark:text-ink-dark-faint', className)}
      numberOfLines={2}
    >
      {parts.join(' · ')}
    </Text>
  );
}

export function metaProps(meta: DataMeta) {
  return { source: meta.source, timestamp: meta.timestamp, delayed: meta.isDelayed };
}

/** A signed percentage in the gain/loss text tone. */
export function Move({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  return (
    <Text className={cn('text-[13px] font-semibold', trendTextClass[trendOf(value)], className)}>
      {formatSignedPercent(value)}
    </Text>
  );
}

/** A labelled figure; three sit side by side in a row. */
export function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  /** Colours the value by sign, for P&L. */
  tone?: number | null;
}) {
  return (
    <View
      className="flex-1"
      accessible
      accessibilityLabel={`${label}: ${value}${detail ? `, ${detail}` : ''}`}
    >
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className={cn(
          'mt-1 text-[15px] font-semibold',
          tone === undefined ? 'text-ink dark:text-ink-dark' : trendTextClass[trendOf(tone)],
        )}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {value}
      </Text>
      {detail ? (
        <Text
          className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
          numberOfLines={2}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <View className="flex-row gap-3">{children}</View>;
}

/** An honest "not available" note inside a section — never a made-up stand-in. */
export function BriefEmpty({
  title,
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="gap-1">
      {title ? (
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark">{title}</Text>
      ) : null}
      <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {message}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={action.onPress}
          className="mt-1 self-start active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Small-print explanation of what a number is and isn't. */
export function Caveat({ children, className }: { children: string; className?: string }) {
  return (
    <Text
      className={cn('text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint', className)}
    >
      {children}
    </Text>
  );
}

export type TagTone = 'up' | 'down' | 'neutral' | 'info';

const tagClasses: Record<TagTone, { box: string; text: string }> = {
  up: {
    box: 'bg-success-wash dark:bg-success-wash-dark',
    text: 'text-brand-text dark:text-brand-text-dark',
  },
  down: {
    box: 'bg-danger-wash dark:bg-danger-wash-dark',
    text: 'text-danger-600 dark:text-danger-dark',
  },
  neutral: {
    box: 'bg-surface-sunk dark:bg-surface-sunk-dark',
    text: 'text-ink-muted dark:text-ink-dark-muted',
  },
  info: { box: 'bg-info-wash dark:bg-info-wash-dark', text: 'text-info dark:text-info-dark' },
};

export function Tag({ label, tone = 'neutral' }: { label: string; tone?: TagTone }) {
  const { box, text } = tagClasses[tone];
  return (
    <View className={cn('self-start rounded-md px-1.5 py-0.5', box)}>
      <Text className={cn('text-[11px] font-semibold', text)} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Divider({ className }: { className?: string }) {
  return <View className={cn('h-px bg-line dark:bg-line-dark', className)} />;
}

/** A tappable list row inside a section card, bleeding to the card's edges. */
export function BriefRow({
  onPress,
  accessibilityLabel,
  children,
  first = false,
}: {
  onPress?: () => void;
  accessibilityLabel?: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={onPress}
      className={cn(
        '-mx-4 flex-row items-center gap-3 px-4 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark',
        !first && 'border-t border-line dark:border-line-dark',
      )}
    >
      {children}
    </Pressable>
  );
}

/** Five dots for an ordinal 1–5 conviction — visibly a scale, not a probability. */
export function ConvictionDots({ value }: { value: number | null }) {
  const { colors } = useTheme();
  const level = value === null ? 0 : Math.max(0, Math.min(5, Math.round(value)));
  return (
    <View
      className="flex-row items-center gap-1"
      accessible
      accessibilityLabel={value === null ? 'Conviction unavailable' : `Conviction ${level} of 5`}
    >
      {[1, 2, 3, 4, 5].map((dot) => (
        <View
          key={dot}
          className="h-1.5 w-3.5 rounded-full"
          style={{ backgroundColor: dot <= level ? colors.accent : colors.border }}
        />
      ))}
    </View>
  );
}
