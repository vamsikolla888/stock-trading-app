import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleX from 'lucide-react-native/icons/circle-x';
import Clock from 'lucide-react-native/icons/clock';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import X from 'lucide-react-native/icons/x';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { SCREEN_EDGES } from '@/components/common/safeArea';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Tabs';
import { useStockDetail } from '@/features/market/hooks';
import { useLiveQuote } from '@/features/market/live';
import { portfolioKeys } from '@/features/portfolio/keys';
import { previewCharges, liveTradingApi, paperApi } from '@/features/trading/api';
import {
  FieldLabel,
  PriceInput,
  QuantityStepper,
  SummaryRow,
} from '@/features/trading/components/OrderInputs';
import {
  tradingKeys,
  useLiveTradingOptions,
  useLiveWallet,
  useOrderIntent,
  usePaperPreview,
} from '@/features/trading/hooks';
import { pinnedBrokerReason } from '@/features/trading/lib/availability';
import { heldQuantity } from '@/features/trading/lib/liveOrders';
import {
  MAX_ORDER_QUANTITY,
  needsLimitPrice,
  needsTriggerPrice,
  ORDER_TYPE_LABEL,
  referencePrice,
  validateOrder,
} from '@/features/trading/lib/orderForm';
import {
  describeLiveOrder,
  describePaperOrder,
  type OrderOutcome,
} from '@/features/trading/lib/orderOutcome';
import { parseTicketParams } from '@/features/trading/lib/ticket';
import type { LiveBroker, OrderType, PaperOrderInput } from '@/features/trading/types';
import { useDebounce } from '@/hooks/useDebounce';
import { formatINR, formatQuantity } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { ApiError, getErrorMessage, isApiError } from '@/types/api';

// A pushed modal outside the tab layouts: without its own boundary a render error here
// would take down the whole signed-in stack.
export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

type Mode = 'live' | 'paper';
type Product = 'delivery' | 'intraday';
type Step = 'form' | 'review' | 'result';

const PRODUCTS: readonly { key: Product; label: string }[] = [
  { key: 'delivery', label: 'Delivery' },
  { key: 'intraday', label: 'Intraday' },
];

const ORDER_TYPES: readonly { key: OrderType; label: string }[] = (
  ['MARKET', 'LIMIT', 'SL', 'SL-M'] as const
).map((key) => ({ key, label: ORDER_TYPE_LABEL[key] }));

function OutcomeIcon({ outcome }: { outcome: OrderOutcome }) {
  const { colors } = useTheme();
  const map = {
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
  } as const;
  const { Icon, color, bg } = map[outcome.tone];
  return (
    <View className={`h-16 w-16 items-center justify-center rounded-full ${bg}`}>
      <Icon size={30} color={color} />
    </View>
  );
}

