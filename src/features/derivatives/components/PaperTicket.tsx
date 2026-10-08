import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleX from 'lucide-react-native/icons/circle-x';
import Clock from 'lucide-react-native/icons/clock';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Tabs';
import {
  FieldLabel,
  LotsStepper,
  Note,
  PillButton,
  PriceField,
  SideToggle,
  SummaryBox,
  SummaryLine,
} from '@/features/fno/components/primitives';
import { Sheet } from '@/features/fno/components/Sheet';
import {
  contractTitle,
  DASH,
  daysUntil,
  dteLabel,
  expiryLabel,
  ivPct,
  lotsLabel,
  signedGreek,
  timeIst,
  venueOf,
} from '@/features/fno/lib/format';
import { useLiveQuote } from '@/features/market/live';
import { useDebounce } from '@/hooks/useDebounce';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatQuantity, formatSignedINR } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { isServerOutdated } from '@/services/api/contract';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage, isApiError } from '@/types/api';

import {
  isPreviewUnavailable,
  useCancelPaperFnoOrder,
  usePaperFnoWallet,
  usePaperOrderPreview,
  usePaperOrders,
  usePlacePaperOrder,
} from '../hooks';
import {
  chargeLines,
  legOrderValue,
  PAPER_ORDERS_LIMIT,
  parseLimitPrice,
  QUICK_LOTS,
} from '../lib/book';
import {
  commitLabel,
  estimateValue,
  inputSignature,
  marketStateWords,
  maxLossLabel,
  maxLotsFor,
  onTick,
  outcomeWords,
  priceSourceWord,
  previewSignature,
  receiptWords,
  riskSentence,
  snapToTick,
  stepPrice,
  type PaperContract,
} from '../lib/paperFno';
import { paperBookHref } from '../lib/routes';
import type {
  FnoOrderPreview,
  FnoOrderType,
  FnoOrderView,
  PaperTicketQuote,
  PlacePaperFnoOrderInput,
} from '../types';

export type { PaperTicketQuote } from '../types';

const ORDER_TYPES: readonly { key: FnoOrderType; label: string }[] = [
  { key: 'MARKET', label: 'Market' },
  { key: 'LIMIT', label: 'Limit' },
];

/** Typing settles before the server is asked — the preview is rate-limited (240/min). */
const PREVIEW_DEBOUNCE_MS = 400;

const NUM = { fontVariant: ['tabular-nums' as const] };

/** A contract and what the ticket should start as. */
export interface PaperTicketTarget extends PaperContract {
  side: 'BUY' | 'SELL';
  /** Start at this many lots (an Exit loads the whole position). */
  lots?: number;
  /** Bumped on every open, so re-opening the same contract re-seeds the form. */
  nonce: number;
}

interface PaperTicketProps {
  target: PaperTicketTarget | null;
  /** What the chain currently says about the contract (refreshed by the parent), if anything. */
  quote: PaperTicketQuote | null;
  onClose: () => void;
  /** "View positions" after a fill. Default: back to the F&O paper book. */
  onViewPositions?: () => void;
  /** "Add funds" beside a shortfall. Omitted: the link is not offered. */
  onAddFunds?: () => void;
}

/**
 * THE paper F&O order ticket — Groww's F&O order pad, with one difference stated first: the
 * PAPER chip. LOTS ONLY.
 *
 * WHAT THE USER SEES IS WHAT THE FILL DOES. Every money figure under the inputs is the server's
 * preview (`POST /derivatives/orders/preview`), computed by the very function placement runs:
 * the price it would fill at and where that came from, value, margin, itemised charges, the P&L
 * a closing order books, the cash before and after, break-even and max loss — or the reason it
 * would be refused, which disables Place. It re-asks as the inputs settle and every few seconds
 * in the session. On a server without the preview (or rate-limited) the ticket quietly falls back
 * to its own arithmetic from the chain's price.
 *
 * A REJECTION IS A RESULT, NOT AN ERROR (201 + REJECTED + a note), and so is a resting order:
 * a LIMIT not yet reached, or an AFTER-MARKET order placed outside the session, which fills at
 * the first price after 09:15. The receipt follows the order — it flips to Filled in place when
 * the server's minute sweep fills it. Simulated: nothing reaches a broker.
 */
