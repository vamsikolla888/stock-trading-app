import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { SegmentedControl } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import { useRulesPreview } from '../hooks';
import { settingsIssues, startingRules, validateStrategyForm, withOptional } from '../lib/rules';
import {
  DEFAULT_BACKTEST_SETTINGS,
  type BacktestSettings,
  type StrategyRules,
  type StrategyTemplate,
  type UniverseExchange,
} from '../types';

import { ConditionListEditor } from './ConditionListEditor';
import { IndexPickerField } from './IndexPickerField';
import { NumberField } from './NumberField';

const EXCHANGES: readonly { key: UniverseExchange; label: string }[] = [
  { key: 'NSE', label: 'NSE' },
  { key: 'BSE', label: 'BSE' },
  { key: 'ALL', label: 'Both' },
];

const HOW_TESTED: readonly [string, string][] = [
  ['Bars', 'Daily'],
  ['Signal', 'Read on the close'],
  ['Fill', 'Next day’s open'],
  ['Sizing', 'Equal weight per slot'],
  ['Direction', 'Long only'],
];

export interface StrategyFormValues {
  name: string;
  description: string;
  rules: StrategyRules;
  /** Omitted = the server's defaults (15 bps, 8 positions). */
  settings?: BacktestSettings;
}

/** Form state for building or editing a strategy; the screen owns the save button. */
export function useStrategyForm(initial?: StrategyFormValues) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [rules, setRules] = useState<StrategyRules>(() => initial?.rules ?? startingRules());
  const [settings, setSettings] = useState<BacktestSettings>(
    () => initial?.settings ?? DEFAULT_BACKTEST_SETTINGS,
  );
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify({
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      rules: initial?.rules ?? startingRules(),
      settings: initial?.settings ?? DEFAULT_BACKTEST_SETTINGS,
    }),
  );

  const validation = useMemo(() => {
    const base = validateStrategyForm({ name, description, rules });
    const settingIssues = settingsIssues(settings);
    const valid = base.valid && Object.keys(settingIssues).length === 0;
    return { ...base, valid, issues: { ...base.issues, ...settingIssues } };
  }, [name, description, rules, settings]);
  const dirty = JSON.stringify({ name, description, rules, settings }) !== baseline;

  const applyTemplate = useCallback((template: StrategyTemplate) => {
    setRules(template.rules);
    setTemplateId(template.id);
    // Only fills empty fields — comparing templates must not overwrite a chosen name.
    setName((current) => current || template.name);
    setDescription((current) => current || template.summary);
  }, []);

  const reset = useCallback((next?: StrategyFormValues) => {
    const values = {
      name: next?.name ?? '',
      description: next?.description ?? '',
      rules: next?.rules ?? startingRules(),
      settings: next?.settings ?? DEFAULT_BACKTEST_SETTINGS,
    };
    setName(values.name);
    setDescription(values.description);
    setRules(values.rules);
    setSettings(values.settings);
    setTemplateId(null);
    setShowErrors(false);
    setBaseline(JSON.stringify(values));
  }, []);

  const body = useCallback(
    (): {
      name: string;
      description: string | null;
      rules: StrategyRules;
      settings: BacktestSettings;
    } => ({
      name: name.trim(),
      description: description.trim() || null,
      rules,
      settings,
    }),
    [name, description, rules, settings],
  );

  return {
    name,
    setName,
    description,
    setDescription,
    rules,
    setRules,
    settings,
    setSettings,
    templateId,
    applyTemplate,
    validation,
    showErrors,
    setShowErrors,
    dirty,
    reset,
    body,
  };
}

export type StrategyFormState = ReturnType<typeof useStrategyForm>;

