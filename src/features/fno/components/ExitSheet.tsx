import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Tabs';
import { SafeModeNotice } from '@/features/account/components/SafeMode';
import { useSafeModeOn, useSafeModeRefusalSync } from '@/features/account/hooks';
import { formatINR, formatQuantity } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage, isApiError } from '@/types/api';

import { useExitFnoPosition, useOrderIntent } from '../hooks';
import { exitPlan } from '../lib/chain';
import { isEquityFnoExchange } from '../lib/explore';
import { contractTitle, DASH, lotsLabel, todayIst } from '../lib/format';
import { checkContractOrder, parsePriceInput, type ContractRuleIssue } from '../lib/orderRules';
import type { FnoPositionRow, LiveOrder } from '../types';

import { OrderReceipt } from './OrderReceipt';
import {
  FieldLabel,
  IssueList,
  LotsStepper,
  Note,
  PillButton,
  PriceField,
  SummaryLine,
} from './primitives';
import { Sheet } from './Sheet';

const ORDER_TYPES = [
  { key: 'MARKET', label: 'Market' },
  { key: 'LIMIT', label: 'Limit' },
] as const;

type Step = 'form' | 'review' | 'result';

/**
 * Exit all or part of one position — a REAL order on the opposite side, never more than is
 * held (the server refuses a larger "exit", which would open a new position the other way).
 * Choose, review, confirm; the confirm button says exactly what will be sent.
 */
