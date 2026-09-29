import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { ModifyOrderSheet } from '@/features/trading/components/ModifyOrderSheet';
import { afterSheetClose, Note, Pager, Sheet, SideTag } from '@/features/trading/components/Sheet';
import { formatINR, formatQuantity } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage } from '@/types/api';

import { useCancelBrokerOrder, useOrderHistoryPage } from '../hooks';
import {
  countOrdersByFilter,
  isCancellable,
  isModifiable,
  matchesOrderFilter,
  orderDaySummary,
  type OrderFilter,
} from '../lib/book';
import { dayLabel, istTime } from '../lib/dates';
import { ORDER_STATUS_LABEL, orderStatusTone } from '../lib/portfolio';
import type { OrderHistoryRow } from '../types';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };
const FILTER_LABEL: Record<OrderFilter, string> = {
  all: 'All',
  open: 'Open',
  executed: 'Executed',
  closed: 'Cancelled / rejected',
};

/**
 * The broker's order book by trading day — orders placed from the broker's own app too.
 * Pages by whole days (three per page); only open mStock orders can be cancelled here, and
 * only orders this app placed can be modified.
 */
export function OrderHistorySection({
  broker,
  brokerLabel,
}: {
  broker: string;
  brokerLabel: string;
}) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [modifyKey, setModifyKey] = useState<string | null>(null);
  const history = useOrderHistoryPage(broker, page);
  const data = history.data;

  const pageOrders = useMemo(() => data?.days.flatMap((day) => day.orders) ?? [], [data]);
  const counts = useMemo(() => countOrdersByFilter(pageOrders), [pageOrders]);
  const days = useMemo(
    () =>
      (data?.days ?? [])
        .map((day) => ({
          ...day,
          shown: day.orders.filter((order) => matchesOrderFilter(order, filter)),
        }))
        .filter((day) => day.shown.length > 0),
    [data, filter],
  );
  const open = pageOrders.find((order) => order.key === openKey) ?? null;
  const modifying = pageOrders.find((order) => order.key === modifyKey) ?? null;

  if (history.isPending) return <ListSkeleton rows={4} />;
  if (history.error && !data) {
    return (
      <InlineError
        what="your orders"
        error={history.error}
        onRetry={() => void history.refetch()}
      />
    );
  }
  if (!data || data.totalDays === 0) {
    return (
      <InlineEmpty
        title="No orders yet"
        message={`Orders you place — here or in the ${brokerLabel} app — show up here, grouped by day.`}
      />
    );
  }

  const chipItems = (Object.keys(FILTER_LABEL) as OrderFilter[]).map((key) => ({
    key,
    label: `${FILTER_LABEL[key]} (${counts[key]})`,
  }));
  const firstDay = (data.page - 1) * data.daysPerPage + 1;
  const lastDay = Math.min(data.totalDays, firstDay + data.days.length - 1);

  return (
    <View>
      <Chips items={chipItems} value={filter} onChange={setFilter} className="mb-3" />
      {!data.live ? (
        <Banner
          tone="warning"
          className="mb-3"
          message={`${brokerLabel} couldn't be reached — showing the last saved orders.`}
        />
      ) : null}

      <View style={{ opacity: history.isPlaceholderData ? 0.6 : 1 }}>
        {days.length === 0 ? (
          <InlineEmpty
            title="Nothing matches"
            message="No orders on these days match this filter."
          />
        ) : (
          days.map((day, dayIndex) => (
            <View key={day.date} className={dayIndex > 0 ? 'mt-5' : undefined}>
              <View className="mb-2 flex-row items-baseline justify-between gap-3">
                <Text className="text-[15px] font-bold text-ink dark:text-ink-dark">
                  {dayLabel(day.date)}
                </Text>
                <Text
                  className="flex-1 text-right text-[11px] text-ink-faint dark:text-ink-dark-faint"
                  numberOfLines={1}
                >
                  {orderDaySummary(day.orders)}
                </Text>
              </View>
              <ListCard>
                {day.shown.map((order, index) => (
                  <View key={order.key}>
                    {index > 0 ? <RowDivider /> : null}
                    <OrderRow order={order} onPress={() => setOpenKey(order.key)} />
                  </View>
                ))}
              </ListCard>
            </View>
          ))
        )}
      </View>

      <Pager
        page={data.page}
        totalPages={data.totalPages}
        busy={history.isFetching && history.isPlaceholderData}
        onPage={(next) => setPage(Math.min(Math.max(1, next), data.totalPages))}
        summary={`Days ${firstDay}–${lastDay} of ${data.totalDays} trading days with orders`}
      />
      <Note>
        {data.live
          ? `Live from ${brokerLabel}, including orders placed in the ${brokerLabel} app.`
          : `Saved copy — ${brokerLabel} will be read again on the next refresh.`}
      </Note>

      {open ? (
        <OrderSheet
          order={open}
          broker={broker}
          brokerLabel={brokerLabel}
          onClose={() => setOpenKey(null)}
          onModify={() => {
            // The detail sheet must finish dismissing before the edit sheet presents —
            // iOS won't show a second RN Modal while the first is animating away.
            setOpenKey(null);
            afterSheetClose(() => setModifyKey(open.key));
          }}
        />
      ) : null}
      {modifying && modifying.liveOrderId && isModifiable(modifying, broker) ? (
        <ModifyOrderSheet
          order={{
            id: modifying.liveOrderId,
            symbol: modifying.tradingsymbol ?? '',
            side: modifying.side ?? 'BUY',
            orderType: modifying.orderType ?? 'MARKET',
            quantity: modifying.quantity ?? 0,
            price: modifying.price,
            triggerPrice: modifying.triggerPrice,
            filledQuantity: modifying.filledQuantity,
            brokerLabel,
          }}
          onClose={() => setModifyKey(null)}
        />
      ) : null}
    </View>
  );
}

