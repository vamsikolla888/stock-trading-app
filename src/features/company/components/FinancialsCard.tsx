import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Section } from '@/components/ui/Section';
import { RangeSelector, SegmentedControl } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils/cn';

import {
  change,
  formatCr,
  seriesGrowth,
  shortCr,
  signedPctOf,
  sourceCaption,
  statementTable,
} from '../lib/insights';
import type { FinancialStatements, StatementPoint } from '../types';

import {
  CardFrame,
  CardNote,
  NUM,
  ProfileGate,
  profileMissingOnServer,
  type ProfileQuery,
} from './CompanyParts';

/**
 * Revenue, net profit and net worth — Groww's Financials block: one line at a time, quarterly or
 * yearly, consolidated or standalone, drawn as columns with the value on each cap. Tapping a
 * column moves the readout to that period with its change against a year before; it starts on
 * the latest period, so the figure a reader most wants needs no tap. The statement under it puts
 * every period side by side.
 */

type Line = 'revenue' | 'profit' | 'netWorth';
type Period = 'quarterly' | 'yearly';
type Basis = 'consolidated' | 'standalone';

const LINES: readonly { key: Line; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'profit', label: 'Profit' },
  { key: 'netWorth', label: 'Net worth' },
];

const PERIODS: readonly { key: Period; label: string }[] = [
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'yearly', label: 'Yearly' },
];

const BASES: readonly { key: Basis; label: string }[] = [
  { key: 'consolidated', label: 'Consolidated' },
  { key: 'standalone', label: 'Standalone' },
];

const PLOT_H = 132;
const CAP_H = 16;

const toneClass = (f: number) =>
  f >= 0 ? 'text-brand-text dark:text-brand-text-dark' : 'text-danger-600 dark:text-danger-dark';

