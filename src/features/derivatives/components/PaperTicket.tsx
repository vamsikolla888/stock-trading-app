import { useRouter } from 'expo-router';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleX from 'lucide-react-native/icons/circle-x';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import {
  FieldLabel,
  LotsStepper,
  Note,
  SideToggle,
  SummaryBox,
  SummaryLine,
} from '@/features/fno/components/primitives';
import { Sheet } from '@/features/fno/components/Sheet';
import { riskNote } from '@/features/fno/lib/chain';
import {
  contractTitle,
  DASH,
  expiryLabel,
  ivPct,
  lotsLabel,
  signedGreek,
} from '@/features/fno/lib/format';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatQuantity } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { usePlacePaperOrder } from '../hooks';
import { fillSummary, legOrderValue, PAPER_MAX_LOTS, QUICK_LOTS } from '../lib/book';
import type { DerivativeKind, FnoOrderView, PaperExchange } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };

export interface PaperTicketTarget {
  tradingsymbol: string;
  exchange: PaperExchange;
  underlying: string;
  kind: DerivativeKind;
  strike: number | null;
  expiry: string;
  lotSize: number;
  side: 'BUY' | 'SELL';
  /** Bumped on every open, so re-opening the same contract re-seeds the form. */
  nonce: number;
}

/** What the chain currently says about the ticket's contract (refreshed by the parent). */
export interface PaperTicketQuote {
  lastPrice: number | null;
  impliedVolatility: number | null;
  delta: number | null;
}

/**
 * The paper order ticket for one option leg or future. LOTS ONLY — the arithmetic (lots × lot
 * size = quantity, × premium = the money that moves) is shown before the button. A REJECTION IS
 * A RESULT, NOT AN ERROR: the server answers 201 with `REJECTED` and a note saying why, and that
 * sentence is shown in place. Simulated — nothing reaches a broker.
 */