export function PaperTicket({
  target,
  quote,
  onClose,
  onViewPositions,
  onAddFunds,
}: PaperTicketProps) {
  // The last contract stays mounted while the sheet slides away; a new one remounts the form.
  const [shown, setShown] = useState(target);
  const keyOf = (t: PaperTicketTarget | null) =>
    t ? `${t.exchange}:${t.tradingsymbol}:${t.nonce}` : '';
  if (target && keyOf(target) !== keyOf(shown)) setShown(target);
  if (!shown) return null;
  return (
    <TicketSheet
      key={keyOf(shown)}
      target={shown}
      visible={target != null}
      quote={target ? quote : null}
      onClose={onClose}
      onViewPositions={onViewPositions}
      onAddFunds={onAddFunds}
    />
  );
}

function TicketSheet({
  target,
  visible,
  quote,
  onClose,
  onViewPositions,
  onAddFunds,
}: {
  target: PaperTicketTarget;
  visible: boolean;
  quote: PaperTicketQuote | null;
  onClose: () => void;
  onViewPositions?: () => void;
  onAddFunds?: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const place = usePlacePaperOrder();
  const cancel = useCancelPaperFnoOrder();
  const orders = usePaperOrders(PAPER_ORDERS_LIMIT);
  const inFlight = useRef(false);

  const [side, setSideRaw] = useState(target.side);
  const [lots, setLotsRaw] = useState(target.lots && target.lots > 0 ? target.lots : 1);
  const [orderType, setOrderTypeRaw] = useState<FnoOrderType>('MARKET');
  const [limitText, setLimitTextRaw] = useState('');
  const [showCharges, setShowCharges] = useState(false);
  const [receipt, setReceipt] = useState<FnoOrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(30_000);

  // Any edit drops the last placement error — it was about a different order.
  const edited =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setError(null);
      setter(value);
    };
  const setSide = edited(setSideRaw);
  const setLots = edited(setLotsRaw);
  const setOrderType = edited(setOrderTypeRaw);
  const setLimitText = edited(setLimitTextRaw);

  // LIMIT orders arrived with the F&O wallet; a server without the wallet takes MARKET only.
  const wallet = usePaperFnoWallet();
  const limitSupported = !isServerOutdated(wallet.error);

  // The streamed price (with the user's own Groww market data), the chain's, the server's.
  const live = useLiveQuote(target.exchange, target.tradingsymbol, { mode: 'fno' });

  const isLimit = orderType === 'LIMIT';
  const limitPrice = isLimit ? parseLimitPrice(limitText) : null;
  const isOption = target.kind !== 'FUT';
  const isBuy = side === 'BUY';

  // Memoised on primitives: a fresh object each render would restart the debounce forever.
  const input = useMemo<PlacePaperFnoOrderInput | null>(() => {
    if (!(lots >= 1)) return null;
    if (orderType === 'LIMIT' && limitPrice == null) return null;
    return {
      tradingsymbol: target.tradingsymbol,
      exchange: target.exchange,
      side,
      lots,
      type: orderType,
      ...(orderType === 'LIMIT' && limitPrice != null ? { limitPrice } : {}),
    };
  }, [target.tradingsymbol, target.exchange, side, lots, orderType, limitPrice]);
  const asked = useDebounce(input, PREVIEW_DEBOUNCE_MS);
  const preview = usePaperOrderPreview(asked);
  const pv = preview.data ?? null;
  const pvCurrent = pv != null && input != null && previewSignature(pv) === inputSignature(input);

  // Old server, rate limit, an answer this app cannot read: the ticket's own arithmetic.
  const fallback = pv == null && (preview.isError || preview.isSuccess || isPreviewUnavailable());
  const notListed =
    isApiError(preview.error) && preview.error.status === 404 && !isServerOutdated(preview.error);

  const lotSize = pv?.contract.lotSize || target.lotSize;
  const tickSize = pv?.contract.tickSize ?? target.tickSize;
  const maxLots = pv?.contract.maxLots ?? maxLotsFor(lotSize, target.freezeQuantity);
  const shownLtp = live?.ltp ?? pv?.price?.ltp ?? quote?.lastPrice ?? null;
  const ltpWord = live
    ? 'live'
    : pv?.price
      ? priceSourceWord(pv.price.source)
      : quote?.lastPrice != null
        ? 'chain'
        : 'no price yet';
  const dte = pv?.contract.daysToExpiry ?? daysUntil(target.expiry);
  const sessionOpen = pv?.sessionOpen ?? null;
  const market = marketStateWords(sessionOpen, now);

  const lotsIssue =
    lots < 1
      ? 'Enter how many lots.'
      : maxLots > 0 && lots > maxLots
        ? maxLots < 100
          ? `At most ${maxLots} lots (${formatQuantity(maxLots * lotSize)} qty) in one order — the exchange’s freeze limit. Place the rest as another order.`
          : `A paper order is 1 to ${maxLots} lots.`
        : null;
  const priceIssue = !isLimit
    ? null
    : limitText.trim() && limitPrice == null
      ? 'Enter a price above ₹0'
      : limitPrice != null && !onTick(limitPrice, tickSize)
        ? `Moves in steps of ₹${(tickSize ?? 0.05).toFixed(2)}`
        : null;
  const blocked =
    pvCurrent && (pv.outcome === 'invalid' || pv.outcome === 'rejected') ? pv.blockedReason : null;

  // Without a preview, the old rules: MARKET needs a price to fill at, LIMIT only a limit.
  const local = legOrderValue({ lastPrice: isLimit ? limitPrice : shownLtp, lotSize }, lots);
  const fallbackTradeable = isLimit ? limitPrice != null : shownLtp != null;
  const canSubmit =
    input != null &&
    !lotsIssue &&
    !priceIssue &&
    !blocked &&
    !notListed &&
    !place.isPending &&
    (!fallback || fallbackTradeable);

  const submit = () => {
    if (!canSubmit || !input || inFlight.current) return;
    inFlight.current = true;
    place.mutate(input, {
      onSuccess: (order) => {
        setReceipt(order);
        if (order.status === 'FILLED') {
          toast.success(
            'Paper order filled',
            `${order.side === 'BUY' ? 'Bought' : 'Sold'} ${lotsLabel(order.lots)} · ${order.tradingsymbol}`,
          );
        } else if (order.status === 'PENDING') {
          toast.info(
            order.afterHours ? 'After-market order placed' : 'Limit order placed',
            order.afterHours
              ? 'It fills when the market opens.'
              : `Resting until ${order.tradingsymbol} reaches it.`,
          );
        }
      },
      // In the sheet, next to the form — a toast would sit under the modal.
      onError: (err) => setError(getErrorMessage(err, 'The paper order could not be placed.')),
      onSettled: () => {
        inFlight.current = false;
      },
    });
  };

  const liveReceipt = receipt ? (orders.data?.find((o) => o.id === receipt.id) ?? receipt) : null;
  const viewPositions = () => {
    onClose();
    if (onViewPositions) onViewPositions();
    else router.dismissTo(paperBookHref('positions'));
  };

  const label = commitLabel({
    side,
    lots,
    pending: place.isPending,
    outcome: pvCurrent ? pv.outcome : null,
    cashDelta: pvCurrent ? pv.cashDelta : null,
    reservedAmount: pvCurrent ? pv.reservedAmount : 0,
    estimate: fallback && local.total != null ? local.total : null,
  });

  const footer = liveReceipt ? (
    <ReceiptActions
      order={liveReceipt}
      cancelling={cancel.isPending}
      onDone={onClose}
      onViewPositions={viewPositions}
      onAgain={() => {
        setError(null);
        setReceipt(null);
      }}
      onCancel={() =>
        cancel.mutate(liveReceipt.id, {
          onSuccess: (order) => setReceipt(order),
          onError: (err) => setError(getErrorMessage(err, 'The order could not be cancelled.')),
        })
      }
    />
  ) : (
    <Button
      label={label}
      size="lg"
      fullWidth
      variant={isBuy ? 'primary' : 'danger'}
      loading={place.isPending}
      disabled={!canSubmit}
      onPress={submit}
      accessibilityLabel={`${label}, ${contractTitle(target)}, in the paper book`}
    />
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      busy={place.isPending || cancel.isPending}
      title={contractTitle(target)}
      subtitle={`${expiryLabel(target.expiry)} · ${dteLabel(dte)} · lot ${formatQuantity(lotSize)} · ${venueOf(target.exchange)}`}
      headerRight={
        <View className="items-end">
          <Text className="text-base font-bold text-ink dark:text-ink-dark" style={NUM}>
            {shownLtp != null ? formatINR(shownLtp) : DASH}
          </Text>
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{ltpWord}</Text>
        </View>
      }
      footer={footer}
    >
      {liveReceipt ? (
        <Receipt order={liveReceipt} error={error} />
      ) : (
        <View className="gap-4 pb-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <View className="rounded-md bg-info-wash px-2 py-1 dark:bg-info-wash-dark">
              <Text className="text-[11px] font-bold text-info dark:text-info-dark">
                PAPER · simulated, no real order
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: market.open ? colors.success : colors.textFaint }}
              />
              <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                {market.open ? 'Market open' : 'Market closed'}
              </Text>
            </View>
          </View>

          {pv?.position && pv.position.lots !== 0 ? (
            <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted" style={NUM}>
              You hold{' '}
              <Text className="font-semibold text-ink dark:text-ink-dark">
                {lotsLabel(Math.abs(pv.position.lots))} {pv.position.lots > 0 ? 'long' : 'short'}
              </Text>{' '}
              at {formatINR(pv.position.avgPrice)}
              {pvCurrent && pv.closingLots > 0
                ? ` · this order closes ${pv.closingLots}${pv.openingLots > 0 ? ` and opens ${pv.openingLots} the other way` : ''}`
                : ''}
            </Text>
          ) : null}
          {isOption && quote && (quote.impliedVolatility != null || quote.delta != null) ? (
            <Text className="-mt-2 text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
              IV {ivPct(quote.impliedVolatility)} · Δ {signedGreek(quote.delta, 2)} (modelled)
            </Text>
          ) : null}

          <SideToggle value={side} onChange={setSide} disabled={place.isPending} />

          {limitSupported ? (
            <SegmentedControl
              items={ORDER_TYPES}
              value={orderType}
              onChange={(next) => {
                setOrderType(next);
                if (next === 'LIMIT' && !limitText && shownLtp != null) {
                  setLimitText(snapToTick(shownLtp, tickSize).toFixed(2));
                }
              }}
            />
          ) : null}

          <View>
            <View className="flex-row items-baseline justify-between">
              <FieldLabel>Lots</FieldLabel>
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
                Qty {lots > 0 ? formatQuantity(lots * lotSize) : DASH}
              </Text>
            </View>
            <LotsStepper
              value={lots}
              onChange={setLots}
              max={maxLots > 0 ? maxLots : null}
              disabled={place.isPending}
            />
            <View className="mt-2 flex-row gap-2">
              {QUICK_LOTS.filter((n) => !(maxLots > 0) || n <= maxLots).map((n) => (
                <Pressable
                  key={n}
                  accessibilityRole="button"
                  accessibilityState={{ selected: lots === n }}
                  accessibilityLabel={lotsLabel(n)}
                  onPress={() => setLots(n)}
                  className={cn(
                    'h-8 flex-1 items-center justify-center rounded-lg border',
                    lots === n
                      ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
                      : 'border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
                  )}
                >
                  <Text
                    className={cn(
                      'text-xs font-semibold',
                      lots === n
                        ? 'text-brand-text dark:text-brand-text-dark'
                        : 'text-ink-muted dark:text-ink-dark-muted',
                    )}
                  >
                    {n}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text
              className={cn(
                'mt-1.5 text-xs',
                lotsIssue && lots > 0
                  ? 'text-danger-600 dark:text-danger-dark'
                  : 'text-ink-faint dark:text-ink-dark-faint',
              )}
              style={NUM}
            >
              {lotsIssue && lots > 0
                ? lotsIssue
                : `1 lot = ${formatQuantity(lotSize)} qty${maxLots > 0 ? ` · up to ${maxLots} lots per order` : ''}`}
            </Text>
          </View>

          {isLimit ? (
            <View>
              <PriceField
                label="Limit price"
                value={limitText}
                onChange={setLimitText}
                placeholder={shownLtp != null ? shownLtp.toFixed(2) : '0.00'}
                error={priceIssue}
                action={
                  shownLtp != null
                    ? {
                        label: 'Use LTP',
                        onPress: () => setLimitText(snapToTick(shownLtp, tickSize).toFixed(2)),
                      }
                    : undefined
                }
              />
              <View className="mt-2 flex-row items-center gap-2">
                <PillButton
                  label="− tick"
                  accessibilityLabel="One tick lower"
                  onPress={() =>
                    setLimitText(stepPrice(limitPrice ?? shownLtp ?? 0.05, tickSize, -1).toFixed(2))
                  }
                />
                <PillButton
                  label="+ tick"
                  accessibilityLabel="One tick higher"
                  onPress={() =>
                    setLimitText(stepPrice(limitPrice ?? shownLtp ?? 0, tickSize, 1).toFixed(2))
                  }
                />
                <Text className="flex-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                  Tick ₹{(tickSize ?? 0.05).toFixed(2)}
                </Text>
              </View>
              <Note className="mt-2">
                A {isBuy ? 'buy' : 'sell'} limit fills at once if the market is already{' '}
                {isBuy ? 'at or below' : 'at or above'} it, otherwise it waits — checked once a
                minute — and fills at the price that reaches it.
              </Note>
            </View>
          ) : null}

          {fallback ? (
            <SummaryBox>
              <SummaryLine
                label={`${lotsLabel(lots)} × ${formatQuantity(lotSize)}`}
                value={`${formatQuantity(lots * lotSize)} qty`}
              />
              <SummaryLine
                label={
                  isLimit
                    ? 'Value at your limit'
                    : !isOption
                      ? 'Contract value'
                      : isBuy
                        ? 'Premium payable'
                        : 'Premium receivable'
                }
                value={local.total != null ? formatINR(local.total) : DASH}
                strong
              />
            </SummaryBox>
          ) : (
            <Estimate
              pv={pv}
              current={pvCurrent}
              loading={input != null && pv == null && preview.isFetching}
              valueLabel={
                !isOption ? 'Contract value' : isBuy ? 'Premium payable' : 'Premium receivable'
              }
              side={side}
              showCharges={showCharges}
              onToggleCharges={() => setShowCharges((open) => !open)}
            />
          )}

          {pvCurrent ? <Outcome pv={pv} onAddFunds={onAddFunds} /> : null}
          {!pvCurrent && sessionOpen === false ? (
            <Note>
              {market.text}.{' '}
              {isLimit
                ? 'A limit order rests until the market opens.'
                : 'A market order rests as an after-market order and fills at the first price after 09:15 IST.'}
            </Note>
          ) : null}
          {notListed ? (
            <Banner tone="error" message={getErrorMessage(preview.error)} />
          ) : fallback && !isLimit && shownLtp == null ? (
            <Banner
              tone="info"
              message="This contract has no traded price, so a market order has nothing to fill against. It is not worthless — it simply has not printed. Switch to Limit to rest an order anyway."
            />
          ) : null}
          {error ? <Banner tone="error" message={error} /> : null}

          <Note>{riskSentence(target.kind, side)}</Note>
        </View>
      )}
    </Sheet>
  );
}

/** The server's estimate, line by line; dimmed while it answers for an older input. */
function Estimate({
  pv,
  current,
  loading,
  valueLabel,
  side,
  showCharges,
  onToggleCharges,
}: {
  pv: FnoOrderPreview | null;
  current: boolean;
  loading: boolean;
  valueLabel: string;
  side: 'BUY' | 'SELL';
  showCharges: boolean;
  onToggleCharges: () => void;
}) {
  const { colors } = useTheme();
  const value = pv ? estimateValue(pv) : null;
  const maxLoss = pv ? maxLossLabel(pv, side) : null;
  const Chevron = showCharges ? ChevronUp : ChevronDown;
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityState={{ busy: !current }}
      style={pv && !current ? { opacity: 0.5 } : undefined}
    >
      <SummaryBox>
        <SummaryLine
          label={`${valueLabel}${value?.atPrice != null ? ` at ${formatINR(value.atPrice)}` : ''}`}
          value={
            value?.value != null
              ? `${value.approximate ? '≈ ' : ''}${formatINR(value.value)}`
              : loading
                ? 'Pricing…'
                : DASH
          }
          strong
        />
        {pv && pv.marginRequired > 0 ? (
          <SummaryLine label="Margin blocked" value={formatINR(pv.marginRequired)} />
        ) : null}
        {pv && pv.marginReleased > 0 ? (
          <SummaryLine label="Margin released" value={formatINR(pv.marginReleased)} />
        ) : null}
        {pv?.charges ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showCharges }}
              accessibilityLabel={`Charges ${formatINR(pv.charges.total)}. ${showCharges ? 'Hide' : 'Show'} the breakdown`}
              onPress={onToggleCharges}
              className="flex-row items-center justify-between gap-3 py-1.5"
            >
              <View className="flex-row items-center gap-1">
                <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">Charges</Text>
                <Chevron size={14} color={colors.textMuted} />
              </View>
              <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUM}>
                {formatINR(pv.charges.total)}
              </Text>
            </Pressable>
            {showCharges ? (
              <View className="pl-3">
                {chargeLines(pv.charges).map((line) => (
                  <SummaryLine
                    key={line.label}
                    label={line.label}
                    value={formatINR(line.value)}
                    muted
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
        {pv?.realisedPnl != null ? (
          <SummaryLine
            label="P&L booked on close"
            value={formatSignedINR(pv.realisedPnl)}
            valueClassName={
              pv.realisedPnl > 0
                ? 'text-brand-text dark:text-brand-text-dark'
                : pv.realisedPnl < 0
                  ? 'text-danger-600 dark:text-danger-dark'
                  : undefined
            }
          />
        ) : null}
        {pv && pv.reservedAmount > 0 ? (
          <SummaryLine label="Held until it fills" value={formatINR(pv.reservedAmount)} />
        ) : null}
        <View className="my-1 h-px bg-line dark:bg-line-dark" />
        <SummaryLine
          label="Available"
          value={
            pv?.availableCash != null
              ? `${formatINR(pv.availableCash)}${pv.cashAfter != null ? ` → ${formatINR(pv.cashAfter)}` : ''}`
              : DASH
          }
          strong
        />
      </SummaryBox>
      {pv && (pv.breakEven != null || maxLoss) ? (
        <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1 px-1">
          {pv.breakEven != null ? (
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
              Break-even at expiry{' '}
              <Text className="font-semibold text-ink dark:text-ink-dark">
                {pv.breakEven.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </Text>
            </Text>
          ) : null}
          {maxLoss ? (
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
              Max loss <Text className="font-semibold text-ink dark:text-ink-dark">{maxLoss}</Text>
            </Text>
          ) : null}
        </View>
      ) : null}
      {pv?.price ? (
        <Text className="mt-1.5 px-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">
          Priced from {pv.price.label || priceSourceWord(pv.price.source)}
          {pv.price.asOf ? ` · ${timeIst(pv.price.asOf, true)} IST` : ''}
        </Text>
      ) : pv?.priceNote ? (
        <Text className="mt-1.5 px-1 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          {pv.priceNote}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * What placing now would do, in plain words — the server's own sentence when it has one
 * ("Limit ₹120 crossed on placement…", "After-market order — fills at…"). A refusal is a banner,
 * with "Add funds" beside a shortfall when the host can open the wallet.
 */
function Outcome({ pv, onAddFunds }: { pv: FnoOrderPreview; onAddFunds?: () => void }) {
  const words = outcomeWords(pv);
  if (words.tone === 'danger' || words.tone === 'warning') {
    const shortfall = onAddFunds && /funds|wallet|available/i.test(words.text);
    return (
      <Banner
        tone={words.tone === 'danger' ? 'error' : 'warning'}
        message={words.text}
        action={shortfall ? { label: 'Add funds', onPress: onAddFunds } : undefined}
      />
    );
  }
  return (
    <Text
      accessibilityRole="text"
      className={cn(
        'text-[13px] font-medium leading-[19px]',
        words.tone === 'success'
          ? 'text-brand-text dark:text-brand-text-dark'
          : 'text-info dark:text-info-dark',
      )}
    >
      {pv.note ?? words.text}
    </Text>
  );
}

/** The placed order, following its live status. */
function Receipt({ order, error }: { order: FnoOrderView; error: string | null }) {
  const { colors } = useTheme();
  const filled = order.status === 'FILLED';
  const pending = order.status === 'PENDING';
  const cancelled = order.status === 'CANCELLED';
  const words = receiptWords(order);
  return (
    <View accessibilityLiveRegion="polite" className="items-center gap-3 pb-1 pt-3">
      <View
        className={cn(
          'h-16 w-16 items-center justify-center rounded-full',
          filled
            ? 'bg-brand-wash dark:bg-brand-wash-dark'
            : pending
              ? 'bg-warning-wash dark:bg-warning-wash-dark'
              : cancelled
                ? 'bg-surface-sunk dark:bg-surface-sunk-dark'
                : 'bg-danger-wash dark:bg-danger-wash-dark',
        )}
      >
        {filled ? (
          <CircleCheck size={30} color={colors.success} />
        ) : pending ? (
          <Clock size={30} color={colors.warning} />
        ) : (
          <CircleX size={30} color={cancelled ? colors.textMuted : colors.danger} />
        )}
      </View>
      <Text className="text-center text-lg font-bold text-ink dark:text-ink-dark">
        {words.title}
      </Text>
      <Text className="text-center text-sm text-ink-muted dark:text-ink-dark-muted" style={NUM}>
        {order.side === 'BUY' ? 'Buy' : 'Sell'} {lotsLabel(order.lots)} · {order.tradingsymbol}
      </Text>
      {words.detail ? (
        <Text
          className="max-w-[340px] text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted"
          style={NUM}
        >
          {words.detail}
        </Text>
      ) : null}
      {filled && order.charges.total > 0 ? (
        <Text className="text-center text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          Charges {formatINR(order.charges.total)}
        </Text>
      ) : null}
      {pending && order.note ? (
        <Text className="max-w-[340px] text-center text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
          {order.note}
        </Text>
      ) : null}
      {error ? <Banner tone="error" message={error} /> : null}
    </View>
  );
}

function ReceiptActions({
  order,
  cancelling,
  onDone,
  onViewPositions,
  onAgain,
  onCancel,
}: {
  order: FnoOrderView;
  cancelling: boolean;
  onDone: () => void;
  onViewPositions: () => void;
  onAgain: () => void;
  onCancel: () => void;
}) {
  const filled = order.status === 'FILLED';
  return (
    <>
      <Button label="Done" size="lg" fullWidth onPress={onDone} />
      {order.status === 'PENDING' ? (
        <Button
          label="Cancel this order"
          variant="outline"
          fullWidth
          loading={cancelling}
          onPress={onCancel}
        />
      ) : (
        <Button
          label={
            filled
              ? 'View paper positions'
              : order.status === 'CANCELLED'
                ? 'Place it again'
                : 'Change and try again'
          }
          variant="ghost"
          fullWidth
          onPress={filled ? onViewPositions : onAgain}
        />
      )}
    </>
  );
}
