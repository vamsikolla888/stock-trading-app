import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { RowDivider } from '@/components/ui/Section';
import { stockHref } from '@/lib/navigation';
import { cn } from '@/lib/utils/cn';
import { formatNumber, formatPercent } from '@/lib/utils/formatters';

import { COMPAT_VIEW, edgeText, libraryRows, sessionDay, signed } from '../lib/view';
import type { EdgeStats, LibraryStrategy, RegimeClass, StrategyLibrary } from '../types';
import { Bullets, FinePrint, NUM, TonePill } from './parts';

const REGIMES: [RegimeClass, string][] = [
  ['bull', 'Bullish'],
  ['bear', 'Bearish'],
  ['choppy', 'Choppy'],
];

/** One market class's edge: signals · next session · five sessions. */
function EdgeLine({ label, edge, first }: { label: string; edge: EdgeStats; first: boolean }) {
  return (
    <View
      accessible
      className={cn(
        'flex-row items-baseline gap-2 py-2',
        !first && 'border-t border-line dark:border-line-dark',
      )}
    >
      <Text className="w-[64px] text-xs text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      <Text
        className="w-[52px] text-right text-xs text-ink-faint dark:text-ink-dark-faint"
        style={NUM}
      >
        {formatNumber(edge.signals, 0)}
      </Text>
      <Text
        className="flex-1 text-right text-xs text-ink dark:text-ink-dark"
        style={NUM}
        numberOfLines={1}
      >
        {edgeText(edge)}
      </Text>
      <Text
        className="flex-1 text-right text-xs text-ink dark:text-ink-dark"
        style={NUM}
        numberOfLines={1}
      >
        {edgeText(edge, 'd5')}
      </Text>
    </View>
  );
}

/**
 * One scanner in full: what it looks for and its rules, then per direction whether its vote
 * counts and why, its edge over the market (all sessions and by market class) and its trades, and
 * what it saw in the latest report.
 */
export function ScannerDetail({ s, lib }: { s: LibraryStrategy; lib: StrategyLibrary }) {
  const router = useRouter();
  const layout = useScreenLayout();
  const row = libraryRows([s])[0]!;

  return (
    <View className="gap-5">
      <Panel
        title={s.when === 'morning' ? 'Morning confirmation' : 'Evening scan'}
        meta={s.needs ? `Needs ${s.needs}` : undefined}
      >
        {s.summary ? (
          <Text className="mb-3 text-[14px] leading-[21px] text-ink dark:text-ink-dark">
            {s.summary}
          </Text>
        ) : null}
        <Bullets items={s.rules} />
      </Panel>

      <Grid columns={Math.min(layout.columns, 2)} gap={20} equalHeight={false}>
        {(['long', 'short'] as const).map((side) => {
          const m = s.measure?.[side];
          const r = row[side];
          const view = COMPAT_VIEW[r.state];
          return (
            <Panel
              key={side}
              title={side === 'long' ? 'Long votes · BUY' : 'Short votes · SELL'}
              right={<TonePill tone={view.tone} label={view.label} />}
            >
              <Text className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                {r.reason}
              </Text>
              {m && m.edge.signals > 0 ? (
                <View className="mt-3">
                  <View className="flex-row gap-2 pb-1">
                    <Text className="w-[64px] text-[11px] text-ink-faint dark:text-ink-dark-faint">
                      Market
                    </Text>
                    <Text className="w-[52px] text-right text-[11px] text-ink-faint dark:text-ink-dark-faint">
                      Signals
                    </Text>
                    <Text className="flex-1 text-right text-[11px] text-ink-faint dark:text-ink-dark-faint">
                      Next session
                    </Text>
                    <Text className="flex-1 text-right text-[11px] text-ink-faint dark:text-ink-dark-faint">
                      5 sessions
                    </Text>
                  </View>
                  <EdgeLine label="All" edge={m.edge} first />
                  {REGIMES.map(([k, label]) => (
                    <EdgeLine key={k} label={label} edge={m.byRegime[k]} first={false} />
                  ))}
                </View>
              ) : null}
              {m && m.trade.trades > 0 ? (
                <View className="mt-2">
                  <KeyValueRow
                    divider
                    label="Trades"
                    value={`${formatNumber(m.trade.trades, 0)} of ${formatNumber(m.trade.signals, 0)}`}
                  />
                  <KeyValueRow
                    divider
                    label="Win rate"
                    value={m.trade.winRatePct == null ? '—' : formatPercent(m.trade.winRatePct, 1)}
                  />
                  <KeyValueRow
                    divider
                    label="Per trade"
                    value={signed(m.trade.avgR, 2, 'R')}
                    trend={m.trade.avgR}
                  />
                  <KeyValueRow
                    divider
                    label="Profit factor"
                    value={formatNumber(m.trade.profitFactor)}
                  />
                  <KeyValueRow
                    divider
                    label="Max drawdown"
                    value={`${formatNumber(m.trade.maxDrawdownR, 1)}R`}
                  />
                </View>
              ) : null}
            </Panel>
          );
        })}
      </Grid>

      {s.today && s.today.top.length > 0 ? (
        <Panel
          title={`Today · ${sessionDay(lib.reportDate)}`}
          meta={`${s.today.buy} buy · ${s.today.sell} sell${s.today.setups ? ` · ${s.today.setups} setups` : ''}`}
          flush
        >
          {s.today.top.slice(0, 8).map((t, index) => (
            <View key={t.symbol}>
              {index > 0 ? <RowDivider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t.symbol}, ${t.vote === 'NEUTRAL' ? 'setup' : t.vote.toLowerCase()}. ${t.reason}. Open stock`}
                onPress={() => router.push(stockHref(t.symbol, 'NSE'))}
                className="px-4 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                  {t.symbol}{' '}
                  <Text className="font-normal text-ink-muted dark:text-ink-dark-muted">
                    {t.vote === 'NEUTRAL' ? 'setup' : t.vote.toLowerCase()}
                  </Text>
                </Text>
                {t.reason ? (
                  <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                    {t.reason}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          ))}
        </Panel>
      ) : null}

      <FinePrint>
        Edge = next session from the open, minus that day’s market. A backtest is not a forecast.
      </FinePrint>
    </View>
  );
}