function OrderRow({ order, onPress }: { order: OrderHistoryRow; onPress: () => void }) {
  const price = order.averagePrice
    ? `Avg ${formatINR(order.averagePrice)}`
    : order.price
      ? formatINR(order.price)
      : 'Market';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${order.side ?? ''} ${order.tradingsymbol ?? ''}, ${ORDER_STATUS_LABEL[order.status]}`}
      onPress={onPress}
      className="min-h-[64px] flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <SideTag side={order.side} />
          <Text
            className="flex-shrink text-sm font-semibold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {order.tradingsymbol ?? '—'}
          </Text>
        </View>
        <Text
          className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted"
          style={NUMBERS}
          numberOfLines={1}
        >
          {formatQuantity(order.filledQuantity)}/{formatQuantity(order.quantity)} ·{' '}
          {[order.orderType, order.product].filter(Boolean).join(' · ')} · {price}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Badge label={ORDER_STATUS_LABEL[order.status]} variant={orderStatusTone(order.status)} />
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {istTime(order.placedAt)}
        </Text>
      </View>
    </Pressable>
  );
}

function OrderSheet({
  order,
  broker,
  brokerLabel,
  onClose,
  onModify,
}: {
  order: OrderHistoryRow;
  broker: string;
  brokerLabel: string;
  onClose: () => void;
  onModify: () => void;
}) {
  const cancel = useCancelBrokerOrder();
  const cancellable = isCancellable(order, broker);
  const modifiable = isModifiable(order, broker);

  const confirmCancel = () => {
    if (!order.brokerOrderId) return;
    Alert.alert(
      'Cancel this order?',
      `${order.side ?? ''} ${formatQuantity(order.quantity)} ${order.tradingsymbol ?? ''} at ${brokerLabel}. Anything already filled stays filled.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel order',
          style: 'destructive',
          onPress: () =>
            cancel.mutate(order.brokerOrderId!, {
              onSuccess: () => {
                toast.success(
                  'Cancel sent',
                  `${order.tradingsymbol ?? 'The order'} is being cancelled.`,
                );
                onClose();
              },
              onError: (error) => toast.error('Couldn’t cancel', getErrorMessage(error)),
            }),
        },
      ],
    );
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      busy={cancel.isPending}
      title={`${order.side === 'SELL' ? 'Sell' : 'Buy'} ${order.tradingsymbol ?? ''}`}
      subtitle={`${order.exchange ?? ''} · ${order.liveOrderId ? 'placed via this app' : `placed at ${brokerLabel}`}`}
      footer={
        cancellable ? (
          <View className="flex-row gap-2.5">
            {modifiable ? (
              <Button label="Modify" variant="outline" className="flex-1" onPress={onModify} />
            ) : null}
            <Button
              label="Cancel order"
              variant="danger"
              className="flex-1"
              loading={cancel.isPending}
              onPress={confirmCancel}
            />
          </View>
        ) : undefined
      }
    >
      <View className="mb-1 flex-row">
        <Badge label={ORDER_STATUS_LABEL[order.status]} variant={orderStatusTone(order.status)} />
      </View>
      <KeyValueRow
        label="Quantity"
        value={`${formatQuantity(order.filledQuantity)} of ${formatQuantity(order.quantity)} filled`}
      />
      <KeyValueRow
        label="Type"
        value={[order.orderType, order.product].filter(Boolean).join(' · ') || '—'}
        divider
      />
      <KeyValueRow label="Price" value={order.price ? formatINR(order.price) : 'Market'} divider />
      {order.triggerPrice ? (
        <KeyValueRow label="Trigger" value={formatINR(order.triggerPrice)} divider />
      ) : null}
      <KeyValueRow
        label="Average fill"
        value={order.averagePrice ? formatINR(order.averagePrice) : '—'}
        divider
      />
      <KeyValueRow
        label="Placed"
        value={`${dayLabel(order.tradingDate)}, ${istTime(order.placedAt)}`}
        divider
      />
      <KeyValueRow
        label="Order number"
        value={order.brokerOrderId ? `#${order.brokerOrderId}` : 'Not sent to the exchange'}
        divider
      />
      {order.brokerStatus ? (
        <KeyValueRow label={`${brokerLabel} status`} value={order.brokerStatus} divider />
      ) : null}
      {order.statusMessage ? (
        <Banner
          className="mt-3"
          tone={order.status === 'REJECTED' || order.status === 'RISK_REJECTED' ? 'error' : 'info'}
          message={order.statusMessage}
        />
      ) : null}
      {order.status === 'UNKNOWN' ? (
        <Note>
          {brokerLabel} hasn't confirmed this order yet. Don't place it again — it resolves on its
          own once reconciled.
        </Note>
      ) : null}
      {cancellable && !modifiable ? (
        <Note>
          {order.liveOrderId
            ? 'An F&O order — it can be cancelled here and modified from the F&O tab.'
            : `Placed outside this app, so it can be cancelled here but modified only in ${brokerLabel}.`}
        </Note>
      ) : null}
    </Sheet>
  );
}
