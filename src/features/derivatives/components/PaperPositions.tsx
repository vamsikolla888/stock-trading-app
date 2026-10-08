import { useRouter } from 'expo-router';
import FlaskConical from 'lucide-react-native/icons/flask-conical';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

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
import {
  formatINR,
  formatQuantity,
  formatSignedINR,
  formatSignedPercent,
} from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import {
  useLivePaperMarks,
  usePaperBook,
  useSettleExpiredPaper,
  type PositionMark,
} from '../hooks';
import {
  expiredCount,
  isExpired,
  payoffGroups,
  PAYOFF_MAX_LEGS,
  positionDteLabel,
  settlementOutcome,
  type SettlementOutcome,
} from '../lib/book';
import { exitOrderFor, livePnlPct, ltpProvenance } from '../lib/paperFno';
import { paperChainHref } from '../lib/routes';
import type { FnoBook, FnoPositionView } from '../types';

import { PayoffSheet } from './PayoffSheet';

const NUM = { fontVariant: ['tabular-nums' as const] };

/** Exit / Add hand a contract to the screen's ticket — they never place anything themselves. */
export type PositionTrade = (p: FnoPositionView, side: 'BUY' | 'SELL', lots: number) => void;

/**
 * The paper F&O book — the web's positions, marked LIVE: every position the server says is
 * streamable is re-priced per tick from the F&O feed (with the user's own Groww market data);
 * the rest keep the book's polled price and say where it came from and how old it is. Net
 * greeks lead, above the rows: a multi-leg book is not described by its legs. A net greek of
 * null is NOT zero, and `ungreekedCount` says how much of the book the nets leave out.
 *
 * EXIT AND ADD OPEN THE TICKET (the opposite side and the whole size, or one more lot the same
 * way), so the last thing read before an order is the server's own estimate — the P&L the exit
 * books, the margin it releases. A partial exit is the same Exit with fewer lots.
 *
 * `compact` (the cash paper screen's F&O tab): the rows alone, without settlement, nets,
 * payoffs or caveats — the full book is one tap away.
 */
export function PaperPositions({
  onTrade,
  compact = false,
}: {
  onTrade: PositionTrade;
  compact?: boolean;
}) {
  const router = useRouter();
  const book = usePaperBook();
  const settle = useSettleExpiredPaper();
  const now = useNow(5_000);
  const today = todayIst(now);
  const [settled, setSettled] = useState<SettlementOutcome | null>(null);
  const [payoffFor, setPayoffFor] = useState<string | null>(null);

  const data = book.data;
  const positions = useMemo(() => data?.positions ?? [], [data]);
  const { markOf, totals } = useLivePaperMarks(positions);
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
        {compact ? null : (
          <View className="h-[132px] rounded-card bg-surface-sunk dark:bg-surface-sunk-dark" />
        )}
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

  const rows = (list: readonly FnoPositionView[]) => (
    <ListCard>
      {list.map((p, index) => (
        <React.Fragment key={p.id}>
          {index > 0 ? <RowDivider /> : null}
          <PositionRow
            position={p}
            mark={markOf(p)}
            now={now}
            dte={positionDteLabel(p, today)}
            expired={isExpired(p.expiry, today)}
            onOpen={openChain}
            onTrade={onTrade}
          />
        </React.Fragment>
      ))}
    </ListCard>
  );

  return (
    <View>
      {book.isError ? (
        <Text className="mb-2 text-[11px] text-warning-600 dark:text-warning-dark">
          Couldn’t refresh — showing the last marks.
        </Text>
      ) : null}

      {!compact && expired > 0 ? (
        <View className="mb-4 gap-2.5">
          <Banner
            tone="warning"
            title={`${expired} position${expired === 1 ? '' : 's'} past expiry`}
            message="Settles at intrinsic value after the close, or settle now."
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
          className="mb-4"
          tone={settled.tone}
          title={settled.title}
          message={settled.message}
        />
      ) : null}
      {settle.isError ? (
        <Banner className="mb-4" tone="error" message={getErrorMessage(settle.error)} />
      ) : null}

      {!compact && positions.length > 0 ? <NetExposure book={data} /> : null}

      {positions.length === 0 ? (
        <View className="items-center gap-3 rounded-card border border-line bg-surface px-5 py-8 dark:border-line-dark dark:bg-surface-dark">
          <IconTile Icon={FlaskConical} tone="violet" size="lg" />
          <Text className="text-center text-base font-bold text-ink dark:text-ink-dark">
            No open F&amp;O positions
          </Text>
          <Text className="text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
            Nothing held.
          </Text>
          <Button
            label="Open option chain"
            onPress={() => router.push(paperChainHref())}
            className="mt-1 self-stretch"
          />
        </View>
      ) : compact ? (
        <View className="mt-1">{rows(positions)}</View>
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
            {rows(g.positions)}
          </Section>
        ))
      )}

      {positions.length > 0 ? (
        <Text
          className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
          style={NUM}
        >
          {book.isFetching ? 'Refreshing… ' : ''}
          {totals.unpriced > 0
            ? `${totals.unpriced} of ${positions.length} without a price — the open P&L leaves ${totals.unpriced === 1 ? 'it' : 'them'} out. `
            : ''}
          Live where Groww streams the contract; otherwise marked about every 10 s.
        </Text>
      ) : null}

      {!compact && data.caveats.length > 0 ? (
        <Disclosure
          className="mt-6"
          title="What these numbers assume"
          meta={`${data.caveats.length} thing${data.caveats.length === 1 ? '' : 's'} worth knowing`}
        >
          <Caveats items={data.caveats} />
        </Disclosure>
      ) : null}

      {compact ? null : <PayoffSheet group={payoffGroup} onClose={() => setPayoffFor(null)} />}
    </View>
  );
}

