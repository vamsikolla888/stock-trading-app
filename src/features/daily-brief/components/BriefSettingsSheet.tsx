import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Tabs';
import { ModalSheet } from '@/features/home/components/ModalSheet';
import { SwitchRow } from '@/features/settings/components/SwitchRow';
import { cn } from '@/lib/utils/cn';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';

import {
  moveSection,
  PREFERRED_LIMIT,
  RISK_OPTIONS,
  SECTION_LABELS,
  toggleSection,
  togglePreferred,
} from '../lib/brief';
import type { DailyBriefPreferences, DailyBriefSection } from '../types';

interface BriefSettingsSheetProps {
  visible: boolean;
  preferences: DailyBriefPreferences;
  /** Index and sector names present in the current brief. */
  availableIndices: string[];
  availableSectors: string[];
  saving: boolean;
  onClose: () => void;
  onSave: (next: DailyBriefPreferences) => void;
}

/** Union of what today's feed offers and what the user already picked, so a pick can be undone. */
function optionsFor(available: string[], picked: string[]): string[] {
  return [...new Set([...available, ...picked])];
}

/**
 * Personalises the brief: default risk profile, the Listen controls, which indices and
 * sectors lead, and which sections show in what order. Edits a draft; nothing is sent
 * until Save.
 */
export function BriefSettingsSheet({
  visible,
  preferences,
  availableIndices,
  availableSectors,
  saving,
  onClose,
  onSave,
}: BriefSettingsSheetProps) {
  const [draft, setDraft] = useState(preferences);

  // Each opening starts from what's saved — only on opening, so a background refetch or a
  // re-render of the screen underneath never wipes edits in progress.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) setDraft(preferences);
    wasVisible.current = visible;
  }, [preferences, visible]);

  const indexOptions = useMemo(
    () => optionsFor(availableIndices, draft.preferredIndices),
    [availableIndices, draft.preferredIndices],
  );
  const sectorOptions = useMemo(
    () => optionsFor(availableSectors, draft.preferredSectors),
    [availableSectors, draft.preferredSectors],
  );

  const pick = (key: 'preferredIndices' | 'preferredSectors', value: string, limit: number) => {
    const { next, atLimit } = togglePreferred(draft[key], value, limit);
    if (atLimit) {
      toast.info(`Up to ${limit} can be preferred`, 'Remove one to add another.');
      return;
    }
    setDraft({ ...draft, [key]: next });
  };

  return (
    <ModalSheet
      visible={visible}
      title="Daily Brief settings"
      onClose={onClose}
      footer={
        <View className="flex-row gap-3">
          <Button label="Cancel" variant="outline" onPress={onClose} className="flex-1" />
          <Button label="Save" loading={saving} onPress={() => onSave(draft)} className="flex-1" />
        </View>
      }
    >
      <Heading>Risk profile</Heading>
      <SegmentedControl
        items={RISK_OPTIONS}
        value={draft.riskProfile}
        onChange={(riskProfile) => setDraft({ ...draft, riskProfile })}
      />
      <Hint>Shapes how the AI outlook weighs risk. The market data itself doesn't change.</Hint>

      <View className="-mx-3.5 mt-3">
        <SwitchRow
          title="Listen controls"
          subtitle="Show the buttons that read the brief aloud"
          value={draft.audioEnabled}
          onValueChange={(audioEnabled) => setDraft({ ...draft, audioEnabled })}
        />
      </View>

      <Heading right={`${draft.preferredIndices.length} of ${PREFERRED_LIMIT.indices}`}>
        Preferred indices
      </Heading>
      <ChoiceChips
        options={indexOptions}
        selected={draft.preferredIndices}
        onToggle={(value) => pick('preferredIndices', value, PREFERRED_LIMIT.indices)}
        empty="No index data in this brief to choose from."
      />

      <Heading right={`${draft.preferredSectors.length} of ${PREFERRED_LIMIT.sectors}`}>
        Preferred sectors
      </Heading>
      <ChoiceChips
        options={sectorOptions}
        selected={draft.preferredSectors}
        onToggle={(value) => pick('preferredSectors', value, PREFERRED_LIMIT.sectors)}
        empty="No sector data in this brief to choose from."
      />
      <Hint>With none picked, every index and sector is shown.</Hint>

      <Heading>Sections and order</Heading>
      <View className="overflow-hidden rounded-card border border-line dark:border-line-dark">
        {draft.sectionOrder.map((section, position) => (
          <SectionRow
            key={section}
            section={section}
            first={position === 0}
            last={position === draft.sectionOrder.length - 1}
            visible={draft.visibleSections.includes(section)}
            onlyVisible={
              draft.visibleSections.length === 1 && draft.visibleSections.includes(section)
            }
            onToggle={() => setDraft(toggleSection(draft, section))}
            onMove={(delta) => setDraft(moveSection(draft, section, delta))}
          />
        ))}
      </View>
      <Hint>At least one section stays visible.</Hint>
    </ModalSheet>
  );
}

