import React from 'react';
import { Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatIstDateTime } from '@/features/home/lib/istTime';
import { metricSummary } from '@/features/screeners/lib/metrics';
import { SheetModal } from '@/features/strategies/components/SheetModal';
import {
  formatINR,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from '@/lib/utils/formatters';

import { ACTION_LABEL, ACTION_TONE, alertState, convictionLabel } from '../lib/signals';
import type { Signal } from '../types';

import { DotLabel, Metric, NUM, signedClass } from './SignalParts';

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-4">
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
        {title}
      </Text>
      <View className="mt-1">{children}</View>
    </View>
  );
}

/**
 * One setup in full (web: the row's reason / risk / notification cells): the measured record,
 * today's read, why it was picked, what would make it wrong, the screener's own evidence, and
 * whether it alerted. Opens the stock from its footer.
 */
export function SignalSheet({
  signal,
  visible,
  holdDays,
  onClose,
  onOpenStock,
}: {
  /** Kept after closing, so the sheet does not empty while it slides away. */
  signal: Signal | null;
  visible: boolean;
  holdDays: number;
  onClose: () => void;
  onOpenStock: (signal: Signal) => void;
}) {
  const s = signal;
  const alert = s ? alertState(s) : null;
  const evidence = s ? metricSummary(s.metrics, 6) : '';
  const sentAt = s?.notifiedAt ? formatIstDateTime(s.notifiedAt) : null;

  return (
    <SheetModal
      visible={visible && s != null}
      title={s?.symbol ?? ''}
      subtitle={s ? `${s.companyName ?? s.exchange} · ${s.screenerName}` : undefined}
      onClose={onClose}
      footer={
        s ? (
          <Button label={`Open ${s.symbol}`} variant="outline" onPress={() => onOpenStock(s)} />
        ) : null
      }
    >
      {s && alert ? (
        <>
          <View className="flex-row items-center gap-2">
            <Badge label={ACTION_LABEL[s.action]} variant={ACTION_TONE[s.action]} />
            <Text className="text-[17px] font-bold text-ink dark:text-ink-dark" style={NUM}>
              {formatINR(s.ltp)}
            </Text>
            <ChangeText value={s.changePct} className="text-[13px]" style={NUM}>
              {formatSignedPercent(s.changePct)}
            </ChangeText>
          </View>
          <Text className="mt-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">
            Price at the last signal check
          </Text>

          <View className="mt-4 flex-row gap-3 rounded-field bg-surface-sunk p-3 dark:bg-surface-sunk-dark">
            <Metric
              label="Hit rate"
              value={formatPercent(s.hitRatePct, 1)}
              sub={
                s.sampleTrades != null
                  ? `${formatNumber(s.sampleTrades, 0)} matches`
                  : 'Not measured'
              }
            />
            <Metric
              label="Past average"
              value={formatSignedPercent(s.avgReturnPct, 2)}
              valueClassName={signedClass(s.avgReturnPct)}
              sub={`${s.holdDays ?? holdDays}-day hold`}
            />
            <Metric
              label="Today strength"
              value={convictionLabel(s.conviction)}
              sub="Not a probability"
              align="right"
            />
          </View>

          <Block title="Reason">
            <Text selectable className="text-[13px] leading-[19px] text-ink dark:text-ink-dark">
              {s.rationale || 'No reason was supplied.'}
            </Text>
          </Block>
          <Block title="Risk">
            <Text selectable className="text-[13px] leading-[19px] text-ink dark:text-ink-dark">
              {s.invalidation || 'Not supplied — treat this setup as incomplete.'}
            </Text>
          </Block>
          {evidence ? (
            <Block title="Screener evidence">
              <Text
                className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
                style={NUM}
              >
                {evidence}
              </Text>
            </Block>
          ) : null}
          <Block title="Notification">
            <DotLabel
              tone={alert.tone}
              label={sentAt ? `${alert.label} · ${sentAt} IST` : alert.label}
            />
          </Block>

          <Text className="mt-5 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            Historical figures use a {s.holdDays ?? holdDays}-day hold and include measured costs. A
            strong model read alone never triggers an alert. Not investment advice.
          </Text>
        </>
      ) : null}
    </SheetModal>
  );
}
