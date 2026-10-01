import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { LiveFlash } from '@/components/market/LiveFlash';
import { Sparkline } from '@/components/market/Sparkline';
import { Button } from '@/components/ui/Button';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { Meter } from '@/components/ui/Meter';
import { changePctFrom, overlayQuote } from '@/features/market/lib/liveQuote';
import { useLiveQuote } from '@/features/market/live';
import { formatDay, istDateOf } from '@/features/portfolio/lib/dates';
import { Note, Sheet } from '@/features/trading/components/Sheet';
import { formatINR, formatSignedPercent } from '@/lib/utils/formatters';

import type { WatchlistItem } from '../types';

import { RepeatTag, unpricedText, VerdictTag } from './WatchlistRow';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };

function Gauge({ label, value }: { label: string; value: number | null }) {
  return (
    <View className="flex-1 rounded-xl bg-surface-sunk px-2.5 py-2.5 dark:bg-surface-sunk-dark">
      <Text
        className="text-center text-[10px] font-semibold uppercase tracking-wide text-ink-faint dark:text-ink-dark-faint"
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        className="mt-1 text-center text-[17px] font-bold text-ink dark:text-ink-dark"
        style={NUMBERS}
      >
        {value ?? '—'}
        {value !== null ? (
          <Text className="text-[11px] font-normal text-ink-faint dark:text-ink-dark-faint">
            /100
          </Text>
        ) : null}
      </Text>
      <Meter
        className="mt-2"
        height={4}
        value={value}
        accessibilityLabel={`${label} ${value ?? 'unknown'} out of 100`}
      />
    </View>
  );
}

interface WatchlistStockSheetProps {
  item: WatchlistItem;
  now: number;
  onClose: () => void;
  onOpenStock: () => void;
  onTradePaper: () => void;
  /** Present on the user's own lists only. */
  onRemove?: () => void;
}

/**
 * One stock on a list: price, trend, and — for an AI pick — the model's own reasons and its
 * own caveat, verbatim. Two gauges plus the composite, never a "fundamental" one: the
 * platform holds no fundamental data. Trading routes to the paper ticket (which shows costs
 * before a fill), never straight to an order.
 */