/* ── Net exposure ────────────────────────────────────────────────────────────────────── */

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
      why: t.netTheta == null ? 'no model output' : 'per day',
    },
    {
      label: 'Net vega',
      value: signedGreek(t.netVega, 0),
      why: t.netVega == null ? 'no model output' : 'per 1 vol point',
    },
  ];
  return (
    <Section title="Net exposure" note="scaled by quantity, signed">
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
          {missing} position{missing === 1 ? '' : 's'} without IV, excluded from the nets.
        </Note>
      ) : null}
    </Section>
  );
}

/* ── One position ────────────────────────────────────────────────────────────────────── */

const PositionRow = memo(function PositionRow({
  position: p,
  mark,
  now,
  dte,
  expired,
  onOpen,
  onTrade,
}: {
  position: FnoPositionView;
  mark: PositionMark;
  now: number;
  dte: string;
  expired: boolean;
  onOpen: (p: FnoPositionView) => void;
  onTrade: PositionTrade;
}) {
  const { colors } = useTheme();
  const title = contractTitle({
    underlying: p.underlying,
    kind: p.kind,
    strike: p.kind === 'FUT' ? null : p.strike,
  });
  const short = p.lots < 0;
  const lots = Math.abs(p.lots);
  const pnl = mark.pnl;
  const pct = livePnlPct(pnl, p);
  const isOption = p.kind !== 'FUT';
  const exit = exitOrderFor(p);
  const value = mark.ltp != null ? mark.ltp * p.quantity : p.currentValue;
  const source = ltpProvenance(p, mark.streamed, now);

  return (
    <View className="gap-2 px-3.5 py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${short ? 'short' : 'long'} ${lotsLabel(lots)}, unrealised P&L ${
          pnl == null ? 'unknown, no live price' : formatSignedINR(pnl)
        }. Opens the paper chain`}
        onPress={() => onOpen(p)}
        className="gap-2 active:opacity-70"
      >
        <View className="flex-row items-start gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
              {title}
            </Text>
            <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
              <Tag label={short ? 'SHORT' : 'LONG'} tone={short ? 'warning' : 'info'} />
              {expired ? <Tag label="Expired" tone="warning" /> : null}
              {!expired && p.daysToExpiry === 0 ? (
                <Tag label="Expires today" tone="warning" />
              ) : null}
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
                {expiryLabel(p.expiry)} · {dte}
              </Text>
            </View>
          </View>
          <View className="items-end">
            <ChangeText value={pnl} className="text-sm" style={NUM}>
              {formatSignedINR(pnl)}
            </ChangeText>
            <Text
              className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
              style={NUM}
            >
              {pnl == null
                ? 'no live price'
                : pct != null
                  ? formatSignedPercent(pct)
                  : 'unrealised'}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <Text
            className="min-w-0 flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
            style={NUM}
            numberOfLines={2}
          >
            <Text className={cn(short && 'text-danger-600 dark:text-danger-dark')}>
              {short ? '−' : ''}
              {lotsLabel(lots)}
            </Text>
            {` × ${formatQuantity(p.lotSize)} · Avg ${formatINR(p.avgPrice)} · LTP ${
              mark.ltp != null ? formatINR(mark.ltp) : DASH
            }`}
          </Text>
          <View className="flex-row items-center gap-1">
            {mark.streamed ? (
              <View
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: colors.success }}
              />
            ) : null}
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
              {source}
            </Text>
          </View>
        </View>

        <Text
          className="text-[11px] text-ink-faint dark:text-ink-dark-faint"
          style={NUM}
          numberOfLines={2}
        >
          Value {value != null ? formatINR(value, 0) : DASH}
          {isOption ? ` · IV ${ivPct(p.impliedVolatility)}` : ''}
          {` · Δ ${signedGreek(p.greeks?.delta, 1)}`}
          {isOption ? ` · Θ ${signedGreek(p.greeks?.theta, 0)}` : ''}
          {` · Margin ${p.marginBlocked > 0 ? formatINR(p.marginBlocked, 0) : DASH}`}
        </Text>
        {p.realisedPnl !== 0 || p.totalCharges > 0 ? (
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            {p.realisedPnl !== 0 ? `Realised ${formatSignedINR(p.realisedPnl)} · ` : ''}
            Charges {formatINR(p.totalCharges)}
          </Text>
        ) : null}
      </Pressable>

      <View className="flex-row justify-end gap-2">
        <PillButton
          label="Add"
          tone="brand"
          disabled={expired}
          onPress={() => onTrade(p, short ? 'SELL' : 'BUY', 1)}
          accessibilityLabel={`Add a lot to ${title}`}
        />
        <PillButton
          label="Exit"
          disabled={expired}
          onPress={() => onTrade(p, exit.side, exit.lots)}
          accessibilityLabel={`Exit ${title} — opens the ticket for all ${lotsLabel(lots)}`}
        />
      </View>
    </View>
  );
});
