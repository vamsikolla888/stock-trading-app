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

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Tabs';
import { useStockDetail } from '@/features/market/hooks';
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
  useLiveTradingAvailability,
  useLiveWallet,
  useOrderIntent,
  usePaperPreview,
} from '@/features/trading/hooks';
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
import type { OrderSide, OrderType, PaperOrderInput } from '@/features/trading/types';
import { useDebounce } from '@/hooks/useDebounce';
import { formatINR, formatQuantity } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { ApiError, getErrorMessage, isApiError } from '@/types/api';

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
  const params = useLocalSearchParams<{ symbol: string; exchange?: string; side?: string }>();
  const symbol = (params.symbol ?? '').toUpperCase();
  const exchange = (params.exchange ?? 'NSE').toUpperCase() as 'NSE' | 'BSE';
  const side: OrderSide = params.side === 'SELL' ? 'SELL' : 'BUY';
  const isBuy = side === 'BUY';

  const detail = useStockDetail(symbol, exchange);
  const live = useLiveTradingAvailability();
  const intent = useOrderIntent();

  const [chosenMode, setChosenMode] = useState<Mode | null>(null);
  const [product, setProduct] = useState<Product>('delivery');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<OrderOutcome | null>(null);
  /** The mode shown on the review screen — what Confirm will place. */
  const [reviewedMode, setReviewedMode] = useState<Mode | null>(null);

  // Live only when the pre-checks pass; otherwise paper, with the reason shown.
  const mode: Mode = chosenMode ?? (live.available ? 'live' : 'paper');
  const isLive = mode === 'live' && live.available;
  const ltp = detail.data?.ltp ?? null;
  const displaySymbol =
    detail.data?.listings?.find((listing) => listing.exchange === exchange)?.displaySymbol ??
    symbol;

  const form = { side, orderType, quantity, limitPrice, triggerPrice };
  const { order, errors } = validateOrder(form);
  const [showErrors, setShowErrors] = useState(false);

  // Any edit to what would be sent is a new intent: its idempotency key must not be reused.
  // Done in the setters (not an effect) so it happens exactly when the user changes a field.
  const edit =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      intent.discard();
      setSubmitError(null);
      setter(value);
    };

  const wallet = useLiveWallet(isLive ? live.broker : null);
  const available = isLive
    ? product === 'delivery'
      ? (wallet.data?.deliveryAvailable ?? null)
      : (wallet.data?.intradayAvailable ?? null)
    : null;

  const paperInput = useMemo<PaperOrderInput | null>(
    () =>
      !isLive && order
        ? {
            segment: product === 'delivery' ? 'equity' : 'intraday',
            exchange,
            symbol,
            side,
            type: orderType,
            quantity: order.quantity,
            limitPrice: order.price,
            triggerPrice: order.triggerPrice,
          }
        : null,
    [
      isLive,
      order?.quantity,
      order?.price,
      order?.triggerPrice,
      product,
      exchange,
      symbol,
      side,
      orderType,
    ], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const paperPreview = usePaperPreview(useDebounce(paperInput, 300));

  const price = order ? referencePrice(order, orderType, ltp) : null;
  const estimate = order && price !== null ? order.quantity * price : null;
  const orderQuantity = order?.quantity ?? null;
  // Memoised on primitives: a fresh object each render would restart the debounce forever.
  const liveChargesInput = useMemo(
    () =>
      isLive && orderQuantity !== null && price !== null
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
    ? (charges.data?.breakdown.total ?? null)
    : (paperPreview.data?.charges ?? null);
  const fundsShown = isLive ? available : (paperPreview.data?.availableCash ?? null);
  const blockedReason = !isLive ? (paperPreview.data?.blockedReason ?? null) : null;
  const shortOfFunds = isBuy && estimate !== null && fundsShown !== null && estimate > fundsShown;

  const refreshAfterOrder = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: portfolioKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['portfolio', 'orders'] }),
      queryClient.invalidateQueries({ queryKey: ['paper'] }),
      queryClient.invalidateQueries({ queryKey: tradingKeys.wallet(live.broker ?? 'none') }),
    ]);

  const place = useMutation({
    mutationFn: async (idempotencyKey: string): Promise<OrderOutcome> => {
      if (!order) throw new Error('Invalid order');
      // Place exactly what was reviewed. If live trading became unavailable while the
      // review was open, refuse rather than quietly placing it as the other mode.
      if (reviewedMode === 'live' && (!live.available || !live.broker)) {
        throw new ApiError({
          status: 409,
          code: 'LIVE_UNAVAILABLE',
          message: live.reason ?? 'Live trading is no longer available. Go back to edit the order.',
        });
      }
      if (reviewedMode === 'live' && live.broker) {
        const result = await liveTradingApi.placeOrder({
          mode: 'live',
          broker: live.broker,
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
      void refreshAfterOrder();
    },
    onError: (error) => {
      intent.settle(error);
      const retrySafe = isApiError(error) && (error.isNetworkError || error.isServerError);
      setSubmitError(
        retrySafe && reviewedMode === 'live'
          ? `${getErrorMessage(error)} Tapping confirm again is safe — it can't place a second order.`
          : getErrorMessage(error),
      );
    },
  });

  const openReview = () => {
    setShowErrors(true);
    if (!order || blockedReason) return;
    if (isLive) intent.begin();
    setReviewedMode(isLive ? 'live' : 'paper');
    setSubmitError(null);
    setStep('review');
  };

  const confirm = () => {
    if (place.isPending) return;
    place.mutate(reviewedMode === 'live' ? intent.begin() : 'paper');
  };

  const title = `${isBuy ? 'Buy' : 'Sell'} ${displaySymbol}`;
  const modeItems: readonly { key: Mode; label: string }[] = [
    { key: 'live', label: live.brokerLabel ? `Live · ${live.brokerLabel}` : 'Live' },
    { key: 'paper', label: 'Paper' },
  ];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.surface }}>
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
          onPress={() => router.back()}
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
              <View>
                <SegmentedControl
                  items={modeItems}
                  value={isLive ? 'live' : 'paper'}
                  onChange={(next) => {
                    if (next === 'live' && !live.available) return;
                    edit(setChosenMode)(next);
                  }}
                />
                {!live.available && live.reason ? (
                  <Text className="mt-1.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                    Live unavailable: {live.reason}{' '}
                    <Text
                      className="font-semibold text-brand-text dark:text-brand-text-dark"
                      onPress={() => router.push('/brokers')}
                    >
                      Brokers
                    </Text>
                  </Text>
                ) : null}
              </View>

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
                      placeholder={ltp ? ltp.toFixed(2) : undefined}
                      error={showErrors ? errors.limitPrice : null}
                    />
                  ) : null}
                  {needsTriggerPrice(orderType) ? (
                    <PriceInput
                      label="Trigger price"
                      value={triggerPrice}
                      onChange={edit(setTriggerPrice)}
                      placeholder={ltp ? ltp.toFixed(2) : undefined}
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
                <SummaryRow
                  label={isLive ? 'Available funds' : 'Paper cash available'}
                  value={
                    fundsShown !== null
                      ? formatINR(fundsShown)
                      : isLive && wallet.isPending
                        ? 'Checking…'
                        : '—'
                  }
                />
              </View>

              {blockedReason ? <Banner tone="warning" message={blockedReason} /> : null}
              {!isLive &&
                paperPreview.data?.notices.map((notice) => (
                  <Banner key={notice} tone="info" message={notice} />
                ))}
              {shortOfFunds && !blockedReason ? (
                <Banner
                  tone="warning"
                  message="The estimated value is more than your available funds."
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
                    ? `This sends a real order to ${live.brokerLabel ?? 'your broker'}. Pre-trade risk checks run on the server; executed orders can't be undone.`
                    : 'Paper orders use virtual cash and real prices. Nothing is sent to a broker.'
                }
              />
            </View>
          ) : null}

          {step === 'review' && order ? (
            <View className="gap-4">
              <View className="rounded-xl border border-line px-3.5 py-2.5 dark:border-line-dark">
                <SummaryRow
                  label="Mode"
                  value={
                    reviewedMode === 'live'
                      ? `Live · ${live.brokerLabel ?? ''}`
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
              {reviewedMode === 'live' ? (
                <Banner
                  tone="warning"
                  title="Confirm a real order"
                  message={`${isBuy ? 'Buying' : 'Selling'} on ${live.brokerLabel ?? 'your broker'} with real money. Market orders fill at the prevailing price, which can differ from the estimate.`}
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
              {outcome.details.map((line) => (
                <Text
                  key={line}
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
                label={`Confirm ${isBuy ? 'buy' : 'sell'}${reviewedMode === 'live' ? '' : ' (paper)'}`}
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
              <Button label="Done" size="lg" fullWidth onPress={() => router.back()} />
              <Button
                label={reviewedMode === 'live' ? 'View orders' : 'Open paper portfolio'}
                variant="ghost"
                fullWidth
                onPress={() =>
                  router.replace(reviewedMode === 'live' ? '/trade/mstock' : '/trade/paper')
                }
              />
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
