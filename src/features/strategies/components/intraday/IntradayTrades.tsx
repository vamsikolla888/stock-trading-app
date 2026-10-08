import { useRouter } from 'expo-router';
import React, { memo, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { Button } from '@/components/ui/Button';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { stockHref } from '@/lib/navigation';
import { formatINR, formatNumber, formatSignedPercent } from '@/lib/utils/formatters';

import {
  exitLabel,
  exitReasons,
  filterTrades,
  minutes,
  shortDay,
  signedRupees,
  timeOfDay,
  type TradeOutcome,
} from '../../lib/intradayView';
import type { IntradayTrade } from '../../types';
import { PickerPill, SymbolSearch } from './IntradayBits';

const NUM = { fontVariant: ['tabular-nums' as const] };
const PAGE = 40;
const ANY_EXIT = 'any';

const OUTCOMES: readonly { key: TradeOutcome; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'wins', label: 'Wins' },
  { key: 'losses', label: 'Losses' },
];

/** The variant's newest trades (the run keeps 300; a stock's full list is one tap away). */
export function IntradayTrades({
  trades,
  total,
}: {
  trades: readonly IntradayTrade[];
  total: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<TradeOutcome>('all');
  const [exit, setExit] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const reasons = useMemo(() => exitReasons(trades), [trades]);
  const rows = useMemo(
    () => filterTrades(trades, { query, outcome, exit }),
    [trades, query, outcome, exit],
  );
  const visible = rows.slice(0, limit);
  const reset = () => setLimit(PAGE);

  return (
    <View className="gap-3">
      <SymbolSearch
        value={query}
        onChange={(text) => {
          setQuery(text);
          reset();
        }}
        label="Filter trades by symbol"
      />
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Chips
            items={OUTCOMES}
            value={outcome}
            bleed={false}
            onChange={(key) => {
              setOutcome(key);
              reset();
            }}
          />
        </View>
        <PickerPill
          label={exit ? exitLabel(exit) : 'Any exit'}
          a11y={`Exit reason: ${exit ? exitLabel(exit) : 'any'}. Change`}
          active={exit !== null}
          onPress={() => setPicking(true)}
        />
      </View>
      <Text className="text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
        {`${formatNumber(rows.length, 0)} of the latest ${formatNumber(trades.length, 0)}${total > trades.length ? ` · ${formatNumber(total, 0)} in total` : ''}`}
      </Text>

      {visible.length === 0 ? (
        <Text className="py-4 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No trades match.
        </Text>
      ) : (
        <ListCard>
          {visible.map((t, index) => (
            <View key={`${t.symbol}:${t.entryTime}`}>
              {index > 0 ? <RowDivider /> : null}
              <IntradayTradeRow trade={t} onPress={() => router.push(stockHref(t.symbol, 'NSE'))} />
            </View>
          ))}
        </ListCard>
      )}
      {rows.length > visible.length ? (
        <Button
          label={`Show ${Math.min(PAGE, rows.length - visible.length)} more`}
          variant="link"
          className="self-center"
          onPress={() => setLimit((n) => n + PAGE)}
        />
      ) : null}

      <OptionSheet
        visible={picking}
        title="Exit reason"
        options={[
          { key: ANY_EXIT, label: 'Any exit' },
          ...reasons.map((r) => ({ key: r, label: exitLabel(r) })),
        ]}
        value={exit ?? ANY_EXIT}
        onSelect={(key) => {
          setExit(key === ANY_EXIT ? null : key);
          reset();
        }}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

/**
 * One backtested intraday trade: day and IST times, fill and exit prices, how long it was held,
 * why it ended, and the net result in percent and in rupees on ₹1 lakh. `showSymbol` is off on a
 * single stock's list, where every row is the same stock.
 */
export const IntradayTradeRow = memo(function IntradayTradeRow({
  trade: t,
  onPress,
  showSymbol = true,
}: {
  trade: IntradayTrade;
  onPress?: () => void;
  showSymbol?: boolean;
}) {
  const when = `${shortDay(t.day)} · ${timeOfDay(t.entryTime)}–${timeOfDay(t.exitTime)}`;
  const a11y = `${showSymbol ? `${t.symbol}, ` : ''}${when}, ${exitLabel(t.exit)}, ${formatSignedPercent(t.returnPct, 2)}, ${signedRupees(t.netPnl)}`;
  const body = (
    <>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
          {showSymbol ? t.symbol : when}
        </Text>
        <Text
          className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
          numberOfLines={1}
          style={NUM}
        >
          {showSymbol ? `${when} · ${minutes(t.holdMinutes)}` : minutes(t.holdMinutes)}
        </Text>
        <Text
          className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
          numberOfLines={1}
          style={NUM}
        >
          {`${formatINR(t.entryPrice)} → ${formatINR(t.exitPrice)} · ${exitLabel(t.exit)}`}
        </Text>
      </View>
      <View className="items-end">
        <ChangeText value={t.returnPct} className="text-sm" style={NUM}>
          {formatSignedPercent(t.returnPct, 2)}
        </ChangeText>
        <ChangeText value={t.netPnl} className="mt-0.5 text-[11px] font-normal" style={NUM}>
          {signedRupees(t.netPnl)}
        </ChangeText>
      </View>
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a11y}. Open stock`}
      onPress={onPress}
      className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={a11y} className="flex-row items-center gap-3 px-3.5 py-3">
      {body}
    </View>
  );
});
