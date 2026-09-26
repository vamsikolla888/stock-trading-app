import Check from 'lucide-react-native/icons/check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Search from 'lucide-react-native/icons/search';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Chips } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  COMPARATORS,
  describeCondition,
  matchEntryId,
  operandFields,
  operandFromEntry,
  operandLabel,
  operandNumber,
  setOperandNumber,
  validateCondition,
} from '../lib/rules';
import type { CatalogEntry, Condition, IndicatorCategory, Operand } from '../types';

import { NumberField } from './NumberField';
import { SheetModal } from './SheetModal';

type Side = 'left' | 'right';
type Step = 'form' | Side;
type CategoryFilter = IndicatorCategory | 'all';

const CATEGORY_CHIPS: readonly { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  ...CATEGORY_ORDER.map((key) => ({ key, label: CATEGORY_LABELS[key] })),
];

interface ConditionEditorSheetProps {
  visible: boolean;
  /**
   * The condition being edited. The draft is seeded from it on mount, so the parent remounts
   * the sheet (a fresh `key`) each time it opens it — never a reset inside an effect.
   */
  initial: Condition | null;
  title: string;
  catalog: readonly CatalogEntry[];
  catalogLoading: boolean;
  onSave: (condition: Condition) => void;
  /** Present when editing an existing row. */
  onRemove?: () => void;
  onClose: () => void;
}

/**
 * Edits one `left <comparison> right` rule. Operands come only from the server's catalogue,
 * so anything this sheet can express is something the engine can evaluate. Choosing an
 * operand swaps the sheet's content (never a sheet on top of a sheet).
 */
