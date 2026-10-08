import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, Section } from '@/components/ui/Section';
import { SegmentedControl } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatPercent, formatSignedINR } from '@/lib/utils/formatters';

import { usePaperFnoAnalytics } from '../hooks';
import { chargeLines } from '../lib/book';
import type { FnoAnalytics, FnoPnlSlice, FnoReconcileStatus } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };

type Slice = 'underlying' | 'kind' | 'direction';
const SLICES: readonly { key: Slice; label: string }[] = [
  { key: 'underlying', label: 'Underlying' },
  { key: 'kind', label: 'Kind' },
  { key: 'direction', label: 'Direction' },
];
/** Ranked by |P&L| server-side; capped so the comparison reads at a glance. */
const MAX_SLICES = 8;

const STATUS: Record<
  FnoReconcileStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' }
> = {
  exact: { label: 'Exact to the paisa', tone: 'success' },
  rounding: { label: 'Within a paisa', tone: 'warning' },
  mismatch: { label: 'Mismatch', tone: 'danger' },
};

function sliceOf(pnl: FnoAnalytics['pnl'], slice: Slice): FnoPnlSlice[] {
  return slice === 'underlying'
    ? pnl.byUnderlying
    : slice === 'kind'
      ? pnl.byKind
      : pnl.byDirection;
}

/**
 * F&O paper › Analytics (web: /fno/paper/analytics) — what this sandbox's OWN order log shows,
 * replayed rather than restated. Realised P&L only (open positions are the book's job), sliced
 * three ways that each sum to the same total; a trade record from closing orders only; charges
 * itemised like a contract note; and a cash check that can genuinely report a mismatch.
 */
export function PaperAnalytics() {
  const analytics = usePaperFnoAnalytics();
  const a = analytics.data;

  if (analytics.isPending) return <ListSkeleton rows={4} />;
  if (!a) {
    return (
      <InlineError
        what="your F&O analytics"
        error={analytics.error}
        onRetry={() => void analytics.refetch()}
      />
    );
  }

  const { charges, trades, reconciliation } = a;
  const realised = a.pnl.byKind.reduce((sum, s) => sum + s.realisedPnl, 0);
  const status = STATUS[reconciliation.status];

  return (
    <View>
      <View className="flex-row flex-wrap rounded-card border border-line bg-surface p-1.5 dark:border-line-dark dark:bg-surface-dark">
        <Stat
          label="Realised P&L"
          value={formatSignedINR(realised)}
          tone={realised}
          sub={`${trades.closingTrades} closing trade${trades.closingTrades === 1 ? '' : 's'}`}
        />
        <Stat
          label="Win rate"
          value={trades.winRatePct == null ? '—' : formatPercent(trades.winRatePct, 1)}
          sub={
            trades.closingTrades === 0
              ? 'nothing closed yet'
              : `${trades.wins}W · ${trades.losses}L${trades.flatTrades > 0 ? ` · ${trades.flatTrades} flat` : ''}`
          }
        />
        <Stat
          label="Charges paid"
          value={formatINR(charges.total)}
          sub={`${trades.filledOrders} filled · ${trades.rejectedOrders} rejected`}
        />
        <Stat
          label="Cash check"
          value={status.label}
          sub={
            reconciliation.status === 'exact'
              ? 'replayed independently'
              : `diff ${reconciliation.diffPaise}p`
          }
        />
      </View>

      <PnlSlices pnl={a.pnl} />

      <Section title="How the trading went" note="closing orders only">
        <ListCard className="px-3.5">
          <KeyValueRow label="Filled orders" value={String(trades.filledOrders)} />
          <KeyValueRow label="Rejected orders" value={String(trades.rejectedOrders)} divider />
          {trades.pendingOrders ? (
            <KeyValueRow label="Resting (limit)" value={String(trades.pendingOrders)} divider />
          ) : null}
          {trades.cancelledOrders ? (
            <KeyValueRow label="Cancelled" value={String(trades.cancelledOrders)} divider />
          ) : null}
          <KeyValueRow
            label="Lots traded"
            hint="Turnover — opens and closes"
            value={String(trades.totalLots)}
            divider
          />
          {trades.basketOrders > 0 ? (
            <KeyValueRow label="Basket legs" value={String(trades.basketOrders)} divider />
          ) : null}
          <KeyValueRow
            label="Wins / losses / flat"
            value={`${trades.wins} / ${trades.losses} / ${trades.flatTrades}`}
            divider
          />
          <KeyValueRow
            label="Average win"
            value={trades.avgWin == null ? '—' : `+${formatINR(trades.avgWin)}`}
            trend={trades.avgWin ?? undefined}
            divider
          />
          <KeyValueRow
            label="Average loss"
            value={trades.avgLoss == null ? '—' : `−${formatINR(trades.avgLoss)}`}
            trend={trades.avgLoss == null ? undefined : -trades.avgLoss}
            divider
          />
          <KeyValueRow
            label="Best / worst trade"
            value={`${trades.bestTrade == null ? '—' : formatSignedINR(trades.bestTrade)} / ${trades.worstTrade == null ? '—' : formatSignedINR(trades.worstTrade)}`}
            divider
          />
        </ListCard>
      </Section>

      <Section title="Charges paid" note="all filled orders">
        <ListCard className="px-3.5">
          {chargeLines(charges).map((line, index) => (
            <KeyValueRow
              key={line.label}
              label={line.label}
              value={formatINR(line.value)}
              divider={index > 0}
            />
          ))}
          <KeyValueRow label="Total" value={formatINR(charges.total)} divider />
          <KeyValueRow label="On buy orders" value={formatINR(charges.buySide)} divider />
          <KeyValueRow
            label="On sell orders"
            hint="STT is sell-side only"
            value={formatINR(charges.sellSide)}
            divider
          />
        </ListCard>
      </Section>

      <Section
        title="Cash check"
        note="order log vs stored"
        right={<Badge label={status.label} variant={status.tone} />}
      >
        <ListCard className="px-3.5">
          <KeyValueRow
            label="Opening cash"
            hint="At the last reset"
            value={formatINR(reconciliation.openingCash)}
          />
          <KeyValueRow
            label="Wallet changes"
            value={formatSignedINR(reconciliation.walletChanges)}
            divider
          />
          <KeyValueRow
            label="Orders’ cash effect"
            value={formatSignedINR(reconciliation.orderCashEffect)}
            divider
          />
          <KeyValueRow label="Expected" value={formatINR(reconciliation.expectedCash)} divider />
          <KeyValueRow label="Stored" value={formatINR(reconciliation.actualCash)} divider />
        </ListCard>
      </Section>
    </View>
  );
}

