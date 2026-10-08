import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import Star from 'lucide-react-native/icons/star';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { StockLogo } from '@/components/market/StockLogo';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import { STATUS_LABEL, STATUS_TONE, type Tone } from '../lib/format';
import type { IpoRecord, IpoStatus } from '../types';

/** The small shared pieces of the IPO screens. Colour never carries meaning alone: a word does. */

export const NUM = { fontVariant: ['tabular-nums' as const] };

export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-brand-text dark:text-brand-text-dark',
  warn: 'text-warning-600 dark:text-warning-dark',
  err: 'text-danger-600 dark:text-danger-dark',
  info: 'text-info dark:text-info-dark',
  neutral: 'text-ink-muted dark:text-ink-dark-muted',
};

const TONE_WASH: Record<Tone, string> = {
  ok: 'bg-success-wash dark:bg-success-wash-dark',
  warn: 'bg-warning-wash dark:bg-warning-wash-dark',
  err: 'bg-danger-wash dark:bg-danger-wash-dark',
  info: 'bg-info-wash dark:bg-info-wash-dark',
  neutral: 'bg-surface-sunk dark:bg-surface-sunk-dark',
};

export const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-brand dark:bg-brand-text-dark',
  warn: 'bg-warning-500 dark:bg-warning-dark',
  err: 'bg-danger-500 dark:bg-danger-dark',
  info: 'bg-info dark:bg-info-dark',
  neutral: 'bg-ink-faint dark:bg-ink-dark-faint',
};

/** A rounded label on its tone's wash — a status or a verdict. */
export function TonePill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <View className={cn('self-start rounded-full px-2.5 py-1', TONE_WASH[tone])}>
      <Text className={cn('text-[11px] font-semibold leading-[14px]', TONE_TEXT[tone])}>
        {label}
      </Text>
    </View>
  );
}

export function StatusPill({ status }: { status: IpoStatus }) {
  return <TonePill tone={STATUS_TONE[status]} label={STATUS_LABEL[status]} />;
}

/** "● Favourable setup" — a dot and a word, for a line inside a row. */
export function ToneLine({
  tone,
  text,
  className,
}: {
  tone: Tone;
  text: string;
  className?: string;
}) {
  return (
    <View className={cn('flex-row items-center gap-1.5', className)}>
      <View className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} />
      <Text className={cn('flex-1 text-xs font-medium', TONE_TEXT[tone])} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export function IpoLogo({
  ipo,
  size = 'md',
}: {
  ipo: Pick<IpoRecord, 'companyName' | 'logoUrl'>;
  size?: 'md' | 'lg';
}) {
  return <StockLogo symbol={ipo.companyName} uri={ipo.logoUrl} size={size} />;
}

/**
 * The IPO feed's market rating (a popularity score, 1–5) as stars (web: IpoRating). `small` sits
 * inside a 12px line of text; `showValue` adds "4/5". Unrated says "Not rated", or nothing with
 * `hideEmpty` (a row with no room for it).
 */
export function IpoRating({
  rating,
  small = false,
  showValue = true,
  hideEmpty = false,
}: {
  rating: number | null | undefined;
  small?: boolean;
  showValue?: boolean;
  hideEmpty?: boolean;
}) {
  const { colors } = useTheme();
  const value =
    rating == null || !Number.isFinite(rating) || rating <= 0
      ? null
      : Math.min(5, Math.max(1, Math.round(rating)));
  if (value == null) {
    return hideEmpty ? null : (
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">Not rated</Text>
    );
  }
  const size = small ? 11 : 13;
  return (
    <View
      accessible
      accessibilityLabel={`Rated ${value} out of 5`}
      className={cn('flex-row items-center', small ? 'gap-1' : 'gap-1.5')}
    >
      <View className="flex-row items-center gap-px">
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            size={size}
            color={i < value ? colors.warning : colors.borderStrong}
            fill={i < value ? colors.warning : 'none'}
          />
        ))}
      </View>
      {showValue ? (
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          {value}/5
        </Text>
      ) : null}
    </View>
  );
}

/** Label over value, for a row of two or three figures inside a card. */
export function Figure({
  label,
  value,
  tone,
  align = 'left',
  muted = false,
}: {
  label: string;
  value: string;
  tone?: Tone;
  align?: 'left' | 'right';
  /** A word standing in for a number ("Not valued"): quieter than a figure. */
  muted?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      className={cn('flex-1', align === 'right' && 'items-end')}
    >
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      <Text
        className={cn(
          'mt-0.5 text-[13px]',
          muted
            ? 'font-medium text-ink-muted dark:text-ink-dark-muted'
            : cn('font-semibold', tone ? TONE_TEXT[tone] : 'text-ink dark:text-ink-dark'),
        )}
        style={NUM}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** A titled block that opens on tap — the long-form parts of a research report. */
export function Collapsible({
  title,
  tag,
  initiallyOpen = false,
  divider = false,
  children,
}: {
  title: string;
  tag?: React.ReactNode;
  initiallyOpen?: boolean;
  divider?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <View className={cn(divider && 'border-t border-line dark:border-line-dark')}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        onPress={() => setOpen((value) => !value)}
        className="min-h-[48px] flex-row items-center gap-2 px-3.5 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">{title}</Text>
        {tag}
        <Icon size={18} color={colors.textMuted} />
      </Pressable>
      {open ? <View className="px-3.5 pb-3.5">{children}</View> : null}
    </View>
  );
}

/** Report prose, or a plain note that the sources said nothing. */
export function Prose({ text }: { text: string | null | undefined }) {
  return text ? (
    <Text selectable className="text-[13px] leading-[20px] text-ink dark:text-ink-dark">
      {text}
    </Text>
  ) : (
    <Muted>Not stated in the sources.</Muted>
  );
}

export function Muted({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Text
      className={cn('text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted', className)}
    >
      {children}
    </Text>
  );
}

/** Bulleted lines; each may carry the report's source numbers ("[3]"). */
export function Bullets({
  items,
  empty,
  ordered = false,
}: {
  items: readonly { text: string; sources?: readonly number[] }[];
  empty: string;
  ordered?: boolean;
}) {
  if (items.length === 0) return <Muted>{empty}</Muted>;
  return (
    <View className="gap-2">
      {items.map((item, index) => (
        // Two points can share wording; the position is the stable identity.
        <View key={index} className="flex-row gap-2">
          <Text className="w-4 text-[13px] leading-[20px] text-ink-muted dark:text-ink-dark-muted">
            {ordered ? `${index + 1}.` : '•'}
          </Text>
          <Text
            selectable
            className="flex-1 text-[13px] leading-[20px] text-ink dark:text-ink-dark"
          >
            {item.text}
            {item.sources && item.sources.length > 0 ? (
              <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                {`  ${item.sources.map((n) => `[${n}]`).join('')}`}
              </Text>
            ) : null}
          </Text>
        </View>
      ))}
    </View>
  );
}
