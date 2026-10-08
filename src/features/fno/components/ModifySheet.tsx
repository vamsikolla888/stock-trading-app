import CircleCheck from 'lucide-react-native/icons/circle-check';
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SafeModeNotice } from '@/features/account/components/SafeMode';
import { useSafeModeOn, useSafeModeRefusalSync } from '@/features/account/hooks';
import { formatINR, formatQuantity } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { useModifyFnoOrder } from '../hooks';
import { modifyBody } from '../lib/chain';
import { contractTitle, DASH, lotsLabel } from '../lib/format';
import {
  checkContractOrder,
  parsePriceInput,
  requestLimitIssues,
  type ContractRuleIssue,
} from '../lib/orderRules';
import type { FnoOrderRow } from '../types';

import { FieldLabel, IssueList, LotsStepper, Note, PriceField, SummaryLine } from './primitives';
import { Sheet } from './Sheet';

/**
 * Modify a working LIMIT / SL / SL-M order — lots, limit and trigger. Only what changed is
 * sent, after a review step; the book then shows what GROWW does with the change.
 */
export function ModifySheet({
  order,
  onClose,
}: {
  order: FnoOrderRow | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      visible={order != null}
      onClose={onClose}
      busy={busy}
      title={
        order
          ? `Modify ${order.contract ? contractTitle(order.contract) : order.tradingSymbol}`
          : 'Modify'
      }
      subtitle={
        order
          ? `${order.side ?? DASH} · ${order.orderType ?? DASH} · ${order.product ?? DASH} · filled ${formatQuantity(order.filledQuantity)}/${order.quantity != null ? formatQuantity(order.quantity) : DASH}`
          : undefined
      }
    >
      {order ? (
        <ModifyBody key={order.growwOrderId} order={order} onBusy={setBusy} onClose={onClose} />
      ) : null}
    </Sheet>
  );
}

function ModifyBody({
  order,
  onBusy,
  onClose,
}: {
  order: FnoOrderRow;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const modify = useModifyFnoOrder();
  // A modify can raise the size or move a price into the market: Safe Mode blocks it. A cancel
  // only removes exposure and stays available.
  const safeMode = useSafeModeOn();
  const syncSafeMode = useSafeModeRefusalSync();
  // Without Groww's lot count the size cannot be shown or changed here — only prices.
  const sizable = order.lots != null && order.contract != null;
  const [lots, setLots] = useState(order.lots ?? 0);
  const [priceStr, setPriceStr] = useState(order.price != null ? String(order.price) : '');
  const [triggerStr, setTriggerStr] = useState(
    order.triggerPrice != null ? String(order.triggerPrice) : '',
  );
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => onBusy(modify.isPending), [modify.isPending, onBusy]);

  const type = (
    order.orderType === 'SL' || order.orderType === 'SL-M' ? order.orderType : 'LIMIT'
  ) as 'LIMIT' | 'SL' | 'SL-M';
  const price = type === 'SL-M' ? null : parsePriceInput(priceStr);
  const trigger = type === 'LIMIT' ? null : parsePriceInput(triggerStr);
  const c = order.contract;

  const issues = useMemo<ContractRuleIssue[]>(() => {
    const out = c
      ? checkContractOrder({
          contract: c,
          side: order.side ?? 'BUY',
          orderType: type,
          // An unsizable order is checked at a stand-in of one lot: only its prices can change.
          lots: sizable ? lots : 1,
          price,
          triggerPrice: trigger,
          today: '0000-00-00',
        }).filter((i) => i.field !== 'side' && i.field !== 'expiry')
      : [];
    if (sizable) out.push(...requestLimitIssues(lots));
    const filledLots = c ? order.filledQuantity / c.lotSize : 0;
    if (sizable && c && lots < filledLots) {
      out.push({
        field: 'quantity',
        message: `Quantity cannot go below the ${lotsLabel(filledLots)} already filled`,
      });
    }
    return out;
  }, [c, sizable, order.side, order.filledQuantity, type, lots, price, trigger]);

  const body = modifyBody(order, { lots: sizable ? lots : null, price, triggerPrice: trigger });
  const changed = Object.keys(body).length > 0;
  const summary = [
    body.lots != null ? lotsLabel(body.lots) : null,
    body.price != null ? `limit ${formatINR(body.price)}` : null,
    body.triggerPrice != null ? `trigger ${formatINR(body.triggerPrice)}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const edit =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setReviewing(false);
      modify.reset();
      setter(value);
    };

  if (modify.isSuccess) {
    return (
      <View className="items-center gap-3 pb-1 pt-4">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-wash dark:bg-brand-wash-dark">
          <CircleCheck size={30} color={colors.success} />
        </View>
        <Text className="text-center text-lg font-bold text-ink dark:text-ink-dark">
          Modification sent to Groww
        </Text>
        <Text className="text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          The order book shows what Groww does with it — a request is not a change until Groww
          reports it.
        </Text>
        <Button label="Done" size="lg" fullWidth onPress={onClose} className="mt-2" />
      </View>
    );
  }

  return (
    <View className="gap-4 pb-1">
      {sizable && c ? (
        <View>
          <FieldLabel>{`Lots (lot ${formatQuantity(c.lotSize)})`}</FieldLabel>
          <LotsStepper value={lots} onChange={edit(setLots)} />
        </View>
      ) : (
        <Note>
          Groww did not report this order’s size in lots, so only its prices can be changed here.
        </Note>
      )}
      <View className="flex-row gap-3">
        {type !== 'LIMIT' ? (
          <PriceField label="Trigger" value={triggerStr} onChange={edit(setTriggerStr)} />
        ) : null}
        {type !== 'SL-M' ? (
          <PriceField label="Limit price" value={priceStr} onChange={edit(setPriceStr)} />
        ) : null}
      </View>
      <IssueList issues={issues} />
      {reviewing ? (
        <View className="rounded-xl border border-line px-3.5 py-2 dark:border-line-dark">
          <SummaryLine label="Order" value={order.growwOrderId} />
          <SummaryLine label="Change to" value={summary || DASH} strong />
        </View>
      ) : (
        <Note>Only what you change is sent. Whatever has already filled stays filled.</Note>
      )}
      {safeMode ? <SafeModeNotice action="modify" onLeave={onClose} /> : null}
      {modify.isError ? <Banner tone="error" message={getErrorMessage(modify.error)} /> : null}
      {reviewing ? (
        <>
          <Button
            label={modify.isPending ? 'Sending…' : 'Confirm change'}
            size="lg"
            fullWidth
            loading={modify.isPending}
            disabled={safeMode}
            onPress={() =>
              modify.mutate(
                { id: order.growwOrderId, body },
                {
                  onSuccess: () => toast.success('Modification sent to Groww'),
                  onError: syncSafeMode,
                },
              )
            }
          />
          <Button
            label="Edit"
            variant="ghost"
            fullWidth
            disabled={modify.isPending}
            onPress={() => setReviewing(false)}
          />
        </>
      ) : (
        <Button
          label="Review change"
          size="lg"
          fullWidth
          disabled={!changed || issues.length > 0 || safeMode}
          onPress={() => setReviewing(true)}
        />
      )}
    </View>
  );
}
