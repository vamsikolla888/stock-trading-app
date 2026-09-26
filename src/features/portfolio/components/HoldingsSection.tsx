import { useRouter } from 'expo-router';
import ArrowUpDown from 'lucide-react-native/icons/arrow-up-down';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { StockRow } from '@/components/market/StockRow';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { stockLogoUrl } from '@/features/market/api';
import { afterSheetClose, Note, Sheet } from '@/features/trading/components/Sheet';
import { ticketHref } from '@/features/trading/lib/ticket';
import type { LiveBroker } from '@/features/trading/types';
import { stockHref } from '@/lib/navigation';
import {
  formatINR,
  formatPercent,
  formatQuantity,
  formatSignedPercent,
} from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { HOLDING_SORT_LABEL, sortHoldings, type HoldingSort } from '../lib/book';
import type { HoldingView } from '../lib/portfolio';
import type { HoldingFlag } from '../types';

import { formatReturn, useMask } from './BookSummaryCard';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };
const SORTS = (Object.keys(HOLDING_SORT_LABEL) as HoldingSort[]).map((key) => ({
  key,
  label: HOLDING_SORT_LABEL[key],
}));

export interface HoldingExtras {
  flag?: HoldingFlag | null;
  /** Bought recently, settling into demat (T+1) — owned and sellable now. */
  t1Qty?: number;
}

interface HoldingsSectionProps {
  holdings: readonly HoldingView[];
  /** The live broker these holdings sit at — Buy / Sell go to the same one. */
  broker?: LiveBroker;
  brokerLabel: string;
  /** Buy / Sell from the holding sheet — only where orders can be placed. */
  tradable: boolean;
  extras?: Record<string, HoldingExtras>;
  emptyMessage: string;
}