export function ExitSheet({
  position,
  ltp,
  onClose,
}: {
  position: FnoPositionRow | null;
  ltp: number | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const title = position
    ? `Exit ${position.contract ? contractTitle(position.contract) : position.tradingSymbol}`
    : 'Exit';
  return (
    <Sheet
      visible={position != null}
      onClose={onClose}
      busy={busy}
      title={title}
      subtitle={
        position
          ? `${position.side === 'LONG' ? 'Long' : 'Short'} ${formatQuantity(Math.abs(position.netQuantity))} qty · ${position.product} · last ${ltp != null ? formatINR(ltp) : DASH}`
          : undefined
      }
    >
      {position ? (
        <ExitBody
          key={`${position.exchange}:${position.tradingSymbol}:${position.product}`}
          position={position}
          ltp={ltp}
          onBusy={setBusy}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function ExitBody({
  position,
  ltp,
  onBusy,
  onClose,
}: {
  position: FnoPositionRow;
  ltp: number | null;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const c = position.contract;
  const plan = exitPlan(position);
  const exit = useExitFnoPosition();
  // An exit is a real order too: Safe Mode blocks it like any other (server-side as well).
  const safeMode = useSafeModeOn();
  const syncSafeMode = useSafeModeRefusalSync();
  const intent = useOrderIntent();
  const inFlight = useRef(false);
  const [lots, setLots] = useState(plan.wholeLots ? plan.openLots : 0);
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [priceStr, setPriceStr] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<LiveOrder | null>(null);

  useEffect(() => onBusy(exit.isPending), [exit.isPending, onBusy]);

  const edit =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      intent.discard();
      setSubmitError(null);
      setStep('form');
      setter(value);
    };

  const price = orderType === 'LIMIT' ? parsePriceInput(priceStr) : null;
  const issues = useMemo<ContractRuleIssue[]>(() => {
    if (!c) {
      return [
        {
          field: 'quantity',
          message:
            'This contract is not in Groww’s instrument master, so the exit cannot be sized here.',
        },
      ];
    }
    const out = checkContractOrder({
      contract: c,
      side: plan.side,
      orderType,
      lots,
      price,
      triggerPrice: null,
      today: todayIst(),
    }).filter((i) => i.field !== 'expiry');
    if (lots > plan.openLots) {
      out.push({
        field: 'quantity',
        message: `You hold ${lotsLabel(plan.openLots)} — an exit cannot be larger than the position`,
      });
    }
    return out;
  }, [c, plan.side, plan.openLots, orderType, lots, price]);
  const shownIssues = issues.filter((i) => !(i.field === 'price' && !priceStr.trim()));
  const canReview = issues.length === 0 && lots >= 1 && !safeMode && !exit.isPending;

  const confirm = () => {
    // The ref stops a double tap inside one frame, before `isPending` has re-rendered.
    if (exit.isPending || inFlight.current) return;
    // Groww positions are NSE / BSE F&O only; a commodity book takes no orders (server 422).
    const exchange = position.exchange;
    if (!isEquityFnoExchange(exchange)) return;
    inFlight.current = true;
    exit.mutate(
      {
        exchange,
        tradingSymbol: position.tradingSymbol,
        product: position.product === 'MIS' ? 'MIS' : 'NRML',
        lots,
        orderType,
        price,
        idempotencyKey: intent.begin(),
      },
      {
        onSuccess: (res) => {
          intent.settle(null);
          setResult(res.order);
          setStep('result');
          const bad = res.order.status === 'REJECTED' || res.order.status === 'RISK_REJECTED';
          if (!bad)
            toast.success(
              'Exit sent to Groww',
              `${plan.side === 'SELL' ? 'Sell' : 'Buy'} ${lotsLabel(lots)} · ${position.tradingSymbol}`,
            );
        },
        onError: (err) => {
          intent.settle(err);
          syncSafeMode(err);
          const retrySafe = isApiError(err) && (err.isNetworkError || err.isServerError);
          setSubmitError(
            retrySafe
              ? `${getErrorMessage(err)} Nothing is known to have been sent — confirming again sends the same exit, never a second one.`
              : getErrorMessage(err),
          );
        },
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  };

  if (step === 'result' && result) {
    return (
      <View className="gap-4 pb-1">
        <OrderReceipt order={result} />
        <Button label="Done" size="lg" fullWidth onPress={onClose} />
      </View>
    );
  }

  const verb = plan.side === 'SELL' ? 'Sell' : 'Buy';
  const priceLabel =
    orderType === 'MARKET'
      ? 'at market'
      : price != null && Number.isFinite(price)
        ? `at ${formatINR(price)}`
        : '';

  if (step === 'review') {
    return (
      <View className="gap-4 pb-1">
        <View className="rounded-xl border border-line px-3.5 py-2 dark:border-line-dark">
          <SummaryLine
            label="Exit order"
            value={`${verb.toUpperCase()} ${position.tradingSymbol}`}
          />
          <SummaryLine
            label="Quantity"
            value={
              c
                ? `${lotsLabel(lots)} × ${formatQuantity(c.lotSize)} = ${formatQuantity(lots * c.lotSize)}`
                : lotsLabel(lots)
            }
          />
          <SummaryLine
            label="Type"
            value={orderType === 'MARKET' ? 'Market' : `Limit @ ${formatINR(price)}`}
          />
          <SummaryLine label="Product" value={position.product} />
          <SummaryLine label="Last price" value={ltp != null ? formatINR(ltp) : DASH} />
        </View>
        <Banner
          tone="warning"
          title="A real order"
          message={`This ${verb.toLowerCase()}s on your Groww account.${orderType === 'MARKET' ? ' A market order fills at the live price, which can differ from the last price shown.' : ''}`}
        />
        {safeMode ? <SafeModeNotice action="exit" onLeave={onClose} /> : null}
        {submitError ? <Banner tone="error" message={submitError} /> : null}
        <Button
          label={
            exit.isPending
              ? 'Sending…'
              : `Confirm ${verb.toLowerCase()} ${lotsLabel(lots)} ${priceLabel}`.trim()
          }
          size="lg"
          fullWidth
          variant={plan.side === 'SELL' ? 'danger' : 'primary'}
          loading={exit.isPending}
          disabled={safeMode}
          onPress={confirm}
        />
        <Button
          label="Edit"
          variant="ghost"
          fullWidth
          disabled={exit.isPending}
          onPress={() => setStep('form')}
        />
      </View>
    );
  }

  return (
    <View className="gap-4 pb-1">
      <View>
        <FieldLabel>Lots to exit</FieldLabel>
        <LotsStepper
          value={lots}
          onChange={edit(setLots)}
          max={plan.wholeLots ? plan.openLots : null}
        />
        <View className="mt-2 flex-row items-center gap-2">
          <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted">
            {c ? `You hold ${lotsLabel(plan.openLots)} (lot ${formatQuantity(c.lotSize)})` : ''}
          </Text>
          {plan.openLots >= 2 && plan.wholeLots ? (
            <PillButton label="Half" onPress={() => edit(setLots)(Math.floor(plan.openLots / 2))} />
          ) : null}
          <PillButton
            label="All"
            disabled={!plan.wholeLots}
            onPress={() => edit(setLots)(plan.openLots)}
          />
        </View>
      </View>
      <View>
        <FieldLabel>Order type</FieldLabel>
        <SegmentedControl items={ORDER_TYPES} value={orderType} onChange={edit(setOrderType)} />
      </View>
      {orderType === 'LIMIT' ? (
        <PriceField
          label="Limit price"
          value={priceStr}
          onChange={edit(setPriceStr)}
          placeholder={c?.tickSize ? `tick ₹${c.tickSize}` : undefined}
          action={
            ltp != null
              ? { label: 'Use LTP', onPress: () => edit(setPriceStr)(ltp.toFixed(2)) }
              : undefined
          }
        />
      ) : null}
      <IssueList issues={shownIssues} />
      {c && !plan.wholeLots ? (
        <Banner
          tone="warning"
          message={`Groww reports ${formatQuantity(Math.abs(position.netQuantity))} qty, which is not a whole number of ${formatQuantity(c.lotSize)}-unit lots. Orders here are in whole lots — exit any remainder from the Groww app.`}
        />
      ) : null}
      {safeMode ? <SafeModeNotice action="exit" onLeave={onClose} /> : null}
      <Note>
        An exit is placed on the opposite side of the position and never exceeds what you hold.
      </Note>
      <Button
        label={safeMode ? 'Safe Mode is on' : 'Review exit'}
        size="lg"
        fullWidth
        variant={plan.side === 'SELL' ? 'danger' : 'primary'}
        disabled={!canReview}
        onPress={() => {
          intent.begin();
          setStep('review');
        }}
      />
    </View>
  );
}
