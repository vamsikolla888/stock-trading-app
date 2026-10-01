import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/formatters';

import { spotMarkerIndex } from '../lib/chain';
import { DASH, formatStrike } from '../lib/format';

/**
 * CALLS | STRIKE | PUTS — the layout every chain reader already knows, compacted for a
 * phone: one outer column per side (open interest, or delta with IV beneath) plus the last
 * price against the strike ladder. Shared by the live Groww chain and the paper chain so the
 * two can never disagree about how a chain reads.
 *
 * - Rows are exactly the strikes the server returned; nothing here assumes an interval. The
 *   spot marker sits BETWEEN the two strikes the underlying is between.
 * - In-the-money halves are shaded (amber wash, as Groww does); the ATM strike is branded.
 * - Each half-row is one button (≥ 48 px tall) that opens that leg's ticket.
 * - One row = one memoised component with primitive props, so a refresh that changes one
 *   strike re-renders that row, not the table.
 */

export const CHAIN_ROW_HEIGHT = 50;
/** Height of the spot marker drawn between two strikes (h-6). */
export const SPOT_MARKER_HEIGHT = 24;
const STRIKE_WIDTH = 76;
const NUM = { fontVariant: ['tabular-nums' as const] };

export interface ChainGridRow<L> {
  strike: number;
  call: L | null;
  put: L | null;
}

export interface ChainOuterColumn<L> {
  label: string;
  main: (leg: L) => string;
  sub?: (leg: L) => string | null;
  /** 0–1 share for a thin bar under the value (open interest). */
  bar?: (leg: L) => number;
}

interface ChainGridProps<L> {
  rows: readonly ChainGridRow<L>[];
  atmStrike: number | null;
  spot: number | null;
  ltp: (leg: L) => number | null;
  /** The leg's day change in percent, when the feed carries one (live chain only). */
  change?: (leg: L) => number | null;
  outer: ChainOuterColumn<L>;
  itm: (leg: L) => boolean;
  /** False for a leg with no tradable contract (rendered, not pressable). */
  canPick: (leg: L) => boolean;
  onPick: (leg: L, kind: 'CE' | 'PE', strike: number) => void;
}

interface HalfProps {
  ltp: string;
  /** Formatted day change ("+4.2%"), or null. */
  change: string | null;
  up: boolean;
  outer: string;
  sub: string | null;
  bar: number;
  itm: boolean;
  pickable: boolean;
  present: boolean;
}

interface RowProps {
  strike: number;
  isAtm: boolean;
  call: HalfProps;
  put: HalfProps;
  onPick: (strike: number, kind: 'CE' | 'PE') => void;
}

const priceCell = (value: number | null) => (value == null ? DASH : formatNumber(value));

function changeCell(pct: number | null): { change: string | null; up: boolean } {
  if (pct == null || !Number.isFinite(pct)) return { change: null, up: false };
  return { change: `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`, up: pct >= 0 };
}

