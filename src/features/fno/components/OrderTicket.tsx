import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatQuantity } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage, isApiError } from '@/types/api';

import {
  useFnoOrderDetail,
  useFnoStatus,
  useMarginPreview,
  useOrderIntent,
  usePlaceFnoOrder,
} from '../hooks';
import { ordersBlockedReason } from '../lib/access';
import {
  availableFor,
  availableLabel,
  estimatePrice,
  isShortOfMargin,
  isTerminalStatus,
  orderValue,
  riskNote,
  unitsOf,
  valueLabel,
} from '../lib/chain';
import {
  contractTitle,
  daysUntil,
  DASH,
  dteLabel,
  expiryLabel,
  lotsLabel,
  todayIst,
} from '../lib/format';
import {
  checkContractOrder,
  maxLotsPerOrder,
  needsLimitPrice,
  needsTriggerPrice,
  parsePriceInput,
} from '../lib/orderRules';
import type {
  FnoChainLeg,
  FnoContract,
  FnoOrderType,
  FnoProduct,
  FnoSide,
  LiveOrder,
  MarginLeg,
} from '../types';

import { ContractDetails } from './ContractDetails';
import { OrderReceipt } from './OrderReceipt';
import {
  Disclosure,
  FieldLabel,
  IssueList,
  LotsStepper,
  Note,
  PriceField,
  SideToggle,
  SummaryBox,
  SummaryLine,
} from './primitives';
import { Sheet } from './Sheet';

const NUM = { fontVariant: ['tabular-nums' as const] };

export interface TicketTarget {
  contract: FnoContract;
  /** The chain leg it was opened from (greeks for the details section), if any. */
  leg: FnoChainLeg | null;
  side: FnoSide;
  lots?: number;
  product?: FnoProduct;
  /** Bumped on every open so re-opening the same contract re-seeds the form. */
  nonce: number;
}

const PRODUCTS: readonly { key: FnoProduct; label: string }[] = [
  { key: 'NRML', label: 'Carry forward' },
  { key: 'MIS', label: 'Intraday' },
];

const ORDER_TYPES: readonly { key: FnoOrderType; label: string }[] = [
  { key: 'MARKET', label: 'Market' },
  { key: 'LIMIT', label: 'Limit' },
  { key: 'SL', label: 'SL' },
  { key: 'SL-M', label: 'SL-M' },
];

type Step = 'form' | 'review' | 'result';

/**
 * THE order ticket for one F&O contract (options and futures). Places a REAL order on the
 * user's Groww account. Safety, in the order a user meets it:
 *   1. Quantity is LOTS; units and the per-order freeze limit are shown under the stepper.
 *   2. Price and trigger are checked against the tick with the server's own rules.
 *   3. Money: Groww's OWN required-margin figure beside the balance it draws on.
 *   4. REVIEW is a separate step; nothing is sent from the form.
 *   5. ONE idempotency key per intent — a retry after a timeout is the same order.
 *   6. The result is Groww's answer, verbatim, kept live until it is final.
 */
