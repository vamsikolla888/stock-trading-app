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
import { ChangeText } from '@/components/market/ChangeText';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Tabs';
import { SafeModeNotice } from '@/features/account/components/SafeMode';
import { useSafeModeOn, useSafeModeRefusalSync } from '@/features/account/hooks';
import { useStockDetail } from '@/features/market/hooks';
import { useLiveness, useLiveQuote } from '@/features/market/live';
import { usePaperOrders, usePaperPortfolio } from '@/features/paper/hooks';
import { portfolioKeys } from '@/features/portfolio/keys';
import { istToday } from '@/features/portfolio/lib/dates';
import { previewCharges, liveTradingApi, paperApi } from '@/features/trading/api';
import {
  FieldLabel,
  PriceInput,
  QuantityStepper,
  SummaryRow,
} from '@/features/trading/components/OrderInputs';
import {
  DetailStack,
  MoneyCards,
  QuietDisclosure,
  TicketOrders,
} from '@/features/trading/components/TicketMoney';
import {
  tradingKeys,
  useLiveOrders,
  useLiveTradingOptions,
  useLiveWallet,
  useOrderIntent,
  usePaperPreview,
} from '@/features/trading/hooks';
import { pinnedBrokerReason } from '@/features/trading/lib/availability';
import { findOpenOrder, heldQuantity } from '@/features/trading/lib/liveOrders';
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
import {
  detailsSummary,
  liveAmountCard,
  liveBalanceCard,
  liveChargeLines,
  liveDetailRows,
  missingWord,
  openOrderMessage,
  orderTypeHelp,
  ordersSummary,
  paperAmountCard,
  paperBalanceCard,
  paperChargeLines,
  paperDetailRows,
  todaysLiveOrders,
  todaysPaperOrders,
  usablePaperPreview,
} from '@/features/trading/lib/ticketView';
import type { LiveBroker, OrderType, PaperOrderInput } from '@/features/trading/types';
import { useDebounce } from '@/hooks/useDebounce';
import { formatINR, formatQuantity, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { ApiError, getErrorMessage, isApiError } from '@/types/api';

// A pushed modal outside the tab layouts: without its own boundary a render error here
// would take down the whole signed-in stack.
export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

const NUM = { fontVariant: ['tabular-nums' as const] };

type Mode = 'live' | 'paper';
type Product = 'delivery' | 'intraday';
type Step = 'form' | 'review' | 'result';

const PRODUCTS: readonly { key: Product; label: string }[] = [
  { key: 'delivery', label: 'Delivery · CNC' },
  { key: 'intraday', label: 'Intraday · MIS' },
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

  // While ticks stream (either broker), the REST quote is only a fallback and slows down.
  const streaming = useLiveness(exchange, symbol);
  const detail = useStockDetail(symbol, exchange, { streaming: streaming.live });
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
  /** The quiet disclosures: charges & details, its itemised lines, and today's orders. */
  const [showDetails, setShowDetails] = useState(false);
  const [showCharges, setShowCharges] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
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
  // Safe Mode (Profile & security) blocks the live mode only — the server refuses it anyway;
  // this says so before the tap. Paper orders never reach a broker and stay open.
  const safeMode = useSafeModeOn();
  const syncSafeMode = useSafeModeRefusalSync();
  const liveBlocked = isLive && safeMode;
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
  // The typed quantity, for the money card while another field is still incomplete.
  const parsedQuantity = /^\d+$/.test(quantity.trim()) ? Number(quantity.trim()) : null;
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

  // The paper account behind a paper ticket: its free cash and this stock's holding before any
  // preview lands, and today's orders for the stock. Nothing is read for a live ticket (nor
  // while it is still unknown whether this one will be live).
  const segment = product === 'delivery' ? ('equity' as const) : ('intraday' as const);
  const paperMode = !isLive && (chosenMode === 'paper' || !live.isLoading);
  const paperAccount = usePaperPortfolio(segment, profileId, paperMode);
  const paperOrders = usePaperOrders(profileId, 200, paperMode);
  // Real orders: one working order per stock per broker (the server refuses a second), and
  // today's orders for the stock.
  const liveOrders = useLiveOrders(50, isLive);

  // Memoised on primitives: a fresh object each render would restart the debounce forever.
  const paperInput = useMemo<PaperOrderInput | null>(
    () =>
      !isLive && symbol && orderQuantity !== null
        ? {
            segment,
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
      segment,
      profileId,
      exchange,
      symbol,
      side,
      orderType,
    ],
  );
  const debouncedPaper = useDebounce(paperInput, 300);
  const paperPreview = usePaperPreview(debouncedPaper);
  // Only a preview of exactly these inputs counts: while typing, the previous order's figures
  // (kept on screen to avoid flicker) must not be read — or reviewed — as this one's.
  const previewCurrent =
    paperInput !== null && debouncedPaper === paperInput && !paperPreview.isPlaceholderData;
  const rawPreview = previewCurrent ? (paperPreview.data ?? null) : null;
  const preview = usablePaperPreview(rawPreview);
  const previewFailed =
    previewCurrent &&
    !paperPreview.isFetching &&
    (paperPreview.isError || (rawPreview !== null && !preview));
  const previewPending = paperInput !== null && !preview && !previewFailed;

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
  const liveCharges =
    chargesInput !== null && chargesInput === liveChargesInput && !charges.isPlaceholderData
      ? (charges.data?.breakdown ?? null)
      : null;

  const chargesTotal = isLive ? (liveCharges?.total ?? null) : (preview?.charges ?? null);
  const blockedReason = !isLive ? (rawPreview?.blockedReason ?? null) : null;
  // Paper: the server's own margin figure — an intraday buy is leveraged, so it commits only a
  // fraction of its value. Live: the order value against the broker's funds.
  const paperMargin = preview?.marginRequired ?? null;
  const paperAvailable = preview?.availableCash ?? paperAccount.data?.wallet.availableCash ?? null;
  const shortOfFunds = isLive
    ? isBuy && estimate !== null && available !== null && estimate > available
    : isBuy && paperMargin !== null && paperAvailable !== null && paperMargin > paperAvailable;

  const openOrder =
    isLive && broker ? findOpenOrder(liveOrders.data, { broker, exchange, symbol }) : null;
  const openOrderNote = openOrderMessage(openOrder, displaySymbol, brokerLabel ?? 'your broker');

  // ── The money (web: the ticket's two cards, then "Charges & details") ──
  const missing = missingWord(errors);
  const paperHeld =
    paperAccount.data?.positions.find(
      (position) => position.exchange === exchange && position.symbol === symbol,
    )?.quantity ?? null;
  const amountCard = isLive
    ? liveAmountCard({ side, quantity: orderQuantity ?? parsedQuantity, price, missing })
    : paperAmountCard({
        side,
        quantity: orderQuantity ?? parsedQuantity,
        missing,
        pending: previewPending,
        failed: previewFailed,
        preview,
      });
  const balanceCard = isLive
    ? liveBalanceCard({
        side,
        product,
        brokerLabel,
        available,
        loading: wallet.isPending,
        error: wallet.error,
        held,
        price: price ?? ltp,
      })
    : paperBalanceCard({
        side,
        preview,
        available: paperAccount.data?.wallet.availableCash ?? null,
        leverage: paperAccount.data?.leverage ?? null,
        held: paperHeld,
        price: price ?? ltp,
      });
  const detailRows = isLive
    ? order
      ? liveDetailRows({ estimate, charges: chargesTotal })
      : []
    : preview && !missing && preview.referencePrice > 0
      ? paperDetailRows(preview, side)
      : [];
  const chargeLines = isLive
    ? liveChargeLines(liveCharges)
    : paperChargeLines(preview?.chargesBreakdown, side, segment);
  const today = istToday();
  const todays = isLive
    ? todaysLiveOrders(liveOrders.data, { exchange, symbol }, today)
    : todaysPaperOrders(paperOrders.data, { exchange, symbol }, today);

  const triggerHint = needsTriggerPrice(orderType)
    ? `Fires at or ${isBuy ? 'above' : 'below'} this price.${preview?.triggered ? ' Already reached — fills now.' : ''}`
    : null;
  const limitHint =
    orderType === 'SL'
      ? `Keep at or ${isBuy ? 'above' : 'below'} the trigger.`
      : orderType === 'LIMIT' && preview?.wouldRest
        ? `Will rest — the market is ${isBuy ? 'above' : 'below'} your limit.`
        : null;

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
      syncSafeMode(error);
      const retrySafe = isApiError(error) && (error.isNetworkError || error.isServerError);
      setSubmitError(
        retrySafe && reviewed?.mode === 'live'
          ? `${getErrorMessage(error)} Tapping confirm again is safe — it can't place a second order.`
          : getErrorMessage(error),
      );
    },
  });

  // Paper is priced by the server before it can be reviewed (the web's rule): the review shows
  // the server's figures, never a stale or missing estimate.
  const awaitingPrice = !isLive && order !== null && !preview;
  const canReview =
    Boolean(detail.data) &&
    !blockedReason &&
    !live.isLoading &&
    !liveBlocked &&
    !openOrder &&
    !awaitingPrice;

  const openReview = () => {
    setShowErrors(true);
    if (!order || !canReview) return;
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

  const prevClose = liveQuote?.prevClose ?? detail.data?.prevClose ?? null;
  const changePct =
    ltp !== null && prevClose !== null && prevClose > 0
      ? ((ltp - prevClose) / prevClose) * 100
      : (detail.data?.changePct ?? null);
  const fixBroker = () => router.push('/brokers');
  const setMax = (n: number) => edit(setQuantity)(String(Math.min(n, MAX_ORDER_QUANTITY)));

  return (
    <SafeAreaView edges={SCREEN_EDGES} style={{ flex: 1, backgroundColor: colors.surface }}>
      <View className="flex-row items-start gap-3 px-5 pb-3 pt-4">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              accessibilityRole="header"
              className="flex-shrink text-xl font-bold text-ink dark:text-ink-dark"
              numberOfLines={1}
            >
              {step === 'result' ? 'Order status' : title}
            </Text>
            {step === 'result' ? null : (
              <Badge label={isLive ? 'LIVE' : 'PAPER'} variant={isLive ? 'danger' : 'primary'} />
            )}
          </View>
          <Text
            className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
            style={NUM}
            numberOfLines={1}
          >
            {exchange} · {formatINR(ltp)}
            {changePct !== null ? (
              <ChangeText value={changePct} className="text-xs">
                {'  '}
                {formatSignedPercent(changePct)}
              </ChangeText>
            ) : null}
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
            <View className="gap-5">
              {detail.error && !detail.data ? (
                <InlineError
                  what={`${symbol}'s price`}
                  error={detail.error}
                  onRetry={() => void detail.refetch()}
                />
              ) : null}

              <View className="gap-2.5">
                <SegmentedControl
                  items={modeItems}
                  value={isLive ? 'live' : 'paper'}
                  onChange={(next) => {
                    if (next === 'live' && !liveAvailable) return;
                    edit(setChosenMode)(next);
                  }}
                />
                {!liveAvailable && liveReason ? (
                  <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                    Live unavailable: {liveReason}{' '}
                    <Text
                      className="font-semibold text-brand-text dark:text-brand-text-dark"
                      onPress={fixBroker}
                    >
                      Brokers
                    </Text>
                  </Text>
                ) : null}
                {isLive && !pinned && brokerItems.length > 1 && broker ? (
                  <SegmentedControl
                    items={brokerItems}
                    value={broker}
                    onChange={edit(setChosenBroker)}
                  />
                ) : null}
                <SegmentedControl items={PRODUCTS} value={product} onChange={edit(setProduct)} />
              </View>

              <View>
                <FieldLabel>Quantity</FieldLabel>
                <QuantityStepper
                  value={quantity}
                  onChange={edit(setQuantity)}
                  max={MAX_ORDER_QUANTITY}
                  size="lg"
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
                <Text className="mt-1.5 text-xs text-ink-faint dark:text-ink-dark-faint">
                  {orderTypeHelp(orderType, isLive ? 'live' : 'paper')}
                </Text>
              </View>

              {needsLimitPrice(orderType) || needsTriggerPrice(orderType) ? (
                <View className="flex-row gap-3">
                  {needsTriggerPrice(orderType) ? (
                    <PriceInput
                      label="Trigger price"
                      value={triggerPrice}
                      onChange={edit(setTriggerPrice)}
                      placeholder={ltp !== null ? ltp.toFixed(2) : undefined}
                      error={showErrors ? errors.triggerPrice : null}
                      hint={triggerHint}
                      size="lg"
                    />
                  ) : null}
                  {needsLimitPrice(orderType) ? (
                    <PriceInput
                      label={orderType === 'SL' ? 'Limit price' : 'Price'}
                      value={limitPrice}
                      onChange={edit(setLimitPrice)}
                      placeholder={ltp !== null ? ltp.toFixed(2) : undefined}
                      error={showErrors ? errors.limitPrice : null}
                      hint={limitHint}
                      size="lg"
                    />
                  ) : null}
                </View>
              ) : null}

              <View>
                <MoneyCards
                  amount={amountCard}
                  balance={balanceCard}
                  onMax={setMax}
                  onFix={isLive ? fixBroker : undefined}
                />
                {detailRows.length > 0 ? (
                  <>
                    <QuietDisclosure
                      className="mt-1"
                      label="Charges & details"
                      summary={detailsSummary(chargesTotal, showDetails)}
                      open={showDetails}
                      onToggle={() => setShowDetails((open) => !open)}
                    />
                    {showDetails ? (
                      <DetailStack
                        rows={detailRows}
                        chargeLines={chargeLines}
                        chargesOpen={showCharges}
                        onToggleCharges={() => setShowCharges((open) => !open)}
                        notes={!isLive ? preview?.notices : undefined}
                      />
                    ) : null}
                  </>
                ) : null}
              </View>

              {liveBlocked ? <SafeModeNotice /> : null}
              {openOrderNote ? <Banner tone="warning" message={openOrderNote} /> : null}
              {blockedReason ? <Banner tone="warning" message={blockedReason} /> : null}
              {!isLive && previewFailed && paperPreview.error ? (
                <Banner tone="warning" message={getErrorMessage(paperPreview.error)} />
              ) : null}
              {shortOfFunds && !blockedReason ? (
                <Banner
                  tone="warning"
                  message={
                    isLive
                      ? 'More than your available balance.'
                      : 'More than your paper wallet’s available cash.'
                  }
                />
              ) : null}
              {held !== null && orderQuantity !== null && orderQuantity > held ? (
                <Banner
                  tone="warning"
                  message={`Only ${formatQuantity(held)} held at ${brokerLabel ?? 'your broker'} — a delivery sell can't be larger.`}
                />
              ) : null}

              <View className="border-t border-line pt-1 dark:border-line-dark">
                <QuietDisclosure
                  label="Today’s orders"
                  summary={ordersSummary(todays.length, showOrders)}
                  open={showOrders && todays.length > 0}
                  onToggle={() => setShowOrders((open) => todays.length > 0 && !open)}
                />
                {showOrders && todays.length > 0 ? <TicketOrders rows={todays} /> : null}
              </View>
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
                <SummaryRow
                  label="Order value"
                  value={formatINR(
                    reviewed.mode === 'paper' ? (preview?.grossValue ?? null) : estimate,
                  )}
                />
                <SummaryRow
                  label={reviewed.mode === 'paper' ? 'Charges' : 'Estimated charges'}
                  value={chargesTotal !== null ? formatINR(chargesTotal) : '—'}
                />
                <SummaryRow label={amountCard.label} value={amountCard.value} strong />
              </View>
              {reviewed.mode === 'live' ? (
                <Banner
                  tone="warning"
                  title="Confirm a real order"
                  message={`${isBuy ? 'Buying' : 'Selling'} on ${reviewedBrokerLabel} with real money. A market order fills at the prevailing price, which can differ from the estimate.`}
                />
              ) : null}
              {reviewed.mode === 'live' && safeMode ? <SafeModeNotice /> : null}
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
            <>
              <Text
                className={
                  isLive
                    ? 'text-center text-xs font-semibold text-warning-600 dark:text-warning-dark'
                    : 'text-center text-xs text-ink-muted dark:text-ink-dark-muted'
                }
              >
                {isLive
                  ? `Real money · sent to ${brokerLabel ?? 'your broker'} after a risk check`
                  : 'Paper · virtual cash, real prices, no broker'}
              </Text>
              <Button
                label={
                  liveBlocked
                    ? 'Safe Mode is on'
                    : openOrder
                      ? `${displaySymbol} has an open order`
                      : `Review ${isBuy ? 'buy' : 'sell'}`
                }
                size="lg"
                fullWidth
                variant={isBuy ? 'primary' : 'danger'}
                disabled={!canReview}
                onPress={openReview}
              />
            </>
          ) : null}
          {step === 'review' ? (
            <>
              <Button
                label={`Confirm ${isBuy ? 'buy' : 'sell'}${reviewed?.mode === 'live' ? '' : ' (paper)'}`}
                size="lg"
                fullWidth
                variant={isBuy ? 'primary' : 'danger'}
                loading={place.isPending}
                disabled={reviewed?.mode === 'live' && safeMode}
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
