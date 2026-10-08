import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { Button } from '@/components/ui/Button';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import {
  minutes,
  signedRupees,
  STOCK_SORTS,
  VERDICT_ORDER,
  VERDICT_VIEW,
  verdictCounts,
  visibleStocks,
  type StockShow,
  type StockSort,
} from '../../lib/intradayView';
import { formatProfitFactor } from '../../lib/ranking';
import type { IntradayStockRow } from '../../types';
import { PickerPill, SymbolSearch } from './IntradayBits';

const NUM = { fontVariant: ['tabular-nums' as const] };
const PAGE = 40;

/**
 * Every traded stock with its verdict — the "which stocks does it work on" answer. A tap opens
 * every trade the backtest made in that stock.
 */
export function IntradayStocks({
  rows,
  onStock,
}: {
  rows: readonly IntradayStockRow[];
  onStock: (symbol: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<StockShow>('all');
  const [sort, setSort] = useState<StockSort>('verdict');
  const [sorting, setSorting] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const counts = useMemo(() => verdictCounts(rows), [rows]);
  const shown = useMemo(
    () => visibleStocks(rows, { query, show, sort }),
    [rows, query, show, sort],
  );
  const visible = shown.slice(0, limit);
  const filters = useMemo(
    () => [
      { key: 'all' as StockShow, label: `All ${rows.length}` },
      ...VERDICT_ORDER.filter((v) => counts[v] > 0).map((v) => ({
        key: v as StockShow,
        label: `${VERDICT_VIEW[v].label} ${counts[v]}`,
      })),
    ],
    [rows.length, counts],
  );
  const sortLabel = STOCK_SORTS.find((s) => s.key === sort)?.label ?? 'Verdict';

  return (
    <View className="gap-3">
      <SymbolSearch
        value={query}
        onChange={(text) => {
          setQuery(text);
          setLimit(PAGE);
        }}
        label="Filter stocks"
      />
      <Chips
        items={filters}
        value={show}
        onChange={(key) => {
          setShow(key);
          setLimit(PAGE);
        }}
      />
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          {`${formatNumber(shown.length, 0)} stock${shown.length === 1 ? '' : 's'}`}
        </Text>
        <PickerPill
          label={`Sort: ${sortLabel}`}
          a11y={`Sort by ${sortLabel}. Change`}
          onPress={() => setSorting(true)}
        />
      </View>

      {visible.length === 0 ? (
        <Text className="py-4 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No stocks match.
        </Text>
      ) : (
        <ListCard>
          {visible.map((r, index) => (
            <View key={r.symbol}>
              {index > 0 ? <RowDivider /> : null}
              <StockRowItem row={r} onPress={() => onStock(r.symbol)} />
            </View>
          ))}
        </ListCard>
      )}
      {shown.length > visible.length ? (
        <Button
          label={`Show ${Math.min(PAGE, shown.length - visible.length)} more`}
          variant="link"
          className="self-center"
          onPress={() => setLimit((n) => n + PAGE)}
        />
      ) : null}
      <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Net ₹ at ₹1 lakh a trade. Works: positive after costs, profit factor ≥ 1.3, both halves of
        its history positive.
      </Text>

      <OptionSheet
        visible={sorting}
        title="Sort stocks by"
        options={STOCK_SORTS}
        value={sort}
        onSelect={(key) => {
          setSort(key);
          setLimit(PAGE);
        }}
        onClose={() => setSorting(false)}
      />
    </View>
  );
}

function StockRowItem({ row: r, onPress }: { row: IntradayStockRow; onPress: () => void }) {
  const { colors } = useTheme();
  const view = VERDICT_VIEW[r.verdict];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${r.symbol}, ${view.label}. ${formatSignedPercent(r.avgReturnPct, 3)} a trade, ${r.trades} trades, ${formatPercent(r.winRate, 0)} won, net ${signedRupees(r.netPnl)}. Open its trades`}
      onPress={onPress}
      className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
            {r.symbol}
          </Text>
          <StatusPill tone={view.tone} label={view.label} />
        </View>
        <Text
          className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted"
          numberOfLines={1}
          style={NUM}
        >
          {`${formatNumber(r.trades, 0)} trades · ${formatPercent(r.winRate, 0)} win · PF ${formatProfitFactor(r.profitFactor)} · ${minutes(r.avgHoldMinutes)}`}
        </Text>
      </View>
      <View className="items-end">
        <ChangeText value={r.avgReturnPct} className="text-sm" style={NUM}>
          {formatSignedPercent(r.avgReturnPct, 3)}
        </ChangeText>
        <ChangeText value={r.netPnl} className="mt-0.5 text-[11px] font-normal" style={NUM}>
          {signedRupees(r.netPnl)}
        </ChangeText>
      </View>
      <ChevronRight size={16} color={colors.textFaint} />
    </Pressable>
  );
}
