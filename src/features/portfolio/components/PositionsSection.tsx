import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { StockRow } from '@/components/market/StockRow';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { stockLogoUrl } from '@/features/market/api';
import { afterSheetClose, Sheet } from '@/features/trading/components/Sheet';
import { ticketHref } from '@/features/trading/lib/ticket';
import type { LiveBroker } from '@/features/trading/types';
import { stockHref } from '@/lib/navigation';
import { formatINR, formatQuantity, formatSignedINR } from '@/lib/utils/formatters';

import { POSITION_KIND_LABEL, positionsSummary } from '../lib/book';
import type { PositionRow } from '../types';

import { useMask } from './BookSummaryCard';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };
const keyOf = (row: PositionRow) => `${row.exch}:${row.sym}:${row.product}`;

interface PositionsSectionProps {
  rows: readonly PositionRow[];
  /** The live broker these positions sit at — the exit goes to the same one. */
  broker?: LiveBroker;
  brokerLabel: string;
  /** Exit through the order ticket — only where orders can be placed. */
  tradable: boolean;
}

/** Today's positions: open first, closed ones dimmed, with the day's P&L on top. */
export function PositionsSection({ rows, broker, brokerLabel, tradable }: PositionsSectionProps) {
  const router = useRouter();
  const mask = useMask();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const summary = useMemo(() => positionsSummary(rows), [rows]);
  const ordered = useMemo(() => [...summary.open, ...summary.closed], [summary]);
  const open = rows.find((row) => keyOf(row) === openKey) ?? null;

  if (rows.length === 0) {
    return (
      <InlineEmpty
        title="No positions today"
        message="Anything you buy or sell today — delivery or intraday — shows up here."
      />
    );
  }

  return (
    <View>
      <View className="mb-2.5 flex-row items-center justify-between gap-3">
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
          {summary.open.length} open · {summary.closed.length} closed today
        </Text>
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Day P&L{' '}
          <ChangeText value={summary.dayPnl} style={NUMBERS}>
            {summary.dayPnl === null ? '—' : mask(formatSignedINR(summary.dayPnl))}
          </ChangeText>
        </Text>
      </View>
      <ListCard>
        {ordered.map((row, index) => {
          const closed = row.qty === 0;
          return (
            <View key={keyOf(row)} style={closed ? { opacity: 0.6 } : undefined}>
              {index > 0 ? <RowDivider /> : null}
              <StockRow
                symbol={row.sym}
                exchange={row.exch}
                logoUri={stockLogoUrl(row.sym)}
                subtitle={`${closed ? 'Closed' : `${formatQuantity(row.qty)} qty`} · ${POSITION_KIND_LABEL[row.kind]} · Avg ${formatINR(row.avg)}`}
                onPress={() => setOpenKey(keyOf(row))}
                right={
                  <View className="items-end">
                    <ChangeText value={row.pnl} className="text-sm" style={NUMBERS}>
                      {row.pnl === null ? '—' : mask(formatSignedINR(row.pnl))}
                    </ChangeText>
                    <Text
                      className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                      style={NUMBERS}
                    >
                      LTP {formatINR(row.ltp)}
                    </Text>
                  </View>
                }
              />
            </View>
          );
        })}
      </ListCard>

      {open ? (
        <PositionSheet
          row={open}
          broker={broker}
          brokerLabel={brokerLabel}
          tradable={tradable}
          onClose={() => setOpenKey(null)}
          onNavigate={(href) => {
            setOpenKey(null);
            afterSheetClose(() => router.push(href));
          }}
        />
      ) : null}
    </View>
  );
}

function PositionSheet({
  row,
  broker,
  brokerLabel,
  tradable,
  onClose,
  onNavigate,
}: {
  row: PositionRow;
  broker?: LiveBroker;
  brokerLabel: string;
  tradable: boolean;
  onClose: () => void;
  onNavigate: (href: ReturnType<typeof ticketHref> | ReturnType<typeof stockHref>) => void;
}) {
  const mask = useMask();
  // Exiting is a normal order the other way — same ticket, same risk checks. Carry-forward
  // (NRML) positions aren't equity-ticket products, so they're exited at the broker.
  const exitable = tradable && row.qty !== 0 && row.kind !== 'carry';
  const exitHref = ticketHref({
    symbol: row.sym,
    exchange: row.exch,
    side: row.qty > 0 ? 'SELL' : 'BUY',
    qty: Math.abs(row.qty),
    product: row.kind === 'intraday' ? 'intraday' : 'delivery',
    mode: 'live',
    broker,
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      title={row.sym}
      subtitle={`${row.exch} · ${brokerLabel} · ${row.product}`}
      footer={
        exitable ? (
          <Button
            label={`Exit ${formatQuantity(Math.abs(row.qty))} ${row.qty > 0 ? '(sell)' : '(buy)'}`}
            variant={row.qty > 0 ? 'danger' : 'primary'}
            size="lg"
            fullWidth
            onPress={() => onNavigate(exitHref)}
          />
        ) : (
          <Button
            label="View stock"
            variant="outline"
            fullWidth
            onPress={() => onNavigate(stockHref(row.sym, row.exch))}
          />
        )
      }
    >
      <View className="mb-1 flex-row items-center gap-2">
        <Badge label={POSITION_KIND_LABEL[row.kind]} />
        {row.qty === 0 ? <Badge label="Closed today" /> : null}
      </View>
      <KeyValueRow label="Net quantity" value={formatQuantity(row.qty)} />
      <KeyValueRow label="Average price" value={formatINR(row.avg)} divider />
      <KeyValueRow label="Last price" value={formatINR(row.ltp)} divider />
      <KeyValueRow
        label="Bought"
        value={row.buyQty > 0 ? `${formatQuantity(row.buyQty)} @ ${formatINR(row.buyAvg)}` : '—'}
        divider
      />
      <KeyValueRow
        label="Sold"
        value={row.sellQty > 0 ? `${formatQuantity(row.sellQty)} @ ${formatINR(row.sellAvg)}` : '—'}
        divider
      />
      <KeyValueRow
        label="Realised"
        value={mask(formatSignedINR(row.realised))}
        trend={row.realised}
        divider
      />
      <KeyValueRow
        label="Unrealised"
        value={row.unrealised === null ? '—' : mask(formatSignedINR(row.unrealised))}
        trend={row.unrealised}
        divider
      />
      <KeyValueRow
        label="Total P&L"
        value={row.pnl === null ? '—' : mask(formatSignedINR(row.pnl))}
        trend={row.pnl}
        divider
      />
      {exitable ? (
        <Button
          label="View stock"
          variant="ghost"
          fullWidth
          className="mt-2"
          onPress={() => onNavigate(stockHref(row.sym, row.exch))}
        />
      ) : null}
    </Sheet>
  );
}