function StepTitle({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <View className={cn('mb-3 flex-row items-center gap-2.5', step === 1 ? 'mt-1' : 'mt-7')}>
      <View className="h-6 w-6 items-center justify-center rounded-full bg-brand-wash dark:bg-brand-wash-dark">
        <Text className="text-xs font-bold text-brand-text dark:text-brand-text-dark">{step}</Text>
      </View>
      <View className="flex-1">
        <Text
          accessibilityRole="header"
          className="text-[17px] font-bold text-ink dark:text-ink-dark"
          style={{ letterSpacing: -0.4 }}
        >
          {title}
        </Text>
        {hint ? (
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{hint}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The builder, step by step: start from → name → entry → exit → universe. Only operands the
 * backtest engine can evaluate are offered, so anything built here is something it can run.
 */
export function StrategyFormFields({
  form,
  templates,
  templatesLoading,
}: {
  form: StrategyFormState;
  /** Offered only when creating. */
  templates?: readonly StrategyTemplate[];
  templatesLoading?: boolean;
}) {
  const { rules, setRules, validation, showErrors } = form;
  const issues = validation.issues;
  const show = (message: string | undefined) => (showErrors ? message : undefined);
  // Step numbers are fixed per layout: the template picker only exists when creating.
  const first = templates ? 2 : 1;

  const setExit = <K extends keyof StrategyRules['exit']>(
    key: K,
    value: StrategyRules['exit'][K] | undefined,
  ) => setRules((r) => ({ ...r, exit: withOptional(r.exit, key, value) }));
  const setUniverse = <K extends keyof StrategyRules['universe']>(
    key: K,
    value: StrategyRules['universe'][K] | undefined,
  ) => setRules((r) => ({ ...r, universe: withOptional(r.universe, key, value) }));

  return (
    <View>
      {templates ? (
        <>
          <StepTitle step={1} title="Start from" hint="A template, then adjust anything" />
          {templatesLoading ? (
            <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
              Loading templates…
            </Text>
          ) : templates.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="-mx-5"
              contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
            >
              {templates.map((template) => {
                const selected = form.templateId === template.id;
                return (
                  <Pressable
                    key={template.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Template ${template.name}: ${template.summary}`}
                    onPress={() => form.applyTemplate(template)}
                    className={cn(
                      'w-[200px] rounded-card border p-3.5',
                      selected
                        ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
                        : 'border-line bg-surface active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-sm font-semibold',
                        selected
                          ? 'text-brand-text dark:text-brand-text-dark'
                          : 'text-ink dark:text-ink-dark',
                      )}
                      numberOfLines={1}
                    >
                      {template.name}
                    </Text>
                    <Text
                      className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
                      numberOfLines={3}
                    >
                      {template.summary}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
            Templates use conventional defaults, deliberately not tuned to this data — a template
            shipped at its best parameters would be an overfitting trap.
          </Text>
        </>
      ) : null}

      <StepTitle step={first} title="Name it" />
      <View className="gap-3">
        <Input
          label="Name"
          value={form.name}
          onChangeText={form.setName}
          maxLength={80}
          placeholder="RSI Reversal"
          error={show(issues.name)}
        />
        <Input
          label="Note (optional)"
          value={form.description}
          onChangeText={form.setDescription}
          maxLength={500}
          placeholder="What this is for, and what it's bad at"
          error={show(issues.description)}
        />
      </View>

      <StepTitle step={first + 1} title="Entry" hint="All of these must be true on the same bar" />
      <ConditionListEditor
        conditions={rules.entry.all}
        onChange={(all) => setRules((r) => ({ ...r, entry: { all } }))}
        joinWords={['When', 'And']}
        target="entry"
        emptyMessage={issues.entry}
        issues={issues.entryConditions}
      />

      <StepTitle step={first + 2} title="Exit" hint="Whichever comes first" />
      <View className="flex-row flex-wrap" style={{ marginHorizontal: -5 }}>
        <View style={{ width: '50%', paddingHorizontal: 5, marginBottom: 10 }}>
          <NumberField
            label="Target %"
            value={rules.exit.targetPct}
            placeholder="off"
            onChange={(v) => setExit('targetPct', v)}
            error={issues.targetPct}
          />
        </View>
        <View style={{ width: '50%', paddingHorizontal: 5, marginBottom: 10 }}>
          <NumberField
            label="Stop loss %"
            value={rules.exit.stopLossPct}
            placeholder="off"
            onChange={(v) => setExit('stopLossPct', v)}
            error={issues.stopLossPct}
          />
        </View>
        <View style={{ width: '50%', paddingHorizontal: 5, marginBottom: 10 }}>
          <NumberField
            label="Time stop (bars)"
            value={rules.exit.maxHoldBars}
            placeholder="off"
            integer
            onChange={(v) => setExit('maxHoldBars', v)}
            error={issues.maxHoldBars}
          />
        </View>
      </View>
      <Text className="mb-2 mt-1 text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
        Exit conditions
      </Text>
      <ConditionListEditor
        conditions={rules.exit.any}
        onChange={(any) => setRules((r) => ({ ...r, exit: { ...r.exit, any } }))}
        joinWords={['Or when', 'Or']}
        target="exit"
        emptyHint="Optional — exit as soon as a condition turns true."
        issues={issues.exitConditions}
      />
      {issues.exit ? (
        <Text className="mt-3 text-[13px] leading-[19px] text-danger-600 dark:text-danger-dark">
          {issues.exit}
        </Text>
      ) : null}

      <StepTitle step={first + 3} title="Universe" hint="Which stocks it looks at" />
      <Text className="mb-2 text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
        Exchange
      </Text>
      <SegmentedControl
        items={EXCHANGES}
        value={rules.universe.exchange}
        onChange={(exchange) => setRules((r) => ({ ...r, universe: { ...r.universe, exchange } }))}
      />
      <View className="mt-4">
        <IndexPickerField
          value={rules.universe.indexKey ?? null}
          onChange={(indexKey) => setUniverse('indexKey', indexKey ?? undefined)}
          footnote="An index filter uses today's constituents across the whole backtest window — survivorship bias in the flattering direction."
        />
      </View>
      <View className="mt-4 flex-row flex-wrap" style={{ marginHorizontal: -5 }}>
        <View style={{ width: '50%', paddingHorizontal: 5 }}>
          <NumberField
            label="Min price ₹"
            value={rules.universe.minPrice}
            placeholder="off"
            onChange={(v) => setUniverse('minPrice', v)}
            error={issues.minPrice}
          />
        </View>
        <View style={{ width: '50%', paddingHorizontal: 5 }}>
          <NumberField
            label="Max symbols"
            value={rules.universe.maxSymbols}
            placeholder="all"
            integer
            onChange={(v) => setUniverse('maxSymbols', v)}
            error={issues.maxSymbols}
          />
        </View>
      </View>
      <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
        The minimum price is checked at each entry, not today — filtering on today would quietly
        drop everything that has since fallen, which flatters the result.
      </Text>
      <Card className="mt-4 py-1">
        <ToggleRow
          title="F&O names only"
          hint="NSE stocks with listed futures and options"
          value={Boolean(rules.universe.fnoOnly)}
          onChange={(on) => setUniverse('fnoOnly', on || undefined)}
        />
        <View className="h-px bg-line dark:bg-line-dark" />
        <ToggleRow
          title="Tradeable names only"
          hint="Liquid enough that a next-open fill is plausible"
          value={Boolean(rules.universe.tradeableOnly)}
          onChange={(on) => setUniverse('tradeableOnly', on || undefined)}
        />
      </Card>

      <Text className="mb-3 mt-7 text-[17px] font-bold text-ink dark:text-ink-dark">
        How it will be tested
      </Text>
      <View className="mb-3 flex-row flex-wrap" style={{ marginHorizontal: -5 }}>
        <View style={{ width: '50%', paddingHorizontal: 5 }}>
          <NumberField
            label="Costs (bps per side)"
            value={form.settings.costBps}
            placeholder="15"
            onChange={(v) => form.setSettings((s) => ({ ...s, costBps: v ?? 0 }))}
            error={issues.costBps}
          />
        </View>
        <View style={{ width: '50%', paddingHorizontal: 5 }}>
          <NumberField
            label="Max positions"
            value={form.settings.maxOpenPositions}
            placeholder="8"
            integer
            onChange={(v) => form.setSettings((s) => ({ ...s, maxOpenPositions: v ?? 1 }))}
            error={issues.maxOpenPositions}
          />
        </View>
      </View>
      <Card className="py-1.5">
        {HOW_TESTED.map(([label, value], index) => (
          <KeyValueRow key={label} label={label} value={value} divider={index > 0} />
        ))}
      </Card>
      <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
        Stops and targets are checked on the close, not intrabar — the conservative direction for a
        rule that relies on tight intraday stops.
      </Text>
    </View>
  );
}

/** A universe switch (F&O names only, tradeable only) — shared with the screener form. */
export function ToggleRow({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-3 px-3.5 py-2.5">
      <View className="flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark">{title}</Text>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">{hint}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.borderStrong }}
      />
    </View>
  );
}

/**
 * The server's live check of the draft (web builder: the readback panel). Its words, not the
 * form's: what the backtest will actually run, lint the client cannot know ("RSI > 0 is always
 * true"), and how many bars of history each stock needs before the rule can fire.
 */
export function RulesPreviewCard({ rules }: { rules: StrategyRules }) {
  const { colors } = useTheme();
  const preview = useRulesPreview(rules);
  const data = preview.data;
  if (!data && !preview.isFetching) return null;
  return (
    <Card className="mt-6 bg-surface-sunk dark:bg-surface-sunk-dark">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-[11px] font-bold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
          What will be tested
        </Text>
        {preview.isFetching ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
      </View>
      {data?.readback ? (
        <Text className="mt-1.5 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
          {data.readback}
        </Text>
      ) : data && !data.valid ? (
        <Text className="mt-1.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          Finish the highlighted fields to see the rule in words.
        </Text>
      ) : null}
      {data && data.universe.length > 0 ? (
        <Text className="mt-2 text-xs text-ink-muted dark:text-ink-dark-muted">
          Looks at {data.universe.join(' · ')}
          {data.warmupBars ? ` · needs ${data.warmupBars} bars of history` : ''}
        </Text>
      ) : null}
      {data?.warnings.map((warning) => (
        <Text
          key={`${warning.path}:${warning.message}`}
          className="mt-2 text-xs leading-[17px] text-warning-600 dark:text-warning-dark"
        >
          ⚠ {warning.message}
        </Text>
      ))}
    </Card>
  );
}