function Heading({ children, right }: { children: string; right?: string }) {
  return (
    <View className="mb-2.5 mt-5 flex-row items-baseline justify-between">
      <Text accessibilityRole="header" className="text-sm font-bold text-ink dark:text-ink-dark">
        {children}
      </Text>
      {right ? (
        <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">{right}</Text>
      ) : null}
    </View>
  );
}

function Hint({ children }: { children: string }) {
  return (
    <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
      {children}
    </Text>
  );
}

function ChoiceChips({
  options,
  selected,
  onToggle,
  empty,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  empty: string;
}) {
  const { colors } = useTheme();
  if (options.length === 0) return <Hint>{empty}</Hint>;
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <Pressable
            key={option}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => onToggle(option)}
            className={cn(
              'flex-row items-center gap-1 rounded-full border px-3 py-1.5 active:opacity-70',
              on
                ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
                : 'border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
            )}
          >
            {on ? <Check size={13} color={colors.link} /> : null}
            <Text
              className={cn(
                'text-[13px] font-semibold',
                on
                  ? 'text-brand-text dark:text-brand-text-dark'
                  : 'text-ink-muted dark:text-ink-dark-muted',
              )}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionRow({
  section,
  first,
  last,
  visible,
  onlyVisible,
  onToggle,
  onMove,
}: {
  section: DailyBriefSection;
  first: boolean;
  last: boolean;
  visible: boolean;
  onlyVisible: boolean;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const { colors } = useTheme();
  const label = SECTION_LABELS[section];
  return (
    <View
      className={cn(
        'flex-row items-center gap-2 bg-surface pl-3 pr-1.5 dark:bg-surface-dark',
        !first && 'border-t border-line dark:border-line-dark',
      )}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked: visible, disabled: onlyVisible }}
        disabled={onlyVisible}
        onPress={onToggle}
        className="min-h-[48px] flex-1 flex-row items-center gap-3 active:opacity-70"
      >
        <View
          className="h-5 w-5 items-center justify-center rounded-md border-2"
          style={{
            borderColor: visible ? colors.link : colors.borderStrong,
            backgroundColor: visible ? colors.link : 'transparent',
          }}
        >
          {visible ? <Check size={13} color={colors.textInverted} strokeWidth={3} /> : null}
        </View>
        <Text
          className={cn(
            'flex-1 text-sm',
            visible ? 'text-ink dark:text-ink-dark' : 'text-ink-faint dark:text-ink-dark-faint',
          )}
        >
          {label}
        </Text>
      </Pressable>
      <MoveButton
        label={`Move ${label} up`}
        disabled={first}
        onPress={() => onMove(-1)}
        Icon={ChevronUp}
      />
      <MoveButton
        label={`Move ${label} down`}
        disabled={last}
        onPress={() => onMove(1)}
        Icon={ChevronDown}
      />
    </View>
  );
}

function MoveButton({
  label,
  disabled,
  onPress,
  Icon,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  Icon: typeof ChevronUp;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      style={{ opacity: disabled ? 0.3 : 1 }}
    >
      <Icon size={18} color={colors.textMuted} />
    </Pressable>
  );
}
