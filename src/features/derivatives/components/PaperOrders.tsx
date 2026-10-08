import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { SideTag, SummaryBox, SummaryLine } from '@/features/fno/components/primitives';
import {
  contractTitle,
  DASH,
  dateTimeIst,
  expiryLabel,
  formatStrike,
  lotsLabel,
} from '@/features/fno/lib/format';
import { confirmAction } from '@/features/settings/lib/confirm';
import { formatINR, formatQuantity, formatSignedINR } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { useCancelPaperFnoOrder, usePaperOrders } from '../hooks';
import {
  chargeLines,
  countPaperOrders,
  filterPaperOrders,
  PAPER_ORDER_FILTERS,
  PAPER_ORDERS_LIMIT,
  premiumFlow,
  type PaperOrderFilter,
} from '../lib/book';
import { orderStatusView, priceSourceWord } from '../lib/paperFno';
import { paperChainHref } from '../lib/routes';
import type { FnoOrderView } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * The paper F&O order log — the web's /fno/paper/orders: every order this account placed
 * against the paper book, newest first. A rejection is a normal outcome (not enough margin, no
 * live price) carrying its reason, so it is listed, not hidden. A resting order — a LIMIT not yet
 * reached, or an AFTER-MARKET order placed outside the session — can be cancelled here, and the
 * list polls while one rests, so the minute sweep's fill shows up without a pull. Each fill says
 * where its price came from and the cash it moved; an expiry settlement row reads as Settled.
 * Tap an order for its contract-note breakdown; `onOpen` re-opens the ticket on its contract.
 */
export function PaperOrders({
  onOpen,
  compact = false,
}: {
  onOpen?: (order: FnoOrderView) => void;
  compact?: boolean;
} = {}) {
  const router = useRouter();
  const orders = usePaperOrders(PAPER_ORDERS_LIMIT);
  const [filter, setFilter] = useState<PaperOrderFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => orders.data ?? [], [orders.data]);
  const counts = useMemo(() => countPaperOrders(rows), [rows]);
  const shown = useMemo(() => filterPaperOrders(rows, filter), [rows, filter]);
  const chips = PAPER_ORDER_FILTERS.map((f) => ({
    key: f.key,
    label: `${f.label} ${counts[f.key]}`,
  }));
  const toggle = useCallback((id: string) => setExpanded((open) => (open === id ? null : id)), []);
  const {
    mutate: cancelOrder,
    isPending: cancelling,
    variables: cancellingId,
  } = useCancelPaperFnoOrder();
  const cancel = useCallback(
    (o: FnoOrderView) =>
      confirmAction({
        title: o.afterHours ? 'Cancel this after-market order?' : 'Cancel this limit order?',
        message: `${o.side} ${lotsLabel(o.lots)} of ${o.tradingsymbol}${o.limitPrice != null ? ` at ${formatINR(o.limitPrice)}` : ''}. What it holds goes back to your F&O wallet.`,
        confirmLabel: 'Cancel order',
        cancelLabel: 'Keep it',
        destructive: true,
        onConfirm: () =>
          cancelOrder(o.id, {
            onSuccess: () => toast.success('Order cancelled'),
            onError: (err) => toast.error('Couldn’t cancel', getErrorMessage(err)),
          }),
      }),
    [cancelOrder],
  );

  if (orders.isPending) return <ListSkeleton rows={5} />;
  if (orders.isError && !orders.data) {
    return (
      <InlineError
        what="your paper orders"
        error={orders.error}
        onRetry={() => void orders.refetch()}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <InlineEmpty
        title="No paper F&O orders yet"
        message="Orders you place on the paper option chain — filled, resting or rejected — show up here."
        action={{ label: 'Open option chain', onPress: () => router.push(paperChainHref()) }}
      />
    );
  }

  return (
    <View>
      <Chips items={chips} value={filter} onChange={setFilter} />
      {orders.isError ? (
        <Text className="mt-2 text-[11px] text-warning-600 dark:text-warning-dark">
          Couldn’t refresh — showing the last list.
        </Text>
      ) : null}
      <View className="mt-3">
        {shown.length === 0 ? (
          <InlineEmpty title="No orders match" message="Try another filter." />
        ) : (
          <ListCard>
            {shown.map((o, index) => (
              <React.Fragment key={o.id}>
                {index > 0 ? <RowDivider /> : null}
                <OrderRow
                  order={o}
                  open={expanded === o.id}
                  onToggle={toggle}
                  onCancel={cancel}
                  onTrade={onOpen}
                  cancelling={cancelling && cancellingId === o.id}
                />
              </React.Fragment>
            ))}
          </ListCard>
        )}
      </View>
      {compact ? null : (
        <Text className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          The last {PAPER_ORDERS_LIMIT} orders on your paper F&amp;O book. A resting order is
          checked once a minute; an after-market order fills at the first price after 09:15 IST.
          Simulated — nothing reached a broker.
        </Text>
      )}
    </View>
  );
}

