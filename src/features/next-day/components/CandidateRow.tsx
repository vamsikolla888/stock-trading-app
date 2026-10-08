import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { formatINR, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import {
  levelsLine,
  MORNING_VIEW,
  scoreSub,
  sizeFor,
  sizeLine,
  squeezeLine,
  squeezeSides,
  type SizingPrefs,
} from '../lib/view';
import type { Candidate, Compatibility, MorningCandidate } from '../types';
import { DirectionChip, NUM, Tag, TonePill } from './parts';

/**
 * One candidate as a list row: symbol, direction and score first; the setup; the plan in one
 * line; the size for the reader's capital; the morning check once it has run. Tapping opens the
 * full evidence. A squeeze is two-sided: both triggers, the best side's score.
 */
export const CandidateRow = memo(function CandidateRow({
  c,
  prefs,
  morning,
  compat,
  twoSided = false,
  onPress,
}: {
  c: Candidate;
  prefs: SizingPrefs;
  morning: MorningCandidate | null;
  compat: Compatibility[];
  twoSided?: boolean;
  onPress: (symbol: string) => void;
}) {
  const { colors } = useTheme();
  const lv = c.levels;
  const size = lv && !twoSided ? sizeFor(lv, prefs, c.fno ? c.lot : null) : null;
  const sides = twoSided ? squeezeSides(c, compat) : [];
  const score = twoSided ? Math.max(c.score, c.otherScore) : c.score;
  const morningView = morning ? MORNING_VIEW[morning.status] : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${c.symbol}, ${twoSided ? 'two-sided' : c.direction === 'LONG' ? 'long' : 'short'}, score ${score}. ${c.setup}. Open details`}
      onPress={() => onPress(c.symbol)}
      className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text
            className="flex-shrink text-[15px] font-bold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {c.symbol}
          </Text>
          <DirectionChip direction={c.direction} twoSided={twoSided} />
          {c.fno ? <Tag label="F&O" /> : null}
        </View>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {twoSided ? 'Contraction — the break decides the side' : c.setup || c.name}
        </Text>
        {twoSided && sides.length > 0 ? (
          <Text
            className="mt-1.5 text-xs text-ink dark:text-ink-dark"
            style={NUM}
            numberOfLines={1}
          >
            {squeezeLine(sides)}
          </Text>
        ) : lv ? (
          <Text
            className="mt-1.5 text-xs text-ink dark:text-ink-dark"
            style={NUM}
            numberOfLines={1}
          >
            {levelsLine(lv)}
          </Text>
        ) : null}
        {size && lv ? (
          <Text
            className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
            style={NUM}
            numberOfLines={1}
          >
            {`${sizeLine(size, c.fno)} · R:R 1:${lv.rewardRisk}`}
          </Text>
        ) : null}
        {morningView ? (
          <View className="mt-2 flex-row">
            <TonePill tone={morningView.tone} label={`Open · ${morningView.label}`} />
          </View>
        ) : null}
      </View>

      <View className="items-end">
        <Text className="text-[17px] font-bold text-ink dark:text-ink-dark" style={NUM}>
          {score}
        </Text>
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          {twoSided ? 'best side' : scoreSub(c)}
        </Text>
        {c.close != null ? (
          <Text className="mt-1 text-[11px] text-ink-muted dark:text-ink-dark-muted" style={NUM}>
            {formatINR(c.close)}{' '}
            <ChangeText value={c.changePct} className="text-[11px]" style={NUM}>
              {formatSignedPercent(c.changePct)}
            </ChangeText>
          </Text>
        ) : null}
      </View>
      <ChevronRight size={16} color={colors.textFaint} />
    </Pressable>
  );
});