export function WatchlistStockSheet({
  item,
  now,
  onClose,
  onOpenStock,
  onTradePaper,
  onRemove,
}: WatchlistStockSheetProps) {
  const [showRationale, setShowRationale] = useState(false);
  const ai = item.ai ?? null;
  // The same live figures as the row behind the sheet.
  const quote = useLiveQuote(item.exchange, item.symbol);
  const view = overlayQuote(
    { price: item.ltp, prevClose: item.prevClose, changePct: item.changeTodayPct },
    quote,
  );
  const since =
    (quote ? changePctFrom(view.price, item.addedPrice) : null) ?? item.changeSinceAddPct;
  const subtitle = [item.companyName, ai?.sector, ai?.riskLevel ? `${ai.riskLevel} risk` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Sheet
      visible
      onClose={onClose}
      title={item.symbol}
      subtitle={`${item.exchange}${subtitle ? ` · ${subtitle}` : ''}`}
      footer={
        <View className="flex-row gap-2.5">
          <Button label="View stock" variant="outline" className="flex-1" onPress={onOpenStock} />
          <Button label="Trade in paper" className="flex-1" onPress={onTradePaper} />
        </View>
      }
    >
      {ai?.reviewVerdict || (ai?.flaggedCount ?? 0) > 1 ? (
        <View className="mb-3 flex-row items-center gap-2">
          <VerdictTag verdict={ai?.reviewVerdict} />
          <RepeatTag count={ai?.flaggedCount} />
          {(ai?.flaggedCount ?? 0) > 1 ? (
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              flagged on {ai?.flaggedCount} days
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="flex-row items-end gap-3 rounded-xl bg-surface-sunk px-3.5 py-3 dark:bg-surface-sunk-dark">
        <View className="min-w-0 flex-1">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Price</Text>
          <LiveFlash seq={quote?.seq} dir={quote?.dir} style={{ alignSelf: 'flex-start' }}>
            <Text
              className="mt-0.5 text-[22px] font-bold text-ink dark:text-ink-dark"
              style={NUMBERS}
            >
              {formatINR(view.price)}
            </Text>
          </LiveFlash>
          <View className="mt-1 flex-row gap-3">
            <ChangeText value={view.changePct} className="text-xs" style={NUMBERS}>
              {formatSignedPercent(view.changePct)} today
            </ChangeText>
            {since !== null ? (
              <ChangeText value={since} className="text-xs" style={NUMBERS}>
                {formatSignedPercent(since)} since added
              </ChangeText>
            ) : (
              <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
                {unpricedText(item)}
              </Text>
            )}
          </View>
        </View>
        {item.sparkline.length > 1 ? (
          <Sparkline data={item.sparkline} width={96} height={32} />
        ) : null}
      </View>

      <Note>
        {item.addedPrice !== null
          ? `Tracked from ${formatINR(item.addedPrice)} on ${formatDay(istDateOf(item.addedAt), now)}${
              item.daysHeld !== null ? ` · ${item.daysHeld} days ago` : ''
            }.`
          : `Added on ${formatDay(istDateOf(item.addedAt), now)} — no price was recorded then, so there's nothing to measure from.`}
      </Note>
      {item.note ? <Note>Note: {item.note}</Note> : null}

      {ai ? (
        <>
          <Text className="mb-2 mt-5 text-[13px] font-semibold text-ink dark:text-ink-dark">
            Model scores
          </Text>
          <View className="flex-row gap-2">
            <Gauge label="Composite" value={ai.compositeScore} />
            <Gauge label="Technical" value={ai.technicalScore} />
            <Gauge label="News" value={ai.newsSentimentScore} />
          </View>
          <Note className="mt-2 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            Scores out of 100 — not probabilities, and never validated against outcomes. There's no
            fundamental score: this platform holds no fundamental data.
          </Note>

          {ai.targetPrice !== null || ai.stopPrice !== null || ai.holdingPeriodDays !== null ? (
            <View className="mt-4 rounded-xl border border-line px-3.5 dark:border-line-dark">
              <KeyValueRow
                label="Target"
                value={formatINR(ai.targetPrice)}
                trend={ai.targetPrice !== null ? 1 : undefined}
              />
              <KeyValueRow
                label="Stop"
                value={formatINR(ai.stopPrice)}
                trend={ai.stopPrice !== null ? -1 : undefined}
                divider
              />
              <KeyValueRow
                label="Suggested hold"
                value={ai.holdingPeriodDays !== null ? `${ai.holdingPeriodDays} days` : '—'}
                divider
              />
              {ai.expectedMovementPercent !== null ? (
                <KeyValueRow
                  label="Expected move"
                  value={formatSignedPercent(ai.expectedMovementPercent)}
                  trend={ai.expectedMovementPercent}
                  divider
                />
              ) : null}
            </View>
          ) : null}

          {ai.reasons.length > 0 ? (
            <>
              <Text className="mb-2 mt-5 text-[13px] font-semibold text-ink dark:text-ink-dark">
                Why the model flagged it
              </Text>
              <View className="gap-2">
                {ai.reasons.map((reason) => (
                  <View
                    key={`${reason.head}:${reason.text.slice(0, 24)}`}
                    className="rounded-xl border border-line p-3 dark:border-line-dark"
                  >
                    <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                      {reason.head}
                    </Text>
                    <Text className="mt-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
                      {reason.text}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {ai.caveat ? (
            <View className="mt-4 rounded-xl bg-warning-wash p-3 dark:bg-warning-wash-dark">
              <Text className="text-[11px] font-bold uppercase tracking-wide text-warning-600 dark:text-warning-dark">
                The model's own caveat
              </Text>
              <Text className="mt-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
                {ai.caveat}
              </Text>
            </View>
          ) : null}

          {ai.rationale ? (
            <View className="mt-3">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showRationale }}
                hitSlop={8}
                onPress={() => setShowRationale((open) => !open)}
                className="self-start active:opacity-60"
              >
                <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                  {showRationale ? 'Hide full rationale' : 'Read full rationale'}
                </Text>
              </Pressable>
              {showRationale ? (
                <Text className="mt-2 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
                  {ai.rationale}
                </Text>
              ) : null}
            </View>
          ) : null}

          <Note className="mt-4 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
            {ai.reviewVerdict
              ? `An independent weekend review recomputed the technicals and returned ${ai.reviewVerdict}.`
              : "This pick hasn't been through the independent review — which isn't the same as passing one."}
          </Note>
        </>
      ) : (
        <Note className="mt-4 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          You added this stock yourself, so it has no model score. Only the AI recommendations list
          carries scores.
        </Note>
      )}

      {onRemove ? (
        <Button
          label="Remove from this list"
          variant="ghost"
          fullWidth
          className="mt-4"
          onPress={onRemove}
        />
      ) : null}
    </Sheet>
  );
}
