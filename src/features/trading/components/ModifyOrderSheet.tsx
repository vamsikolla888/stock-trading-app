import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SafeModeNotice } from '@/features/account/components/SafeMode';
import { useSafeModeOn, useSafeModeRefusalSync } from '@/features/account/hooks';
import { formatQuantity } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage } from '@/types/api';

import { useLiveOrderMutations } from '../hooks';
import { needsPriceField, needsTriggerField, validateModify } from '../lib/liveOrders';

import { FieldLabel, PriceInput, QuantityStepper } from './OrderInputs';
import { Note, Sheet } from './Sheet';

export interface ModifiableOrder {
  /** This app's live order id — what PATCH /live-trading/orders/:id takes. */
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: string;
  quantity: number;
  price: number | null;
  triggerPrice: number | null;
  filledQuantity: number;
  brokerLabel: string;
}

/**
 * Edits a working REAL order: quantity, plus limit / trigger where the type has one. Sends
 * only what changed; the server resends the rest to the broker as-is. A modify is a real
 * instruction to the exchange, so it says so plainly before the save.
 */
export function ModifyOrderSheet({
  order,
  onClose,
}: {
  order: ModifiableOrder;
  onClose: () => void;
}) {
  const { modify } = useLiveOrderMutations();
  // Safe Mode blocks a modify (a real order change); cancelling stays available.
  const safeMode = useSafeModeOn();
  const syncSafeMode = useSafeModeRefusalSync();
  const [quantity, setQuantity] = useState(String(order.quantity));
  const [price, setPrice] = useState(order.price !== null ? String(order.price) : '');
  const [trigger, setTrigger] = useState(
    order.triggerPrice !== null ? String(order.triggerPrice) : '',
  );
  const { changes, error } = validateModify(order, { quantity, price, triggerPrice: trigger });

  const save = () => {
    if (!changes || safeMode || modify.isPending) return;
    modify.mutate(
      { id: order.id, changes },
      {
        onSuccess: () => {
          toast.success('Order modified', `${order.symbol} was updated at ${order.brokerLabel}.`);
          onClose();
        },
        onError: syncSafeMode,
      },
    );
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      busy={modify.isPending}
      title={`Modify ${order.side === 'BUY' ? 'buy' : 'sell'} · ${order.symbol}`}
      subtitle={`${order.orderType} · ${order.brokerLabel} · real order`}
      footer={
        <Button
          label="Save changes"
          size="lg"
          fullWidth
          disabled={!changes || safeMode}
          loading={modify.isPending}
          onPress={save}
        />
      }
    >
      <View className="gap-4">
        <View>
          <FieldLabel>Quantity</FieldLabel>
          <QuantityStepper value={quantity} onChange={setQuantity} max={100_000} />
          {order.filledQuantity > 0 ? (
            <Note>
              {formatQuantity(order.filledQuantity)} already filled — the quantity can't go below
              that.
            </Note>
          ) : null}
        </View>
        {needsPriceField(order.orderType) || needsTriggerField(order.orderType) ? (
          <View className="flex-row gap-3">
            {needsPriceField(order.orderType) ? (
              <PriceInput label="Price" value={price} onChange={setPrice} />
            ) : null}
            {needsTriggerField(order.orderType) ? (
              <PriceInput label="Trigger price" value={trigger} onChange={setTrigger} />
            ) : null}
          </View>
        ) : null}
        {error ? (
          <Text className="text-xs text-danger-600 dark:text-danger-dark">{error}</Text>
        ) : null}
        {safeMode ? <SafeModeNotice action="modify" onLeave={onClose} /> : null}
        {modify.error ? <Banner tone="error" message={getErrorMessage(modify.error)} /> : null}
        <Note>
          The change goes to {order.brokerLabel} straight away. If part of the order fills before it
          lands, the filled part stays filled.
        </Note>
      </View>
    </Sheet>
  );
}
