import { useRouter } from 'expo-router';
import FlaskConical from 'lucide-react-native/icons/flask-conical';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { IconTile } from '@/components/ui/IconTile';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { Caveats, Disclosure, Note, PillButton, Tag } from '@/features/fno/components/primitives';
import {
  contractTitle,
  DASH,
  expiryLabel,
  ivPct,
  lotsLabel,
  signedGreek,
  todayIst,
} from '@/features/fno/lib/format';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatQuantity, formatSignedINR } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { usePaperBook, useSettleExpiredPaper, useSquareOffPaper } from '../hooks';
import {
  expiredCount,
  isExpired,
  payoffGroups,
  PAYOFF_MAX_LEGS,
  positionDteLabel,
  settlementOutcome,
  type SettlementOutcome,
} from '../lib/book';
import { paperChainHref } from '../lib/routes';
import type { FnoBook, FnoOrderView, FnoPositionView } from '../types';

import { PayoffSheet } from './PayoffSheet';

const NUM = { fontVariant: ['tabular-nums' as const] };

const pnlTone = (n: number | null) =>
  n == null || n === 0
    ? 'text-ink dark:text-ink-dark'
    : n > 0
      ? 'text-brand-text dark:text-brand-text-dark'
      : 'text-danger-600 dark:text-danger-dark';

/**
 * The paper F&O book — the web's /fno/paper/positions: what is held, what it is worth and what
 * it is exposed to. Net greeks lead, above the rows: a multi-leg book is not described by its
 * legs. A net greek of null is NOT zero (nothing could be greeked), and `ungreekedCount` says
 * how much of the book the shown nets leave out. Margin is an approximation, not SPAN.
 *
 * One section per underlying, each with its expiry payoff priced at what the legs cost.
 * Square-off is an opposite order at the live price, so it can come back REJECTED (no price to
 * close against) like any order — that answer is shown, not treated as a failure.
 */
