import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Section } from '@/components/ui/Section';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatNumber } from '@/lib/utils/formatters';

import { companyInsights, compactCr, sourceCaption, type InsightTone } from '../lib/insights';
import type { CompanyRatios } from '../types';

import {
  CardFrame,
  CardNote,
  NUM,
  ProfileGate,
  profileMissingOnServer,
  type ProfileQuery,
} from './CompanyParts';

/**
 * Groww's ten headline ratios, laid out as Groww lays them out (two columns, label left, value
 * right), then the facts those numbers state ("What the numbers say"). The ratios are CURRENT
 * values as Groww computed them when the profile was fetched; the scored reading of them is on
 * the Fundamentals tab.
 */

const ROWS: { key: keyof CompanyRatios; label: string; render: (r: CompanyRatios) => string }[] = [
  { key: 'marketCapCr', label: 'Market cap', render: (r) => compactCr(r.marketCapCr) },
  { key: 'roe', label: 'ROE', render: (r) => pct(r.roe) },
  { key: 'peTtm', label: 'P/E (TTM)', render: (r) => formatNumber(r.peTtm, 2) },
  { key: 'epsTtm', label: 'EPS (TTM)', render: (r) => formatINR(r.epsTtm, 2) },
  { key: 'pb', label: 'P/B', render: (r) => formatNumber(r.pb, 2) },
  { key: 'dividendYield', label: 'Dividend yield', render: (r) => pct(r.dividendYield) },
  { key: 'industryPe', label: 'Industry P/E', render: (r) => formatNumber(r.industryPe, 2) },
  { key: 'bookValue', label: 'Book value', render: (r) => formatINR(r.bookValue, 2) },
  { key: 'debtToEquity', label: 'Debt to equity', render: (r) => formatNumber(r.debtToEquity, 2) },
  { key: 'faceValue', label: 'Face value', render: (r) => formatINR(r.faceValue, 0) },
];

function pct(value: number | null): string {
  return value == null ? '—' : `${formatNumber(value, 2)}%`;
}

const GLYPH: Record<InsightTone, { mark: string; className: string }> = {
  pos: { mark: '▲', className: 'text-brand-text dark:text-brand-text-dark' },
  neg: { mark: '▼', className: 'text-danger-600 dark:text-danger-dark' },
  neutral: { mark: '●', className: 'text-ink-faint dark:text-ink-dark-faint' },
};

const INSIGHTS_SHOWN = 4;

export function RatiosCard({
  query,
  price,
  yearHigh,
}: {
  query: ProfileQuery;
  price: number | null;
  yearHigh: number | null;
}) {
  const [all, setAll] = useState(false);
  const profile = query.data?.profile ?? null;
  const insights = useMemo(
    () => (profile ? companyInsights(profile, { price, yearHigh }) : []),
    [profile, price, yearHigh],
  );
  if (profileMissingOnServer(query)) return null;

  const pairs: (typeof ROWS)[] = [];
  for (let i = 0; i < ROWS.length; i += 2) pairs.push(ROWS.slice(i, i + 2));
  const shown = all ? insights : insights.slice(0, INSIGHTS_SHOWN);

  return (
    <Section title="Fundamentals" note={sourceCaption(query.data)}>
      <ProfileGate query={query} rows={5}>
        {(p) => (
          <>
            <CardFrame>
              {pairs.map((pair, index) => (
                <View
                  key={pair[0]!.key}
                  className={cn(
                    'flex-row',
                    index > 0 && 'border-t border-line dark:border-line-dark',
                  )}
                >
                  {pair.map((row, col) => (
                    <View
                      key={row.key}
                      accessible
                      accessibilityLabel={`${row.label}: ${row.render(p.ratios)}`}
                      className={cn(
                        'flex-1 flex-row items-center justify-between gap-2 py-2.5',
                        col === 0 ? 'pr-3' : 'border-l border-line pl-3 dark:border-line-dark',
                      )}
                    >
                      <Text
                        className="flex-shrink text-xs text-ink-muted dark:text-ink-dark-muted"
                        numberOfLines={1}
                      >
                        {row.label}
                      </Text>
                      <Text
                        className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                        style={NUM}
                        numberOfLines={1}
                      >
                        {row.render(p.ratios)}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </CardFrame>

            {insights.length > 0 ? (
              <View className="mt-3 rounded-card bg-surface-sunk p-3.5 dark:bg-surface-sunk-dark">
                <Text className="mb-2 text-xs font-semibold text-ink dark:text-ink-dark">
                  What the numbers say
                </Text>
                <View className="gap-2">
                  {shown.map((insight) => (
                    <View key={insight.key} className="flex-row gap-2">
                      <Text
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                        className={cn(
                          'w-3 text-[10px] leading-[19px]',
                          GLYPH[insight.tone].className,
                        )}
                      >
                        {GLYPH[insight.tone].mark}
                      </Text>
                      <Text className="flex-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
                        {insight.text}
                      </Text>
                    </View>
                  ))}
                </View>
                {insights.length > INSIGHTS_SHOWN ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setAll((value) => !value)}
                    className="mt-2 self-start active:opacity-60"
                  >
                    <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                      {all ? 'Show less' : `Show all ${insights.length}`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <CardNote>
              Current values as Groww reports them — facts, not a rating.
              {query.data?.message ? ` ${query.data.message}` : ''}
            </CardNote>
          </>
        )}
      </ProfileGate>
    </Section>
  );
}
