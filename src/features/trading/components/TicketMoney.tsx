import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { Badge } from '@/components/ui/Badge';
import { istTime } from '@/features/portfolio/lib/dates';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import type {
  AmountCard,
  BalanceCard,
  ChargeLine,
  DetailRow,
  TicketOrderRow,
} from '../lib/ticketView';

import { SideTag } from './Sheet';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * The ticket's money (web: `.ticket-money`): what the order needs, and what can be spent —
 * two figures read before committing, side by side, with the Max pill where it applies.
 */
export function MoneyCards({
  amount,
  balance,
  onMax,
  onFix,
}: {
  amount: AmountCard;
  balance: BalanceCard;
  onMax: (quantity: number) => void;
  /** The way out of a balance problem (opens Brokers). */
  onFix?: () => void;
}) {
  return (
    <View accessibilityLiveRegion="polite" className="flex-row gap-2.5">
      <View className="min-w-0 flex-1 rounded-xl border border-line bg-surface-sunk p-3 dark:border-line-dark dark:bg-surface-sunk-dark">
        <Text className="text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted">
          {amount.label}
        </Text>
        <Text
          className="mt-1 text-[19px] font-bold text-ink dark:text-ink-dark"
          style={[NUM, { letterSpacing: -0.3 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {amount.value}
        </Text>
        <Text
          className="mt-1 text-[11px] text-ink-faint dark:text-ink-dark-faint"
          style={NUM}
          numberOfLines={1}
        >
          {amount.meta}
        </Text>
      </View>
      <View className="min-w-0 flex-1 rounded-xl border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark">
        <Text className="text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted">
          {balance.label}
        </Text>
        <Text
          className="mt-1 text-[19px] font-bold text-ink dark:text-ink-dark"
          style={[NUM, { letterSpacing: -0.3 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {balance.value}
        </Text>
        <View className="mt-1 flex-row items-center justify-between gap-1.5">
          <Text
            className={cn(
              'min-w-0 flex-shrink text-[11px]',
              balance.problem
                ? 'text-danger-600 dark:text-danger-dark'
                : 'text-ink-faint dark:text-ink-dark-faint',
            )}
            style={NUM}
            numberOfLines={1}
          >
            {balance.meta}
          </Text>
          {balance.problem && onFix ? (
            <Pill label={balance.problem.fix} onPress={onFix} />
          ) : balance.max !== null ? (
            <Pill
              label="Max"
              accessibilityLabel={`Max, ${balance.max}`}
              onPress={() => onMax(balance.max!)}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Pill({
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
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={8}
      onPress={onPress}
      className="rounded-full bg-brand-wash px-2 py-0.5 active:opacity-70 dark:bg-brand-wash-dark"
    >
      <Text className="text-[11px] font-bold text-brand-text dark:text-brand-text-dark">
        {label}
      </Text>
    </Pressable>
  );
}

/** A muted full-width row that opens what's behind it (web: `.ticket-quiet-disclosure`). */
export function QuietDisclosure({
  label,
  summary,
  open,
  onToggle,
  className,
}: {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const { colors } = useTheme();
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}, ${summary}`}
      onPress={onToggle}
      className={cn('min-h-[40px] flex-row items-center gap-2 active:opacity-60', className)}
    >
      <Text className="flex-1 text-[13px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted" style={NUM}>
        {summary}
      </Text>
      <Chevron size={14} color={colors.textMuted} />
    </Pressable>
  );
}

/** The figures behind the money cards (web: `.ticket-detail-stack`); the charge row opens its lines. */
export function DetailStack({
  rows,
  chargeLines,
  chargesOpen,
  onToggleCharges,
  notes,
}: {
  rows: readonly DetailRow[];
  chargeLines: readonly ChargeLine[];
  chargesOpen: boolean;
  onToggleCharges: () => void;
  /** Rendered verbatim — the server decides which apply to this order. */
  notes?: readonly string[];
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-1.5 border-t border-dashed border-line pb-1 pt-2.5 dark:border-line-dark">
      {rows.map((row) =>
        row.charges && chargeLines.length > 0 ? (
          <View key={row.key}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: chargesOpen }}
              accessibilityLabel={`${row.label} ${row.value}`}
              onPress={onToggleCharges}
              className="flex-row items-center gap-1.5 active:opacity-60"
            >
              <Text className="flex-1 text-[13px] text-ink-muted dark:text-ink-dark-muted">
                {row.label}
              </Text>
              <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUM}>
                {row.value}
              </Text>
              {chargesOpen ? (
                <ChevronUp size={13} color={colors.textMuted} />
              ) : (
                <ChevronDown size={13} color={colors.textMuted} />
              )}
            </Pressable>
            {chargesOpen ? (
              <View className="ml-1 mt-1.5 gap-1 border-l-2 border-line pl-2.5 dark:border-line-dark">
                {chargeLines.map((line) => (
                  <View key={line.key} className="flex-row justify-between gap-3">
                    <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted">
                      {line.label}
                      {line.note ? (
                        <Text className="text-ink-faint dark:text-ink-dark-faint">
                          {' '}
                          · {line.note}
                        </Text>
                      ) : null}
                    </Text>
                    <Text className="text-xs text-ink dark:text-ink-dark" style={NUM}>
                      {formatINR(line.value)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View key={row.key} className="flex-row justify-between gap-3">
            <Text className="flex-1 text-[13px] text-ink-muted dark:text-ink-dark-muted">
              {row.label}
            </Text>
            {row.trend !== undefined ? (
              <ChangeText value={row.trend} className="text-[13px]" style={NUM}>
                {row.value}
              </ChangeText>
            ) : (
              <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUM}>
                {row.value}
              </Text>
            )}
          </View>
        ),
      )}
      {notes?.map((note, index) => (
        <Text
          key={`${index}-${note}`}
          className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
        >
          {note}
        </Text>
      ))}
    </View>
  );
}

/** Today's orders for the stock on the ticket — compact, read-only rows. */
export function TicketOrders({ rows }: { rows: readonly TicketOrderRow[] }) {
  return (
    <View className="gap-2.5 pb-1 pt-1">
      {rows.map((row) => (
        <View key={row.id} className="flex-row items-center gap-2">
          <SideTag side={row.side} />
          <Text
            className="min-w-0 flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
            style={NUM}
            numberOfLines={1}
          >
            {row.line}
          </Text>
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            {istTime(row.at)}
          </Text>
          <Badge label={row.status.label} variant={row.status.tone} />
        </View>
      ))}
    </View>
  );
}
