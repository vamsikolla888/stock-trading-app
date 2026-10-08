import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Section } from '@/components/ui/Section';
import { RangeSelector } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import { holderColor, holderRows, sourceCaption, type HolderRow } from '../lib/insights';
import type { ProfileFund } from '../types';

import {
  CardFrame,
  CardNote,
  NUM,
  ProfileGate,
  profileMissingOnServer,
  type ProfileQuery,
} from './CompanyParts';

/**
 * Who owns the company, quarter by quarter — Groww's Shareholding pattern: a bar per holder
 * category and, the part a reader actually scans for, each category's move since the previous
 * quarter. Each category wears its own colour, Groww's (Promoters lilac, FII sky blue, DII olive,
 * retail orange, mutual funds magenta) — identity only: the label and value sit on every row in
 * ink, so no reading depends on telling two hues apart. Then the mutual funds behind the "Mutual
 * funds" bar.
 */

const pctText = (value: number | null) => (value == null ? '—' : `${value.toFixed(2)}%`);

function Delta({ row, prevLabel }: { row: HolderRow; prevLabel: string | null }) {
  if (row.delta == null || !prevLabel) return null;
  if (row.delta === 0) {
    return <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">No change</Text>;
  }
  const up = row.delta > 0;
  return (
    <Text
      accessibilityLabel={`${up ? 'Up' : 'Down'} ${Math.abs(row.delta).toFixed(2)} points from ${prevLabel}`}
      className={cn(
        'text-[11px] font-semibold',
        up ? 'text-brand-text dark:text-brand-text-dark' : 'text-danger-600 dark:text-danger-dark',
      )}
      style={NUM}
    >
      {up ? '▲' : '▼'} {Math.abs(row.delta).toFixed(2)}
    </Text>
  );
}

const FUNDS_SHOWN = 5;

/** `aumPercent` is the share of each FUND's assets in this stock — the note says so. */
function Funds({ funds }: { funds: ProfileFund[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? funds : funds.slice(0, FUNDS_SHOWN);
  const ret = (n: number | null) =>
    n == null ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
  return (
    <View className="mt-4 border-t border-line pt-3 dark:border-line-dark">
      <View className="mb-1 flex-row">
        <Text className="flex-1 text-xs font-semibold text-ink dark:text-ink-dark">
          Mutual funds holding it
        </Text>
        <Text className="w-16 text-right text-[11px] text-ink-muted dark:text-ink-dark-muted">
          % of fund
        </Text>
        <Text className="w-16 text-right text-[11px] text-ink-muted dark:text-ink-dark-muted">
          1Y return
        </Text>
      </View>
      {shown.map((fund) => (
        <View
          key={fund.name}
          accessible
          accessibilityLabel={`${fund.name}: ${pctText(fund.aumPercent)} of the fund, one-year return ${ret(fund.return1y)}`}
          className="flex-row items-center py-2"
        >
          <Text className="flex-1 pr-2 text-xs text-ink dark:text-ink-dark" numberOfLines={1}>
            {fund.name}
          </Text>
          <Text
            className="w-16 text-right text-xs font-semibold text-ink dark:text-ink-dark"
            style={NUM}
          >
            {pctText(fund.aumPercent)}
          </Text>
          <Text
            className={cn(
              'w-16 text-right text-xs font-semibold',
              fund.return1y == null
                ? 'text-ink-faint dark:text-ink-dark-faint'
                : fund.return1y >= 0
                  ? 'text-brand-text dark:text-brand-text-dark'
                  : 'text-danger-600 dark:text-danger-dark',
            )}
            style={NUM}
          >
            {ret(fund.return1y)}
          </Text>
        </View>
      ))}
      {funds.length > FUNDS_SHOWN ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setAll((value) => !value)}
          className="mt-1 self-start active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            {all ? 'Show fewer funds' : `Show all ${funds.length} funds`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A holder's share as a bar in its category's colour; the label and value beside it stay in ink. */
function HolderBar({ value, color }: { value: number | null; color: string }) {
  const pct = value != null && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      className="h-1.5 w-full overflow-hidden rounded-full bg-line dark:bg-line-dark"
    >
      {pct > 0 ? (
        <View
          className="h-full rounded-full"
          style={{ width: `${pct}%`, minWidth: 2, backgroundColor: color }}
        />
      ) : null}
    </View>
  );
}

export function ShareholdingCard({ query }: { query: ProfileQuery }) {
  const { isDark } = useTheme();
  const [pick, setPick] = useState<string | null>(null);
  if (profileMissingOnServer(query)) return null;

  return (
    <Section title="Shareholding pattern" note={sourceCaption(query.data)}>
      <ProfileGate query={query} rows={5}>
        {(profile) => {
          const periods = profile.shareholding;
          const index = Math.max(
            0,
            periods.findIndex((p) => p.periodEnd === pick),
          );
          const curr = periods[index];
          if (!curr) {
            return (
              <CardFrame>
                <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
                  Groww publishes no shareholding pattern for this company.
                </Text>
              </CardFrame>
            );
          }
          const prev = periods[index + 1] ?? null;
          const rows = holderRows(curr, prev);
          const split = curr.promoterSplit;
          return (
            <>
              <CardFrame>
                {periods.length > 1 ? (
                  <RangeSelector
                    items={periods.slice(0, 5).map((p) => ({ key: p.periodEnd, label: p.label }))}
                    value={curr.periodEnd}
                    onChange={setPick}
                    className="mb-3 flex-wrap"
                  />
                ) : null}
                <View className="gap-3.5">
                  {rows.map((row) => (
                    <View
                      key={row.key}
                      accessible
                      accessibilityLabel={`${row.label}: ${pctText(row.value)}`}
                    >
                      <View className="mb-1.5 flex-row items-center gap-2">
                        <View
                          className="h-2.5 w-2.5 rounded-[3px]"
                          style={{ backgroundColor: holderColor(row.key, isDark) }}
                        />
                        <Text
                          className="flex-1 text-[13px] text-ink dark:text-ink-dark"
                          numberOfLines={1}
                        >
                          {row.label}
                        </Text>
                        <Delta row={row} prevLabel={prev?.label ?? null} />
                        <Text
                          className="w-16 text-right text-[13px] font-semibold text-ink dark:text-ink-dark"
                          style={NUM}
                        >
                          {pctText(row.value)}
                        </Text>
                      </View>
                      <HolderBar value={row.value} color={holderColor(row.key, isDark)} />
                      {row.key === 'promoters' &&
                      split &&
                      (split.corporation || split.government) ? (
                        <Text className="mt-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                          Individuals {pctText(split.individual)} · Corporate bodies{' '}
                          {pctText(split.corporation)} · Government {pctText(split.government)}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
                {profile.mutualFunds.length > 0 ? <Funds funds={profile.mutualFunds} /> : null}
              </CardFrame>
              <CardNote>
                As of {curr.label}
                {prev ? `; ▲/▼ is the change in percentage points since ${prev.label}` : ''}. Groww
                does not publish pledged promoter shares.
                {profile.mutualFunds.length > 0
                  ? ' “% of fund” is the share of each fund’s assets in this stock.'
                  : ''}
              </CardNote>
            </>
          );
        }}
      </ProfileGate>
    </Section>
  );
}
