import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatQuantity, formatSignedINR } from '@/lib/utils/formatters';

import { livePnl } from '../lib/chain';
import { contractTitle, DASH, dteLabel, expiryLabel, lotsLabel } from '../lib/format';
import type { FnoPositionRow } from '../types';

import { PillButton, Tag } from './primitives';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * One Groww F&O position: contract, product, net quantity (red when short), average and last
 * price, and the P&L. Unrealised is computed from Groww's net average and the latest price
 * (Groww does not publish it); realised is Groww's own figure. A dash, never ₹0.00, when a
 * line has no price.
 */
export const PositionCard = memo(function PositionCard({
  position,
  onOpen,
  onExit,
}: {
  position: FnoPositionRow;
  onOpen: (p: FnoPositionRow) => void;
  onExit: ((p: FnoPositionRow) => void) | null;
}) {
  const p = position;
  const c = p.contract;
  const open = p.netQuantity !== 0;
  const pnl = open ? livePnl(p, p.ltp) : p.realisedPnl;
  const title = c ? contractTitle(c) : p.tradingSymbol;
  const short = p.netQuantity < 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${open ? (short ? 'short' : 'long') : 'closed'}, ${
        open ? 'unrealised' : 'realised'
      } P&L ${formatSignedINR(pnl)}. Opens the option chain`}
      onPress={() => onOpen(p)}
      className="gap-2 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
            {title}
          </Text>
          <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
            <Tag label={p.product} tone={p.product === 'MIS' ? 'warning' : 'neutral'} />
            {open ? (
              <Tag label={short ? 'SHORT' : 'LONG'} tone={short ? 'warning' : 'info'} />
            ) : null}
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
              {c ? `${expiryLabel(c.expiry)} · ${dteLabel(p.daysToExpiry)}` : p.tradingSymbol}
            </Text>
          </View>
        </View>
        <View className="items-end">
          <ChangeText value={pnl} className="text-sm" style={NUM}>
            {formatSignedINR(pnl)}
          </ChangeText>
          <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
            {open ? 'unrealised' : 'realised'}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-3">
        <Text
          className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
          style={NUM}
          numberOfLines={2}
        >
          <Text className={cn(short && 'text-danger-600 dark:text-danger-dark')}>
            Qty {formatQuantity(p.netQuantity)}
          </Text>
          {p.lots != null ? ` (${lotsLabel(Math.abs(p.lots))})` : ''}
          {' · '}Avg {p.netAverage != null ? formatINR(p.netAverage) : DASH}
          {' · '}LTP {p.ltp != null ? formatINR(p.ltp) : DASH}
        </Text>
        {onExit ? (
          <PillButton
            label="Exit"
            tone="neutral"
            onPress={() => onExit(p)}
            accessibilityLabel={`Exit ${title}`}
          />
        ) : null}
      </View>
      {open && p.realisedPnl != null && p.realisedPnl !== 0 ? (
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          Realised today {formatSignedINR(p.realisedPnl)}
        </Text>
      ) : null}
    </Pressable>
  );
});