export function PaperPositions() {
  const router = useRouter();
  const book = usePaperBook();
  // Destructured so the row callbacks stay stable (the mutation object is new every render).
  const {
    mutate: squareOff,
    isPending: squaringOff,
    variables: squaringVariables,
  } = useSquareOffPaper();
  const settle = useSettleExpiredPaper();
  const now = useNow(60_000);
  const today = todayIst(now);
  const [settled, setSettled] = useState<SettlementOutcome | null>(null);
  const [rejected, setRejected] = useState<FnoOrderView | null>(null);
  const [payoffFor, setPayoffFor] = useState<string | null>(null);

  const data = book.data;
  const positions = useMemo(() => data?.positions ?? [], [data]);
  const groups = useMemo(() => payoffGroups(positions), [positions]);
  const expired = expiredCount(positions, today);
  const payoffGroup = payoffFor ? (groups.find((g) => g.underlying === payoffFor) ?? null) : null;

  const openChain = useCallback(
    (p: FnoPositionView) =>
      router.push(
        paperChainHref({
          underlying: p.underlying,
          expiry: p.kind === 'FUT' || isExpired(p.expiry, today) ? null : p.expiry,
        }),
      ),
    [router, today],
  );

  const confirmSquareOff = useCallback(
    (p: FnoPositionView) => {
      if (squaringOff) return;
      const lots = Math.abs(p.lots);
      Alert.alert(
        'Square off at the live price?',
        `${p.side === 'LONG' ? 'Sell' : 'Buy'} ${lotsLabel(lots)} of ${p.tradingsymbol} in your paper book. Charges apply as on any order.`,
        [
          { text: 'Keep it', style: 'cancel' },
          {
            text: 'Square off',
            style: 'destructive',
            onPress: () => {
              setRejected(null);
              squareOff(
                { exchange: p.exchange, tradingsymbol: p.tradingsymbol },
                {
                  onSuccess: (order) => {
                    if (order.status === 'FILLED') {
                      toast.success(
                        'Squared off',
                        `${order.tradingsymbol} at ${formatINR(order.price)}${
                          order.realisedPnl != null
                            ? ` · realised ${formatSignedINR(order.realisedPnl)}`
                            : ''
                        }`,
                      );
                    } else {
                      setRejected(order);
                      toast.error('Square-off rejected', order.note ?? order.tradingsymbol);
                    }
                  },
                  onError: (error) => toast.error('Could not square off', getErrorMessage(error)),
                },
              );
            },
          },
        ],
      );
    },
    [squareOff, squaringOff, setRejected],
  );

  const runSettle = () => {
    if (settle.isPending) return;
    setSettled(null);
    settle.mutate(undefined, {
      onSuccess: (result) => {
        const outcome = settlementOutcome(
          result,
          expired,
          (n) => formatINR(n),
          (n) => formatSignedINR(n),
        );
        setSettled(outcome);
        if (result.settled > 0) toast.success(outcome.title);
      },
      onError: (error) => toast.error('Could not settle', getErrorMessage(error)),
    });
  };

  if (book.isPending) {
    return (
      <View className="gap-4">
        <View className="h-[132px] rounded-card bg-surface-sunk dark:bg-surface-sunk-dark" />
        <ListSkeleton rows={3} />
      </View>
    );
  }
  if (book.isError && !data) {
    return (
      <InlineError
        what="your paper positions"
        error={book.error}
        onRetry={() => void book.refetch()}
      />
    );
  }
  if (!data) return null;

  const pendingSymbol = squaringOff ? (squaringVariables?.tradingsymbol ?? null) : null;

  return (
    <View>
      <BookSummary book={data} />
      {book.isError ? (
        <Text className="mt-2 text-[11px] text-warning-600 dark:text-warning-dark">
          Couldn’t refresh — showing the last marks.
        </Text>
      ) : null}

      {expired > 0 ? (
        <View className="mt-4 gap-2.5">
          <Banner
            tone="warning"
            title={`${expired} position${expired === 1 ? ' has' : 's have'} passed expiry`}
            message="Settling closes them at INTRINSIC value, not at zero — an expiring in-the-money option is worth real money and the exchange cash-settles it."
          />
          <Button
            label={settle.isPending ? 'Settling…' : 'Settle expired positions'}
            variant="secondary"
            size="sm"
            loading={settle.isPending}
            onPress={runSettle}
          />
        </View>
      ) : null}
      {settled ? (
        <Banner
          className="mt-4"
          tone={settled.tone}
          title={settled.title}
          message={settled.message}
        />
      ) : null}
      {settle.isError ? (
        <Banner className="mt-4" tone="error" message={getErrorMessage(settle.error)} />
      ) : null}

      {positions.length > 0 ? <NetExposure book={data} /> : null}

      {rejected ? (
        <Banner
          className="mt-4"
          tone="error"
          title={`Square-off rejected — ${rejected.tradingsymbol}`}
          message={rejected.note ?? 'The server gave no reason.'}
        />
      ) : null}

      {positions.length === 0 ? (
        <View className="mt-5 items-center gap-3 rounded-card border border-line bg-surface px-5 py-8 dark:border-line-dark dark:bg-surface-dark">
          <IconTile Icon={FlaskConical} tone="violet" size="lg" />
          <Text className="text-center text-base font-bold text-ink dark:text-ink-dark">
            Nothing held in your paper book
          </Text>
          <Text className="text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
            Open the option chain to buy or sell your first contract — with paper money.
          </Text>
          <Button
            label="Open option chain"
            onPress={() => router.push(paperChainHref())}
            className="mt-1 self-stretch"
          />
        </View>
      ) : (
        groups.map((g) => (
          <Section
            key={g.underlying}
            title={g.underlying}
            right={
              <PillButton
                label={g.tooMany ? `Payoff · max ${PAYOFF_MAX_LEGS} legs` : 'Payoff'}
                tone="brand"
                disabled={g.tooMany}
                onPress={() => setPayoffFor(g.underlying)}
                accessibilityLabel={
                  g.tooMany
                    ? `Payoff unavailable: more than ${PAYOFF_MAX_LEGS} legs in ${g.underlying}`
                    : `Payoff at expiry for ${g.underlying}`
                }
              />
            }
          >
            <ListCard>
              {g.positions.map((p, index) => (
                <React.Fragment key={p.id}>
                  {index > 0 ? <RowDivider /> : null}
                  <PositionRow
                    position={p}
                    dte={positionDteLabel(p, today)}
                    expired={isExpired(p.expiry, today)}
                    busy={pendingSymbol === p.tradingsymbol}
                    disabled={squaringOff}
                    onOpen={openChain}
                    onSquareOff={confirmSquareOff}
                  />
                </React.Fragment>
              ))}
            </ListCard>
          </Section>
        ))
      )}

      {positions.length > 0 ? (
        <Text className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          {book.isFetching ? 'Refreshing… ' : ''}Marked against live quotes about every 25 s while
          the market is open. Tap a position for its chain.
        </Text>
      ) : null}

      {data.caveats.length > 0 ? (
        <Disclosure
          className="mt-6"
          title="What these numbers assume"
          meta={`${data.caveats.length} thing${data.caveats.length === 1 ? '' : 's'} worth knowing`}
        >
          <Caveats items={data.caveats} />
        </Disclosure>
      ) : null}

      <PayoffSheet group={payoffGroup} onClose={() => setPayoffFor(null)} />
    </View>
  );
}

