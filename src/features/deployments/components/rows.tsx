import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { trendOf, trendTextClass } from '@/components/market/ChangeText';
import { StatusDot } from '@/features/settings/components/StatusPill';
import { cn } from '@/lib/utils/cn';
import {
  formatINR,
  formatQuantity,
  formatSignedINR,
  formatSignedPercent,
} from '@/lib/utils/formatters';

import {
  dayLabel,
  eventView,
  exitLine,
  isoDayLabel,
  istTime,
  orderLine,
  outcomeWord,
  tradeSpan,
  triggerDistance,
} from '../lib/view';
import type { DeployEngine, DeployEvent, Deployment, DeployTrade } from '../types';
import { NUM } from './parts';

/**
 * One row per position, order, trade or log line — the phone's version of the web's tables:
 * the name and the money on one line, the detail in muted lines under it. Tapping a row with a
 * stock opens its page.
 */

const ROW = 'px-4 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark';
const SYMBOL = 'text-[15px] font-semibold text-ink dark:text-ink-dark';
const MUTED = 'text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted';
const FAINT = 'text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint';

function Money({ value, pct }: { value: number | null; pct?: number | null }) {
  const tone = trendTextClass[trendOf(value)];
  return (
    <View className="items-end">
      <Text className={cn('text-[15px] font-semibold', tone)} style={NUM}>
        {formatSignedINR(value)}
      </Text>
      {pct !== undefined ? (
        <Text className={cn('mt-0.5 text-xs', trendTextClass[trendOf(pct)])} style={NUM}>
          {formatSignedPercent(pct, 2)}
        </Text>
      ) : null}
    </View>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-surface-sunk px-2 py-0.5 dark:bg-surface-sunk-dark">
      <Text className="text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted">
        {label}
      </Text>
    </View>
  );
}

