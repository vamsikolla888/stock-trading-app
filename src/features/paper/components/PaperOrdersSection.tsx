import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import Share2 from 'lucide-react-native/icons/share-2';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Share, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { useMask } from '@/features/portfolio/components/BookSummaryCard';
import { dayLabel } from '@/features/portfolio/lib/dates';
import { confirmAction } from '@/features/settings/lib/confirm';
import { SideTag } from '@/features/trading/components/Sheet';
import { formatINR, formatQuantity, formatSignedINR } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { usePaperMutations } from '../hooks';
import {
  CHARGE_LINES,
  exitReasonText,
  groupByDay,
  matchesPaperFilter,
  paperDaySummary,
  paperOrdersCsv,
  paperOrderStatus,
  POOL_LABEL,
  sourceText,
  zeroChargeReason,
  type PaperOrderFilter,
} from '../lib/book';
import type { PaperOrder } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };

const FILTERS: readonly { key: PaperOrderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'executed', label: 'Executed' },
  { key: 'closed', label: 'Cancelled / rejected' },
];

function time(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      });
}

/**
 * The paper order book — both products, newest first, one group per day. A rejection is an
 * outcome with its reason, so it is listed rather than hidden; a resting order can be cancelled
 * here, which releases the cash it was holding. Tap an order for its contract-note charges.
 */
export function PaperOrdersSection({
  orders,
  isPending,
  error,
  onRetry,
  profileId,
  now,
}: {
  orders: PaperOrder[] | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  profileId: string | undefined;
  now: number;
}) {
  const { colors } = useTheme();
  const { cancelOrder } = usePaperMutations(profileId);
  const [filter, setFilter] = useState<PaperOrderFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => orders ?? [], [orders]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [
          f.key,
          rows.filter((order) => matchesPaperFilter(order, f.key)).length,
        ]),
      ) as Record<PaperOrderFilter, number>,
    [rows],
  );
  const days = useMemo(
    () =>
      groupByDay(
        rows.filter((order) => matchesPaperFilter(order, filter)),
        (order) => order.createdAt,
      ),
    [rows, filter],
  );
  const pendingId = cancelOrder.isPending ? (cancelOrder.variables ?? null) : null;

  const toggle = useCallback((id: string) => setExpanded((open) => (open === id ? null : id)), []);
  const cancel = useCallback(
    (order: PaperOrder) =>
      confirmAction({
        title: 'Cancel this order?',
        message: `${order.side} ${formatQuantity(order.quantity)} × ${order.symbol}${order.limitPrice ? ` at ${formatINR(order.limitPrice)}` : ''}. The cash it holds is released.`,
        confirmLabel: 'Cancel order',
        cancelLabel: 'Keep it',
        destructive: true,
        onConfirm: () =>
          cancelOrder.mutate(order.id, {
            onSuccess: () => toast.success('Order cancelled'),
            onError: (err) => toast.error('Couldn’t cancel', getErrorMessage(err)),
          }),
      }),
    [cancelOrder],
  );

  const exportCsv = () =>
    void Share.share({ message: paperOrdersCsv(rows), title: 'Paper orders' }).catch(
      () => undefined,
    );

  if (isPending) return <ListSkeleton rows={4} />;
  if (error && !orders)
    return <InlineError what="your paper orders" error={error} onRetry={onRetry} />;
  if (rows.length === 0) {
    return (
      <InlineEmpty
        title="No paper orders yet"
        message="Every paper order you place — filled, resting or rejected — is listed here with its charges."
      />
    );
  }

  return (
    <View>
      <Chips
        items={FILTERS.map((f) => ({ key: f.key, label: `${f.label} ${counts[f.key]}` }))}
        value={filter}
        onChange={setFilter}
      />
      {days.length === 0 ? (
        <InlineEmpty className="mt-4" title="Nothing here" message="Try another filter." />
      ) : (
        days.map((day) => (
          <View key={day.date} className="mt-5">
            <View className="mb-2 flex-row items-baseline justify-between gap-3">
              <Text className="text-[13px] font-bold text-ink dark:text-ink-dark">
                {day.date === 'unknown' ? 'Undated' : dayLabel(day.date, now)}
              </Text>
              <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                {paperDaySummary(day.items)}
              </Text>
            </View>
            <ListCard>
              {day.items.map((order, index) => (
                <React.Fragment key={order.id}>
                  {index > 0 ? <RowDivider /> : null}
                  <OrderRow
                    order={order}
                    open={expanded === order.id}
                    cancelling={pendingId === order.id}
                    onToggle={toggle}
                    onCancel={cancel}
                  />
                </React.Fragment>
              ))}
            </ListCard>
          </View>
        ))
      )}
      <Pressable
        accessibilityRole="button"
        onPress={exportCsv}
        hitSlop={8}
        className="mt-4 flex-row items-center gap-1.5 self-start active:opacity-60"
      >
        <Share2 size={14} color={colors.link} />
        <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
          Export as CSV
        </Text>
      </Pressable>
    </View>
  );
}

