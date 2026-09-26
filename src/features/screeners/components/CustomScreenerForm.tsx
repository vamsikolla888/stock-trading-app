import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/Tabs';
import { ConditionListEditor } from '@/features/strategies/components/ConditionListEditor';
import { IndexPickerField } from '@/features/strategies/components/IndexPickerField';
import { NumberField } from '@/features/strategies/components/NumberField';
import { startingScreenerCondition, validateScreenerForm } from '@/features/strategies/lib/rules';
import type { Condition, UniverseExchange } from '@/features/strategies/types';

import type { CustomScreener, CustomScreenerInput } from '../types';

const EXCHANGES: readonly { key: UniverseExchange; label: string }[] = [
  { key: 'NSE', label: 'NSE' },
  { key: 'BSE', label: 'BSE' },
  { key: 'ALL', label: 'Both' },
];

export interface CustomScreenerValues {
  name: string;
  description: string;
  conditions: Condition[];
  exchange: UniverseExchange;
  /** null = no price floor (different from ₹0); NaN = typed text that is not a number yet. */
  minPrice: number | null;
  /** null = the whole exchange. */
  indexKey: string | null;
}

/** What a new screener opens on — a real, valid condition, so the first save always works. */
function blankValues(): CustomScreenerValues {
  return {
    name: '',
    description: '',
    conditions: [startingScreenerCondition()],
    exchange: 'NSE',
    minPrice: 20,
    indexKey: null,
  };
}

export function valuesFromScreener(screener: CustomScreener): CustomScreenerValues {
  return {
    name: screener.name,
    description: screener.description ?? '',
    conditions: screener.conditions,
    exchange: screener.exchange,
    minPrice: screener.minPrice,
    indexKey: screener.indexKey,
  };
}

/**
 * Form state for creating or editing a custom screener; the screen owns the save button.
 * Mirrors useStrategyForm so both editors behave the same way.
 */
export function useCustomScreenerForm() {
  const [values, setValues] = useState<CustomScreenerValues>(blankValues);
  const [baseline, setBaseline] = useState(() => JSON.stringify(blankValues()));
  const [showErrors, setShowErrors] = useState(false);

  const validation = useMemo(
    () =>
      validateScreenerForm({
        name: values.name,
        description: values.description,
        conditions: values.conditions,
        minPrice: values.minPrice,
      }),
    [values],
  );
  const dirty = JSON.stringify(values) !== baseline;

  const set = useCallback(
    <K extends keyof CustomScreenerValues>(key: K, value: CustomScreenerValues[K]) =>
      setValues((current) => ({ ...current, [key]: value })),
    [],
  );

  const reset = useCallback((next?: CustomScreenerValues) => {
    const initial = next ?? blankValues();
    setValues(initial);
    setBaseline(JSON.stringify(initial));
    setShowErrors(false);
  }, []);

  /**
   * The request body. `indexKey` is sent as null (never omitted) when cleared: a PATCH that
   * omits it means "leave it alone", which would make an index impossible to remove.
   */
  const body = useCallback(
    (): CustomScreenerInput => ({
      name: values.name.trim(),
      description: values.description.trim() || null,
      conditions: values.conditions,
      exchange: values.exchange,
      minPrice: values.minPrice,
      indexKey: values.indexKey,
    }),
    [values],
  );

  return { values, set, validation, showErrors, setShowErrors, dirty, reset, body };
}

export type CustomScreenerFormState = ReturnType<typeof useCustomScreenerForm>;

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="mb-3 mt-7">
      <Text
        accessibilityRole="header"
        className="text-[17px] font-bold text-ink dark:text-ink-dark"
        style={{ letterSpacing: -0.4 }}
      >
        {title}
      </Text>
      {hint ? (
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">{hint}</Text>
      ) : null}
    </View>
  );
}

/**
 * A custom screener is a strategy's ENTRY half — so the conditions use the strategy builder's
 * own editor, and a condition built here behaves identically inside a strategy. The universe
 * sits beside it, because a screener is a question about the universe.
 */
export function CustomScreenerFormFields({
  form,
  editing,
}: {
  form: CustomScreenerFormState;
  editing: boolean;
}) {
  const { values, set, validation, showErrors } = form;
  const issues = validation.issues;
  const show = (message: string | undefined) => (showErrors ? message : undefined);

  return (
    <View>
      <View className="gap-3">
        <Input
          label="Name"
          value={values.name}
          onChangeText={(name) => set('name', name)}
          maxLength={80}
          placeholder="Momentum breakout"
          error={show(issues.name)}
        />
        <Input
          label="Note (optional)"
          value={values.description}
          onChangeText={(description) => set('description', description)}
          maxLength={500}
          placeholder="What this is looking for"
          error={show(issues.description)}
        />
      </View>

      <Heading title="Conditions" hint="All of these must hold on the latest daily bar" />
      <ConditionListEditor
        conditions={values.conditions}
        onChange={(conditions) => set('conditions', conditions)}
        joinWords={['When', 'And']}
        target="entry"
        emptyMessage={issues.conditions}
        issues={issues.conditionIssues}
      />

      <Heading title="Universe" hint="Which stocks it looks at" />
      <Text className="mb-2 text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
        Exchange
      </Text>
      <SegmentedControl
        items={EXCHANGES}
        value={values.exchange}
        onChange={(exchange) => set('exchange', exchange)}
      />
      <View className="mt-4">
        <IndexPickerField value={values.indexKey} onChange={(key) => set('indexKey', key)} />
      </View>
      <NumberField
        label="Min price ₹"
        value={values.minPrice ?? undefined}
        placeholder="off"
        // Empty means "no floor", which is not the same as ₹0.
        onChange={(minPrice) => set('minPrice', minPrice ?? null)}
        error={issues.minPrice}
        containerClassName="mt-4"
      />

      <Text className="mt-4 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
        {editing
          ? 'Changing the conditions clears the current matches — they described the old rule.'
          : 'Saving does not scan. Run a scan once it exists.'}
      </Text>
    </View>
  );
}