function PnlSlices({ pnl }: { pnl: FnoAnalytics['pnl'] }) {
  const [slice, setSlice] = useState<Slice>('underlying');
  const all = sliceOf(pnl, slice);
  const rows = all.slice(0, MAX_SLICES);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.realisedPnl)));
  return (
    <Section title="Profit and loss" note="realised">
      <SegmentedControl items={SLICES} value={slice} onChange={setSlice} className="mb-3" />
      {rows.length === 0 ? (
        <Text className="rounded-card border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-ink-muted dark:border-line-dark-strong dark:text-ink-dark-muted">
          No closed trades yet.
        </Text>
      ) : (
        <ListCard className="gap-3 px-3.5 py-3">
          {rows.map((row) => {
            const negative = row.realisedPnl < 0;
            return (
              <View
                key={row.key}
                accessible
                accessibilityLabel={`${row.label}, ${formatSignedINR(row.realisedPnl)}, ${row.trades} trades`}
              >
                <View className="flex-row items-baseline justify-between gap-3">
                  <Text
                    className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark"
                    numberOfLines={1}
                  >
                    {row.label}
                    <Text className="font-normal text-ink-faint dark:text-ink-dark-faint">
                      {' '}
                      · {row.trades}
                    </Text>
                  </Text>
                  <ChangeText value={row.realisedPnl} className="text-[13px]" style={NUM}>
                    {formatSignedINR(row.realisedPnl)}
                  </ChangeText>
                </View>
                <View className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunk dark:bg-surface-sunk-dark">
                  <View
                    className={cn('h-1.5 rounded-full', negative ? 'bg-danger-500' : 'bg-brand')}
                    style={{ width: `${Math.max(2, (Math.abs(row.realisedPnl) / max) * 100)}%` }}
                  />
                </View>
              </View>
            );
          })}
        </ListCard>
      )}
      {all.length > rows.length ? (
        <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
          +{all.length - rows.length} smaller not shown
        </Text>
      ) : null}
    </Section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: number;
}) {
  return (
    <View className="w-1/2 px-2.5 py-2">
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{label}</Text>
      {tone !== undefined ? (
        <ChangeText
          value={tone}
          className="mt-0.5 text-base"
          style={NUM}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </ChangeText>
      ) : (
        <Text
          className="mt-0.5 text-base font-bold text-ink dark:text-ink-dark"
          style={NUM}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
      )}
      {sub ? (
        <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}