export function PaperTicket({
  target,
  quote,
  onClose,
}: {
  target: PaperTicketTarget | null;
  quote: PaperTicketQuote | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      visible={target != null}
      onClose={onClose}
      busy={busy}
      title={target ? contractTitle(target) : ''}
      subtitle={
        target
          ? `${expiryLabel(target.expiry)} expiry · ${target.tradingsymbol} · lot ${formatQuantity(target.lotSize)}`
          : undefined
      }
      headerRight={
        target ? (
          <View className="items-end">
            <Text className="text-base font-bold text-ink dark:text-ink-dark" style={NUM}>
              {quote?.lastPrice != null ? formatINR(quote.lastPrice) : DASH}
            </Text>
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
              {target.kind === 'FUT' ? 'last price' : 'premium'}
            </Text>
          </View>
        ) : null
      }
    >
      {target ? (
        <TicketBody
          key={`${target.exchange}:${target.tradingsymbol}:${target.nonce}`}
          target={target}
          quote={quote}
          onBusy={setBusy}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function TicketBody({
  target,
  quote,
  onBusy,
  onClose,
}: {
  target: PaperTicketTarget;
  quote: PaperTicketQuote | null;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const place = usePlacePaperOrder();
  const inFlight = useRef(false);
  const [side, setSide] = useState(target.side);
  const [lots, setLots] = useState(1);
  const [receipt, setReceipt] = useState<FnoOrderView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onBusy(place.isPending), [place.isPending, onBusy]);

  const lastPrice = quote?.lastPrice ?? null;
  const isOption = target.kind !== 'FUT';
  const { quantity, total } = legOrderValue({ lastPrice, lotSize: target.lotSize }, lots);
  const lotsOk = Number.isInteger(lots) && lots >= 1 && lots <= PAPER_MAX_LOTS;
  // Null premium is not zero: the contract has never traded, so there is nothing to fill at.
  const tradeable = lastPrice != null;
  const isBuy = side === 'BUY';
  const valueLabel = !isOption
    ? 'Contract value'
    : isBuy
      ? 'Premium payable'
      : 'Premium receivable';

  const change =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setError(null);
      setter(value);
    };

  const submit = () => {
    if (!tradeable || !lotsOk || place.isPending || inFlight.current) return;
    inFlight.current = true;
    place.mutate(
      { tradingsymbol: target.tradingsymbol, exchange: target.exchange, side, lots },
      {
        onSuccess: (order) => {
          setReceipt(order);
          if (order.status === 'FILLED') {
            toast.success(
              'Paper order filled',
              `${order.side === 'BUY' ? 'Bought' : 'Sold'} ${lotsLabel(order.lots)} · ${order.tradingsymbol}`,
            );
          }
        },
        onError: (err) => setError(getErrorMessage(err, 'The paper order could not be placed.')),
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  };

  if (receipt) {
    const filled = receipt.status === 'FILLED';
    return (
      <View accessibilityLiveRegion="polite" className="items-center gap-3 pb-1 pt-3">
        <View
          className={cn(
            'h-16 w-16 items-center justify-center rounded-full',
            filled
              ? 'bg-brand-wash dark:bg-brand-wash-dark'
              : 'bg-danger-wash dark:bg-danger-wash-dark',
          )}
        >
          {filled ? (
            <CircleCheck size={30} color={colors.success} />
          ) : (
            <CircleX size={30} color={colors.danger} />
          )}
        </View>
        <Text className="text-center text-lg font-bold text-ink dark:text-ink-dark">
          {filled ? 'Filled in your paper book' : 'Rejected'}
        </Text>
        <Text className="text-center text-sm text-ink-muted dark:text-ink-dark-muted" style={NUM}>
          {receipt.side === 'BUY' ? 'Buy' : 'Sell'} {lotsLabel(receipt.lots)} ·{' '}
          {receipt.tradingsymbol}
          {filled ? ` at ${formatINR(receipt.price)}` : ''}
        </Text>
        {filled ? (
          <Text
            className="max-w-[340px] text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted"
            style={NUM}
          >
            {fillSummary(receipt, (n) => formatINR(n))}
          </Text>
        ) : null}
        {receipt.note ? (
          <Text className="max-w-[340px] text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            {receipt.note}
          </Text>
        ) : null}
        <View className="mt-2 w-full gap-2">
          <Button label="Done" size="lg" fullWidth onPress={onClose} />
          <Button
            label={filled ? 'View paper positions' : 'Change and try again'}
            variant="ghost"
            fullWidth
            onPress={() => {
              if (filled) {
                onClose();
                router.push({ pathname: '/fno/paper', params: { view: 'positions' } });
              } else {
                setReceipt(null);
              }
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="gap-4 pb-1">
      <View className="self-start rounded-md bg-info-wash px-2 py-1 dark:bg-info-wash-dark">
        <Text className="text-[11px] font-bold text-info dark:text-info-dark">
          PAPER — simulated, no broker
        </Text>
      </View>

      <SideToggle value={side} onChange={change(setSide)} disabled={place.isPending} />

      <View className="flex-row rounded-xl border border-line px-3 py-2.5 dark:border-line-dark">
        <Fact
          label={isOption ? 'Premium' : 'Price'}
          value={lastPrice != null ? formatINR(lastPrice) : DASH}
        />
        {isOption ? (
          <>
            <Fact label="IV" value={ivPct(quote?.impliedVolatility)} />
            <Fact label="Delta" value={signedGreek(quote?.delta, 3)} />
          </>
        ) : null}
        <Fact label="Lot size" value={formatQuantity(target.lotSize)} />
      </View>

      <View>
        <FieldLabel>Lots</FieldLabel>
        <LotsStepper
          value={lots}
          onChange={change(setLots)}
          max={PAPER_MAX_LOTS}
          disabled={place.isPending}
        />
        <View className="mt-2 flex-row gap-2">
          {QUICK_LOTS.map((n) => (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityState={{ selected: lots === n }}
              accessibilityLabel={lotsLabel(n)}
              onPress={() => change(setLots)(n)}
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
        {!lotsOk && lots !== 0 ? (
          <Text className="mt-1.5 text-xs text-danger-600 dark:text-danger-dark">
            A paper order is 1 to {PAPER_MAX_LOTS} lots.
          </Text>
        ) : null}
      </View>

      <SummaryBox>
        <SummaryLine
          label={`${lotsLabel(lots)} × ${formatQuantity(target.lotSize)}`}
          value={`${formatQuantity(quantity)} qty`}
        />
        <SummaryLine label={valueLabel} value={total != null ? formatINR(total) : DASH} strong />
      </SummaryBox>

      {!tradeable ? (
        <Banner
          tone="info"
          message="This contract has no traded price, so there is nothing to fill against. It is not worthless — it simply has not printed."
        />
      ) : null}
      {error ? <Banner tone="error" message={error} /> : null}

      <Note>{riskNote(target.kind, side)}</Note>

      <Button
        label={`${isBuy ? 'Buy' : 'Sell'} ${lotsLabel(lotsOk ? lots : 0)}${total != null && lotsOk ? ` · ${formatINR(total, 0)}` : ''}`}
        size="lg"
        fullWidth
        variant={isBuy ? 'primary' : 'danger'}
        loading={place.isPending}
        disabled={!tradeable || !lotsOk}
        onPress={submit}
        accessibilityLabel={`${isBuy ? 'Buy' : 'Sell'} ${lotsLabel(lots)} of ${contractTitle(target)} in the paper book`}
      />
      <Text className="text-center text-[11px] text-ink-faint dark:text-ink-dark-faint">
        Fills at the live quote in your paper F&amp;O pool, with itemised charges and an approximate
        margin.
      </Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{label}</Text>
      <Text
        className="mt-0.5 text-[13px] font-semibold text-ink dark:text-ink-dark"
        style={NUM}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
