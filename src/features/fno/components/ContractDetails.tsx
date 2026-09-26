import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { formatINR, formatQuantity } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { useContractDetail } from '../hooks';
import { changeLine, compactQty, DASH, greek, ivPct, signedGreek } from '../lib/format';
import type { FnoChainLeg, FnoContract } from '../types';

import { sourceLabel } from './FnoChrome';
import { Caveats, SummaryLine } from './primitives';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * One contract's quote (OHLC, OI, circuit limits), greeks WITH their source, and market depth.
 * Greeks say where they came from: "from Groww" is Groww's greeks API, "calculated" is
 * Black-Scholes on the server. The chain leg's greeks fill in only when the contract endpoint
 * has none, labelled with the chain's source — two numbers for one greek never show together.
 */
export function ContractDetails({
  contract,
  leg,
  enabled,
}: {
  contract: FnoContract;
  leg: FnoChainLeg | null;
  enabled: boolean;
}) {
  const { colors } = useTheme();
  const detail = useContractDetail(contract.exchange, contract.tradingSymbol, enabled);
  const q = detail.data?.quote ?? null;
  const greeks = detail.data?.greeks ?? leg?.greeks ?? null;
  const greeksSource = detail.data?.greeks ? detail.data.greeksSource : (leg?.greeksSource ?? null);

  if (detail.isLoading) {
    return (
      <View className="items-center py-4">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (detail.isError && !detail.data) {
    return (
      <Text className="py-2 text-xs text-ink-muted dark:text-ink-dark-muted">
        This contract’s quote could not be loaded. Try again in a moment.
      </Text>
    );
  }
  if (!detail.data) return null;

  const levels = Math.max(q?.bid.length ?? 0, q?.ask.length ?? 0);
  return (
    <View className="gap-3">
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
        {sourceLabel(detail.data.source)} · lot {formatQuantity(contract.lotSize)}
        {contract.tickSize ? ` · tick ₹${contract.tickSize}` : ''}
        {contract.freezeQuantity ? ` · freeze ${formatQuantity(contract.freezeQuantity)}` : ''}
      </Text>

      <View>
        <SummaryLine
          label="Day change"
          value={changeLine(q?.dayChange ?? null, q?.dayChangePct ?? null)}
        />
        <SummaryLine
          label="Open · High"
          value={`${q?.open != null ? formatINR(q.open) : DASH} · ${q?.high != null ? formatINR(q.high) : DASH}`}
        />
        <SummaryLine
          label="Low · Prev close"
          value={`${q?.low != null ? formatINR(q.low) : DASH} · ${q?.close != null ? formatINR(q.close) : DASH}`}
        />
        <SummaryLine label="Volume" value={compactQty(q?.volume)} />
        <SummaryLine
          label="Open interest"
          value={`${compactQty(q?.openInterest ?? leg?.openInterest)}${
            q?.oiDayChange != null
              ? ` (${q.oiDayChange >= 0 ? '+' : '−'}${compactQty(Math.abs(q.oiDayChange))})`
              : ''
          }`}
        />
        <SummaryLine
          label="Circuit"
          value={`${q?.lowerCircuit != null ? formatINR(q.lowerCircuit) : DASH} – ${
            q?.upperCircuit != null ? formatINR(q.upperCircuit) : DASH
          }`}
        />
      </View>

      {contract.kind !== 'FUT' ? (
        <View>
          <Text className="mb-1 text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
            Greeks ·{' '}
            {greeksSource === 'groww'
              ? 'from Groww'
              : greeksSource === 'calculated'
                ? 'calculated (Black-Scholes)'
                : 'unavailable'}
          </Text>
          <View className="flex-row flex-wrap">
            {[
              ['IV', ivPct(greeks?.iv)],
              ['Delta', signedGreek(greeks?.delta, 3)],
              ['Gamma', greek(greeks?.gamma, 4)],
              ['Theta/day', signedGreek(greeks?.theta, 2)],
              ['Vega/1%', greek(greeks?.vega, 2)],
              ['Rho', signedGreek(greeks?.rho, 2)],
            ].map(([label, value]) => (
              <View key={label} className="w-1/3 py-1.5">
                <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{label}</Text>
                <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUM}>
                  {value}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View>
        <Text className="mb-1 text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
          Market depth
        </Text>
        {q && levels > 0 ? (
          <View className="overflow-hidden rounded-lg border border-line dark:border-line-dark">
            <View className="flex-row bg-surface-sunk px-2 py-1.5 dark:bg-surface-sunk-dark">
              {['Bid qty', 'Bid', 'Ask', 'Ask qty'].map((h, i) => (
                <Text
                  key={h}
                  className={cn(
                    'flex-1 text-[11px] text-ink-faint dark:text-ink-dark-faint',
                    i < 2 ? 'text-left' : 'text-right',
                  )}
                >
                  {h}
                </Text>
              ))}
            </View>
            {Array.from({ length: levels }, (_, i) => (
              <View
                key={i}
                className="flex-row border-t border-line px-2 py-1.5 dark:border-line-dark"
              >
                <Text className="flex-1 text-xs text-ink dark:text-ink-dark" style={NUM}>
                  {q.bid[i] ? formatQuantity(q.bid[i].quantity) : ''}
                </Text>
                <Text
                  className="flex-1 text-xs font-semibold text-brand-text dark:text-brand-text-dark"
                  style={NUM}
                >
                  {q.bid[i] ? formatINR(q.bid[i].price) : ''}
                </Text>
                <Text
                  className="flex-1 text-right text-xs font-semibold text-danger-600 dark:text-danger-dark"
                  style={NUM}
                >
                  {q.ask[i] ? formatINR(q.ask[i].price) : ''}
                </Text>
                <Text className="flex-1 text-right text-xs text-ink dark:text-ink-dark" style={NUM}>
                  {q.ask[i] ? formatQuantity(q.ask[i].quantity) : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            {detail.data.source === 'groww'
              ? 'No resting orders reported.'
              : 'Depth needs Groww live data — the platform feed carries last price only.'}
          </Text>
        )}
      </View>

      {detail.data.caveats.length > 0 ? <Caveats items={detail.data.caveats} /> : null}
    </View>
  );
}