/* ── Summary and net exposure ────────────────────────────────────────────────────────── */

function BookSummary({ book }: { book: FnoBook }) {
  const t = book.totals;
  const open = book.positions.length;
  return (
    <View
      accessible
      accessibilityLabel={`Unrealised P&L ${formatSignedINR(t.unrealisedPnl)}. Realised ${formatSignedINR(t.realisedPnl)}. Margin blocked ${formatINR(t.marginBlocked)}. Charges paid ${formatINR(t.totalCharges)}.`}
      className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark"
    >
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Unrealised P&amp;L</Text>
      <Text
        className={cn('mt-1 text-[26px] font-bold', pnlTone(t.unrealisedPnl))}
        style={[NUM, { letterSpacing: -0.6 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {formatSignedINR(t.unrealisedPnl)}
      </Text>
      <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
        {open} open position{open === 1 ? '' : 's'} · a leg with no live price is left out
      </Text>
      <View className="mt-3 flex-row border-t border-line pt-3 dark:border-line-dark">
        <Stat
          label="Realised"
          value={formatSignedINR(t.realisedPnl)}
          tone={pnlTone(t.realisedPnl)}
        />
        <Stat
          label="Margin blocked"
          value={formatINR(t.marginBlocked, 0)}
          hint="approx., not SPAN"
        />
        <Stat label="Charges paid" value={formatINR(t.totalCharges)} />
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <View className="flex-1">
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className={cn('mt-0.5 text-sm font-semibold', tone ?? 'text-ink dark:text-ink-dark')}
        style={NUM}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {hint ? (
        <Text className="text-[10px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function NetExposure({ book }: { book: FnoBook }) {
  const t = book.totals;
  const missing = book.ungreekedCount;
  const greeks: { label: string; value: string; why: string }[] = [
    {
      label: 'Net delta',
      value: signedGreek(t.netDelta, 1),
      why: t.netDelta == null ? 'nothing could be greeked' : 'shares-equivalent direction',
    },
    {
      label: 'Net gamma',
      value: signedGreek(t.netGamma, 3),
      why: t.netGamma == null ? 'no model output' : 'how fast delta moves',
    },
    {
      label: 'Net theta',
      value: signedGreek(t.netTheta, 0),
      why: t.netTheta == null ? 'no model output' : 'per day, all else equal',
    },
    {
      label: 'Net vega',
      value: signedGreek(t.netVega, 0),
      why: t.netVega == null ? 'no model output' : 'per 1 vol point',
    },
  ];
  return (
    <Section title="Net exposure" note="scaled and signed">
      <View className="flex-row flex-wrap rounded-card border border-line bg-surface p-1.5 dark:border-line-dark dark:bg-surface-dark">
        {greeks.map((g) => (
          <View
            key={g.label}
            accessible
            accessibilityLabel={`${g.label} ${g.value}, ${g.why}`}
            className="w-1/2 px-2.5 py-2"
          >
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{g.label}</Text>
            <Text className="mt-0.5 text-base font-bold text-ink dark:text-ink-dark" style={NUM}>
              {g.value}
            </Text>
            <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
              {g.why}
            </Text>
          </View>
        ))}
      </View>
      {missing > 0 ? (
        <Note className="mt-2">
          {missing} position{missing === 1 ? ' has' : 's have'} no implied volatility, so no greeks
          could be computed for {missing === 1 ? 'it' : 'them'}. The nets above are the sum over the
          rest — not the whole book’s exposure.
        </Note>
      ) : null}
    </Section>
  );
}

/* ── One position ────────────────────────────────────────────────────────────────────── */

const PositionRow = memo(function PositionRow({
  position: p,
  dte,
  expired,
  busy,
  disabled,
  onOpen,
  onSquareOff,
}: {
  position: FnoPositionView;
  dte: string;
  expired: boolean;
  busy: boolean;
  disabled: boolean;
  onOpen: (p: FnoPositionView) => void;
  onSquareOff: (p: FnoPositionView) => void;
}) {
  const { colors } = useTheme();
  const title = contractTitle({ underlying: p.underlying, kind: p.kind, strike: p.strike });
  const short = p.side === 'SHORT';
  const lots = Math.abs(p.lots);
  const pnl = p.unrealisedPnl;
  const isOption = p.kind !== 'FUT';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${short ? 'short' : 'long'} ${lotsLabel(lots)}, unrealised P&L ${
        pnl == null ? 'unknown, no live price' : formatSignedINR(pnl)
      }. Opens the paper chain`}
      onPress={() => onOpen(p)}
      className="gap-2 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
            {title}
          </Text>
          <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
            <Tag label={p.side} tone={short ? 'warning' : 'info'} />
            {expired ? <Tag label="Expired" tone="warning" /> : null}
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
              {expiryLabel(p.expiry)} · {dte}
            </Text>
          </View>
        </View>
        <View className="items-end">
          <ChangeText value={pnl} className="text-sm" style={NUM}>
            {formatSignedINR(pnl)}
          </ChangeText>
          <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
            {pnl == null ? 'no live price' : 'unrealised'}
          </Text>
        </View>
      </View>

      <Text
        className="text-xs text-ink-muted dark:text-ink-dark-muted"
        style={NUM}
        numberOfLines={2}
      >
        <Text className={cn(short && 'text-danger-600 dark:text-danger-dark')}>
          {short ? '−' : ''}
          {lotsLabel(lots)}
        </Text>
        {` × ${formatQuantity(p.lotSize)} · Avg ${formatINR(p.avgPrice)} · LTP ${
          p.ltp != null ? formatINR(p.ltp) : DASH
        }`}
      </Text>

      <View className="flex-row items-center gap-3">
        <Text
          className="flex-1 text-[11px] text-ink-faint dark:text-ink-dark-faint"
          style={NUM}
          numberOfLines={2}
        >
          Value {p.currentValue != null ? formatINR(p.currentValue, 0) : DASH}
          {isOption ? ` · IV ${ivPct(p.impliedVolatility)}` : ''}
          {` · Δ ${signedGreek(p.greeks?.delta, 1)}`}
          {isOption ? ` · Θ ${signedGreek(p.greeks?.theta, 0)}` : ''}
          {` · Margin ${p.marginBlocked > 0 ? formatINR(p.marginBlocked, 0) : DASH}`}
        </Text>
        {busy ? <ActivityIndicator size="small" color={colors.accent} /> : null}
        <PillButton
          label="Exit"
          onPress={() => onSquareOff(p)}
          disabled={disabled}
          accessibilityLabel={`Square off ${title}`}
        />
      </View>

      {p.realisedPnl !== 0 || p.totalCharges > 0 ? (
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          {p.realisedPnl !== 0 ? `Realised ${formatSignedINR(p.realisedPnl)} · ` : ''}
          Charges {formatINR(p.totalCharges)}
        </Text>
      ) : null}
    </Pressable>
  );
});