export function ConditionEditorSheet({
  visible,
  initial,
  title,
  catalog,
  catalogLoading,
  onSave,
  onRemove,
  onClose,
}: ConditionEditorSheetProps) {
  const [draft, setDraft] = useState<Condition | null>(initial);
  const [view, setView] = useState<Step>('form');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const { colors } = useTheme();

  if (!draft) return null;

  const error = validateCondition(draft);
  const setSide = (side: Side, operand: Operand) =>
    setDraft((current) => (current ? { ...current, [side]: operand } : current));

  const openPicker = (side: Side) => {
    setQuery('');
    setCategory('all');
    setView(side);
  };

  const picking = view !== 'form';

  return (
    <SheetModal
      visible={visible}
      title={picking ? `Choose the ${view} side` : title}
      subtitle={picking ? undefined : 'Checked on each daily close'}
      onClose={onClose}
      onBack={picking ? () => setView('form') : undefined}
      tall={picking}
      header={
        picking ? (
          <View className="gap-3">
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search indicators"
              autoCorrect={false}
              autoCapitalize="none"
              leftIcon={<Search size={18} color={colors.textMuted} />}
              accessibilityLabel="Search indicators"
            />
            <Chips items={CATEGORY_CHIPS} value={category} onChange={setCategory} />
          </View>
        ) : undefined
      }
      footer={
        picking ? undefined : (
          <View className="flex-row gap-3">
            {onRemove ? (
              <Button
                label="Remove"
                variant="outline"
                onPress={onRemove}
                accessibilityLabel="Remove this condition"
              />
            ) : null}
            <Button
              label="Done"
              className="flex-1"
              disabled={error !== null}
              onPress={() => onSave(draft)}
            />
          </View>
        )
      }
    >
      {picking ? (
        <OperandPicker
          catalog={catalog}
          loading={catalogLoading}
          query={query}
          category={category}
          current={draft[view]}
          onPick={(entryId) => {
            setSide(view, operandFromEntry(entryId, draft[view], catalog));
            setView('form');
          }}
        />
      ) : (
        <>
          <OperandBlock
            heading="Left side"
            operand={draft.left}
            catalog={catalog}
            onOpenPicker={() => openPicker('left')}
            onChange={(operand) => setSide('left', operand)}
          />

          <Text className="mb-2 mt-5 text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
            Comparison
          </Text>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {COMPARATORS.map((item) => {
              const selected = item.key === draft.op;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setDraft({ ...draft, op: item.key })}
                  className={cn(
                    'rounded-full border px-3.5 py-2',
                    selected
                      ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
                      : 'border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
                  )}
                >
                  <Text
                    className={cn(
                      'text-[13px] font-semibold',
                      selected
                        ? 'text-brand-text dark:text-brand-text-dark'
                        : 'text-ink-muted dark:text-ink-dark-muted',
                    )}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-5">
            <OperandBlock
              heading="Right side"
              operand={draft.right}
              catalog={catalog}
              onOpenPicker={() => openPicker('right')}
              onChange={(operand) => setSide('right', operand)}
            />
          </View>

          <View className="mt-5 rounded-lg bg-surface-sunk p-3 dark:bg-surface-sunk-dark">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
              Reads as
            </Text>
            <Text className="mt-1 text-sm font-medium leading-5 text-ink dark:text-ink-dark">
              {describeCondition(draft)}
            </Text>
          </View>
          {error ? (
            <Text
              accessibilityLiveRegion="polite"
              className="mt-3 text-[13px] leading-[19px] text-danger-600 dark:text-danger-dark"
            >
              {error}
            </Text>
          ) : null}
        </>
      )}
    </SheetModal>
  );
}

function OperandBlock({
  heading,
  operand,
  catalog,
  onOpenPicker,
  onChange,
}: {
  heading: string;
  operand: Operand;
  catalog: readonly CatalogEntry[];
  onOpenPicker: () => void;
  onChange: (operand: Operand) => void;
}) {
  const { colors } = useTheme();
  const entry = catalog.find((e) => e.id === matchEntryId(operand, catalog));
  const fields = operandFields(operand, catalog);
  const label = operandLabel(operand, catalog);
  const description = operand.kind === 'constant' ? 'A fixed level' : entry?.description;

  return (
    <View>
      <Text className="mb-2 text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
        {heading}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${heading}: ${label}. Change`}
        onPress={onOpenPicker}
        className="min-h-[56px] flex-row items-center gap-3 rounded-field border border-line-strong bg-canvas px-3.5 py-2.5 active:bg-surface-sunk dark:border-line-dark-strong dark:bg-canvas-dark dark:active:bg-surface-sunk-dark"
      >
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">{label}</Text>
          {description ? (
            <Text
              className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
              numberOfLines={1}
            >
              {description}
            </Text>
          ) : null}
        </View>
        <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
          Change
        </Text>
        <ChevronRight size={16} color={colors.link} />
      </Pressable>

      {operand.kind === 'constant' ? (
        <NumberField
          label="Value"
          value={operand.value}
          allowNegative
          onChange={(value) => onChange({ kind: 'constant', value: value ?? Number.NaN })}
          containerClassName="mt-3"
          accessibilityLabel={`${heading} value`}
        />
      ) : (
        <View className="mt-3 flex-row flex-wrap" style={{ marginHorizontal: -5 }}>
          {fields.map((field) => (
            <View key={field.key} style={{ width: '50%', paddingHorizontal: 5, marginBottom: 10 }}>
              <NumberField
                label={field.label}
                value={operandNumber(operand, field.key)}
                placeholder={field.placeholder ?? 'default'}
                integer={field.integer}
                onChange={(value) => onChange(setOperandNumber(operand, field.key, value))}
                accessibilityLabel={`${heading} ${field.label}`}
              />
            </View>
          ))}
        </View>
      )}
      {entry?.caveat ? (
        <Text className="mt-1 text-xs leading-[17px] text-warning-600 dark:text-warning-dark">
          {entry.caveat}
        </Text>
      ) : null}
    </View>
  );
}

function OperandPicker({
  catalog,
  loading,
  query,
  category,
  current,
  onPick,
}: {
  catalog: readonly CatalogEntry[];
  loading: boolean;
  query: string;
  category: CategoryFilter;
  current: Operand;
  onPick: (entryId: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const currentId = matchEntryId(current, catalog);

  const groups = useMemo(() => {
    const matches = catalog.filter(
      (e) =>
        (category === 'all' || e.category === category) &&
        (!q || e.label.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)),
    );
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      entries: matches.filter((e) => e.category === cat),
    })).filter((group) => group.entries.length > 0);
  }, [catalog, category, q]);

  const showNumber = (category === 'all' || category === 'price') && (!q || 'a number'.includes(q));

  if (loading && catalog.length === 0) {
    return (
      <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
        Loading indicators…
      </Text>
    );
  }

  return (
    <View>
      {showNumber ? (
        <PickerRow
          label="A number"
          description="Compare against a fixed level, e.g. RSI below 30"
          selected={currentId === 'constant' && current.kind === 'constant'}
          onPress={() => onPick('constant')}
        />
      ) : null}
      {groups.map((group) => (
        <View key={group.category}>
          <Text className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
            {CATEGORY_LABELS[group.category]}
          </Text>
          {group.entries.map((entry) => (
            <PickerRow
              key={entry.id}
              label={entry.label}
              description={entry.description}
              selected={current.kind !== 'constant' && entry.id === currentId}
              onPress={() => onPick(entry.id)}
            />
          ))}
        </View>
      ))}
      {!showNumber && groups.length === 0 ? (
        <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Nothing matches “{query.trim()}”.
        </Text>
      ) : null}
    </View>
  );
}

function PickerRow({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${description}`}
      onPress={onPress}
      className="min-h-[52px] flex-row items-center gap-3 py-2 active:opacity-70"
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
          {label}
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={2}>
          {description}
        </Text>
      </View>
      {selected ? <Check size={20} color={colors.link} /> : null}
    </Pressable>
  );
}
