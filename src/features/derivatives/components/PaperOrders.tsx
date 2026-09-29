import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { SideTag, SummaryBox, SummaryLine } from '@/features/fno/components/primitives';
import {
  contractTitle,
  DASH,
  dateTimeIst,
  expiryLabel,
  formatStrike,
  lotsLabel,
} from '@/features/fno/lib/format';
import { formatINR, formatQuantity, formatSignedINR } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { usePaperOrders } from '../hooks';
import {
  chargeLines,
  countPaperOrders,
  filterPaperOrders,
  PAPER_ORDER_FILTERS,
  PAPER_ORDERS_LIMIT,
  premiumFlow,
  type PaperOrderFilter,
} from '../lib/book';
import { paperChainHref } from '../lib/routes';
import type { FnoOrderView } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * The paper F&O order log — the web's /fno/paper/orders: every order this account placed
 * against the paper book, filled and rejected alike, newest first. A rejection is a normal
 * outcome (not enough margin, no live price) carrying its reason, so it is listed, not hidden.
 * Tap an order for its contract-note breakdown and what it did to the account.
 */
export function PaperOrders() {
  const router = useRouter();
  const orders = usePaperOrders(PAPER_ORDERS_LIMIT);
  const [filter, setFilter] = useState<PaperOrderFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => orders.data ?? [], [orders.data]);
  const counts = useMemo(() => countPaperOrders(rows), [rows]);
  const shown = useMemo(() => filterPaperOrders(rows, filter), [rows, filter]);
  const chips = PAPER_ORDER_FILTERS.map((f) => ({
    key: f.key,
    label: `${f.label} ${counts[f.key]}`,
  }));
  const toggle = useCallback((id: string) => setExpanded((open) => (open === id ? null : id)), []);

  if (orders.isPending) return <ListSkeleton rows={5} />;
  if (orders.isError && !orders.data) {
    return (
      <InlineError
        what="your paper orders"
        error={orders.error}
        onRetry={() => void orders.refetch()}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <InlineEmpty
        title="No paper F&O orders yet"
        message="Orders you place on the paper option chain — filled or rejected — show up here."
        action={{ label: 'Open option chain', onPress: () => router.push(paperChainHref()) }}
      />
    );
  }

  return (
    <View>
      <Chips items={chips} value={filter} onChange={setFilter} />
      {orders.isError ? (
        <Text className="mt-2 text-[11px] text-warning-600 dark:text-warning-dark">
          Couldn’t refresh — showing the last list.
        </Text>
      ) : null}
      <View className="mt-3">
        {shown.length === 0 ? (
          <InlineEmpty title="No orders match" message="Try another filter." />
        ) : (
          <ListCard>
            {shown.map((o, index) => (
              <React.Fragment key={o.id}>
                {index > 0 ? <RowDivider /> : null}
                <OrderRow order={o} open={expanded === o.id} onToggle={toggle} />
              </React.Fragment>
            ))}
          </ListCard>
        )}
      </View>
      <Text className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        The last {PAPER_ORDERS_LIMIT} orders on your paper F&amp;O book. Simulated — nothing reached
        a broker.
      </Text>
    </View>
  );
}

const OrderRow = memo(function OrderRow({
  order: o,
  open,
  onToggle,
}: {
  order: FnoOrderView;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const { colors } = useTheme();
  const filled = o.status === 'FILLED';
  const title = contractTitle({ underlying: o.underlying, kind: o.kind, strike: o.strike });
  const flow = premiumFlow(o.premiumFlow);
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${o.side} ${lotsLabel(o.lots)} ${title}, ${o.status}${
          o.note ? `. ${o.note}` : ''
        }. ${open ? 'Hide' : 'Show'} the charges`}
        onPress={() => onToggle(o.id)}
        className="gap-1.5 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <View className="flex-row items-center gap-2">
          <SideTag side={o.side} />
          <Text
            className="min-w-0 flex-1 text-sm font-semibold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {title}
          </Text>
          <Badge label={o.status} variant={filled ? 'success' : 'danger'} />
        </View>
        <View className="flex-row items-center gap-2">
          <Text
            className="min-w-0 flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={1}
          >
            {expiryLabel(o.expiry)} · {o.tradingsymbol}
          </Text>
          <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            {dateTimeIst(o.createdAt)}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text
            className="flex-1 text-xs text-ink dark:text-ink-dark"
            style={NUM}
            numberOfLines={2}
          >
            {lotsLabel(o.lots)} · {filled ? formatINR(o.price) : DASH}
            {filled && o.premiumFlow !== 0
              ? ` · premium ${flow.word} ${formatINR(flow.amount)}`
              : ''}
            {o.charges.total > 0 ? ` · charges ${formatINR(o.charges.total)}` : ''}
          </Text>
          <Chevron size={16} color={colors.textMuted} />
        </View>
        {o.realisedPnl != null ? (
          <Text
            className={
              o.realisedPnl >= 0
                ? 'text-xs font-semibold text-brand-text dark:text-brand-text-dark'
                : 'text-xs font-semibold text-danger-600 dark:text-danger-dark'
            }
            style={NUM}
          >
            Realised {formatSignedINR(o.realisedPnl)}
          </Text>
        ) : null}
        {o.basketName ? (
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
            Basket · {o.basketName}
          </Text>
        ) : null}
        {o.note ? (
          <Text
            className={
              filled
                ? 'text-[11px] leading-4 text-ink-muted dark:text-ink-dark-muted'
                : 'text-[11px] leading-4 text-danger-600 dark:text-danger-dark'
            }
          >
            {o.note}
          </Text>
        ) : null}
      </Pressable>

      {open ? (
        <View className="gap-3 px-3.5 pb-3.5">
          <View>
            <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
              Charges on this order
            </Text>
            <SummaryBox>
              {chargeLines(o.charges).map((line) => (
                <SummaryLine key={line.label} label={line.label} value={formatINR(line.value)} />
              ))}
              <SummaryLine label="Total" value={formatINR(o.charges.total)} strong />
            </SummaryBox>
          </View>
          <View>
            <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
              Effect on the account
            </Text>
            <SummaryBox>
              <SummaryLine
                label="Quantity"
                value={`${formatQuantity(o.quantity)} (${o.lots} × ${formatQuantity(o.lotSize)})`}
              />
              <SummaryLine
                label={o.premiumFlow < 0 ? 'Premium received' : 'Premium paid'}
                value={formatINR(flow.amount)}
              />
              <SummaryLine
                label={o.marginDelta >= 0 ? 'Margin blocked' : 'Margin released'}
                value={formatINR(Math.abs(o.marginDelta), 0)}
              />
              <SummaryLine
                label="Contract"
                value={`${o.kind === 'FUT' ? 'Future' : `${formatStrike(o.strike)} ${o.kind}`} · ${expiryLabel(o.expiry)} · ${o.exchange}`}
              />
              {o.basketId ? (
                <SummaryLine label="Basket" value={o.basketName ?? o.basketId} />
              ) : null}
            </SummaryBox>
          </View>
        </View>
      ) : null}
    </View>
  );
});
