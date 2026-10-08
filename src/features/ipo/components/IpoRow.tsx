import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  boardLine,
  dateText,
  gmpPctText,
  gmpText,
  listingWhen,
  priceBand,
  rowResearch,
  times,
} from '../lib/format';
import { inr, valueCell } from '../lib/valuation';
import type { IpoRecord } from '../types';

import { Figure, IpoLogo, IpoRating, StatusPill, ToneLine } from './IpoParts';

/** The one date that matters for the issue's stage: when it opens, closes or lists. */
export function stageDate(ipo: IpoRecord, now: Date = new Date()): string {
  const when = listingWhen(ipo.listingDate, now);
  if (when === 'today') return ipo.status === 'listed' ? 'Listed today' : 'Lists today';
  if (when === 'tomorrow') return 'Lists tomorrow';
  switch (ipo.status) {
    case 'upcoming':
      return ipo.openDate ? `Opens ${dateText(ipo.openDate)}` : 'Dates not announced';
    case 'open':
      return ipo.closeDate ? `Closes ${dateText(ipo.closeDate)}` : 'Open for bidding';
    case 'closed':
      return ipo.listingDate ? `Lists ${dateText(ipo.listingDate)}` : 'Listing date pending';
    default:
      return ipo.listingDate ? `Lists ${dateText(ipo.listingDate)}` : 'Dates pending';
  }
}

/**
 * One issue on the board, Groww-style: who and where, the stage date and its star rating, then
 * the numbers a reader compares — price band, grey-market premium, subscription, and the fair
 * value with its good-up-to level — and where its research report stands.
 */
export const IpoRow = memo(function IpoRow({
  ipo,
  onPress,
}: {
  ipo: IpoRecord;
  onPress: () => void;
}) {
  const research = rowResearch(ipo);
  // `?? null`: a cache written before the valuation existed has no field at all.
  const value = valueCell(ipo.valuation ?? null);
  const gmpTone = ipo.gmp == null || ipo.gmp === 0 ? undefined : ipo.gmp > 0 ? 'ok' : 'err';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ipo.companyName}, ${boardLine(ipo)}, ${stageDate(ipo)}. ${value.summary}`}
      accessibilityHint="Opens the IPO's details and research"
      onPress={onPress}
      className="gap-3 px-3.5 py-3.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-start gap-3">
        <IpoLogo ipo={ipo} />
        <View className="flex-1">
          <Text
            className="text-[15px] font-semibold leading-5 text-ink dark:text-ink-dark"
            numberOfLines={2}
          >
            {ipo.companyName}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-2">
            <Text
              className="flex-shrink text-xs text-ink-muted dark:text-ink-dark-muted"
              numberOfLines={1}
            >
              {boardLine(ipo)} · {stageDate(ipo)}
            </Text>
            <IpoRating rating={ipo.rating} small showValue={false} hideEmpty />
          </View>
        </View>
        <StatusPill status={ipo.status} />
      </View>
      <View className="flex-row gap-3 pl-[48px]">
        <Figure label="Price band" value={priceBand(ipo)} />
        <Figure
          label="GMP"
          value={ipo.gmp == null ? '—' : `${gmpText(ipo.gmp)} (${gmpPctText(ipo.gmpPercent)})`}
          tone={gmpTone}
        />
        <Figure label="Subscribed" value={times(ipo.totalSubscription)} align="right" />
      </View>
      <View className="flex-row gap-3 pl-[48px]">
        <Figure
          label="Fair value"
          value={value.valued ? value.fair : (value.missing ?? '—')}
          muted={!value.valued}
        />
        <Figure label="Good up to" value={value.good} muted={!value.valued} />
        <Figure
          label={value.vs?.label ?? 'Est. listing'}
          value={value.vs?.price ?? inr(ipo.estimatedListingPrice)}
          align="right"
        />
      </View>
      {value.vs ? (
        <ToneLine tone={value.vs.tone} text={value.vs.text} className="pl-[48px]" />
      ) : null}
      {research ? (
        <ToneLine tone={research.tone} text={research.text} className="pl-[48px]" />
      ) : null}
    </Pressable>
  );
});
