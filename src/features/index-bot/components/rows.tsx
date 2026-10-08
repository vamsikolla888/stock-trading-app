import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { StatusPill } from '@/features/settings/components/StatusPill';
import { formatDateTime } from '@/features/settings/lib/time';
import { useTheme } from '@/theme/ThemeProvider';

import {
  EXIT_LABEL,
  edgeLine,
  fillsLine,
  holdTime,
  outcomeView,
  phaseView,
  proposalLabel,
  signedMoney,
  testScanView,
  tradeLine,
} from '../lib/view';
import type { RunView, TradeRow } from '../types';
import { NUM, pnlClass } from './parts';

const ROW =
  'flex-row items-center gap-3 px-4 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark';

/**
 * One bot entry: the contract and its net on top, what it was and how it ended under it, the
 * fills and the time last. A closed trade says how it exited; anything else wears its phase.
 */
export function TradeItem({ row, onPress }: { row: TradeRow; onPress: () => void }) {
  const { colors } = useTheme();
  const phase = phaseView(row.phase);
  const ended = row.phase === 'closed';
  const when = formatDateTime(row.enteredAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.tradingSymbol}, ${phase.label}${row.net != null ? `, net ${signedMoney(row.net)}` : ''}. Opens the trade.`}
      onPress={onPress}
      className={ROW}
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-baseline gap-3">
          <Text
            className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {row.tradingSymbol}
          </Text>
          <Text className={`text-sm font-semibold ${pnlClass(row.net)}`} style={NUM}>
            {signedMoney(row.net)}
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Text
            className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={1}
          >
            {tradeLine(row)}
          </Text>
          {ended ? (
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              {row.exitReason ? EXIT_LABEL[row.exitReason] : 'Closed'}
            </Text>
          ) : (
            <StatusPill tone={phase.tone} label={phase.label} />
          )}
        </View>
        <Text
          className="text-[11px] text-ink-faint dark:text-ink-dark-faint"
          style={NUM}
          numberOfLines={1}
        >
          {fillsLine(row)}
          {row.holdMinutes != null ? ` · held ${holdTime(row.holdMinutes)}` : ''} · {when}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textFaint} />
    </Pressable>
  );
}

/**
 * One scan in the decision log: when, what it decided, why — and, when it got that far, the
 * trader's confidence and the historical edge against break-even.
 */
export function RunItem({ run, onPress }: { run: RunView; onPress: () => void }) {
  const { colors } = useTheme();
  const view = run.dryRun ? testScanView(run) : outcomeView(run.outcome);
  const proposal = proposalLabel(run);
  const facts = [
    proposal !== '—' ? proposal : null,
    run.confidence != null ? `confidence ${run.confidence}/100` : null,
    run.edge ? `edge ${edgeLine(run)}` : null,
  ].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Scan at ${formatDateTime(run.at)}, ${run.dryRun ? 'test scan' : view.label}. ${run.reason}. Opens the debate.`}
      onPress={onPress}
      className={ROW}
    >
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <StatusPill
            tone={view.tone}
            label={run.dryRun ? (run.status === 'RUNNING' ? 'Running' : 'Test scan') : view.label}
          />
          <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted" style={NUM}>
            {formatDateTime(run.at)}
          </Text>
          {run.mode ? (
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
              {run.mode === 'live' ? 'Live' : 'Paper'}
            </Text>
          ) : null}
        </View>
        <Text className="text-[13px] leading-[18px] text-ink dark:text-ink-dark" numberOfLines={2}>
          {run.reason || 'No reason recorded.'}
        </Text>
        {facts.length > 0 || run.group ? (
          <Text
            className="text-[11px] text-ink-faint dark:text-ink-dark-faint"
            style={NUM}
            numberOfLines={1}
          >
            {[...facts, run.group && run.outcome === 'hold' ? run.group.label : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={16} color={colors.textFaint} />
    </Pressable>
  );
}
