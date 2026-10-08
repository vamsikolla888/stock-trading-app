import React from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatQuantity, formatSignedPercent } from '@/lib/utils/formatters';

import { isCommodityExchange } from '../lib/explore';
import { changeLine, compactQty, DASH, dteLabel, expiryLabel } from '../lib/format';
import type { FnoContract, FnoFutures, FnoSide } from '../types';

import { PillButton } from './primitives';

const NUM = { fontVariant: ['tabular-nums' as const] };
const MINUS = '−';

function signed(n: number): string {
  const abs = formatINR(Math.abs(n)).replace('₹', '');
  return n > 0 ? `+${abs}` : n < 0 ? `${MINUS}${abs}` : abs;
}

/**
 * Every live future on the underlying, nearest expiry first. BASIS = future − spot: positive
 * is contango, and it converges to zero at expiry — the one number that says whether a future
 * is rich or cheap to its underlying. Day change is Groww's quote; the platform feed carries
 * last price only, and those cells show a dash rather than a zero.
 *
 * A commodity future (MCX / NSE commodity) is READ-ONLY — Groww's API places no commodity
 * orders — so its row offers Chart in place of Buy / Sell, and has no cash spot to basis against.
 */
export function FuturesList({
  data,
  onTrade,
  onChart,
  selected,
}: {
  data: FnoFutures;
  onTrade: (contract: FnoContract, side: FnoSide) => void;
  /** Charts a commodity future (its only action). */
  onChart?: (contract: FnoContract) => void;
  /** Trading symbol of the contract on the chart, outlined. */
  selected?: string | null;
}) {
  if (!data.futures.length) {
    return (
      <InlineEmpty
        title="No futures listed"
        message={`${data.underlying} has no live futures right now.`}
      />
    );
  }
  return (
    <ListCard>
      {data.futures.map((f, index) => {
        const c = f.contract;
        const basis =
          f.ltp != null && data.spot != null
            ? Math.round((f.ltp - data.spot) * 100) / 100
            : f.basis;
        const basisPct = basis != null && data.spot ? (basis / data.spot) * 100 : f.basisPct;
        const readOnly = isCommodityExchange(c.exchange);
        const charted = selected === c.tradingSymbol;
        return (
          <React.Fragment key={c.tradingSymbol}>
            {index > 0 ? <RowDivider /> : null}
            <View
              className={cn(
                'gap-2.5 px-3.5 py-3',
                charted && 'bg-surface-sunk dark:bg-surface-sunk-dark',
              )}
            >
              <View className="flex-row items-start gap-3">
                <View className="min-w-0 flex-1">
                  <Text
                    className="text-sm font-semibold text-ink dark:text-ink-dark"
                    numberOfLines={1}
                  >
                    {c.underlying} {expiryLabel(c.expiry)} FUT
                  </Text>
                  <Text
                    className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                    numberOfLines={1}
                  >
                    {dteLabel(f.daysToExpiry)} · lot {formatQuantity(c.lotSize)} · {c.tradingSymbol}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-semibold text-ink dark:text-ink-dark" style={NUM}>
                    {f.ltp != null ? formatINR(f.ltp) : DASH}
                  </Text>
                  <ChangeText value={f.dayChange} className="mt-0.5 text-xs" style={NUM}>
                    {changeLine(f.dayChange, f.dayChangePct)}
                  </ChangeText>
                </View>
              </View>
              <View className="flex-row gap-3">
                <Stat
                  label="OI"
                  value={compactQty(f.openInterest)}
                  sub={
                    f.oiDayChange != null
                      ? `${f.oiDayChange >= 0 ? '+' : MINUS}${compactQty(Math.abs(f.oiDayChange))}`
                      : null
                  }
                />
                <Stat label="Volume" value={compactQty(f.volume)} />
                {readOnly ? null : (
                  <Stat
                    label="Basis"
                    value={basis != null ? signed(basis) : DASH}
                    sub={basisPct != null ? formatSignedPercent(basisPct) : null}
                  />
                )}
              </View>
              {readOnly ? (
                <PillButton
                  label={charted ? 'On the chart' : 'Chart'}
                  tone={charted ? 'brand' : 'neutral'}
                  disabled={!onChart}
                  onPress={() => onChart?.(c)}
                  accessibilityLabel={`Chart ${c.tradingSymbol}`}
                />
              ) : (
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <PillButton
                      label="Buy"
                      tone="buy"
                      disabled={!c.buyAllowed}
                      onPress={() => onTrade(c, 'BUY')}
                      accessibilityLabel={`Buy ${c.tradingSymbol}`}
                    />
                  </View>
                  <View className="flex-1">
                    <PillButton
                      label="Sell"
                      tone="sell"
                      disabled={!c.sellAllowed}
                      onPress={() => onTrade(c, 'SELL')}
                      accessibilityLabel={`Sell ${c.tradingSymbol}`}
                    />
                  </View>
                </View>
              )}
            </View>
          </React.Fragment>
        );
      })}
    </ListCard>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <View className="flex-1 rounded-lg bg-surface-sunk px-2.5 py-1.5 dark:bg-surface-sunk-dark">
      <Text className="text-[10px] text-ink-faint dark:text-ink-dark-faint">{label}</Text>
      <Text
        className="text-xs font-semibold text-ink dark:text-ink-dark"
        style={NUM}
        numberOfLines={1}
      >
        {value}
      </Text>
      {sub ? (
        <Text
          className="text-[10px] text-ink-muted dark:text-ink-dark-muted"
          style={NUM}
          numberOfLines={1}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
}
