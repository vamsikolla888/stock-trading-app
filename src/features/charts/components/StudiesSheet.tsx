import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { ModalSheet, SheetOption } from '@/features/home/components/ModalSheet';

import { STUDIES, type StudyId } from '../lib/config';

interface StudiesSheetProps {
  visible: boolean;
  selected: readonly StudyId[];
  intraday: boolean;
  onToggle: (study: StudyId) => void;
  onReset: () => void;
  onClose: () => void;
}

const GROUPS = [
  { key: 'overlay', title: 'On the price chart' },
  { key: 'oscillator', title: 'Below the chart' },
] as const;

/** Indicators, toggled in place — the chart redraws behind the sheet as each one changes. */
export function StudiesSheet({
  visible,
  selected,
  intraday,
  onToggle,
  onReset,
  onClose,
}: StudiesSheetProps) {
  return (
    <ModalSheet
      visible={visible}
      title="Indicators"
      onClose={onClose}
      footer={
        <Pressable
          accessibilityRole="button"
          onPress={onReset}
          hitSlop={6}
          className="self-center rounded-lg px-3 py-2 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Reset to volume only
          </Text>
        </Pressable>
      }
    >
      {GROUPS.map((group) => (
        <View key={group.key}>
          <Text className="px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-ink-dark-faint">
            {group.title}
          </Text>
          {STUDIES.filter((study) => study.group === group.key).map((study) => {
            const unavailable = Boolean(study.intradayOnly) && !intraday;
            return (
              <SheetOption
                key={study.id}
                label={study.label}
                detail={unavailable ? `${study.detail} · intraday intervals only` : study.detail}
                selected={selected.includes(study.id)}
                disabled={unavailable}
                onPress={() => onToggle(study.id)}
              />
            );
          })}
        </View>
      ))}
    </ModalSheet>
  );
}