const OrderRow = memo(function OrderRow({
  order: o,
  open,
  onToggle,
  onCancel,
  onTrade,
  cancelling,
}: {
  order: FnoOrderView;
  open: boolean;
  onToggle: (id: string) => void;
  onCancel: (order: FnoOrderView) => void;
  onTrade?: (order: FnoOrderView) => void;
  cancelling: boolean;
}) {
  const { colors } = useTheme();
  const filled = o.status === 'FILLED';
  const pending = o.status === 'PENDING';
  const limit =
    o.type === 'LIMIT' && o.limitPrice != null
      ? pending
        ? `resting at ${formatINR(o.limitPrice)}`
        : `limit ${formatINR(o.limitPrice)}`
      : pending && o.afterHours
        ? 'at the open'
        : null;
  const title = contractTitle({
    underlying: o.underlying,
    kind: o.kind,
    strike: o.kind === 'FUT' ? null : o.strike,
  });
  const flow = premiumFlow(o.premiumFlow);
  const status = orderStatusView(o);
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${o.side} ${lotsLabel(o.lots)} ${title}, ${o.status}${
          o.note ? `. ${o.note}` : ''
        }. ${open ? 'Hide' : 'Show'} the charges`}
        onPress={() => onToggle(o.id)}
        className="gap-1.5 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <View className="flex-row items-center gap-2">
          <SideTag side={o.side} />
          <Text
            className="min-w-0 flex-1 text-sm font-semibold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {title}
          </Text>
          <Badge label={status.label} variant={status.tone} />
        </View>
        <View className="flex-row items-center gap-2">
          <Text
            className="min-w-0 flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={1}
          >
            {expiryLabel(o.expiry)} · {o.tradingsymbol}
          </Text>
          <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            {dateTimeIst(o.createdAt)}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text
            className="flex-1 text-xs text-ink dark:text-ink-dark"
            style={NUM}
            numberOfLines={2}
          >
            {lotsLabel(o.lots)} · {filled ? formatINR(o.price) : (limit ?? DASH)}
            {filled && o.priceSource ? ` via ${priceSourceWord(o.priceSource)}` : ''}
            {filled && o.cashDelta != null
              ? ` · cash ${formatSignedINR(o.cashDelta)}`
              : filled && o.premiumFlow !== 0
                ? ` · premium ${flow.word} ${formatINR(flow.amount)}`
                : ''}
            {pending && (o.reservedAmount ?? 0) > 0
              ? ` · holds ${formatINR(o.reservedAmount)}`
              : ''}
            {o.charges.total > 0 ? ` · charges ${formatINR(o.charges.total)}` : ''}
          </Text>
          <Chevron size={16} color={colors.textMuted} />
        </View>
        {o.realisedPnl != null ? (
          <Text
            className={
              o.realisedPnl >= 0
                ? 'text-xs font-semibold text-brand-text dark:text-brand-text-dark'
                : 'text-xs font-semibold text-danger-600 dark:text-danger-dark'
            }
            style={NUM}
          >
            Realised {formatSignedINR(o.realisedPnl)}
          </Text>
        ) : null}
        {o.basketName ? (
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
            Basket · {o.basketName}
          </Text>
        ) : null}
        {filled && limit ? (
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            Placed as a {limit}
          </Text>
        ) : null}
        {o.note ? (
          <Text
            className={
              o.status === 'REJECTED'
                ? 'text-[11px] leading-4 text-danger-600 dark:text-danger-dark'
                : 'text-[11px] leading-4 text-ink-muted dark:text-ink-dark-muted'
            }
          >
            {o.note}
          </Text>
        ) : null}
      </Pressable>

      {open ? (
        <View className="gap-3 px-3.5 pb-3.5">
          {pending ? (
            <View>
              <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
                Held while it waits
              </Text>
              <SummaryBox>
                <SummaryLine
                  label="Reserved (worst case)"
                  value={formatINR(o.reservedAmount ?? 0)}
                  strong
                />
                {o.type === 'LIMIT' && o.limitPrice != null ? (
                  <SummaryLine
                    label="Limit"
                    value={`${o.side === 'BUY' ? 'At or below' : 'At or above'} ${formatINR(o.limitPrice)}`}
                  />
                ) : null}
                {o.afterHours ? (
                  <SummaryLine label="Fills" value="At the first price after 09:15 IST" />
                ) : null}
              </SummaryBox>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Cancel the resting order for ${o.tradingsymbol}`}
                disabled={cancelling}
                onPress={() => onCancel(o)}
                className="mt-3 h-10 flex-row items-center justify-center gap-2 rounded-field border border-line-strong active:bg-surface-sunk disabled:opacity-50 dark:border-line-dark-strong dark:active:bg-surface-sunk-dark"
              >
                {cancelling ? <ActivityIndicator size="small" color={colors.danger} /> : null}
                <Text className="text-sm font-semibold text-danger-600 dark:text-danger-dark">
                  Cancel order
                </Text>
              </Pressable>
            </View>
          ) : filled ? (
            <View>
              <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
                Charges on this order
              </Text>
              <SummaryBox>
                {chargeLines(o.charges).map((line) => (
                  <SummaryLine key={line.label} label={line.label} value={formatINR(line.value)} />
                ))}
                <SummaryLine label="Total" value={formatINR(o.charges.total)} strong />
              </SummaryBox>
            </View>
          ) : null}
          <View>
            <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
              Effect on the account
            </Text>
            <SummaryBox>
              <SummaryLine
                label="Quantity"
                value={`${formatQuantity(o.quantity)} (${o.lots} × ${formatQuantity(o.lotSize)})`}
              />
              {filled ? (
                <>
                  <SummaryLine
                    label={o.premiumFlow < 0 ? 'Premium received' : 'Premium paid'}
                    value={formatINR(flow.amount)}
                  />
                  <SummaryLine
                    label={o.marginDelta >= 0 ? 'Margin blocked' : 'Margin released'}
                    value={formatINR(Math.abs(o.marginDelta), 0)}
                  />
                  {o.cashDelta != null ? (
                    <SummaryLine label="Cash moved" value={formatSignedINR(o.cashDelta)} strong />
                  ) : null}
                  {o.priceSource ? (
                    <SummaryLine
                      label={o.settlement ? 'Settled against' : 'Price from'}
                      value={priceSourceWord(o.priceSource)}
                    />
                  ) : null}
                </>
              ) : null}
              <SummaryLine
                label="Contract"
                value={`${o.kind === 'FUT' ? 'Future' : `${formatStrike(o.strike)} ${o.kind}`} · ${expiryLabel(o.expiry)} · ${o.exchange}`}
              />
              {o.basketId ? (
                <SummaryLine label="Basket" value={o.basketName ?? o.basketId} />
              ) : null}
            </SummaryBox>
          </View>
          {onTrade && !o.settlement ? (
            <Button
              label="Trade this contract"
              variant="outline"
              size="sm"
              onPress={() => onTrade(o)}
              accessibilityLabel={`Open the ticket for ${title}`}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
});
