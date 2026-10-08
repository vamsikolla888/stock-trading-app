import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import ServerCog from 'lucide-react-native/icons/server-cog';
import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { IconTile } from '@/components/ui/IconTile';
import { cn } from '@/lib/utils/cn';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';

/** Small building blocks shared by the Agents screens. */

export const NUM = { fontVariant: ['tabular-nums' as const] };

/** Opens a cited page in the browser; only http(s) links are ever opened. */
export async function openSource(url: string | null | undefined): Promise<void> {
  if (!url || !/^https?:\/\//i.test(url.trim())) {
    toast.error('No link for this source');
    return;
  }
  try {
    await Linking.openURL(url.trim());
  } catch {
    toast.error('Couldn’t open the source');
  }
}

/** The whole screen when the connected server predates the Agents routes. */
export function AgentsOutdated({ what = 'The Agents screens' }: { what?: string }) {
  return (
    <View
      accessibilityRole="summary"
      className="items-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-10 dark:border-line-dark-strong"
    >
      <IconTile Icon={ServerCog} tone="slate" size="lg" />
      <Text
        accessibilityRole="header"
        className="text-center text-base font-bold text-ink dark:text-ink-dark"
      >
        Needs a newer server
      </Text>
      <Text className="max-w-[320px] text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {what} need a server version newer than the one this app is connected to. They appear here
        once the server is updated.
      </Text>
    </View>
  );
}

/** A small muted heading inside a card ("Bull case", "Sources read"). */
export function SubHead({ children, className }: { children: string; className?: string }) {
  return (
    <Text
      accessibilityRole="header"
      className={cn('mb-1.5 text-[13px] font-semibold text-ink dark:text-ink-dark', className)}
    >
      {children}
    </Text>
  );
}

/** Body prose, selectable. */
export function Para({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Text
      selectable
      className={cn('text-[13px] leading-[20px] text-ink dark:text-ink-dark', className)}
    >
      {children}
    </Text>
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

/** Bulleted (or numbered) lines; a muted note when there are none and `empty` is given. */
export function Bullets({
  items,
  empty,
  ordered = false,
}: {
  items: readonly string[];
  empty?: string;
  ordered?: boolean;
}) {
  if (items.length === 0) return empty ? <Muted>{empty}</Muted> : null;
  return (
    <View className="gap-1.5">
      {items.map((item, index) => (
        // Two lines can share wording; the position is the stable identity.
        <View key={index} className="flex-row gap-2">
          <Text
            className="w-4 text-[13px] leading-[20px] text-ink-muted dark:text-ink-dark-muted"
            style={NUM}
          >
            {ordered ? `${index + 1}.` : '•'}
          </Text>
          <Para className="flex-1">{item}</Para>
        </View>
      ))}
    </View>
  );
}

/** A titled row that opens on tap — the long or secondary parts of a note. */
export function Disclosure({
  title,
  meta,
  initiallyOpen = false,
  divider = false,
  children,
}: {
  title: string;
  meta?: string;
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
        accessibilityLabel={meta ? `${title}, ${meta}` : title}
        onPress={() => setOpen((value) => !value)}
        className="min-h-[48px] flex-row items-center gap-2 px-3.5 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">{title}</Text>
        {meta ? (
          <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            {meta}
          </Text>
        ) : null}
        <Icon size={18} color={colors.textMuted} />
      </Pressable>
      {open ? <View className="px-3.5 pb-3.5">{children}</View> : null}
    </View>
  );
}

/** A headline figure inside a card: label over value. */
export function Fig({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} className="min-w-0 flex-1">
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className={cn('mt-0.5 text-[17px] font-bold text-ink dark:text-ink-dark', valueClassName)}
        style={NUM}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

/** Gain / loss text colour for a signed figure; nothing for zero or unknown. */
export function signClass(sign: -1 | 0 | 1): string | undefined {
  if (sign > 0) return 'text-brand-text dark:text-brand-text-dark';
  if (sign < 0) return 'text-danger-600 dark:text-danger-dark';
  return undefined;
}