/** Holdings as tappable rows (name, qty · avg, current value, returns), sortable. */
export function HoldingsSection({
  holdings,
  broker,
  brokerLabel,
  tradable,
  extras,
  emptyMessage,
}: HoldingsSectionProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const mask = useMask();
  const [sort, setSort] = useState<HoldingSort>('value');
  const [sorting, setSorting] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const sorted = useMemo(() => sortHoldings(holdings, sort), [holdings, sort]);
  const open = holdings.find((holding) => holding.key === openKey) ?? null;

  if (holdings.length === 0) {
    return (
      <InlineEmpty
        title="No holdings"
        message={emptyMessage}
        action={{ label: 'Find a stock', onPress: () => router.push('/search') }}
      />
    );
  }

  return (
    <View>
      <View className="mb-2.5 flex-row items-center justify-between">
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
          {holdings.length} {holdings.length === 1 ? 'stock' : 'stocks'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sort holdings, now by ${HOLDING_SORT_LABEL[sort]}`}
          hitSlop={8}
          onPress={() => setSorting(true)}
          className="flex-row items-center gap-1.5 active:opacity-60"
        >
          <ArrowUpDown size={14} color={colors.link} />
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            {HOLDING_SORT_LABEL[sort]}
          </Text>
        </Pressable>
      </View>

      <ListCard>
        {sorted.map((holding, index) => {
          const t1 = extras?.[holding.key]?.t1Qty ?? 0;
          return (
            <View key={holding.key}>
              {index > 0 ? <RowDivider /> : null}
              <StockRow
                symbol={holding.symbol}
                exchange={holding.exchange}
                logoUri={stockLogoUrl(holding.symbol)}
                subtitle={`${formatQuantity(holding.qty)} ${holding.qty === 1 ? 'share' : 'shares'} · Avg ${formatINR(holding.avg)}${t1 > 0 ? ` · ${formatQuantity(t1)} T1` : ''}`}
                onPress={() => setOpenKey(holding.key)}
                right={
                  <View className="items-end">
                    <Text
                      className="text-sm font-semibold text-ink dark:text-ink-dark"
                      style={NUMBERS}
                    >
                      {mask(formatINR(holding.value ?? holding.invested))}
                    </Text>
                    <ChangeText value={holding.pnl} className="mt-0.5 text-xs" style={NUMBERS}>
                      {holding.pnl === null
                        ? 'No price'
                        : mask(formatReturn(holding.pnl, holding.pnlPct))}
                    </ChangeText>
                  </View>
                }
              />
            </View>
          );
        })}
      </ListCard>

      <OptionSheet
        visible={sorting}
        title="Sort holdings by"
        options={SORTS}
        value={sort}
        onSelect={setSort}
        onClose={() => setSorting(false)}
      />

      {open ? (
        <HoldingSheet
          holding={open}
          extras={extras?.[open.key]}
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

const FLAG_VARIANT = { BUY: 'success', SELL: 'danger', HOLD: 'neutral' } as const;

function HoldingSheet({
  holding,
  extras,
  broker,
  brokerLabel,
  tradable,
  onClose,
  onNavigate,
}: {
  holding: HoldingView;
  extras?: HoldingExtras;
  broker?: LiveBroker;
  brokerLabel: string;
  tradable: boolean;
  onClose: () => void;
  onNavigate: (href: ReturnType<typeof ticketHref> | ReturnType<typeof stockHref>) => void;
}) {
  const mask = useMask();
  const flag = extras?.flag ?? null;
  const t1 = extras?.t1Qty ?? 0;

  return (
    <Sheet
      visible
      onClose={onClose}
      title={holding.symbol}
      subtitle={`${holding.exchange} · ${brokerLabel}${holding.sector ? ` · ${holding.sector}` : ''}`}
      footer={
        tradable ? (
          <View className="flex-row gap-2.5">
            <Button
              label="Sell"
              variant="danger"
              className="flex-1"
              onPress={() =>
                onNavigate(
                  ticketHref({
                    symbol: holding.symbol,
                    exchange: holding.exchange,
                    side: 'SELL',
                    qty: holding.qty,
                    product: 'delivery',
                    mode: 'live',
                    broker,
                  }),
                )
              }
            />
            <Button
              label="Buy more"
              className="flex-1"
              onPress={() =>
                onNavigate(
                  ticketHref({
                    symbol: holding.symbol,
                    exchange: holding.exchange,
                    side: 'BUY',
                    product: 'delivery',
                    mode: 'live',
                    broker,
                  }),
                )
              }
            />
          </View>
        ) : (
          <Button
            label="View stock"
            variant="outline"
            fullWidth
            onPress={() => onNavigate(stockHref(holding.symbol, holding.exchange))}
          />
        )
      }
    >
      <View className="rounded-xl bg-surface-sunk px-3.5 py-3 dark:bg-surface-sunk-dark">
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Current value</Text>
        <Text className="mt-0.5 text-[22px] font-bold text-ink dark:text-ink-dark" style={NUMBERS}>
          {mask(formatINR(holding.value ?? holding.invested))}
        </Text>
        <ChangeText value={holding.pnl} className="mt-0.5 text-[13px]" style={NUMBERS}>
          {holding.pnl === null
            ? 'Unpriced — shown at cost'
            : `${mask(formatReturn(holding.pnl, holding.pnlPct))} overall`}
        </ChangeText>
      </View>

      <KeyValueRow
        label="Quantity"
        value={`${formatQuantity(holding.qty)}${t1 > 0 ? ` (${formatQuantity(t1)} settling)` : ''}`}
      />
      <KeyValueRow label="Average price" value={formatINR(holding.avg)} divider />
      <KeyValueRow
        label="Last price"
        value={
          holding.ltp === null
            ? '—'
            : `${formatINR(holding.ltp)}${holding.dayChangePct !== null ? `  ${formatSignedPercent(holding.dayChangePct)}` : ''}`
        }
        divider
      />
      <KeyValueRow label="Invested" value={mask(formatINR(holding.invested))} divider />
      <KeyValueRow
        label="Today"
        value={
          holding.dayChange === null
            ? '—'
            : mask(formatReturn(holding.dayChange, holding.dayChangePct))
        }
        trend={holding.dayChange}
        divider
      />
      {t1 > 0 ? (
        <Note>
          {formatQuantity(t1)} {t1 === 1 ? 'share was' : 'shares were'} bought recently and{' '}
          {t1 === 1 ? 'is' : 'are'} settling into your demat account (T+1). You own them now and can
          sell them.
        </Note>
      ) : null}

      {flag ? (
        <View className="mt-4 rounded-xl border border-line p-3.5 dark:border-line-dark">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
              Screener signal
            </Text>
            <Badge label={flag.action} variant={FLAG_VARIANT[flag.action]} />
          </View>
          {flag.rationale ? (
            <Text className="mt-2 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
              {flag.rationale}
            </Text>
          ) : null}
          {flag.evidence.length > 0 ? (
            <Text className="mt-1.5 text-xs text-ink-faint dark:text-ink-dark-faint">
              Evidence: {flag.evidence.join(', ')}
            </Text>
          ) : null}
          {flag.hitRatePct !== null ? (
            <Text className="mt-1 text-xs text-ink-faint dark:text-ink-dark-faint">
              Historical hit rate {formatPercent(flag.hitRatePct, 1)} — a screener's record, not a
              forecast.
            </Text>
          ) : null}
        </View>
      ) : null}

      {tradable ? (
        <Button
          label="View stock"
          variant="ghost"
          fullWidth
          className="mt-3"
          onPress={() => onNavigate(stockHref(holding.symbol, holding.exchange))}
        />
      ) : null}
    </Sheet>
  );
}