const OrderRow = memo(function OrderRow({
  order,
  open,
  cancelling,
  onToggle,
  onCancel,
}: {
  order: PaperOrder;
  open: boolean;
  cancelling: boolean;
  onToggle: (id: string) => void;
  onCancel: (order: PaperOrder) => void;
}) {
  const { colors } = useTheme();
  const mask = useMask();
  const status = paperOrderStatus(order);
  const filled = order.status === 'FILLED';
  const Chevron = open ? ChevronUp : ChevronDown;
  const by = sourceText(order.source);
  const exit = exitReasonText(order.exitReason);
  const price = filled
    ? `at ${formatINR(order.filledPrice)}`
    : order.limitPrice
      ? `limit ${formatINR(order.limitPrice)}`
      : order.triggerPrice
        ? `trigger ${formatINR(order.triggerPrice)}`
        : order.type;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${order.side} ${order.quantity} ${order.symbol}, ${status.label}${order.note ? `. ${order.note}` : ''}`}
        onPress={() => onToggle(order.id)}
        className="gap-1.5 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <View className="flex-row items-center gap-2">
          <SideTag side={order.side} />
          <Text
            className="min-w-0 flex-1 text-sm font-semibold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {order.symbol}
          </Text>
          <Badge label={status.label} variant={status.tone} />
        </View>
        <View className="flex-row items-center gap-2">
          <Text
            className="min-w-0 flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
            style={NUM}
            numberOfLines={1}
          >
            {formatQuantity(order.quantity)} qty · {price} · {POOL_LABEL[order.segment]}
            {by ? ` · ${by}` : ''}
          </Text>
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            {time(order.filledAt ?? order.createdAt)}
          </Text>
          <Chevron size={14} color={colors.textMuted} />
        </View>
        {order.realisedPnl != null ? (
          <ChangeText value={order.realisedPnl} className="text-xs" style={NUM}>
            Realised {mask(formatSignedINR(order.realisedPnl))} after charges
            {order.grossPnl != null ? ` · ${mask(formatSignedINR(order.grossPnl))} before` : ''}
            {exit ? ` · ${exit}` : ''}
          </ChangeText>
        ) : null}
        {order.note ? (
          <Text
            className={
              order.status === 'REJECTED'
                ? 'text-[11px] leading-4 text-danger-600 dark:text-danger-dark'
                : 'text-[11px] leading-4 text-ink-muted dark:text-ink-dark-muted'
            }
          >
            {order.note}
          </Text>
        ) : null}
      </Pressable>

      {open ? (
        <View className="gap-2 px-3.5 pb-3.5">
          {filled ? (
            <View className="rounded-xl bg-surface-sunk px-3 py-2 dark:bg-surface-sunk-dark">
              {CHARGE_LINES.map((line) => {
                const amount = order.chargesBreakdown?.[line.key] ?? null;
                const why =
                  amount === 0 ? zeroChargeReason(line.key, order.side, order.segment) : null;
                return (
                  <View key={line.key} className="flex-row justify-between gap-3 py-0.5">
                    <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                      {line.label}
                      {why ? (
                        <Text className="text-ink-faint dark:text-ink-dark-faint"> · {why}</Text>
                      ) : null}
                    </Text>
                    <Text className="text-xs text-ink dark:text-ink-dark" style={NUM}>
                      {amount == null ? '—' : formatINR(amount)}
                    </Text>
                  </View>
                );
              })}
              <View className="mt-1 flex-row justify-between gap-3 border-t border-line pt-1.5 dark:border-line-dark">
                <Text className="text-xs font-semibold text-ink dark:text-ink-dark">
                  Total charges
                </Text>
                <Text className="text-xs font-semibold text-ink dark:text-ink-dark" style={NUM}>
                  {formatINR(order.charges)}
                </Text>
              </View>
              {!order.chargesBreakdown ? (
                <Text className="mt-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                  Booked before charges were itemised — the total is exact.
                </Text>
              ) : null}
            </View>
          ) : (
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              {order.status === 'PENDING'
                ? 'Resting — it fills when the price reaches your level. Nothing is charged until it does.'
                : 'Nothing was filled, so nothing was charged.'}
            </Text>
          )}
          {order.status === 'PENDING' ? (
            <Pressable
              accessibilityRole="button"
              disabled={cancelling}
              onPress={() => onCancel(order)}
              className="mt-1 h-10 flex-row items-center justify-center gap-2 rounded-field border border-line-strong active:bg-surface-sunk disabled:opacity-50 dark:border-line-dark-strong dark:active:bg-surface-sunk-dark"
            >
              {cancelling ? <ActivityIndicator size="small" color={colors.danger} /> : null}
              <Text className="text-sm font-semibold text-danger-600 dark:text-danger-dark">
                Cancel order
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});
