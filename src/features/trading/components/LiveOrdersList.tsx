import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { groupByDay } from '@/features/paper/lib/book';
import { dayLabel, istDateOf, istTime } from '@/features/portfolio/lib/dates';
import { ORDER_STATUS_LABEL, orderStatusTone } from '@/features/portfolio/lib/portfolio';
import { useNow } from '@/hooks/useNow';
import { stockHref } from '@/lib/navigation';
import { formatINR, formatQuantity } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage } from '@/types/api';

import { useLiveOrderMutations, useLiveOrders } from '../hooks';
import { isEquityOrder, WORKING_AT_BROKER } from '../lib/liveOrders';
import { ORDER_TYPE_LABEL } from '../lib/orderForm';
import { LIVE_BROKER_LABEL, type LiveOrder } from '../types';

import { ModifyOrderSheet } from './ModifyOrderSheet';
import { afterSheetClose, Note, Sheet, SideTag } from './Sheet';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };
const INITIAL_ROWS = 12;

const brokerOf = (order: LiveOrder) => LIVE_BROKER_LABEL[order.broker ?? 'mstock'];

/**
 * Your REAL orders placed through this app — status, why one was refused, and modify /
 * cancel for anything still working at the broker. The list polls every few seconds while
 * an order is in flight; the server reconciles with the broker on each read.
 */
export function LiveOrdersList() {
  const orders = useLiveOrders(50);
  const now = useNow();
  const [openId, setOpenId] = useState<string | null>(null);
  const [modifyId, setModifyId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => orders.data ?? [], [orders.data]);
  const days = useMemo(
    () => groupByDay(showAll ? rows : rows.slice(0, INITIAL_ROWS), (order) => order.createdAt),
    [rows, showAll],
  );
  const open = rows.find((order) => order.id === openId) ?? null;
  const modifying = rows.find((order) => order.id === modifyId) ?? null;

  if (orders.isPending) return <ListSkeleton rows={3} />;
  if (orders.error && !orders.data) {
    return (
      <InlineError
        what="your live orders"
        error={orders.error}
        onRetry={() => void orders.refetch()}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <InlineEmpty
        title="No live orders yet"
        message="Real orders you place from a stock's page show up here, with their status."
      />
    );
  }

  return (
    <View>
      {days.map((day, dayIndex) => (
        <View key={day.date} className={dayIndex > 0 ? 'mt-4' : undefined}>
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-dark-muted">
            {dayLabel(day.date, now)}
          </Text>
          <ListCard>
            {day.items.map((order, index) => (
              <View key={order.id}>
                {index > 0 ? <RowDivider /> : null}
                <LiveOrderRow order={order} onPress={() => setOpenId(order.id)} />
              </View>
            ))}
          </ListCard>
        </View>
      ))}
      {rows.length > INITIAL_ROWS ? (
        <Text
          accessibilityRole="button"
          onPress={() => setShowAll((value) => !value)}
          className="mt-3 text-center text-[13px] font-semibold text-brand-text dark:text-brand-text-dark"
        >
          {showAll ? 'Show fewer' : `Show all ${rows.length}`}
        </Text>
      ) : null}
      {open ? (
        <LiveOrderSheet
          order={open}
          onClose={() => setOpenId(null)}
          onModify={() => {
            // One RN Modal must finish dismissing before the next presents on iOS —
            // swapping them in one render leaves the edit sheet invisible.
            setOpenId(null);
            afterSheetClose(() => setModifyId(open.id));
          }}
        />
      ) : null}
      {modifying && WORKING_AT_BROKER.has(modifying.status) && isEquityOrder(modifying) ? (
        <ModifyOrderSheet
          order={{
            id: modifying.id,
            symbol: modifying.tradingsymbol,
            side: modifying.side,
            orderType: modifying.orderType,
            quantity: modifying.quantity,
            price: modifying.price,
            triggerPrice: modifying.triggerPrice,
            filledQuantity: modifying.filledQuantity,
            brokerLabel: brokerOf(modifying),
          }}
          onClose={() => setModifyId(null)}
        />
      ) : null}
    </View>
  );
}

