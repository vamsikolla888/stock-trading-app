import React from 'react';
import { Text, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/formatters';

import { notionalLabel } from '../../lib/intradayView';
import type { IntradayStrategyDetail, VariantKey } from '../../types';

/**
 * Both variants' rules, written by the server FROM the engine's own config — a line here is a
 * rule the backtest applies, nothing more. Lines the improved variant adds are marked "+". The
 * variant on show comes first.
 */
export function IntradayRules({
  detail,
  variant,
}: {
  detail: IntradayStrategyDetail;
  variant: VariantKey;
}) {
  const layout = useScreenLayout();
  const base = detail.rules.base;
  const baseLines = new Set([...base.entry, ...base.exit]);
  const order: VariantKey[] = variant === 'base' ? ['base', 'improved'] : ['improved', 'base'];
  const d = detail.data;

  return (
    <View className="gap-4">
      <Grid columns={Math.min(layout.columns, 2)} equalHeight={false}>
        {order.map((key) => {
          const r = detail.rules[key];
          const marks = key === 'improved';
          return (
            <Panel key={key} title={r.label} meta={key === variant ? 'shown' : undefined}>
              <RuleGroup
                title="Entry"
                lines={r.entry}
                added={(line) => marks && !baseLines.has(line)}
              />
              <View className="h-4" />
              <RuleGroup
                title="Exit"
                lines={r.exit}
                added={(line) => marks && !baseLines.has(line)}
              />
            </Panel>
          );
        })}
      </Grid>
      <Panel title="Test setup">
        <KeyValueRow label="Candles" value="5 minute" />
        <KeyValueRow
          divider
          label="Stocks"
          value={
            d
              ? `${formatNumber(d.stocks, 0)} · ${d.universe.label || detail.universe}`
              : detail.universe || '—'
          }
        />
        <KeyValueRow divider label="Period" value={d?.from && d.to ? `${d.from} → ${d.to}` : '—'} />
        <KeyValueRow divider label="Per trade" value={notionalLabel(detail.costs?.notionalInr)} />
        <KeyValueRow
          divider
          label="Slippage"
          value={`${formatNumber(detail.costs?.slippageBps ?? 2, 0)} bps a side`}
        />
        <KeyValueRow divider label="Fill" value="Next candle’s open" />
      </Panel>
    </View>
  );
}

function RuleGroup({
  title,
  lines,
  added,
}: {
  title: string;
  lines: readonly string[];
  added: (line: string) => boolean;
}) {
  return (
    <View>
      <Text className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
        {title}
      </Text>
      {lines.length === 0 ? (
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">Not sent.</Text>
      ) : (
        <View className="gap-2">
          {lines.map((line) => {
            const plus = added(line);
            return (
              <View
                key={line}
                accessible
                accessibilityLabel={plus ? `Added: ${line}` : line}
                className="flex-row gap-2"
              >
                <Text
                  className={cn(
                    'w-3 text-[13px]',
                    plus
                      ? 'font-bold text-brand-text dark:text-brand-text-dark'
                      : 'text-ink-faint dark:text-ink-dark-faint',
                  )}
                >
                  {plus ? '+' : '•'}
                </Text>
                <Text className="flex-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
                  {line}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
