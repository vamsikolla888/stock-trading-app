import React, { memo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { formatINR, formatQuantity } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { statusLabel, statusTone } from '../lib/chain';
import { contractTitle, DASH, expiryLabel, lotsLabel, timeIst } from '../lib/format';
import type { FnoOrderRow } from '../types';

import { PillButton, SideTag } from './primitives';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * One order in today's Groww F&O book. STATUS IS GROWW'S: the mapped status drives the badge
 * and filters, and Groww's own word is shown beside it.
 */
export const OrderCard = memo(function OrderCard({
  order,
  cancelling,
  onOpen,
  onModify,
  onCancel,
}: {
  order: FnoOrderRow;
  cancelling: boolean;
  onOpen: (o: FnoOrderRow) => void;
  onModify: (o: FnoOrderRow) => void;
  onCancel: (o: FnoOrderRow) => void;
}) {
  const { colors } = useTheme();
  const o = order;
  const title = o.contract ? contractTitle(o.contract) : o.tradingSymbol;
  const priceText =
    o.price != null
      ? formatINR(o.price)
      : o.orderType === 'MARKET' || o.orderType === 'SL-M'
        ? 'Market'
        : DASH;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${o.side ?? ''} ${title}, ${statusLabel(o.status)}. Opens order details`}
      onPress={() => onOpen(o)}
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
        <Badge label={statusLabel(o.status)} variant={statusTone(o.status)} />
      </View>
      <View className="flex-row items-center gap-2">
        <Text
          className="min-w-0 flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
          numberOfLines={1}
        >
          {o.contract ? `${expiryLabel(o.contract.expiry)} · ` : ''}
          {o.orderType ?? DASH} · {o.product ?? DASH}
          {o.liveOrderId ? ' · placed here' : ''}
        </Text>
        <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          {timeIst(o.placedAt)}
        </Text>
      </View>
      <Text className="text-xs text-ink dark:text-ink-dark" style={NUM} numberOfLines={2}>
        Qty {formatQuantity(o.filledQuantity)}/
        {o.quantity != null ? formatQuantity(o.quantity) : DASH}
        {o.lots != null ? ` (${lotsLabel(o.lots)})` : ''} · {priceText}
        {o.triggerPrice != null ? ` · trigger ${formatINR(o.triggerPrice)}` : ''}
        {o.averagePrice != null ? ` · avg ${formatINR(o.averagePrice)}` : ''}
      </Text>
      {o.growwStatus || (o.status === 'REJECTED' && o.remark) ? (
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={2}>
          Groww: {o.growwStatus ?? DASH}
          {o.status === 'REJECTED' && o.remark ? ` · ${o.remark}` : ''}
        </Text>
      ) : null}
      {o.canModify || o.canCancel ? (
        <View className="mt-1 flex-row items-center justify-end gap-2">
          {cancelling ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          {o.canModify ? (
            <PillButton
              label="Modify"
              onPress={() => onModify(o)}
              disabled={cancelling}
              accessibilityLabel={`Modify ${title}`}
            />
          ) : null}
          {o.canCancel ? (
            <PillButton
              label="Cancel"
              onPress={() => onCancel(o)}
              disabled={cancelling}
              accessibilityLabel={`Cancel ${title}`}
            />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
});