function LiveOrderRow({ order, onPress }: { order: LiveOrder; onPress: () => void }) {
  const price = order.averageFillPrice
    ? `Avg ${formatINR(order.averageFillPrice)}`
    : order.price !== null
      ? formatINR(order.price)
      : ORDER_TYPE_LABEL[order.orderType];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${order.side} ${order.quantity} ${order.tradingsymbol}, ${ORDER_STATUS_LABEL[order.status]}`}
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
            {order.tradingsymbol}
          </Text>
        </View>
        <Text
          className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted"
          style={NUMBERS}
          numberOfLines={1}
        >
          {formatQuantity(order.filledQuantity)}/{formatQuantity(order.quantity)} · {price} ·{' '}
          {brokerOf(order)}
        </Text>
        {order.rejectionReason ? (
          <Text
            className="mt-0.5 text-xs text-ink-faint dark:text-ink-dark-faint"
            numberOfLines={1}
          >
            {order.rejectionReason}
          </Text>
        ) : null}
      </View>
      <View className="items-end gap-1">
        <Badge label={ORDER_STATUS_LABEL[order.status]} variant={orderStatusTone(order.status)} />
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {istTime(order.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}

function LiveOrderSheet({
  order,
  onClose,
  onModify,
}: {
  order: LiveOrder;
  onClose: () => void;
  onModify: () => void;
}) {
  const router = useRouter();
  const now = useNow();
  const { cancel } = useLiveOrderMutations();
  const working = WORKING_AT_BROKER.has(order.status);
  const equity = isEquityOrder(order);
  const broker = brokerOf(order);

  const confirmCancel = () =>
    Alert.alert(
      'Cancel this order?',
      `${order.side} ${formatQuantity(order.quantity)} ${order.tradingsymbol} at ${broker}. Anything already filled stays filled.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel order',
          style: 'destructive',
          onPress: () =>
            cancel.mutate(order.id, {
              onSuccess: () => {
                toast.success('Cancel sent', `${order.tradingsymbol} is being cancelled.`);
                onClose();
              },
              onError: (error) => toast.error('Couldn’t cancel', getErrorMessage(error)),
            }),
        },
      ],
    );

  const failedChecks = (order.riskDecision?.checks ?? []).filter((check) => !check.passed);

  return (
    <Sheet
      visible
      onClose={onClose}
      busy={cancel.isPending}
      title={`${order.side === 'BUY' ? 'Buy' : 'Sell'} ${order.tradingsymbol}`}
      subtitle={`${order.exchange} · ${broker} · real order`}
      footer={
        working ? (
          <View className="flex-row gap-2.5">
            {equity ? (
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
        ) : equity ? (
          <Button
            label="View stock"
            variant="outline"
            fullWidth
            onPress={() => {
              onClose();
              afterSheetClose(() => router.push(stockHref(order.tradingsymbol, order.exchange)));
            }}
          />
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
        value={`${ORDER_TYPE_LABEL[order.orderType]} · ${order.product}`}
        divider
      />
      {order.price !== null ? (
        <KeyValueRow label="Price" value={formatINR(order.price)} divider />
      ) : null}
      {order.triggerPrice !== null ? (
        <KeyValueRow label="Trigger" value={formatINR(order.triggerPrice)} divider />
      ) : null}
      <KeyValueRow
        label="Average fill"
        value={order.averageFillPrice ? formatINR(order.averageFillPrice) : '—'}
        divider
      />
      <KeyValueRow
        label="Placed"
        value={`${dayLabel(istDateOf(order.createdAt) ?? '', now)}, ${istTime(order.createdAt)}`}
        divider
      />
      {order.brokerOrderId ? (
        <KeyValueRow label={`${broker} order no.`} value={`#${order.brokerOrderId}`} divider />
      ) : null}

      {order.status === 'UNKNOWN' ? (
        <Banner
          className="mt-3"
          tone="warning"
          title="Waiting for confirmation"
          message={`${broker} didn't confirm in time. Don't place this order again — it resolves on its own once reconciled.`}
        />
      ) : null}
      {order.riskDecision && !order.riskDecision.approved ? (
        <Banner
          className="mt-3"
          tone="error"
          title="Blocked by risk check"
          message={[order.riskDecision.reason, ...failedChecks.map((check) => check.detail)]
            .filter(Boolean)
            .join(' · ')}
        />
      ) : null}
      {order.rejectionReason && order.status !== 'RISK_REJECTED' ? (
        <Banner className="mt-3" tone="error" message={order.rejectionReason} />
      ) : null}

      {order.events && order.events.length > 0 ? (
        <View className="mt-4">
          <Text className="mb-1 text-[13px] font-semibold text-ink dark:text-ink-dark">
            History
          </Text>
          {order.events.map((event, index) => (
            <KeyValueRow
              key={`${event.status}-${event.at}-${index}`}
              label={ORDER_STATUS_LABEL[event.status]}
              hint={event.note ?? undefined}
              value={istTime(event.at)}
              divider={index > 0}
            />
          ))}
        </View>
      ) : null}
      {working ? (
        <Note>
          {equity
            ? `A modify or cancel goes to ${broker} straight away.`
            : `A cancel goes to ${broker} straight away. Modify F&O orders from the F&O tab.`}
        </Note>
      ) : null}
    </Sheet>
  );
}
