import Plus from 'lucide-react-native/icons/plus';
import Sparkles from 'lucide-react-native/icons/sparkles';
import X from 'lucide-react-native/icons/x';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { useTheme } from '@/theme/ThemeProvider';

import { useStrategyCatalog } from '../hooks';
import { blankCondition, describeCondition, MAX_CONDITIONS } from '../lib/rules';
import type { CatalogEntry, Condition } from '../types';

import { ConditionEditorSheet } from './ConditionEditorSheet';
import { SuggestionPickerSheet } from './SuggestionPickerSheet';

/** Common indicators offered as one-tap starting points (same subset and order as the web). */
const FEATURED = [
  'SMA',
  'RSI',
  'EMA',
  'MACD',
  'ADX',
  'SUPERTREND',
  'BB_UPPER',
  'BB_LOWER',
  'VWAP',
  'VOL_OSC',
  'MFI',
  'MOMENTUM',
  'ATR',
  'RSI_MA',
  'PLUS_DI',
  'MINUS_DI',
];

interface ConditionListEditorProps {
  conditions: Condition[];
  onChange: (next: Condition[]) => void;
  /** "When"/"And" for a list that must all hold; "Or when"/"Or" for any-of. */
  joinWords: [first: string, rest: string];
  target: 'entry' | 'exit';
  /** Shown (as an error) when the list is empty and must not be. */
  emptyMessage?: string;
  /** Muted hint when an optional list is empty. */
  emptyHint?: string;
  /** Per-row validation messages, aligned with `conditions`. */
  issues?: readonly (string | null)[];
}

type Editing = { index: number | null; condition: Condition };

/**
 * An editable condition list, shared by the strategy builder (entry and exit) and the custom
 * screener editor — one editor, so the two can never offer different operands.
 */
