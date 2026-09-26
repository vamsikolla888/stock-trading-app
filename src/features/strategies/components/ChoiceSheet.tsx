import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Search from 'lucide-react-native/icons/search';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import { SheetModal } from './SheetModal';

export interface Choice<K extends string> {
  key: K;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Group heading; choices are grouped in first-seen order. */
  section?: string;
}

interface ChoiceSheetProps<K extends string> {
  visible: boolean;
  title: string;
  subtitle?: string;
  choices: readonly Choice<K>[];
  value: K | null;
  onSelect: (key: K) => void;
  onClose: () => void;
  /** Shown under the list, e.g. why some options are disabled. */
  footnote?: string;
}

/**
 * Single-choice bottom sheet for long lists (indices, packs) — OptionSheet's scrolling,
 * searchable sibling. Disabled options stay visible with their reason, so an option that
 * cannot be picked is explained rather than silently missing.
 */
export function ChoiceSheet<K extends string>({
  visible,
  title,
  subtitle,
  choices,
  value,
  onSelect,
  onClose,
  footnote,
}: ChoiceSheetProps<K>) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const searchable = choices.length > 12;
  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const visibleChoices = q
      ? choices.filter(
          (c) =>
            c.label.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q),
        )
      : choices;
    const map = new Map<string, Choice<K>[]>();
    for (const choice of visibleChoices) {
      const section = choice.section ?? '';
      const list = map.get(section) ?? [];
      list.push(choice);
      map.set(section, list);
    }
    return [...map.entries()];
  }, [choices, q]);

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <SheetModal
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={close}
      tall={searchable}
      header={
        searchable ? (
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            autoCorrect={false}
            autoCapitalize="none"
            leftIcon={<Search size={18} color={colors.textMuted} />}
            accessibilityLabel={`Search ${title.toLowerCase()}`}
          />
        ) : undefined
      }
    >
      {groups.length === 0 ? (
        <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Nothing matches “{query.trim()}”.
        </Text>
      ) : (
        groups.map(([section, list]) => (
          <View key={section || 'all'} className="mb-2">
            {section ? (
              <Text className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
                {section}
              </Text>
            ) : null}
            {list.map((choice) => {
              const selected = choice.key === value;
              return (
                <Pressable
                  key={choice.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: choice.disabled }}
                  accessibilityLabel={
                    choice.description ? `${choice.label}, ${choice.description}` : choice.label
                  }
                  disabled={choice.disabled}
                  onPress={() => {
                    onSelect(choice.key);
                    close();
                  }}
                  className={cn(
                    'min-h-[52px] flex-row items-center gap-3 py-2 active:opacity-70',
                    choice.disabled && 'opacity-50',
                  )}
                >
                  <View className="flex-1">
                    <Text
                      className={cn(
                        'text-[15px]',
                        selected
                          ? 'font-semibold text-brand-text dark:text-brand-text-dark'
                          : 'text-ink dark:text-ink-dark',
                      )}
                    >
                      {choice.label}
                    </Text>
                    {choice.description ? (
                      <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                        {choice.description}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? <Check size={20} color={colors.link} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))
      )}
      {footnote ? (
        <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
          {footnote}
        </Text>
      ) : null}
    </SheetModal>
  );
}

/** Looks like a form field; opens a picker. */
export function SelectField({
  label,
  value,
  placeholder = 'Choose',
  onPress,
  helperText,
  disabled,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  onPress: () => void;
  helperText?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View className="w-full gap-1.5">
      <Text className="text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        className={cn(
          'h-12 flex-row items-center gap-2 rounded-field border border-line-strong bg-canvas px-3.5 active:bg-surface-sunk dark:border-line-dark-strong dark:bg-canvas-dark dark:active:bg-surface-sunk-dark',
          disabled && 'opacity-50',
        )}
      >
        <Text
          className={cn(
            'flex-1 text-base',
            value ? 'text-ink dark:text-ink-dark' : 'text-ink-faint dark:text-ink-dark-faint',
          )}
          numberOfLines={1}
        >
          {value ?? placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textMuted} />
      </Pressable>
      {helperText ? (
        <Text className="text-[13px] text-ink-faint dark:text-ink-dark-faint">{helperText}</Text>
      ) : null}
    </View>
  );
}
