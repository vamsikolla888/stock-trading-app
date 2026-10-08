import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useScreenLayout } from '@/components/layout/responsive';
import { ChangeText } from '@/components/market/ChangeText';
import { StockLogo } from '@/components/market/StockLogo';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { stockLogoUrl } from '@/features/market/api';
import { cn } from '@/lib/utils/cn';
import {
  formatINR,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { ACTION_LABEL, ACTION_TONE, convictionLabel, featuredWords } from '../lib/signals';
import type { Signal } from '../types';

import { DotLabel, NUM, signedClass } from './SignalParts';

function Figure({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} className="flex-1 py-2.5">
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className={cn('mt-0.5 text-[17px] font-bold', className ?? 'text-ink dark:text-ink-dark')}
        style={[NUM, { letterSpacing: -0.3 }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <View>
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
        {label}
      </Text>
      <Text selectable className="mt-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
        {text}
      </Text>
    </View>
  );
}

/**
 * The setup the screen leads with (web: FeaturedSignal) — the best one that clears every alert
 * rule, else the closest, labelled as not alert-ready. Measured history first; today's 1–5 read
 * is evidence strength, not a probability.
 */
export function FeaturedSignal({ signal, onOpen }: { signal: Signal; onOpen: () => void }) {
  const { colors } = useTheme();
  const { compact } = useScreenLayout();
  const words = featuredWords(signal);
  const figures = [
    { label: 'Historical hit rate', value: formatPercent(signal.hitRatePct, 1) },
    {
      label: 'Historical average',
      value: formatSignedPercent(signal.avgReturnPct, 2),
      className: signedClass(signal.avgReturnPct),
    },
    { label: 'Evidence today', value: convictionLabel(signal.conviction) },
    {
      label: 'Past matches',
      value: signal.sampleTrades == null ? '—' : formatNumber(signal.sampleTrades, 0),
    },
  ];
  const rows = compact ? [figures.slice(0, 2), figures.slice(2)] : [figures];

  return (
    <Card>
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted">
        {words.eyebrow}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${signal.companyName ?? signal.symbol}. Open the stock`}
        onPress={onOpen}
        className="mt-3 flex-row items-center gap-3 active:opacity-70"
      >
        <StockLogo symbol={signal.symbol} uri={stockLogoUrl(signal.symbol)} size="lg" />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              className="flex-shrink text-[17px] font-bold text-ink dark:text-ink-dark"
              style={{ letterSpacing: -0.3 }}
              numberOfLines={1}
            >
              {signal.symbol}
            </Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </View>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {signal.companyName ?? signal.screenerName}
          </Text>
        </View>
        <Badge label={ACTION_LABEL[signal.action]} variant={ACTION_TONE[signal.action]} />
      </Pressable>

      <View className="mt-3 flex-row flex-wrap items-baseline gap-x-2">
        <Text className="text-[22px] font-bold text-ink dark:text-ink-dark" style={NUM}>
          {formatINR(signal.ltp)}
        </Text>
        <ChangeText value={signal.changePct} className="text-[13px]" style={NUM}>
          {formatSignedPercent(signal.changePct)}
        </ChangeText>
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
          at last signal check
        </Text>
      </View>

      <View className="mt-3 rounded-field bg-surface-sunk px-3 dark:bg-surface-sunk-dark">
        {rows.map((row, index) => (
          <View
            key={row[0]?.label ?? index}
            className={cn(
              'flex-row gap-3',
              index > 0 && 'border-t border-line dark:border-line-dark',
            )}
          >
            {row.map((figure) => (
              <Figure key={figure.label} {...figure} />
            ))}
          </View>
        ))}
      </View>

      <View className="mt-4 gap-3">
        <Note label="Why it stands out" text={signal.rationale || 'No reason was supplied.'} />
        <Note
          label="What invalidates it"
          text={signal.invalidation || 'Not supplied — treat this setup as incomplete.'}
        />
      </View>

      <View className="mt-4 border-t border-line pt-3 dark:border-line-dark">
        <DotLabel tone={signal.meetsNotifyBar ? 'success' : 'warning'} label={words.state} wrap />
      </View>
    </Card>
  );
}