export function OrderTicket({
  target,
  ltp,
  priceStale = false,
  onClose,
}: {
  target: TicketTarget | null;
  /** The contract's latest known price (refreshed by the parent screen). */
  ltp: number | null;
  priceStale?: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const title = target ? contractTitle(target.contract) : '';
  return (
    <Sheet
      visible={target != null}
      onClose={onClose}
      busy={busy}
      title={title}
      subtitle={
        target
          ? `${expiryLabel(target.contract.expiry)} expiry · ${target.contract.exchange} · lot ${formatQuantity(target.contract.lotSize)}`
          : undefined
      }
      headerRight={
        target ? (
          <View className="items-end">
            <Text className="text-base font-bold text-ink dark:text-ink-dark" style={NUM}>
              {ltp != null ? formatINR(ltp) : DASH}
            </Text>
            <Text
              className={cn(
                'text-[11px]',
                priceStale
                  ? 'text-warning-600 dark:text-warning-dark'
                  : 'text-ink-faint dark:text-ink-dark-faint',
              )}
            >
              {priceStale ? 'may be old' : 'last price'}
            </Text>
          </View>
        ) : null
      }
    >
      {target ? (
        <TicketBody
          key={`${target.contract.exchange}:${target.contract.tradingSymbol}:${target.nonce}`}
          target={target}
          ltp={ltp}
          priceStale={priceStale}
          onBusy={setBusy}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function TicketBody({
  target,
  ltp,
  priceStale,
  onBusy,
  onClose,
}: {
  target: TicketTarget;
  ltp: number | null;
  priceStale: boolean;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { contract } = target;
  const status = useFnoStatus();
  const blockedReason = ordersBlockedReason(status.data?.groww);
  const place = usePlaceFnoOrder();
  const intent = useOrderIntent();
  const inFlight = useRef(false);

  const [side, setSide] = useState<FnoSide>(target.side);
  const [product, setProduct] = useState<FnoProduct>(target.product ?? 'NRML');
  const [orderType, setOrderType] = useState<FnoOrderType>('MARKET');
  const [lots, setLots] = useState<number>(target.lots ?? 1);
  const [priceStr, setPriceStr] = useState('');
  const [triggerStr, setTriggerStr] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [attempted, setAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<LiveOrder | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => onBusy(place.isPending), [place.isPending, onBusy]);

  // Any edit to WHAT would be sent is a new intent: its idempotency key must not be reused.
  const edit =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      intent.discard();
      setSubmitError(null);
      setter(value);
    };

  const price = needsLimitPrice(orderType) ? parsePriceInput(priceStr) : null;
  const trigger = needsTriggerPrice(orderType) ? parsePriceInput(triggerStr) : null;
  const units = unitsOf(lots, contract.lotSize);
  const maxLots = maxLotsPerOrder(contract);

  const issues = useMemo(
    () =>
      checkContractOrder({
        contract,
        side,
        orderType,
        lots,
        price,
        triggerPrice: trigger,
        today: todayIst(),
      }),
    [contract, side, orderType, lots, price, trigger],
  );
  const valid = issues.length === 0;
  // Before the first review attempt, only issues about something the user typed are shown.
  const shownIssues = attempted
    ? issues
    : issues.filter(
        (i) =>
          !(i.field === 'price' && !priceStr.trim()) &&
          !(i.field === 'triggerPrice' && !triggerStr.trim()) &&
          !(i.field === 'quantity' && lots === 0),
      );

  const marginLegs = useMemo<MarginLeg[] | null>(
    () =>
      valid
        ? [
            {
              exchange: contract.exchange,
              tradingSymbol: contract.tradingSymbol,
              side,
              lots,
              orderType,
              product,
              price,
            },
          ]
        : null,
    [valid, contract.exchange, contract.tradingSymbol, side, lots, orderType, product, price],
  );
  const margin = useMarginPreview(marginLegs, valid && !blockedReason && step !== 'result');
  const available = availableFor(margin.data?.funds, contract.kind, side);
  const required = margin.data?.required.total ?? null;
  const charges = margin.data?.required.charges ?? null;
  const short = isShortOfMargin(required, available);
  const value = orderValue(estimatePrice(orderType, price, trigger, ltp), units);
  const valueText = value != null ? formatINR(value) : DASH;
  const marginText = blockedReason
    ? DASH
    : margin.isFetching && !margin.data
      ? 'Checking…'
      : required != null
        ? formatINR(required)
        : margin.isError
          ? 'Unavailable'
          : DASH;

  // The receipt stays live until Groww's answer is final (the detail query stops polling then).
  // Keyed on the FIRST answer, so the id never flips back and forth as updates arrive.
  const trackId =
    receipt?.brokerOrderId && !isTerminalStatus(receipt.status) ? receipt.brokerOrderId : null;
  const tracked = useFnoOrderDetail(trackId);
  const shownReceipt = tracked.data?.lifecycle ?? receipt;

  const isBuy = side === 'BUY';
  const verb = isBuy ? 'buy' : 'sell';

  const openReview = () => {
    setAttempted(true);
    if (!valid || blockedReason || units === 0) return;
    intent.begin();
    setSubmitError(null);
    setStep('review');
  };

  const confirm = () => {
    // `isPending` only flips on the next render; the ref stops a double tap inside one frame
    // from sending twice (it would carry the same key, but one request is the contract).
    if (place.isPending || inFlight.current) return;
    inFlight.current = true;
    place.mutate(
      {
        exchange: contract.exchange,
        tradingSymbol: contract.tradingSymbol,
        side,
        lots,
        orderType,
        product,
        price,
        triggerPrice: trigger,
        idempotencyKey: intent.begin(),
        expectedUnderlying: contract.underlying,
        expectedExpiry: contract.expiry,
      },
      {
        onSuccess: (result) => {
          intent.settle(null);
          setReceipt(result.order);
          setStep('result');
          const bad = result.order.status === 'REJECTED' || result.order.status === 'RISK_REJECTED';
          if (!bad)
            toast.success(
              'Order sent to Groww',
              `${isBuy ? 'Buy' : 'Sell'} ${lotsLabel(lots)} · ${contract.tradingSymbol}`,
            );
        },
        onError: (error) => {
          intent.settle(error);
          // No answer (network, 5xx): the key is kept, so retrying is the SAME order.
          const retrySafe = isApiError(error) && (error.isNetworkError || error.isServerError);
          setSubmitError(
            retrySafe
              ? `${getErrorMessage(error)} Nothing is known to have been placed — tapping confirm again sends the same order, never a second one.`
              : getErrorMessage(error, 'The order could not be placed.'),
          );
        },
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  };

  if (step === 'result' && shownReceipt) {
    return (
      <View className="gap-4 pb-1">
        <OrderReceipt order={shownReceipt} live={trackId != null} />
        <Button label="Done" size="lg" fullWidth onPress={onClose} />
        <Button
          label="Open the order book"
          variant="ghost"
          fullWidth
          onPress={() => {
            onClose();
            router.push('/fno/orders');
          }}
        />
      </View>
    );
  }

  if (step === 'review') {
    return (
      <View className="gap-4 pb-1">
        <Banner
          tone="warning"
          title="Review — nothing has been sent yet"
          message="This places a REAL order on your Groww account."
        />
        <View className="rounded-xl border border-line px-3.5 py-2 dark:border-line-dark">
          <SummaryLine
            label="Order"
            value={`${isBuy ? 'BUY' : 'SELL'} ${contractTitle(contract)}`}
            valueClassName={
              isBuy
                ? 'text-brand-text dark:text-brand-text-dark'
                : 'text-danger-600 dark:text-danger-dark'
            }
          />
          <SummaryLine
            label="Contract"
            value={`${contract.tradingSymbol} · ${expiryLabel(contract.expiry)} (${dteLabel(daysUntil(contract.expiry))})`}
          />
          <SummaryLine
            label="Quantity"
            value={`${lotsLabel(lots)} × ${formatQuantity(contract.lotSize)} = ${formatQuantity(units)}`}
          />
          <SummaryLine
            label="Type"
            value={`${orderType}${price != null ? ` @ ${formatINR(price)}` : ''}${
              trigger != null ? ` · trigger ${formatINR(trigger)}` : ''
            }`}
          />
          <SummaryLine
            label="Product"
            value={product === 'MIS' ? 'Intraday (MIS)' : 'Carry forward (NRML)'}
          />
          <SummaryLine label={valueLabel(contract.kind, side)} value={valueText} strong />
          <SummaryLine
            label="Margin (Groww)"
            value={required != null ? formatINR(required) : DASH}
          />
          {charges != null ? (
            <SummaryLine label="Charges (Groww)" value={formatINR(charges)} />
          ) : null}
          <SummaryLine
            label={`Available · ${availableLabel(contract.kind, side)}`}
            value={available != null ? formatINR(available) : DASH}
          />
        </View>
        {priceStale && orderType === 'MARKET' ? (
          <Banner
            tone="warning"
            message="Prices may be old. A market order fills at the live price, not the one shown."
          />
        ) : null}
        {short ? (
          <Banner
            tone="warning"
            message={`Groww says this needs ${formatINR(required)}; ${formatINR(available)} is available. It will be refused unless funds are added.`}
          />
        ) : null}
        {side === 'SELL' && contract.kind === 'CE' ? (
          <Banner
            tone="error"
            message={`You are writing a call. Its loss is unlimited if ${contract.underlying} rises.`}
          />
        ) : null}
        <Note>
          The risk engine checks this order again on the server before it reaches Groww; Groww then
          applies its own checks.
        </Note>
        {submitError ? <Banner tone="error" message={submitError} /> : null}
        <Button
          label={place.isPending ? 'Placing with Groww…' : `Confirm ${verb} · ${lotsLabel(lots)}`}
          size="lg"
          fullWidth
          variant={isBuy ? 'primary' : 'danger'}
          loading={place.isPending}
          onPress={confirm}
          accessibilityLabel={`Confirm ${verb} ${lotsLabel(lots)} of ${contractTitle(contract)}`}
        />
        <Button
          label="Edit order"
          variant="ghost"
          fullWidth
          disabled={place.isPending}
          onPress={() => setStep('form')}
        />
      </View>
    );
  }

  return (
    <View className="gap-4 pb-1">
      <View className="self-start rounded-md bg-danger-wash px-2 py-1 dark:bg-danger-wash-dark">
        <Text className="text-[11px] font-bold text-danger-600 dark:text-danger-dark">
          LIVE — real order via Groww
        </Text>
      </View>

      <SideToggle value={side} onChange={edit(setSide)} disabled={place.isPending} />

      <View>
        <FieldLabel>Product</FieldLabel>
        <SegmentedControl items={PRODUCTS} value={product} onChange={edit(setProduct)} />
      </View>

      <View>
        <FieldLabel>Lots</FieldLabel>
        <LotsStepper value={lots} onChange={edit(setLots)} max={maxLots} />
        <Text className="mt-1.5 text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
          {lots > 0
            ? `${lotsLabel(lots)} × ${formatQuantity(contract.lotSize)} = ${formatQuantity(units)} qty`
            : `Lot size ${formatQuantity(contract.lotSize)}`}
          {maxLots != null ? ` · max ${maxLots} lots per order` : ''}
        </Text>
      </View>

      <View>
        <FieldLabel>Order type</FieldLabel>
        <SegmentedControl items={ORDER_TYPES} value={orderType} onChange={edit(setOrderType)} />
      </View>

      {needsLimitPrice(orderType) || needsTriggerPrice(orderType) ? (
        <View className="flex-row gap-3">
          {needsTriggerPrice(orderType) ? (
            <PriceField
              label="Trigger"
              value={triggerStr}
              onChange={edit(setTriggerStr)}
              placeholder={contract.tickSize ? `tick ₹${contract.tickSize}` : undefined}
            />
          ) : null}
          {needsLimitPrice(orderType) ? (
            <PriceField
              label="Limit price"
              value={priceStr}
              onChange={edit(setPriceStr)}
              placeholder={contract.tickSize ? `tick ₹${contract.tickSize}` : undefined}
              action={
                ltp != null
                  ? { label: 'Use LTP', onPress: () => edit(setPriceStr)(ltp.toFixed(2)) }
                  : undefined
              }
            />
          ) : null}
        </View>
      ) : null}

      <SummaryBox>
        <SummaryLine label={valueLabel(contract.kind, side)} value={valueText} strong />
        <SummaryLine label="Margin required (Groww)" value={marginText} />
        {charges != null ? (
          <SummaryLine label="Brokerage & charges (Groww)" value={formatINR(charges)} />
        ) : null}
        <SummaryLine
          label={`Available · ${availableLabel(contract.kind, side)}`}
          value={available != null ? formatINR(available) : DASH}
        />
      </SummaryBox>

      <IssueList issues={shownIssues} />
      {blockedReason ? (
        <Banner
          tone="warning"
          message={blockedReason}
          action={{
            label: 'Connect broker',
            onPress: () => {
              onClose();
              router.push('/brokers');
            },
          }}
        />
      ) : null}
      {short ? (
        <Banner
          tone="warning"
          message={`Groww says this order needs ${formatINR(required)}; ${formatINR(available)} is available. It will be refused unless funds are added.`}
        />
      ) : null}
      {priceStale && orderType === 'MARKET' ? (
        <Banner
          tone="warning"
          message="Prices may be old. A market order fills at the current price, whatever this screen shows."
        />
      ) : null}
      {margin.isError && !blockedReason ? (
        <Note>Groww’s margin calculator did not answer: {getErrorMessage(margin.error)}</Note>
      ) : null}

      <Note>{riskNote(contract.kind, side)}</Note>

      <Button
        label={
          blockedReason
            ? 'Orders unavailable'
            : `Review ${verb} · ${lotsLabel(lots > 0 ? lots : 0)}`
        }
        size="lg"
        fullWidth
        variant={isBuy ? 'primary' : 'danger'}
        disabled={Boolean(blockedReason) || place.isPending}
        onPress={openReview}
      />

      <Disclosure
        title="Contract details"
        meta="Quote, greeks and market depth"
        onToggle={setDetailsOpen}
      >
        <ContractDetails contract={contract} leg={target.leg} enabled={detailsOpen} />
      </Disclosure>
    </View>
  );
}
