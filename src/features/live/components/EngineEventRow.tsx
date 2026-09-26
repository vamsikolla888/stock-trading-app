import { useRouter } from 'expo-router';
import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { Badge } from '@/components/ui/Badge';
import { istDateTime } from '@/features/insights/lib/dates';
import { stockHref } from '@/lib/navigation';
import { formatINR, formatQuantity, formatSignedINR } from '@/lib/utils/formatters';

import { eventTone, exitWord } from '../lib/engine';
import type { AutoTradeEvent } from '../types';

const numbers = { fontVariant: ['tabular-nums' as const] };

/**
 * One engine order. A rejection is an order that never happened, so it reads as "look at
 * this" (amber), never as a loss; the server's own note is shown verbatim, and an exit that
 * filled away from its trigger level says so rather than implying an exact fill.
 */
export const EngineEventRow = memo(function EngineEventRow({ event }: { event: AutoTradeEvent }) {
  const router = useRouter();
  const tone = eventTone(event);
  const reason = exitWord(event.exitReason);
  const slipped =
    event.exitTriggerLevel !== null &&
    event.price !== null &&
    event.exitTriggerLevel !== event.price;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${tone.label} ${formatQuantity(event.quantity)} ${event.symbol} at ${formatINR(event.price)}, ${istDateTime(event.at)} IST${
        event.realisedPnl !== null ? `, realised ${formatSignedINR(event.realisedPnl)}` : ''
      }`}
      onPress={() => router.push(stockHref(event.symbol, event.exchange))}
      className="px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
            {event.symbol}
            {event.companyName ? (
              <Text className="text-xs font-normal text-ink-muted dark:text-ink-dark-muted">
                {`  ${event.companyName}`}
              </Text>
            ) : null}
          </Text>
          <Text
            className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={1}
            style={numbers}
          >
            {event.side === 'BUY' ? 'Buy' : 'Sell'} {formatQuantity(event.quantity)} @{' '}
            {formatINR(event.price)} · {istDateTime(event.at)} IST
          </Text>
        </View>
        <View className="items-end gap-1">
          <Badge label={tone.label} variant={tone.tone} />
          {event.realisedPnl !== null ? (
            <ChangeText value={event.realisedPnl} className="text-xs" style={numbers}>
              {formatSignedINR(event.realisedPnl)}
            </ChangeText>
          ) : null}
        </View>
      </View>
      {reason || slipped ? (
        <Text className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted" style={numbers}>
          {reason ?? ''}
          {reason && slipped ? ' · ' : ''}
          {slipped ? `triggered at ${formatINR(event.exitTriggerLevel)}` : ''}
        </Text>
      ) : null}
      {event.note ? (
        <Text className="mt-1 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
          {event.note}
        </Text>
      ) : null}
    </Pressable>
  );
});
