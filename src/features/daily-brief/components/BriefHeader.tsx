import Calendar from 'lucide-react-native/icons/calendar';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Headphones from 'lucide-react-native/icons/headphones';
import Shield from 'lucide-react-native/icons/shield';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import Sparkles from 'lucide-react-native/icons/sparkles';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import type { IconComponent } from '@/components/ui/icon';
import { formatIstTime, formatSessionDay } from '@/features/home/lib/istTime';
import { useTheme } from '@/theme/ThemeProvider';

import { MARKET_STATUS_LABEL, RISK_LABEL } from '../lib/brief';
import type { DailyBrief, DailyBriefRiskProfile } from '../types';

import { Tag } from './BriefBits';

interface BriefHeaderProps {
  brief: DailyBrief | undefined;
  date: string;
  isToday: boolean;
  riskProfile: DailyBriefRiskProfile;
  showListen: boolean;
  listenBusy: boolean;
  refreshing: boolean;
  onPickDate: () => void;
  onPickRisk: () => void;
  onListen: () => void;
  onRefresh: () => void;
  onSettings: () => void;
}

/**
 * Title, freshness and the controls: which day, which risk profile, read aloud, re-run the
 * AI analysis (today only — past briefs are immutable on the server) and personalise.
 */
export function BriefHeader({
  brief,
  date,
  isToday,
  riskProfile,
  showListen,
  listenBusy,
  refreshing,
  onPickDate,
  onPickRisk,
  onListen,
  onRefresh,
  onSettings,
}: BriefHeaderProps) {
  const { colors } = useTheme();
  const updated = formatIstTime(brief?.generatedAt);

  return (
    <View>
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text
              accessibilityRole="header"
              className="text-[22px] font-bold text-ink dark:text-ink-dark"
              style={{ letterSpacing: -0.6 }}
            >
              {brief?.title ?? 'Daily Brief'}
            </Text>
            {brief ? (
              <Tag
                label={MARKET_STATUS_LABEL[brief.marketStatus]}
                tone={brief.marketStatus === 'OPEN' ? 'up' : 'neutral'}
              />
            ) : null}
          </View>
          <Text className="mt-1 text-[13px] text-ink-muted dark:text-ink-dark-muted">
            {[updated ? `Updated ${updated} IST` : null, brief?.stale ? 'some data delayed' : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Daily Brief settings"
          hitSlop={6}
          onPress={onSettings}
          className="h-10 w-10 items-center justify-center rounded-full border border-line active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
        >
          <SlidersHorizontal size={18} color={colors.text} />
        </Pressable>
      </View>

      <View className="mt-4 flex-row gap-2">
        <Pill
          Icon={Calendar}
          label={isToday ? `Today · ${formatSessionDay(date)}` : formatSessionDay(date)}
          accessibilityLabel={`Brief date, ${isToday ? 'today' : formatSessionDay(date)}. Change date`}
          onPress={onPickDate}
        />
        <Pill
          Icon={Shield}
          label={RISK_LABEL[riskProfile]}
          accessibilityLabel={`Risk profile, ${RISK_LABEL[riskProfile]}. Change risk profile`}
          onPress={onPickRisk}
        />
      </View>

      <View className="mt-3 flex-row gap-2">
        {showListen ? (
          <Button
            label="Listen"
            variant="secondary"
            size="sm"
            loading={listenBusy}
            onPress={onListen}
            leftIcon={<Headphones size={16} color={colors.link} />}
            className="flex-1"
          />
        ) : null}
        <Button
          label={refreshing ? 'Analyzing…' : 'Refresh analysis'}
          variant="outline"
          size="sm"
          disabled={!isToday || refreshing}
          loading={refreshing}
          onPress={onRefresh}
          leftIcon={<Sparkles size={16} color={colors.text} />}
          accessibilityHint={
            isToday ? undefined : 'Past briefs are stored as they were and can’t be re-run'
          }
          className="flex-1"
        />
      </View>
      {!isToday ? (
        <Text className="mt-2 text-xs text-ink-faint dark:text-ink-dark-faint">
          Viewing a stored brief. Past briefs are kept exactly as they were.
        </Text>
      ) : null}
    </View>
  );
}

function Pill({
  Icon,
  label,
  accessibilityLabel,
  onPress,
}: {
  Icon: IconComponent;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="h-9 flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <Icon size={14} color={colors.textMuted} />
      <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
        {label}
      </Text>
      <ChevronDown size={14} color={colors.textMuted} />
    </Pressable>
  );
}

export function BriefSkeleton() {
  return (
    <View accessibilityLabel="Loading Daily Brief" accessibilityState={{ busy: true }}>
      <View className="mt-5 h-[210px] rounded-hero bg-line dark:bg-line-dark" />
      <View className="mt-7 h-4 w-1/3 rounded bg-line dark:bg-line-dark" />
      <View className="mt-3 flex-row gap-2.5">
        {[0, 1, 2].map((key) => (
          <View key={key} className="h-[92px] w-[150px] rounded-card bg-line dark:bg-line-dark" />
        ))}
      </View>
      <View className="mt-7 h-4 w-2/5 rounded bg-line dark:bg-line-dark" />
      <View className="mt-3 h-[160px] rounded-card bg-line dark:bg-line-dark" />
    </View>
  );
}