/** A held (or being bought / sold) position: live price, stop, target, what happens next. */
export function PositionRow({
  t,
  dep,
  onOpen,
  onSquareOff,
  busy,
}: {
  t: DeployTrade;
  dep: Pick<Deployment, 'engine' | 'source'>;
  onOpen: (symbol: string) => void;
  onSquareOff?: (symbol: string) => void;
  busy?: boolean;
}) {
  const canSquare =
    Boolean(onSquareOff) && t.status === 'open' && (dep.engine === 'intraday' || !t.exitPlan);
  const levels = [
    t.stop != null ? `Stop ${formatINR(t.stop)}` : dep.engine === 'intraday' ? 'No stop' : null,
    t.target != null ? `Target ${formatINR(t.target)}` : null,
    dep.engine === 'intraday'
      ? t.entryAt
        ? `in at ${istTime(t.entryAt)}`
        : null
      : t.entryDay
        ? `since ${dayLabel(t.entryDay)}${t.sessionsHeld ? ` · ${t.sessionsHeld}d` : ''}`
        : null,
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the stock"
      onPress={() => onOpen(t.symbol)}
      className={ROW}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className={SYMBOL} numberOfLines={1}>
              {t.symbol}
            </Text>
            {t.status === 'pending-entry' ? <Tag label="buying…" /> : null}
            {t.status === 'pending-exit' ? <Tag label="selling…" /> : null}
          </View>
          <Text className={cn('mt-0.5', MUTED)} style={NUM} numberOfLines={1}>
            {`${formatQuantity(t.qty)} × ${formatINR(t.entryPrice ?? t.refPrice)} · LTP ${formatINR(t.ltp)}`}
          </Text>
        </View>
        <Money value={t.unrealised} pct={t.unrealisedPct} />
      </View>
      {levels.length ? (
        <Text className={cn('mt-1.5', FAINT)} style={NUM} numberOfLines={2}>
          {levels.join(' · ')}
        </Text>
      ) : null}
      <View className="mt-1 flex-row items-center justify-between gap-3">
        <Text className={cn('flex-1', MUTED)} numberOfLines={2}>
          {exitLine(t, dep)}
        </Text>
        {canSquare ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Square off ${t.symbol}`}
            accessibilityState={{ disabled: Boolean(busy) }}
            disabled={busy}
            hitSlop={8}
            onPress={() => onSquareOff?.(t.symbol)}
            className={cn(
              'rounded-full border border-line-strong px-3 py-1 active:opacity-60 dark:border-line-dark-strong',
              busy && 'opacity-50',
            )}
          >
            <Text className="text-xs font-semibold text-ink dark:text-ink-dark">Square off</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A planned order for the next open, or a resting buy-above trigger (daily strategies). */
export function OrderRow({
  t,
  platform,
  onOpen,
}: {
  t: DeployTrade;
  platform: boolean;
  onOpen: (symbol: string) => void;
}) {
  const distance = triggerDistance(t);
  const facts = [
    t.signalClose != null
      ? `Signal close ${formatINR(t.signalClose)}${t.signalDate ? ` (${dayLabel(t.signalDate)})` : ''}`
      : null,
    platform && (t.stop != null || t.target != null)
      ? `Stop ${formatINR(t.stop)} / target ${formatINR(t.target)}`
      : null,
    distance,
  ].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the stock"
      onPress={() => onOpen(t.symbol)}
      className={ROW}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className={SYMBOL} numberOfLines={1}>
            {t.symbol}
          </Text>
          <Text className={cn('mt-0.5', MUTED)} style={NUM} numberOfLines={1}>
            {orderLine(t)}
          </Text>
        </View>
        <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUM}>
          {platform ? `LTP ${formatINR(t.ltp)}` : `Qty ${formatQuantity(t.qty)}`}
        </Text>
      </View>
      {facts.length ? (
        <Text className={cn('mt-1', FAINT)} style={NUM} numberOfLines={2}>
          {facts.join(' · ')}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** A closed, refused or not-taken trade with its reason and money after charges. */
export function TradeRow({
  t,
  engine,
  onOpen,
}: {
  t: DeployTrade;
  engine: DeployEngine;
  onOpen: (symbol: string) => void;
}) {
  const closed = t.status === 'closed';
  const why =
    t.status === 'failed'
      ? `Refused${t.error ? ` · ${t.error}` : ''}`
      : t.status === 'cancelled'
        ? `Not taken${t.cancelReason ? ` · ${t.cancelReason}` : ''}`
        : outcomeWord(t);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the stock"
      onPress={() => onOpen(t.symbol)}
      className={ROW}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className={SYMBOL} numberOfLines={1}>
            {t.symbol}
          </Text>
          <Text className={cn('mt-0.5', MUTED)} numberOfLines={2}>
            {`${tradeSpan(t, engine)} · ${why}`}
          </Text>
        </View>
        {closed ? (
          <Money value={t.netPnl} pct={t.returnPct} />
        ) : (
          <Text className="text-[13px] text-ink-faint dark:text-ink-dark-faint">—</Text>
        )}
      </View>
      {closed ? (
        <Text className={cn('mt-1', FAINT)} style={NUM} numberOfLines={1}>
          {`${formatINR(t.entryPrice)} → ${formatINR(t.exitPrice)} · qty ${formatQuantity(t.qty)}${t.charges != null ? ` · charges ${formatINR(t.charges)}` : ''}`}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** One line of the activity log: when, what kind, the stock and the message. */
export function EventRow({ e, engine }: { e: DeployEvent; engine: DeployEngine }) {
  const v = eventView(e.kind, engine);
  return (
    <View accessible className="px-4 py-3">
      <View className="flex-row items-center gap-2">
        <StatusDot tone={v.tone} size={7} />
        <Text className="text-xs font-semibold text-ink dark:text-ink-dark">{v.label}</Text>
        <Text className={FAINT} style={NUM}>
          {`${isoDayLabel(e.at)} ${istTime(e.at)}`}
        </Text>
      </View>
      <Text className="mt-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {e.symbol ? (
          <Text className="font-semibold text-ink dark:text-ink-dark">{`${e.symbol} `}</Text>
        ) : null}
        {e.message}
      </Text>
    </View>
  );
}