export default function OrderScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  // Every prefill is honoured: the side and size of an exit, the product of the position,
  // paper vs live, the paper profile, and the broker a holding sits at. Memoised so the
  // values derived from it are stable inputs to the debounced previews below.
  const params = useLocalSearchParams();
  const ticket = useMemo(() => parseTicketParams(params), [params]);
  const { symbol, exchange, side, profileId } = ticket;
  const isBuy = side === 'BUY';

  const detail = useStockDetail(symbol, exchange);
  const live = useLiveTradingOptions();
  const intent = useOrderIntent();

  const [chosenMode, setChosenMode] = useState<Mode | null>(ticket.mode);
  const [chosenBroker, setChosenBroker] = useState<LiveBroker | null>(null);
  const [product, setProduct] = useState<Product>(ticket.product ?? 'delivery');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [quantity, setQuantity] = useState(ticket.qty ? String(ticket.qty) : '1');
  const [limitPrice, setLimitPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<OrderOutcome | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  /** What the review screen showed — exactly what Confirm places. */
  const [reviewed, setReviewed] = useState<{ mode: Mode; broker: LiveBroker | null } | null>(null);

  // A ticket opened for one broker (selling a Groww holding) is pinned to it: it must never
  // quietly go to another broker that may hold the same stock.
  const pinned = ticket.broker;
  const broker: LiveBroker | null =
    pinned ??
    (chosenBroker && live.brokers.includes(chosenBroker) ? chosenBroker : null) ??
    live.brokers[0] ??
    null;
  const liveReason = live.isLoading ? null : pinnedBrokerReason(pinned, live);
  const liveAvailable =
    !live.isLoading && liveReason === null && broker !== null && live.brokers.includes(broker);
  const brokerLabel = broker ? live.labelOf(broker) : null;

  // Live only when the pre-checks pass; otherwise paper, with the reason shown. A paper
  // screen opens the ticket in paper mode — it never silently becomes live.
  const mode: Mode = chosenMode ?? (liveAvailable ? 'live' : 'paper');
  const isLive = mode === 'live' && liveAvailable;
  // Every tick (stream mode): the reference price, the estimate and the LTP line follow the
  // market while the ticket is open, not the last 10-second poll.
  const liveQuote = useLiveQuote(exchange, symbol, { mode: 'stream' });
  const ltp = liveQuote?.ltp ?? detail.data?.ltp ?? null;
  const displaySymbol =
    detail.data?.listings?.find((listing) => listing.exchange === exchange)?.displaySymbol ??
    symbol;

  const { order, errors } = useMemo(
    () => validateOrder({ side, orderType, quantity, limitPrice, triggerPrice }),
    [side, orderType, quantity, limitPrice, triggerPrice],
  );
  const orderQuantity = order?.quantity ?? null;
  const orderPrice = order?.price ?? null;
  const orderTrigger = order?.triggerPrice ?? null;

  // Any edit to what would be sent is a new intent: its idempotency key must not be reused.
  // Done in the setters (not an effect) so it happens exactly when the user changes a field.
  const edit =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      intent.discard();
      setSubmitError(null);
      setter(value);
    };

  const wallet = useLiveWallet(isLive ? broker : null);
  const available = isLive
    ? product === 'delivery'
      ? (wallet.data?.deliveryAvailable ?? null)
      : (wallet.data?.intradayAvailable ?? null)
    : null;
  // A delivery sell draws on demat holdings; intraday sells don't need any.
  const held =
    isLive && !isBuy && product === 'delivery' && wallet.data
      ? heldQuantity(wallet.data.holdings ?? null, detail.data?.listings ?? [])
      : null;

  // Memoised on primitives: a fresh object each render would restart the debounce forever.
  const paperInput = useMemo<PaperOrderInput | null>(
    () =>
      !isLive && symbol && orderQuantity !== null
        ? {
            segment: product === 'delivery' ? 'equity' : 'intraday',
            ...(profileId ? { profileId } : {}),
            exchange,
            symbol,
            side,
            type: orderType,
            quantity: orderQuantity,
            limitPrice: orderPrice,
            triggerPrice: orderTrigger,
          }
        : null,
    [
      isLive,
      orderQuantity,
      orderPrice,
      orderTrigger,
      product,
      profileId,
      exchange,
      symbol,
      side,
      orderType,
    ],
  );
  const paperPreview = usePaperPreview(useDebounce(paperInput, 300));

  const price = order ? referencePrice(order, orderType, ltp) : null;
  const estimate = order && price !== null ? order.quantity * price : null;
  const liveChargesInput = useMemo(
    () =>
      isLive && orderQuantity !== null && price !== null && price > 0
        ? {
            product: product === 'delivery' ? ('DELIVERY' as const) : ('INTRADAY' as const),
            side,
            qty: orderQuantity,
            price,
          }
        : null,
    [isLive, orderQuantity, price, product, side],
  );
  const chargesInput = useDebounce(liveChargesInput, 300);
  const charges = useQuery({
    queryKey: ['orders', 'charges', chargesInput],
    queryFn: ({ signal }) => previewCharges(chargesInput!, signal),
    enabled: chargesInput !== null,
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
  });

  const chargesTotal = isLive
    ? (charges.data?.breakdown?.total ?? null)
    : (paperPreview.data?.charges ?? null);
  const fundsShown = isLive ? available : (paperPreview.data?.availableCash ?? null);
  const blockedReason = !isLive && paperInput ? (paperPreview.data?.blockedReason ?? null) : null;
  const paperNotices = !isLive && paperInput ? (paperPreview.data?.notices ?? []) : [];
  // Paper: the server's own margin figure — an intraday buy is leveraged, so it commits only a
  // fraction of its value. Live: the order value against the broker's funds.
  const paperMargin = !isLive && paperInput ? (paperPreview.data?.marginRequired ?? null) : null;
  const shortOfFunds = isLive
    ? isBuy && estimate !== null && fundsShown !== null && estimate > fundsShown
    : isBuy && paperMargin !== null && fundsShown !== null && paperMargin > fundsShown;

  const refreshAfterOrder = (placedAt: LiveBroker | null) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: portfolioKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['paper'] }),
      queryClient.invalidateQueries({ queryKey: ['live-trading', 'orders'] }),
      ...(placedAt
        ? [queryClient.invalidateQueries({ queryKey: tradingKeys.wallet(placedAt) })]
        : []),
    ]);

  const place = useMutation({
    mutationFn: async (idempotencyKey: string): Promise<OrderOutcome> => {
      if (!order || !reviewed) throw new Error('Invalid order');
      if (reviewed.mode === 'live') {
        // Place exactly what was reviewed. If live trading (or the reviewed broker) became
        // unavailable while the review was open, refuse rather than quietly placing it
        // somewhere else or as the other mode.
        const target = reviewed.broker;
        if (!target || !live.brokers.includes(target) || pinnedBrokerReason(pinned, live)) {
          throw new ApiError({
            status: 409,
            code: 'LIVE_UNAVAILABLE',
            message:
              pinnedBrokerReason(pinned, live) ??
              'Live trading is no longer available. Go back to edit the order.',
          });
        }
        const result = await liveTradingApi.placeOrder({
          mode: 'live',
          broker: target,
          category: product === 'delivery' ? 'equity_delivery' : 'equity_intraday',
          exchange,
          tradingsymbol: symbol,
          side,
          orderType,
          quantity: order.quantity,
          price: order.price,
          triggerPrice: order.triggerPrice,
          idempotencyKey,
        });
        return describeLiveOrder(result.order);
      }
      const paperOrder = await paperApi.placeOrder({
        segment: product === 'delivery' ? 'equity' : 'intraday',
        ...(profileId ? { profileId } : {}),
        exchange,
        symbol,
        side,
        type: orderType,
        quantity: order.quantity,
        limitPrice: order.price,
        triggerPrice: order.triggerPrice,
      });
      return describePaperOrder(paperOrder);
    },
    onSuccess: (result) => {
      intent.settle(null);
      setOutcome(result);
      setStep('result');
      void refreshAfterOrder(reviewed?.mode === 'live' ? reviewed.broker : null);
    },
    onError: (error) => {
      intent.settle(error);
      const retrySafe = isApiError(error) && (error.isNetworkError || error.isServerError);
      setSubmitError(
        retrySafe && reviewed?.mode === 'live'
          ? `${getErrorMessage(error)} Tapping confirm again is safe — it can't place a second order.`
          : getErrorMessage(error),
      );
    },
  });

  const openReview = () => {
    setShowErrors(true);
    if (!order || blockedReason) return;
    const next = {
      mode: isLive ? ('live' as const) : ('paper' as const),
      broker: isLive ? broker : null,
    };
    // A different destination than the last review (the default broker moved) is a new
    // intent, even though no field was edited.
    if (reviewed && (reviewed.mode !== next.mode || reviewed.broker !== next.broker)) {
      intent.discard();
    }
    if (isLive) intent.begin();
    setReviewed(next);
    setSubmitError(null);
    setStep('review');
  };

  const confirm = () => {
    if (place.isPending) return;
    place.mutate(reviewed?.mode === 'live' ? intent.begin() : 'paper');
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/trade'));

  const title = `${isBuy ? 'Buy' : 'Sell'} ${displaySymbol}`;
  const modeItems: readonly { key: Mode; label: string }[] = [
    { key: 'live', label: brokerLabel && liveAvailable ? `Live · ${brokerLabel}` : 'Live' },
    { key: 'paper', label: 'Paper' },
  ];
  const brokerItems = live.brokers.map((id) => ({ key: id, label: live.labelOf(id) }));
  const reviewedBrokerLabel = reviewed?.broker ? live.labelOf(reviewed.broker) : 'your broker';

  // Opened without a stock (a stale link): nothing can be priced or placed.
  if (!symbol) {
    return (
      <SafeAreaView edges={SCREEN_EDGES} style={{ flex: 1, backgroundColor: colors.surface }}>
        <View className="flex-1 justify-center px-5">
          <InlineEmpty
            title="No stock selected"
            message="Open a stock and tap Buy or Sell to place an order."
            action={{ label: 'Close', onPress: close }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={SCREEN_EDGES} style={{ flex: 1, backgroundColor: colors.surface }}>
      <View className="flex-row items-start gap-3 px-5 pb-3 pt-4">
        <View className="flex-1">
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-ink dark:text-ink-dark"
          >
            {step === 'result' ? 'Order status' : title}
          </Text>
          <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
            {exchange} · Equity · LTP {formatINR(ltp)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          disabled={place.isPending}
          onPress={close}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface-sunk dark:bg-surface-sunk-dark"
        >
          <X size={18} color={colors.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'form' ? (
            <View className="gap-4">
              {detail.error && !detail.data ? (
                <InlineError
                  what={`${symbol}'s price`}
                  error={detail.error}
                  onRetry={() => void detail.refetch()}
                />
              ) : null}

              <View>
                <SegmentedControl
                  items={modeItems}
                  value={isLive ? 'live' : 'paper'}
                  onChange={(next) => {
                    if (next === 'live' && !liveAvailable) return;
                    edit(setChosenMode)(next);
                  }}
                />
                {!liveAvailable && liveReason ? (
                  <Text className="mt-1.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                    Live unavailable: {liveReason}{' '}
                    <Text
                      className="font-semibold text-brand-text dark:text-brand-text-dark"
                      onPress={() => router.push('/brokers')}
                    >
                      Brokers
                    </Text>
                  </Text>
                ) : null}
              </View>

              {isLive && !pinned && brokerItems.length > 1 && broker ? (
                <View>
                  <FieldLabel>Broker</FieldLabel>
                  <SegmentedControl
                    items={brokerItems}
                    value={broker}
                    onChange={edit(setChosenBroker)}
                  />
                </View>
              ) : null}

              <SegmentedControl items={PRODUCTS} value={product} onChange={edit(setProduct)} />

              <View>
                <FieldLabel>Quantity</FieldLabel>
                <QuantityStepper
                  value={quantity}
                  onChange={edit(setQuantity)}
                  max={MAX_ORDER_QUANTITY}
                />
                {showErrors && errors.quantity ? (
                  <Text className="mt-1 text-xs text-danger-600 dark:text-danger-dark">
                    {errors.quantity}
                  </Text>
                ) : null}
              </View>

              <View>
                <FieldLabel>Order type</FieldLabel>
                <SegmentedControl
                  items={ORDER_TYPES}
                  value={orderType}
                  onChange={edit(setOrderType)}
                />
              </View>

              {needsLimitPrice(orderType) || needsTriggerPrice(orderType) ? (
                <View className="flex-row gap-3">
                  {needsLimitPrice(orderType) ? (
                    <PriceInput
                      label="Price"
                      value={limitPrice}
                      onChange={edit(setLimitPrice)}
                      placeholder={ltp !== null ? ltp.toFixed(2) : undefined}
                      error={showErrors ? errors.limitPrice : null}
                    />
                  ) : null}
                  {needsTriggerPrice(orderType) ? (
                    <PriceInput
                      label="Trigger price"
                      value={triggerPrice}
                      onChange={edit(setTriggerPrice)}
                      placeholder={ltp !== null ? ltp.toFixed(2) : undefined}
                      error={showErrors ? errors.triggerPrice : null}
                    />
                  ) : null}
                </View>
              ) : null}

              <View className="rounded-xl bg-surface-sunk px-3.5 py-2.5 dark:bg-surface-sunk-dark">
                <SummaryRow label="Estimated value" value={formatINR(estimate)} strong />
                <SummaryRow
                  label="Estimated charges"
                  value={chargesTotal !== null ? formatINR(chargesTotal) : '—'}
                />
                {!isLive && product === 'intraday' && isBuy && paperMargin !== null ? (
                  <SummaryRow label="Margin required" value={formatINR(paperMargin)} />
                ) : null}
                <SummaryRow
                  label={isLive ? 'Available funds' : 'Paper wallet balance'}
                  value={
                    fundsShown !== null
                      ? formatINR(fundsShown)
                      : isLive && wallet.isPending
                        ? 'Checking…'
                        : '—'
                  }
                />
                {held !== null ? (
                  <SummaryRow
                    label={`Shares held at ${brokerLabel ?? 'your broker'}`}
                    value={formatQuantity(held)}
                  />
                ) : null}
              </View>

              {blockedReason ? <Banner tone="warning" message={blockedReason} /> : null}
              {paperNotices.map((notice, index) => (
                <Banner key={`${index}-${notice}`} tone="info" message={notice} />
              ))}
              {!isLive && paperInput && paperPreview.error && !paperPreview.data ? (
                <Banner tone="warning" message={getErrorMessage(paperPreview.error)} />
              ) : null}
              {shortOfFunds && !blockedReason ? (
                <Banner
                  tone="warning"
                  message={
                    isLive
                      ? 'The estimated value is more than your available funds.'
                      : 'This needs more than your paper wallet balance.'
                  }
                />
              ) : null}
              {held !== null && orderQuantity !== null && orderQuantity > held ? (
                <Banner
                  tone="warning"
                  message={`You hold ${formatQuantity(held)} at ${brokerLabel ?? 'your broker'} — a delivery sell can't be larger than that.`}
                />
              ) : null}
              {isLive && wallet.error ? (
                <Banner tone="warning" message={getErrorMessage(wallet.error)} />
              ) : null}

              <Banner
                tone={isLive ? 'warning' : 'info'}
                title={isLive ? 'Real money' : 'Practice mode'}
                message={
                  isLive
                    ? `This sends a real order to ${brokerLabel ?? 'your broker'}. Pre-trade risk checks run on the server; executed orders can't be undone.`
                    : 'Paper orders use virtual cash and real prices. Nothing is sent to a broker.'
                }
              />
            </View>
          ) : null}

          {step === 'review' && order && reviewed ? (
            <View className="gap-4">
              <View className="rounded-xl border border-line px-3.5 py-2.5 dark:border-line-dark">
                <SummaryRow
                  label="Mode"
                  value={
                    reviewed.mode === 'live'
                      ? `Live · ${reviewedBrokerLabel}`
                      : 'Paper (virtual cash)'
                  }
                />
                <SummaryRow
                  label="Order"
                  value={`${isBuy ? 'Buy' : 'Sell'} ${formatQuantity(order.quantity)} × ${displaySymbol}`}
                />
                <SummaryRow
                  label="Product"
                  value={product === 'delivery' ? 'Delivery (CNC)' : 'Intraday (MIS)'}
                />
                <SummaryRow label="Type" value={ORDER_TYPE_LABEL[orderType]} />
                {order.price !== null ? (
                  <SummaryRow label="Price" value={formatINR(order.price)} />
                ) : null}
                {order.triggerPrice !== null ? (
                  <SummaryRow label="Trigger" value={formatINR(order.triggerPrice)} />
                ) : null}
                <SummaryRow label="Estimated value" value={formatINR(estimate)} strong />
                <SummaryRow
                  label="Estimated charges"
                  value={chargesTotal !== null ? formatINR(chargesTotal) : '—'}
                />
              </View>
              {reviewed.mode === 'live' ? (
                <Banner
                  tone="warning"
                  title="Confirm a real order"
                  message={`${isBuy ? 'Buying' : 'Selling'} on ${reviewedBrokerLabel} with real money. Market orders fill at the prevailing price, which can differ from the estimate.`}
                />
              ) : null}
              {submitError ? <Banner tone="error" message={submitError} /> : null}
            </View>
          ) : null}

          {step === 'result' && outcome ? (
            <View className="items-center gap-3 pt-8">
              <OutcomeIcon outcome={outcome} />
              <Text className="text-center text-xl font-bold text-ink dark:text-ink-dark">
                {outcome.title}
              </Text>
              <Text className="max-w-[320px] text-center text-sm leading-5 text-ink-muted dark:text-ink-dark-muted">
                {outcome.message}
              </Text>
              {outcome.details.map((line, index) => (
                <Text
                  key={`${index}-${line}`}
                  className="max-w-[320px] text-center text-[13px] text-ink-muted dark:text-ink-dark-muted"
                >
                  • {line}
                </Text>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View className="gap-2 border-t border-line px-5 pb-2 pt-3 dark:border-line-dark">
          {step === 'form' ? (
            <Button
              label={`Review ${isBuy ? 'buy' : 'sell'} order`}
              size="lg"
              fullWidth
              variant={isBuy ? 'primary' : 'danger'}
              disabled={!detail.data || Boolean(blockedReason) || live.isLoading}
              onPress={openReview}
            />
          ) : null}
          {step === 'review' ? (
            <>
              <Button
                label={`Confirm ${isBuy ? 'buy' : 'sell'}${reviewed?.mode === 'live' ? '' : ' (paper)'}`}
                size="lg"
                fullWidth
                variant={isBuy ? 'primary' : 'danger'}
                loading={place.isPending}
                onPress={confirm}
              />
              <Button
                label="Edit order"
                variant="ghost"
                fullWidth
                disabled={place.isPending}
                onPress={() => setStep('form')}
              />
            </>
          ) : null}
          {step === 'result' ? (
            <>
              <Button label="Done" size="lg" fullWidth onPress={close} />
              <Button
                label={reviewed?.mode === 'live' ? 'View live orders' : 'Open paper portfolio'}
                variant="ghost"
                fullWidth
                onPress={() =>
                  router.replace(reviewed?.mode === 'live' ? '/trade' : '/trade/paper')
                }
              />
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