export function ConditionListEditor({
  conditions,
  onChange,
  joinWords,
  target,
  emptyMessage,
  emptyHint,
  issues,
}: ConditionListEditorProps) {
  const { colors } = useTheme();
  const catalogQuery = useStrategyCatalog();
  const catalog = catalogQuery.data;
  const indicators = useMemo(() => catalog?.indicators ?? [], [catalog]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  // Bumped on every open so each sheet mounts fresh with the state for that open.
  const [editorKey, setEditorKey] = useState(0);
  const [pickerKey, setPickerKey] = useState(0);
  const atCap = conditions.length >= MAX_CONDITIONS;

  const featured = useMemo(() => {
    const byId = new Map(indicators.map((e) => [e.id, e]));
    return FEATURED.map((id) => byId.get(id)).filter((e): e is CatalogEntry => Boolean(e));
  }, [indicators]);

  const openEditor = (next: Editing) => {
    setEditing(next);
    setEditorKey((key) => key + 1);
    setSheetOpen(true);
  };

  const openPicker = () => {
    setPickerKey((key) => key + 1);
    setPicking(true);
  };

  const save = (condition: Condition) => {
    if (!editing) return;
    if (editing.index === null) onChange([...conditions, condition].slice(0, MAX_CONDITIONS));
    else onChange(conditions.map((c, i) => (i === editing.index ? condition : c)));
    setSheetOpen(false);
  };

  const remove = (index: number) => onChange(conditions.filter((_, i) => i !== index));

  return (
    <View>
      {conditions.length > 0 ? (
        <ListCard>
          {conditions.map((condition, index) => {
            const issue = issues?.[index] ?? null;
            const text = describeCondition(condition);
            return (
              <View key={`${index}-${text}`}>
                {index > 0 ? <RowDivider /> : null}
                <View className="flex-row items-start">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Condition ${index + 1}: ${text}. Edit`}
                    onPress={() => openEditor({ index, condition })}
                    className="flex-1 flex-row items-start gap-3 py-3 pl-3.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
                  >
                    <View className="mt-0.5 min-w-[46px] items-center rounded-md bg-brand-wash px-1.5 py-0.5 dark:bg-brand-wash-dark">
                      <Text className="text-[11px] font-bold text-brand-text dark:text-brand-text-dark">
                        {index === 0 ? joinWords[0] : joinWords[1]}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-medium leading-5 text-ink dark:text-ink-dark">
                        {text}
                      </Text>
                      {issue ? (
                        <Text className="mt-1 text-xs leading-[17px] text-danger-600 dark:text-danger-dark">
                          {issue}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove condition ${index + 1}`}
                    hitSlop={6}
                    onPress={() => remove(index)}
                    className="h-11 w-11 items-center justify-center active:opacity-60"
                  >
                    <X size={16} color={colors.textFaint} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ListCard>
      ) : emptyMessage ? (
        <Text className="text-[13px] leading-[19px] text-danger-600 dark:text-danger-dark">
          {emptyMessage}
        </Text>
      ) : emptyHint ? (
        <Text className="text-[13px] leading-[19px] text-ink-faint dark:text-ink-dark-faint">
          {emptyHint}
        </Text>
      ) : null}

      <View className="mt-3 flex-row gap-2.5">
        <Button
          label="Add condition"
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={atCap}
          leftIcon={<Plus size={16} color={colors.text} />}
          onPress={() => openEditor({ index: null, condition: blankCondition() })}
        />
        <Button
          label="Prebuilt setups"
          variant="secondary"
          size="sm"
          className="flex-1"
          disabled={atCap || !catalog}
          leftIcon={<Sparkles size={15} color={colors.link} />}
          onPress={openPicker}
        />
      </View>

      {catalogQuery.error && !catalog ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void catalogQuery.refetch()}
          className="mt-2 active:opacity-60"
        >
          <Text className="text-xs leading-[17px] text-danger-600 dark:text-danger-dark">
            Couldn&apos;t load the indicator list.{' '}
            <Text className="font-semibold text-brand-text dark:text-brand-text-dark">
              Try again
            </Text>
          </Text>
        </Pressable>
      ) : null}

      {featured.length > 0 && !atCap ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-5 mt-3"
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          accessibilityLabel="Quick add an indicator"
        >
          {featured.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              accessibilityLabel={`Start a condition with ${entry.label}`}
              onPress={() =>
                openEditor({
                  index: null,
                  // A bare comparison you then set — the threshold is the rule's most
                  // important part, so it is never chosen for you.
                  condition: {
                    left: entry.operand,
                    op: '>',
                    right: { kind: 'constant', value: 0 },
                  },
                })
              }
              className="w-[132px] rounded-card border border-line bg-surface px-3 py-2.5 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
            >
              <Text
                className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                numberOfLines={1}
              >
                {entry.label}
              </Text>
              <Text
                className="mt-0.5 text-[11px] leading-[15px] text-ink-muted dark:text-ink-dark-muted"
                numberOfLines={2}
              >
                {entry.description}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {atCap ? (
        <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
          Eight conditions is the cap. Past that a rule is fitted to the past rather than describing
          a setup.
        </Text>
      ) : null}

      <ConditionEditorSheet
        key={editorKey}
        visible={sheetOpen}
        initial={editing?.condition ?? null}
        title={
          editing?.index === null || editing === null
            ? `New ${target} condition`
            : `${target === 'entry' ? 'Entry' : 'Exit'} condition ${editing.index + 1}`
        }
        catalog={indicators}
        catalogLoading={catalogQuery.isPending}
        onSave={save}
        onRemove={
          editing && editing.index !== null
            ? () => {
                remove(editing.index!);
                setSheetOpen(false);
              }
            : undefined
        }
        onClose={() => setSheetOpen(false)}
      />

      {catalog ? (
        <SuggestionPickerSheet
          key={pickerKey}
          visible={picking}
          target={target}
          indicators={catalog.indicators}
          suggestions={catalog.suggestions}
          room={MAX_CONDITIONS - conditions.length}
          onInsert={(picked) => onChange([...conditions, ...picked].slice(0, MAX_CONDITIONS))}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </View>
  );
}
