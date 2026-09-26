import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import Search from 'lucide-react-native/icons/search';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Chips, SegmentedControl } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import { CATEGORY_LABELS, CATEGORY_ORDER } from '../lib/rules';
import type { CatalogEntry, Condition, IndicatorCategory, PrebuiltSuggestion } from '../types';

import { SheetModal } from './SheetModal';

type Bias = 'all' | 'bullish' | 'bearish';
type CategoryFilter = IndicatorCategory | 'all';

const BIASES: readonly { key: Bias; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'bullish', label: 'Bullish' },
  { key: 'bearish', label: 'Bearish' },
];

const CATEGORY_CHIPS: readonly { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  ...CATEGORY_ORDER.map((key) => ({ key, label: CATEGORY_LABELS[key] })),
];

interface SuggestionPickerSheetProps {
  visible: boolean;
  target: 'entry' | 'exit';
  indicators: readonly CatalogEntry[];
  suggestions: readonly PrebuiltSuggestion[];
  /** How many more conditions fit under the cap. */
  room: number;
  onInsert: (conditions: Condition[]) => void;
  onClose: () => void;
}

/**
 * Ready-made conditions with real thresholds, grouped by indicator. Multi-select with an
 * explicit "Add", because picking two or three at once is the common case. Each label is
 * written by the server from the condition it inserts, so the text cannot disagree with it.
 *
 * Starts clean on mount; the parent gives it a fresh `key` each time it opens it.
 */
export function SuggestionPickerSheet({
  visible,
  target,
  indicators,
  suggestions,
  room,
  onInsert,
  onClose,
}: SuggestionPickerSheetProps) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [bias, setBias] = useState<Bias>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);

  const q = query.trim().toLowerCase();

  const rows = useMemo(() => {
    return indicators
      .filter((entry) => category === 'all' || entry.category === category)
      .map((entry) => {
        const own = suggestions.filter(
          (s) => s.indicatorId === entry.id && (bias === 'all' || s.bias === bias),
        );
        const entryMatches =
          !q ||
          entry.label.toLowerCase().includes(q) ||
          entry.description.toLowerCase().includes(q);
        const shown = entryMatches ? own : own.filter((s) => s.label.toLowerCase().includes(q));
        return { entry, suggestions: shown, visible: entryMatches || shown.length > 0 };
      })
      .filter((row) => row.visible && row.suggestions.length > 0);
  }, [indicators, suggestions, category, bias, q]);

  const toggle = (id: string) =>
    setChecked((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      if (current.length >= room) return current;
      return [...current, id];
    });

  const insert = () => {
    // Catalogue order, not tap order — the same picks always build the same rule.
    const picked = suggestions.filter((s) => checked.includes(s.id)).map((s) => s.condition);
    if (picked.length > 0) onInsert(picked);
    onClose();
  };

  return (
    <SheetModal
      visible={visible}
      title={`Prebuilt ${target} conditions`}
      subtitle={
        room > 0
          ? `Pick up to ${room} — adjust any of them afterwards`
          : 'The condition cap is reached'
      }
      onClose={onClose}
      tall
      header={
        <View className="gap-3">
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search indicators or conditions"
            autoCorrect={false}
            autoCapitalize="none"
            leftIcon={<Search size={18} color={colors.textMuted} />}
            accessibilityLabel="Search prebuilt conditions"
          />
          <SegmentedControl items={BIASES} value={bias} onChange={setBias} />
          <Chips items={CATEGORY_CHIPS} value={category} onChange={setCategory} />
        </View>
      }
      footer={
        <View className="flex-row items-center gap-3">
          <Text className="flex-1 text-[13px] text-ink-muted dark:text-ink-dark-muted">
            {checked.length === 0 ? 'Nothing selected' : `${checked.length} selected`}
          </Text>
          <Button
            label={checked.length > 0 ? `Add ${checked.length}` : 'Add'}
            disabled={checked.length === 0}
            onPress={insert}
          />
        </View>
      }
    >
      {rows.length === 0 ? (
        <Text className="py-6 text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          No prebuilt conditions match
          {bias !== 'all' ? ` on the ${bias} side` : ''}. You can still add a condition by hand.
        </Text>
      ) : (
        rows.map(({ entry, suggestions: own }) => {
          const open = expanded === entry.id || q.length > 0;
          const count = own.filter((s) => checked.includes(s.id)).length;
          return (
            <View key={entry.id} className="border-b border-line dark:border-line-dark">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${entry.label}, ${own.length} conditions`}
                onPress={() => setExpanded(open && !q ? null : entry.id)}
                className="min-h-[56px] flex-row items-center gap-3 py-2.5 active:opacity-70"
              >
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">
                    {entry.label}
                    {count > 0 ? (
                      <Text className="text-brand-text dark:text-brand-text-dark">
                        {`  · ${count}`}
                      </Text>
                    ) : null}
                  </Text>
                  <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                    {entry.description} · {own.length}
                  </Text>
                </View>
                {open ? (
                  <ChevronUp size={18} color={colors.textMuted} />
                ) : (
                  <ChevronDown size={18} color={colors.textMuted} />
                )}
              </Pressable>
              {open ? (
                <View className="pb-3">
                  {entry.caveat ? (
                    <Text className="mb-2 text-xs leading-[17px] text-warning-600 dark:text-warning-dark">
                      {entry.caveat}
                    </Text>
                  ) : null}
                  {own.map((suggestion) => {
                    const isChecked = checked.includes(suggestion.id);
                    const blocked = !isChecked && checked.length >= room;
                    return (
                      <Pressable
                        key={suggestion.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isChecked, disabled: blocked }}
                        accessibilityLabel={`${suggestion.label}, ${suggestion.bias}, ${suggestion.tag}`}
                        disabled={blocked}
                        onPress={() => toggle(suggestion.id)}
                        className={cn(
                          'flex-row items-start gap-3 rounded-lg px-2 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark',
                          blocked && 'opacity-50',
                        )}
                      >
                        <View
                          className={cn(
                            'mt-0.5 h-5 w-5 items-center justify-center rounded-md border',
                            isChecked
                              ? 'border-brand-strong bg-brand-strong dark:border-brand-strong-dark dark:bg-brand-strong-dark'
                              : 'border-line-strong dark:border-line-dark-strong',
                          )}
                        >
                          {isChecked ? <Check size={14} color={colors.primaryText} /> : null}
                        </View>
                        <View className="flex-1 gap-1.5">
                          <Text className="text-[13px] leading-[19px] text-ink dark:text-ink-dark">
                            {suggestion.label}
                          </Text>
                          <Badge
                            label={suggestion.tag}
                            variant={suggestion.bias === 'bullish' ? 'success' : 'danger'}
                          />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </SheetModal>
  );
}