function Columns({ points, period }: { points: StatementPoint[]; period: Period }) {
  const [active, setActive] = useState(points.length - 1);
  const shown = Math.min(active, points.length - 1);
  const values = points.map((p) => p.value);
  const posMax = Math.max(0, ...values);
  const negMin = Math.min(0, ...values);
  const range = posMax - negMin || 1;
  const bottomPad = negMin < 0 ? CAP_H : 0;
  const usable = PLOT_H - CAP_H - bottomPad;
  const zeroY = CAP_H + (posMax / range) * usable;
  // A year earlier: one fiscal year back, or four quarter-ends back.
  const back = period === 'yearly' ? 1 : 4;
  const cur = points[shown]!;
  const prior = shown - back >= 0 ? points[shown - back]! : null;
  const yoy = prior ? change(prior.value, cur.value) : null;

  return (
    <View>
      <View accessibilityLiveRegion="polite" className="flex-row flex-wrap items-baseline gap-x-2">
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{cur.label}</Text>
        <Text className="text-base font-bold text-ink dark:text-ink-dark" style={NUM}>
          {formatCr(cur.value)}
        </Text>
        {yoy != null && prior ? (
          <Text className={cn('text-xs font-semibold', toneClass(yoy))} style={NUM}>
            {signedPctOf(yoy)} vs {prior.label}
          </Text>
        ) : null}
      </View>
      <View className="mt-2 flex-row gap-1.5" style={{ height: PLOT_H + 22 }}>
        {points.map((p, i) => {
          const h = Math.max((Math.abs(p.value) / range) * usable, 1);
          const up = p.value >= 0;
          const selected = i === shown;
          return (
            <Pressable
              key={p.period}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${p.label}: ${formatCr(p.value)}`}
              onPress={() => setActive(i)}
              className="flex-1"
            >
              <View style={{ height: PLOT_H }}>
                <View
                  className="absolute left-0 right-0 h-px bg-line-strong dark:bg-line-dark-strong"
                  style={{ top: zeroY }}
                />
                <Text
                  numberOfLines={1}
                  className={cn(
                    'absolute left-0 right-0 text-center text-[10px]',
                    selected
                      ? 'font-semibold text-ink dark:text-ink-dark'
                      : 'text-ink-faint dark:text-ink-dark-faint',
                  )}
                  style={[NUM, up ? { top: zeroY - h - 14 } : { top: zeroY + h + 1 }]}
                >
                  {shortCr(p.value)}
                </Text>
                <View
                  className={cn(
                    'absolute left-[18%] right-[18%] rounded-[3px]',
                    up
                      ? selected
                        ? 'bg-brand-strong dark:bg-brand-strong-dark'
                        : 'bg-primary-300 dark:bg-primary-800'
                      : selected
                        ? 'bg-danger-600 dark:bg-danger-dark'
                        : 'bg-danger-wash dark:bg-danger-wash-dark',
                  )}
                  style={up ? { top: zeroY - h, height: h } : { top: zeroY, height: h }}
                />
              </View>
              <Text
                numberOfLines={1}
                className={cn(
                  'mt-1.5 text-center text-[10px]',
                  selected
                    ? 'font-semibold text-ink dark:text-ink-dark'
                    : 'text-ink-muted dark:text-ink-dark-muted',
                )}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Growth({ s, line }: { s: FinancialStatements; line: Line }) {
  const g = seriesGrowth(s[line].yearly, s[line].quarterly);
  const items = [
    { label: '1-year growth', value: g.oneYear?.pct ?? null },
    { label: '3-year CAGR', value: g.threeYear?.pct ?? null },
    ...(line !== 'netWorth' ? [{ label: 'Latest qtr YoY', value: g.quarterYoY?.pct ?? null }] : []),
  ];
  return (
    <View className="mt-4 flex-row border-t border-line pt-3 dark:border-line-dark">
      {items.map((item, index) => (
        <View
          key={item.label}
          accessible
          accessibilityLabel={`${item.label}: ${item.value != null ? signedPctOf(item.value) : 'not available'}`}
          className={cn('flex-1', index > 0 && 'border-l border-line pl-3 dark:border-line-dark')}
        >
          <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{item.label}</Text>
          <Text
            className={cn(
              'mt-0.5 text-[13px] font-semibold',
              item.value != null
                ? toneClass(item.value)
                : 'text-ink-faint dark:text-ink-dark-faint',
            )}
            style={NUM}
          >
            {item.value != null ? signedPctOf(item.value) : '—'}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Statement({ s, period }: { s: FinancialStatements; period: Period }) {
  const t = statementTable(s, period);
  if (t.periods.length === 0) return null;
  const cell = (kind: 'cr' | 'pct', value: number | null, signed: boolean) => {
    if (value == null) return { text: '—', className: 'text-ink-faint dark:text-ink-dark-faint' };
    if (kind === 'cr') {
      return {
        text: value.toLocaleString('en-IN', {
          maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
        }),
        className: 'text-ink dark:text-ink-dark',
      };
    }
    return {
      text: signed ? signedPctOf(value) : `${(value * 100).toFixed(1)}%`,
      className: signed ? toneClass(value) : 'text-ink dark:text-ink-dark',
    };
  };
  return (
    <View className="mt-4">
      <Text className="mb-2 text-xs font-semibold text-ink dark:text-ink-dark">
        {period === 'yearly' ? 'Yearly statement' : 'Quarterly statement'} · ₹ crore
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View className="flex-row border-b border-line pb-1.5 dark:border-line-dark">
            <View className="w-[108px]" />
            {t.periods.map((p) => (
              <Text
                key={p.period}
                className="w-[76px] text-right text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted"
              >
                {p.label}
              </Text>
            ))}
          </View>
          {t.rows.map((row) => (
            <View key={row.key} className="flex-row py-1.5">
              <Text
                className="w-[108px] text-xs text-ink-muted dark:text-ink-dark-muted"
                numberOfLines={1}
              >
                {row.label}
              </Text>
              {row.values.map((value, i) => {
                const c = cell(row.kind, value, row.key.endsWith('Growth'));
                return (
                  <Text
                    key={t.periods[i]!.period}
                    className={cn('w-[76px] text-right text-xs', c.className)}
                    style={NUM}
                  >
                    {c.text}
                  </Text>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function FinancialsCard({ query }: { query: ProfileQuery }) {
  const fin = query.data?.profile?.financials;
  const bases = useMemo(() => (fin ? BASES.filter((b) => fin[b.key] != null) : []), [fin]);
  const [basisPick, setBasis] = useState<Basis>('consolidated');
  const [line, setLine] = useState<Line>('revenue');
  const [periodPick, setPeriod] = useState<Period>('quarterly');
  if (profileMissingOnServer(query)) return null;

  const basis = bases.some((b) => b.key === basisPick) ? basisPick : bases[0]?.key;
  const s = basis ? (fin?.[basis] ?? null) : null;
  // Net worth is yearly only — Groww sends no quarterly figure, so yearly shows instead of an
  // empty chart.
  const hasQuarterly = !!s && s[line].quarterly.length > 0;
  const period: Period = hasQuarterly ? periodPick : 'yearly';
  const points = s ? s[line][period] : [];

  return (
    <Section title="Financials" note={sourceCaption(query.data)}>
      <ProfileGate query={query} rows={6}>
        {() =>
          !s ? (
            <CardFrame>
              <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
                Groww publishes no financial statements for this company.
              </Text>
            </CardFrame>
          ) : (
            <>
              <CardFrame>
                <SegmentedControl items={LINES} value={line} onChange={setLine} />
                <View className="mt-3 flex-row flex-wrap items-center justify-between gap-2">
                  {hasQuarterly ? (
                    <RangeSelector items={PERIODS} value={period} onChange={setPeriod} />
                  ) : (
                    <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Yearly</Text>
                  )}
                  {bases.length > 1 && basis ? (
                    <RangeSelector items={BASES} value={basis} onChange={setBasis} />
                  ) : null}
                </View>
                <View className="mt-4">
                  {points.length > 0 ? (
                    // Keyed by what is drawn, so the selected column resets on a switch.
                    <Columns key={`${basis}:${line}:${period}`} points={points} period={period} />
                  ) : (
                    <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
                      No {period} figures for this line.
                    </Text>
                  )}
                </View>
                <Growth s={s} line={line} />
                <Statement s={s} period={period} />
              </CardFrame>
              <CardNote>
                ₹ crore,{' '}
                {basis === 'standalone'
                  ? 'standalone (this company alone)'
                  : 'consolidated (with subsidiaries)'}
                . Years are fiscal years ending March
                {line === 'netWorth' ? '; net worth is published yearly only' : ''}. Tap a column
                for its figure.
              </CardNote>
            </>
          )
        }
      </ProfileGate>
    </Section>
  );
}
