import ServerCog from 'lucide-react-native/icons/server-cog';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { IconTile } from '@/components/ui/IconTile';
import { Meter, type MeterTone } from '@/components/ui/Meter';
import { isAdminDenied } from '@/features/admin/lib/access';
import { cn } from '@/lib/utils/cn';
import { isServerOutdated } from '@/services/api/contract';

import { pnlSign } from '../lib/view';

/** Tabular figures, so stacked numbers line up. */
export const NUM = { fontVariant: ['tabular-nums' as const] };

const SIGN_CLASS = {
  gain: 'text-brand-text dark:text-brand-text-dark',
  loss: 'text-danger-600 dark:text-danger-dark',
  none: 'text-ink dark:text-ink-dark',
} as const;

/** The text colour of a P&L figure — green up, red down, ink at zero or unknown. */
export function pnlClass(value: number | null | undefined): string {
  return SIGN_CLASS[pnlSign(value) ?? 'none'];
}

/** A pre-formatted P&L figure in its sign's colour. */
export function PnlText({
  value,
  children,
  className,
}: {
  value: number | null | undefined;
  children: string;
  className?: string;
}) {
  return (
    <Text className={cn('font-semibold', pnlClass(value), className)} style={NUM}>
      {children}
    </Text>
  );
}

/**
 * A wrapping row of filter pills, each with an optional count ("Held 412"). Wraps instead of
 * scrolling sideways, so it lines up with the page gutter at every width.
 */
export function ChipRow<K extends string>({
  items,
  value,
  onChange,
  counts,
  label,
  className,
}: {
  items: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  counts?: Partial<Record<K, number>>;
  /** What the row filters, for screen readers ("Mode"). */
  label: string;
  className?: string;
}) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      className={cn('flex-row flex-wrap gap-1.5', className)}
    >
      {items.map((item) => {
        const selected = item.key === value;
        const n = counts?.[item.key];
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${label}: ${item.label}${n != null ? `, ${n}` : ''}`}
            hitSlop={4}
            onPress={() => onChange(item.key)}
            className={cn(
              'flex-row items-center gap-1.5 rounded-lg border px-2.5 py-1.5',
              selected
                ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
                : 'border-line bg-surface active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark',
            )}
          >
            <Text
              className={cn(
                'text-xs font-semibold',
                selected
                  ? 'text-brand-text dark:text-brand-text-dark'
                  : 'text-ink-muted dark:text-ink-dark-muted',
              )}
            >
              {item.label}
            </Text>
            {n != null ? (
              <Text
                className={cn(
                  'text-[11px]',
                  selected
                    ? 'text-brand-text dark:text-brand-text-dark'
                    : 'text-ink-faint dark:text-ink-dark-faint',
                )}
                style={NUM}
              >
                {n.toLocaleString('en-IN')}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A compact bar row: label and figure on one line, a thin share bar, an optional note. */
export function BarRow({
  label,
  value,
  valueClassName,
  share,
  note,
  tone = 'info',
}: {
  label: string;
  value: string;
  valueClassName?: string;
  /** 0–100 */
  share: number;
  note?: string;
  tone?: MeterTone;
}) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}${note ? `. ${note}` : ''}`}>
      <View className="flex-row items-baseline gap-3">
        <Text className="flex-1 text-[13px] text-ink dark:text-ink-dark" numberOfLines={1}>
          {label}
        </Text>
        <Text
          className={cn('text-[13px] font-semibold text-ink dark:text-ink-dark', valueClassName)}
          style={NUM}
        >
          {value}
        </Text>
      </View>
      <Meter value={share} tone={tone} height={4} className="mt-1.5" />
      {note ? (
        <Text
          className="mt-1 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
          numberOfLines={2}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/** "Label  value" pairs in a wrapping line (best day, worst trade…). */
export function FigLine({
  items,
}: {
  items: readonly { label: string; value: string; sign?: number | null }[];
}) {
  return (
    <View className="mt-3 flex-row flex-wrap gap-x-5 gap-y-2">
      {items.map((item) => (
        <View key={item.label}>
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{item.label}</Text>
          <Text className={cn('mt-0.5 text-[13px] font-semibold', pnlClass(item.sign))} style={NUM}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A full-section notice: the bot needs a newer server, or the account is not an admin. */
export function BotNotice({ kind, message }: { kind: 'outdated' | 'admin'; message?: string }) {
  const outdated = kind === 'outdated';
  return (
    <View className="items-center gap-3 rounded-card border border-line bg-surface px-6 py-10 dark:border-line-dark dark:bg-surface-dark">
      <IconTile Icon={outdated ? ServerCog : ShieldAlert} tone="amber" size="lg" />
      <Text
        accessibilityRole="header"
        className="text-center text-base font-bold text-ink dark:text-ink-dark"
      >
        {outdated ? 'The index bot needs a newer server' : 'Administrators only'}
      </Text>
      <Text className="max-w-[320px] text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {message ??
          (outdated
            ? 'The server this app is connected to does not have the index bot yet. It appears here after the next server update.'
            : 'The index bot trades an administrator’s account, so its screens are limited to administrators.')}
      </Text>
    </View>
  );
}

/** A section's failure: "needs a newer server", "Administrators only", or a retryable error. */
export function BotQueryError({
  error,
  what,
  onRetry,
  className,
}: {
  error: unknown;
  what: string;
  onRetry?: () => void;
  className?: string;
}) {
  if (isServerOutdated(error)) return <BotNotice kind="outdated" />;
  if (isAdminDenied(error)) {
    return <BotNotice kind="admin" message="Your account no longer has administrator access." />;
  }
  return <InlineError what={what} error={error} onRetry={onRetry} className={className} />;
}

/** The server's own caveat, verbatim, as the page's last line. */
export function Caveat({ children }: { children: string | null | undefined }) {
  if (!children) return null;
  return (
    <Text className="mt-5 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
      {children}
    </Text>
  );
}

/** A small text link inside a panel ("See debate", "Open in Trades"). */
export function TextLink({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={10}
      onPress={onPress}
      className="active:opacity-60"
    >
      <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
        {label}
      </Text>
    </Pressable>
  );
}
