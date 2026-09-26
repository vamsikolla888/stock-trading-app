import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleX from 'lucide-react-native/icons/circle-x';
import Clock from 'lucide-react-native/icons/clock';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import React from 'react';
import { Text, View } from 'react-native';

import { formatINR, formatQuantity } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { isTerminalStatus, STATUS_TEXT, statusLabel } from '../lib/chain';
import { lotsLabel } from '../lib/format';
import type { LiveOrder, LiveOrderStatus } from '../types';

type Tone = 'success' | 'pending' | 'warning' | 'danger';

function toneOf(status: LiveOrderStatus): Tone {
  if (status === 'FILLED') return 'success';
  if (status === 'REJECTED' || status === 'RISK_REJECTED') return 'danger';
  if (status === 'UNKNOWN' || status === 'CANCELLED') return 'warning';
  return 'pending';
}

/**
 * What GROWW said about an order, verbatim: never "placed" for an order the risk engine
 * refused, never "failed" for one Groww did not confirm (UNKNOWN — do not resubmit).
 */
export function OrderReceipt({ order, live }: { order: LiveOrder; live?: boolean }) {
  const { colors } = useTheme();
  const tone = toneOf(order.status);
  const icon = {
    success: {
      Icon: CircleCheck,
      color: colors.success,
      bg: 'bg-brand-wash dark:bg-brand-wash-dark',
    },
    pending: { Icon: Clock, color: colors.info, bg: 'bg-info-wash dark:bg-info-wash-dark' },
    warning: {
      Icon: TriangleAlert,
      color: colors.warning,
      bg: 'bg-warning-wash dark:bg-warning-wash-dark',
    },
    danger: { Icon: CircleX, color: colors.danger, bg: 'bg-danger-wash dark:bg-danger-wash-dark' },
  }[tone];
  const notes: string[] = [];
  if (order.status === 'UNKNOWN') {
    notes.push(
      'Groww did not confirm in time. Do not place this order again — it resolves on its own once reconciled.',
    );
  }
  if (order.riskDecision && !order.riskDecision.approved) {
    if (order.riskDecision.reason) notes.push(order.riskDecision.reason);
    for (const check of order.riskDecision.checks.filter((c) => !c.passed))
      notes.push(check.detail);
  }
  if (order.rejectionReason && order.status !== 'RISK_REJECTED') notes.push(order.rejectionReason);
  if (
    (order.status === 'FILLED' || order.status === 'PARTIALLY_FILLED') &&
    order.averageFillPrice != null
  ) {
    notes.push(
      `${formatQuantity(order.filledQuantity)} qty filled at ${formatINR(order.averageFillPrice)}`,
    );
  }
  if (order.brokerOrderId) notes.push(`Groww order ${order.brokerOrderId}`);

  return (
    <View accessibilityLiveRegion="polite" className="items-center gap-3 pt-4">
      <View className={`h-16 w-16 items-center justify-center rounded-full ${icon.bg}`}>
        <icon.Icon size={30} color={icon.color} />
      </View>
      <Text className="text-center text-lg font-bold text-ink dark:text-ink-dark">
        {STATUS_TEXT[order.status] ?? statusLabel(order.status)}
      </Text>
      <Text className="text-center text-sm text-ink-muted dark:text-ink-dark-muted">
        {order.side === 'BUY' ? 'Buy' : 'Sell'} {lotsLabel(order.quantity)} · {order.tradingsymbol}
        {order.orderType !== 'MARKET' && order.price != null ? ` @ ${formatINR(order.price)}` : ''}
      </Text>
      {notes.map((note) => (
        <Text
          key={note}
          className="max-w-[340px] text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted"
        >
          {note}
        </Text>
      ))}
      {live && !isTerminalStatus(order.status) ? (
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
          Updating from Groww every few seconds…
        </Text>
      ) : null}
    </View>
  );
}