function Half({
  half,
  kind,
  strike,
  onPick,
}: {
  half: HalfProps;
  kind: 'CE' | 'PE';
  strike: number;
  onPick: (strike: number, kind: 'CE' | 'PE') => void;
}) {
  const isCall = kind === 'CE';
  const outerCell = (
    <View className={cn('flex-1 justify-center px-1.5', isCall ? 'items-start' : 'items-end')}>
      <Text
        className="text-xs text-ink-muted dark:text-ink-dark-muted"
        style={NUM}
        numberOfLines={1}
      >
        {half.present ? half.outer : DASH}
      </Text>
      {half.present && half.sub ? (
        <Text
          className="text-[10px] text-ink-faint dark:text-ink-dark-faint"
          style={NUM}
          numberOfLines={1}
        >
          {half.sub}
        </Text>
      ) : null}
      {half.present && half.bar > 0 ? (
        <View
          className={cn('mt-1 h-[3px] w-full flex-row', isCall ? 'justify-end' : 'justify-start')}
        >
          <View
            className="h-full rounded-full bg-info dark:bg-info-dark"
            style={{ width: `${Math.max(4, Math.round(half.bar * 100))}%`, opacity: 0.55 }}
          />
        </View>
      ) : null}
    </View>
  );
  const ltpCell = (
    <View className={cn('flex-1 justify-center px-1.5', isCall ? 'items-end' : 'items-start')}>
      <Text
        className={cn(
          'text-[13px] font-semibold',
          half.present ? 'text-ink dark:text-ink-dark' : 'text-ink-faint dark:text-ink-dark-faint',
        )}
        style={NUM}
        numberOfLines={1}
      >
        {half.present ? half.ltp : DASH}
      </Text>
      {half.present && half.change ? (
        <Text
          className={cn(
            'text-[10px] font-semibold',
            half.up
              ? 'text-brand-text dark:text-brand-text-dark'
              : 'text-danger-600 dark:text-danger-dark',
          )}
          style={NUM}
          numberOfLines={1}
        >
          {half.change}
        </Text>
      ) : null}
    </View>
  );
  const label = `${formatStrike(strike)} ${isCall ? 'call' : 'put'}, last ${
    half.ltp === DASH ? 'not traded' : half.ltp
  }${half.itm ? ', in the money' : ''}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={half.pickable ? `${label}. Opens the order ticket` : label}
      accessibilityState={{ disabled: !half.pickable }}
      disabled={!half.pickable}
      onPress={() => onPick(strike, kind)}
      className={cn(
        'flex-1 flex-row active:opacity-60',
        half.itm && 'bg-warning-wash dark:bg-warning-wash-dark',
      )}
    >
      {isCall ? (
        <>
          {outerCell}
          {ltpCell}
        </>
      ) : (
        <>
          {ltpCell}
          {outerCell}
        </>
      )}
    </Pressable>
  );
}

const ChainRow = memo(
  function ChainRow({ strike, isAtm, call, put, onPick }: RowProps) {
    return (
      <View
        className="flex-row border-b border-line dark:border-line-dark"
        style={{ height: CHAIN_ROW_HEIGHT }}
      >
        <Half half={call} kind="CE" strike={strike} onPick={onPick} />
        <View
          className={cn(
            'items-center justify-center',
            isAtm
              ? 'bg-brand-wash dark:bg-brand-wash-dark'
              : 'bg-surface-sunk dark:bg-surface-sunk-dark',
          )}
          style={{ width: STRIKE_WIDTH }}
        >
          <Text
            className={cn(
              'text-[13px] font-bold',
              isAtm ? 'text-brand-text dark:text-brand-text-dark' : 'text-ink dark:text-ink-dark',
            )}
            style={NUM}
            numberOfLines={1}
          >
            {formatStrike(strike)}
          </Text>
          {isAtm ? (
            <Text className="text-[9px] font-bold tracking-wider text-brand-text dark:text-brand-text-dark">
              ATM
            </Text>
          ) : null}
        </View>
        <Half half={put} kind="PE" strike={strike} onPick={onPick} />
      </View>
    );
  },
  (a, b) =>
    a.strike === b.strike &&
    a.isAtm === b.isAtm &&
    a.onPick === b.onPick &&
    sameHalf(a.call, b.call) &&
    sameHalf(a.put, b.put),
);

function sameHalf(a: HalfProps, b: HalfProps): boolean {
  return (
    a.ltp === b.ltp &&
    a.change === b.change &&
    a.outer === b.outer &&
    a.sub === b.sub &&
    a.bar === b.bar &&
    a.itm === b.itm &&
    a.pickable === b.pickable &&
    a.present === b.present
  );
}

function SpotMarker({ spot }: { spot: number }) {
  return (
    <View
      accessible
      accessibilityLabel={`Underlying at ${formatNumber(spot)}`}
      className="flex-row items-center"
      style={{ height: SPOT_MARKER_HEIGHT }}
    >
      <View className="h-px flex-1 bg-brand" />
      <View className="rounded-full bg-brand-strong px-2.5 py-0.5 dark:bg-brand-strong-dark">
        <Text className="text-[11px] font-bold text-white" style={NUM}>
          Spot {formatNumber(spot)}
        </Text>
      </View>
      <View className="h-px flex-1 bg-brand" />
    </View>
  );
}

export function ChainGrid<L>({
  rows,
  atmStrike,
  spot,
  ltp,
  change,
  outer,
  itm,
  canPick,
  onPick,
}: ChainGridProps<L>) {
  const byStrike = useMemo(() => new Map(rows.map((row) => [row.strike, row])), [rows]);
  const spotIndex = spotMarkerIndex(rows, spot);

  const pick = useCallback(
    (strike: number, kind: 'CE' | 'PE') => {
      const row = byStrike.get(strike);
      const leg = kind === 'CE' ? row?.call : row?.put;
      if (leg && canPick(leg)) onPick(leg, kind, strike);
    },
    [byStrike, canPick, onPick],
  );

  const half = (leg: L | null): HalfProps =>
    leg == null
      ? {
          ltp: DASH,
          change: null,
          up: false,
          outer: DASH,
          sub: null,
          bar: 0,
          itm: false,
          pickable: false,
          present: false,
        }
      : {
          ltp: priceCell(ltp(leg)),
          ...changeCell(change?.(leg) ?? null),
          outer: outer.main(leg),
          sub: outer.sub?.(leg) ?? null,
          bar: outer.bar ? Math.round(outer.bar(leg) * 100) / 100 : 0,
          itm: itm(leg),
          pickable: canPick(leg),
          present: true,
        };

  return (
    <View>
      {rows.map((row, index) => {
        const isAtm = row.strike === atmStrike;
        return (
          <React.Fragment key={row.strike}>
            {index === spotIndex && spot != null ? <SpotMarker spot={spot} /> : null}
            <ChainRow
              strike={row.strike}
              isAtm={isAtm}
              call={half(row.call)}
              put={half(row.put)}
              onPick={pick}
            />
          </React.Fragment>
        );
      })}
    </View>
  );
}

/** The sticky column header: CALLS · strike · PUTS over the two outer/LTP pairs. */
export function ChainGridHeader({ outerLabel }: { outerLabel: string }) {
  return (
    <View className="border-b border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
      <View className="flex-row pt-2">
        <Text className="flex-1 pl-1.5 text-[11px] font-bold tracking-wider text-ink-muted dark:text-ink-dark-muted">
          CALLS
        </Text>
        <View style={{ width: STRIKE_WIDTH }} />
        <Text className="flex-1 pr-1.5 text-right text-[11px] font-bold tracking-wider text-ink-muted dark:text-ink-dark-muted">
          PUTS
        </Text>
      </View>
      <View className="flex-row pb-2 pt-1">
        <Text className="flex-1 pl-1.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {outerLabel}
        </Text>
        <Text className="flex-1 pr-1.5 text-right text-[11px] text-ink-faint dark:text-ink-dark-faint">
          LTP
        </Text>
        <Text
          className="text-center text-[11px] text-ink-faint dark:text-ink-dark-faint"
          style={{ width: STRIKE_WIDTH }}
        >
          Strike
        </Text>
        <Text className="flex-1 pl-1.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
          LTP
        </Text>
        <Text className="flex-1 pr-1.5 text-right text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {outerLabel}
        </Text>
      </View>
    </View>
  );
}
