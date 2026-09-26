import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/formatters';

import { changeLine, level } from '../lib/format';
import type { MiniCandle } from '../types';

import { MiniCandles } from './MiniCandles';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * The Explore screen's card shapes, after Groww's F&O Explore. Prices arrive already
 * measured against the server's baseline; these only format. An index level prints without
 * a rupee sign (it is not an amount), everything tradable with one.
 */

function priceText(value: number | null, isLevel: boolean): string {
  if (value == null) return 'No price';
  return isLevel ? level(value) : formatINR(value);
}

/** Top traded: name, the session in mini candlesticks, price, change. Two per row. */
export const TradedTile = memo(function TradedTile({
  label,
  ltp,
  change,
  changePct,
  isLevel,
  candles,
  candleNote,
  onPress,
}: {
  label: string;
  ltp: number | null;
  change: number | null;
  changePct: number | null;
  isLevel: boolean;
  candles: MiniCandle[] | null;
  candleNote: string | null;
  onPress: (() => void) | null;
}) {
  const move = changeLine(change, changePct);
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}, ${priceText(ltp, isLevel)}, ${move}${onPress ? ', open option chain' : ''}`}
      disabled={!onPress}
      onPress={onPress ?? undefined}
      className="flex-1 rounded-card border border-line bg-surface p-3 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
        {label}
      </Text>
      <View className="my-2 h-10 justify-center">
        {candles?.length ? (
          <MiniCandles candles={candles} label={label} />
        ) : (
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={2}>
            {candleNote ? 'No intraday chart' : ''}
          </Text>
        )}
      </View>
      <Text
        className={cn(
          'text-sm font-semibold',
          ltp == null ? 'text-ink-faint dark:text-ink-dark-faint' : 'text-ink dark:text-ink-dark',
        )}
        style={NUM}
        numberOfLines={1}
      >
        {priceText(ltp, isLevel)}
      </Text>
      <ChangeText value={changePct} className="mt-0.5 text-xs" style={NUM} numberOfLines={1}>
        {move}
      </ChangeText>
    </Pressable>
  );
});

export function TradedTileSkeleton() {
  return (
    <View className="flex-1 rounded-card border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark">
      <View className="h-3 w-3/5 rounded bg-line dark:bg-line-dark" />
      <View className="my-2 h-10 rounded bg-surface-sunk dark:bg-surface-sunk-dark" />
      <View className="h-3 w-1/2 rounded bg-line dark:bg-line-dark" />
      <View className="mt-1.5 h-2.5 w-2/3 rounded bg-line dark:bg-line-dark" />
    </View>
  );
}

/** Commodities and futures shelves: mark, two-line title, price, change. Scrolls sideways. */
export const QuoteCard = memo(function QuoteCard({
  mark,
  title,
  sub,
  ltp,
  change,
  changePct,
  onPress,
}: {
  mark: React.ReactNode;
  title: string;
  sub?: string | null;
  ltp: number | null;
  change: number | null;
  changePct: number | null;
  onPress?: (() => void) | null;
}) {
  const move = changeLine(change, changePct);
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${title}${sub ? `, ${sub}` : ''}, ${priceText(ltp, false)}, ${move}`}
      disabled={!onPress}
      onPress={onPress ?? undefined}
      className="w-[152px] rounded-card border border-line bg-surface p-3 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      {mark}
      <Text
        className="mt-2.5 min-h-[34px] text-[13px] font-medium leading-[17px] text-ink dark:text-ink-dark"
        numberOfLines={2}
      >
        {title}
      </Text>
      {sub ? (
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
      <Text
        className={cn(
          'mt-1.5 text-sm font-semibold',
          ltp == null ? 'text-ink-faint dark:text-ink-dark-faint' : 'text-ink dark:text-ink-dark',
        )}
        style={NUM}
        numberOfLines={1}
      >
        {priceText(ltp, false)}
      </Text>
      <ChangeText value={changePct} className="mt-0.5 text-xs" style={NUM} numberOfLines={1}>
        {move}
      </ChangeText>
    </Pressable>
  );
});

export function QuoteCardSkeleton() {
  return (
    <View className="w-[152px] rounded-card border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark">
      <View className="h-9 w-9 rounded-[11px] bg-line dark:bg-line-dark" />
      <View className="mt-3 h-3 w-4/5 rounded bg-line dark:bg-line-dark" />
      <View className="mt-2 h-3 w-1/2 rounded bg-line dark:bg-line-dark" />
      <View className="mt-3 h-3 w-2/5 rounded bg-line dark:bg-line-dark" />
    </View>
  );
}

/** One instrument in a list: mark · name/meta · price/change. */
export const InstrumentRow = memo(function InstrumentRow({
  mark,
  title,
  meta,
  price,
  change,
  changePct,
  trailing,
  onPress,
}: {
  mark: React.ReactNode;
  title: string;
  meta: string;
  price: string;
  change: number | null;
  changePct: number | null;
  /** Under the change, e.g. "Vol 12.4L". */
  trailing?: string | null;
  onPress?: (() => void) | null;
}) {
  const move = changeLine(change, changePct);
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${title}, ${meta}, ${price}, ${move}`}
      disabled={!onPress}
      onPress={onPress ?? undefined}
      className="min-h-[64px] flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      {mark}
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View className="max-w-[48%] items-end">
        <Text
          className="text-sm font-semibold text-ink dark:text-ink-dark"
          style={NUM}
          numberOfLines={1}
        >
          {price}
        </Text>
        <ChangeText
          value={changePct ?? change}
          className="mt-0.5 text-xs"
          style={NUM}
          numberOfLines={1}
        >
          {move}
        </ChangeText>
        {trailing ? (
          <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
            {trailing}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});
