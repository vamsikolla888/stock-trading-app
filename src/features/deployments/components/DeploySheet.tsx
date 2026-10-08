import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Check from 'lucide-react-native/icons/check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { trendOf, trendTextClass } from '@/components/market/ChangeText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { SheetFrame } from '@/components/ui/SheetFrame';
import { SegmentedControl } from '@/components/ui/Tabs';
import { useSafeModeOn } from '@/features/account/hooks';
import { StatusDot } from '@/features/settings/components/StatusPill';
import { confirmAction } from '@/features/settings/lib/confirm';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage, isApiError } from '@/types/api';

import { useDeploy } from '../hooks';
import {
  brokerName,
  buildDeployInput,
  currentOf,
  exposureLine,
  formFieldErrors,
  initialForm,
  liveChecklist,
  MAX_SYMBOLS,
  MIN_STOCK_TRADES,
  parseAmount,
  pickByVerdict,
  provenStocks,
  submitState,
  switchFormMode,
  universeLabel,
  validateDeployForm,
  VERDICT_VIEW,
  type DeployForm,
  type FormErrors,
} from '../lib/view';
import type {
  BrokerId,
  DeployMode,
  Deployment,
  DeploymentList,
  DeployStockRow,
  DeployTarget,
  UniverseKey,
  VariantKey,
} from '../types';
import { NUM } from './parts';

const MODE_ITEMS = [
  { key: 'paper' as const, label: 'Paper wallet' },
  { key: 'live' as const, label: 'Live broker' },
];
const VARIANT_ITEMS = [
  { key: 'improved' as const, label: 'Improved' },
  { key: 'base' as const, label: 'Your rules' },
];
const SCOPE_ITEMS = [
  { key: 'all' as const, label: 'All the rules allow' },
  { key: 'list' as const, label: 'Only chosen' },
];

/**
 * Deploy a strategy to the paper wallet or the live broker — or change the settings of the one
 * already running in that mode (for a user's strategy, saving also takes its current rules).
 * PAPER is the default. LIVE shows its readiness checklist and the platform's caps up front,
 * holds the settings inside those caps, needs a connected broker and the server's typed phrase,
 * and asks once more before real orders can start. A blocked live submit never leaves the phone;
 * the server checks every one of these again.
 */
export function DeploySheet({
  visible,
  onClose,
  target,
  list,
  initialMode,
  stocks,
  variant,
  universe,
  strategyName,
  onDeployed,
}: {
  visible: boolean;
  onClose: () => void;
  target: DeployTarget;
  list: DeploymentList;
  initialMode: DeployMode;
  /** The backtested stocks to pick from. */
  stocks: readonly DeployStockRow[];
  /** Intraday: the page's current rule variant and universe. */
  variant?: VariantKey | null;
  universe?: UniverseKey | null;
  strategyName?: string | null;
  onDeployed: (deployment: Deployment) => void;
}) {
  const engine = list.engine;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const safeOnDevice = useSafeModeOn();
  const deploy = useDeploy(target);
  const [form, setForm] = useState<DeployForm>(() =>
    initialForm({ mode: initialMode, list, stocks, variant, universe }),
  );
  const [step, setStep] = useState<'form' | 'stocks'>('form');
  const [serverErrors, setServerErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const update = (patch: Partial<DeployForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setServerErrors({});
    setServerError(null);
  };

  const live = form.mode === 'live';
  const current = currentOf(list.deployments, form.mode);
  const checks = useMemo(() => liveChecklist(list, safeOnDevice), [list, safeOnDevice]);
  const localErrors = validateDeployForm(form, engine, list.live.limits);
  const errors: FormErrors = { ...localErrors, ...serverErrors };
  const submit = submitState({
    form,
    errors: localErrors,
    checks,
    phrase: list.live.phrase,
    brokers: list.live.brokers,
  });
  const connected = list.live.brokers.filter((b) => b.connected);
  const lim = list.live.limits;
  const busy = deploy.isPending;

  const send = () =>
    deploy.mutate(buildDeployInput(form, engine), {
      onSuccess: (d) => {
        toast.success(
          current ? 'Settings saved' : d.mode === 'live' ? 'Deployed LIVE' : 'Deployed to paper',
          d.mode === 'live' ? 'Its orders are now real.' : undefined,
        );
        onDeployed(d);
      },
      onError: (error) => {
        setServerErrors(isApiError(error) ? formFieldErrors(error.fieldErrors) : {});
        setServerError(getErrorMessage(error));
      },
    });

  const onSubmit = () => {
    if (!submit.ok || busy) return;
    if (!live) {
      send();
      return;
    }
    const cap = parseAmount(form.capital);
    const positions = Math.round(parseAmount(form.positions));
    confirmAction({
      title: current ? 'Save LIVE settings?' : 'Deploy LIVE with real money?',
      message: `${exposureLine(cap, positions)}, through ${brokerName(form.broker)}. The platform’s risk engine and kill switch still apply.`,
      confirmLabel: current ? 'Save live settings' : 'Deploy LIVE',
      destructive: true,
      onConfirm: send,
    });
  };

  const switchMode = (mode: DeployMode) => {
    setForm((f) => switchFormMode(f, mode, list));
    setServerErrors({});
    setServerError(null);
  };

  const title =
    step === 'stocks'
      ? 'Choose stocks'
      : current
        ? `Settings — ${live ? 'Live' : 'Paper'}`
        : 'Deploy this strategy';
  const subtitle = list.strategy?.name || strategyName || undefined;

  return (
    <SheetFrame
      visible={visible}
      onRequestClose={onClose}
      onBackPress={step === 'stocks' ? () => setStep('form') : undefined}
      locked={busy}
      maxHeight={0.92}
      fill={step === 'stocks'}
      avoidKeyboard
      handle={
        <>
          <View className="mb-1 mt-3 h-1 w-10 self-center rounded-full bg-line-strong dark:bg-line-dark-strong" />
          <View className="flex-row items-center gap-2 px-3 pb-2 pt-1">
            {step === 'stocks' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={8}
                onPress={() => setStep('form')}
                className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <ArrowLeft size={20} color={colors.text} />
              </Pressable>
            ) : (
              <View className="w-2" />
            )}
            <View className="flex-1">
              <Text
                accessibilityRole="header"
                className="text-[17px] font-bold text-ink dark:text-ink-dark"
                numberOfLines={1}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text
                  className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={1}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              hitSlop={8}
              onPress={onClose}
              className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
            >
              <X size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        </>
      }
    >
      {step === 'stocks' ? (
        <StockPicker
          engine={engine}
          rows={stocks}
          chosen={form.symbols}
          onChange={(symbols) => update({ symbols })}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: 20,
            gap: 16,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SegmentedControl items={MODE_ITEMS} value={form.mode} onChange={switchMode} />

          {live ? (
            <View className="gap-2.5">
              <Banner
                tone="warning"
                title="Real money"
                message={
                  engine === 'intraday'
                    ? 'Entries and exits become real intraday (MIS) orders at your broker, through the platform’s risk engine and kill switch.'
                    : 'Entries and exits become real delivery (CNC) orders at your broker, through the platform’s risk engine and kill switch. Positions are held overnight.'
                }
              />
              <View className="gap-2 rounded-card border border-line px-3.5 py-3 dark:border-line-dark">
                {checks.map((c) => (
                  <View key={c.key} className="flex-row items-center gap-2.5">
                    <StatusDot tone={c.ok ? 'ok' : 'bad'} size={8} />
                    <Text
                      className={cn(
                        'flex-1 text-[13px] leading-[18px]',
                        c.ok
                          ? 'text-ink-muted dark:text-ink-dark-muted'
                          : 'font-semibold text-ink dark:text-ink-dark',
                      )}
                    >
                      {c.label}
                    </Text>
                  </View>
                ))}
              </View>
              <Text
                className="text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint"
                style={NUM}
              >
                {`Platform caps: ${formatINR(lim.maxOrderValue, 0)} an order · ${lim.maxOpenPositions} positions · ${formatINR(lim.maxDailyLoss, 0)} daily loss${engine === 'intraday' ? ' · one entry a stock a day' : ''}.`}
              </Text>
            </View>
          ) : null}

          {list.strategy && list.strategy.howItTrades.length > 0 ? (
            <View className="gap-1.5">
              {list.strategy.howItTrades.map((line) => (
                <Text
                  key={line}
                  className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
                >
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
          {current?.rulesChanged ? (
            <Banner
              tone="info"
              message="The strategy’s rules changed since this was deployed — saving switches it to the current rules."
            />
          ) : null}
          {list.strategy && !list.strategy.backtest.ran && !live ? (
            <Banner
              tone="info"
              message="Not backtested yet — you can paper-trade it, but there is nothing to compare the results with."
            />
          ) : null}

          {engine === 'intraday' ? (
            <View className="gap-2.5">
              <SegmentedControl
                items={VARIANT_ITEMS}
                value={form.variant}
                onChange={(v) => update({ variant: v })}
              />
              <KeyValueRow
                label="Universe"
                hint="Switch it on the strategy page"
                value={universeLabel(form.universe)}
                className="py-1"
              />
            </View>
          ) : null}

          <View className="gap-3">
            <Input
              label="Capital per trade (₹)"
              value={form.capital}
              onChangeText={(v) => update({ capital: v })}
              keyboardType="number-pad"
              error={errors.capitalPerTrade}
            />
            <View className="flex-row gap-3">
              <Input
                label="Open positions, max"
                value={form.positions}
                onChangeText={(v) => update({ positions: v })}
                keyboardType="number-pad"
                error={errors.maxOpenPositions}
                containerClassName="flex-1"
              />
              <Input
                label={engine === 'swing' ? 'New a day, max' : 'Entries a day, max'}
                value={form.entries}
                onChangeText={(v) => update({ entries: v })}
                keyboardType="number-pad"
                error={errors.maxEntriesPerDay}
                containerClassName="flex-1"
              />
            </View>
            {engine === 'intraday' ? (
              <Input
                label="Daily loss limit (₹)"
                value={form.lossLimit}
                onChangeText={(v) => update({ lossLimit: v })}
                keyboardType="number-pad"
                error={errors.dailyLossLimit}
              />
            ) : null}
            {!errors.capitalPerTrade && !errors.maxOpenPositions ? (
              <Text className="text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
                {`${exposureLine(parseAmount(form.capital), Math.round(parseAmount(form.positions)))} · ${engine === 'swing' ? 'held overnight' : 'squared off 15:14'}`}
              </Text>
            ) : null}
          </View>

          {live && connected.length > 0 ? (
            connected.length > 1 ? (
              <View className="gap-1.5">
                <Text className="text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
                  Broker
                </Text>
                <SegmentedControl
                  items={connected.map((b) => ({ key: b.broker, label: brokerName(b.broker) }))}
                  value={form.broker}
                  onChange={(b: BrokerId) => update({ broker: b })}
                />
              </View>
            ) : (
              <KeyValueRow label="Broker" value={brokerName(form.broker)} className="py-1" />
            )
          ) : null}
          {errors.broker ? (
            <Text className="text-[13px] text-danger-600 dark:text-danger-dark">
              {errors.broker}
            </Text>
          ) : null}

          <View className="gap-2.5">
            <Text className="text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
              Stocks
            </Text>
            {engine === 'swing' ? (
              <SegmentedControl
                items={SCOPE_ITEMS}
                value={form.scope}
                onChange={(s) => update({ scope: s })}
              />
            ) : null}
            {engine === 'swing' && form.scope === 'all' ? (
              <Text className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                {`${list.strategy?.universe || 'The strategy’s universe'} — the most liquid signals first, within the limits above.`}
              </Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Opens the stock picker"
                onPress={() => setStep('stocks')}
                className="flex-row items-center gap-3 rounded-card border border-line px-3.5 py-3 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-[14px] font-semibold text-ink dark:text-ink-dark">
                    {`${form.symbols.length} chosen${form.symbols.length >= MAX_SYMBOLS[engine] ? ' (max)' : ''}`}
                  </Text>
                  <Text
                    className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                    numberOfLines={1}
                  >
                    {form.symbols.length
                      ? `${form.symbols.slice(0, 4).join(', ')}${form.symbols.length > 4 ? ` +${form.symbols.length - 4}` : ''}`
                      : 'None yet — choose from the backtest'}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </Pressable>
            )}
            {errors.symbols ? (
              <Text className="text-[13px] text-danger-600 dark:text-danger-dark">
                {errors.symbols}
              </Text>
            ) : null}
          </View>

          {live ? (
            <Input
              label={`Type ${list.live.phrase ?? 'the confirmation phrase'} to send real orders`}
              value={form.confirm}
              onChangeText={(v) => update({ confirm: v })}
              placeholder={list.live.phrase ?? ''}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              editable={Boolean(list.live.phrase)}
              error={errors.confirm}
            />
          ) : null}

          {serverError ? (
            <Banner tone="error" title="Couldn’t deploy" message={serverError} />
          ) : null}
        </ScrollView>
      )}

      <View
        className="border-t border-line px-5 pt-3 dark:border-line-dark"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        {step === 'stocks' ? (
          <Button label="Done" fullWidth onPress={() => setStep('form')} />
        ) : (
          <>
            {!submit.ok &&
            submit.reason &&
            (submit.kind === 'blocked' || submit.kind === 'broker') ? (
              <Text className="mb-2 text-[13px] leading-[18px] text-danger-600 dark:text-danger-dark">
                {submit.reason}
              </Text>
            ) : null}
            <Button
              label={current ? 'Save settings' : live ? 'Deploy LIVE' : 'Deploy to paper'}
              variant={live ? 'danger' : 'primary'}
              fullWidth
              loading={busy}
              disabled={!submit.ok || busy}
              onPress={onSubmit}
            />
          </>
        )}
      </View>
    </SheetFrame>
  );
}

/** Pick from the backtest's per-stock record: search, quick picks, one tap per stock. */
function StockPicker({
  engine,
  rows,
  chosen,
  onChange,
}: {
  engine: DeploymentList['engine'];
  rows: readonly DeployStockRow[];
  chosen: readonly string[];
  onChange: (symbols: string[]) => void;
}) {
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const max = MAX_SYMBOLS[engine];
  const picked = useMemo(() => new Set(chosen), [chosen]);
  const shown = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return needle ? rows.filter((r) => r.symbol.includes(needle)) : [...rows];
  }, [rows, q]);

  const toggle = (symbol: string) => {
    if (picked.has(symbol)) {
      onChange(chosen.filter((s) => s !== symbol));
      return;
    }
    if (chosen.length >= max) {
      toast.info(`At most ${max} stocks`);
      return;
    }
    onChange([...chosen, symbol]);
  };

  const quick =
    engine === 'swing'
      ? [{ label: 'Made money', pick: () => onChange(provenStocks(rows, max)) }]
      : [
          { label: 'Works', pick: () => onChange(pickByVerdict(rows, ['works'], max)) },
          { label: '+ Mixed', pick: () => onChange(pickByVerdict(rows, ['works', 'mixed'], max)) },
        ];

  return (
    <View style={{ flex: 1 }}>
      <View className="gap-2.5 px-5 pb-2">
        <Input
          value={q}
          onChangeText={setQ}
          placeholder="Search a symbol"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          accessibilityLabel="Filter stocks"
          leftIcon={<Search size={18} color={colors.textMuted} />}
        />
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
            {`${chosen.length} chosen${chosen.length >= max ? ' (max)' : ''}`}
          </Text>
          <View className="flex-row gap-2">
            {[...quick, { label: 'Clear', pick: () => onChange([]) }].map((b) => (
              <Pressable
                key={b.label}
                accessibilityRole="button"
                onPress={b.pick}
                hitSlop={4}
                className="rounded-full border border-line px-3 py-1.5 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
              >
                <Text className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
                  {b.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {engine === 'swing' ? (
          <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            {`Made money: at least ${MIN_STOCK_TRADES} backtested trades and a positive average.`}
          </Text>
        ) : null}
      </View>
      <FlatList
        data={shown}
        keyExtractor={(r) => r.symbol}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 12 }}
        initialNumToRender={20}
        ItemSeparatorComponent={() => <View className="ml-5 h-px bg-line dark:bg-line-dark" />}
        ListEmptyComponent={
          <Text className="px-5 py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
            {rows.length ? 'No match.' : 'No per-stock record — run the backtest first.'}
          </Text>
        }
        renderItem={({ item }) => {
          const on = picked.has(item.symbol);
          const verdict = item.verdict ? VERDICT_VIEW[item.verdict] : null;
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={item.symbol}
              onPress={() => toggle(item.symbol)}
              className="flex-row items-center gap-3 px-5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
            >
              <View
                className={cn(
                  'h-5 w-5 items-center justify-center rounded-[5px] border',
                  on
                    ? 'border-brand-strong bg-brand-strong dark:border-brand-strong-dark dark:bg-brand-strong-dark'
                    : 'border-line-strong dark:border-line-dark-strong',
                )}
              >
                {on ? <Check size={14} color="#ffffff" strokeWidth={3} /> : null}
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[14px] font-semibold text-ink dark:text-ink-dark">
                  {item.symbol}
                </Text>
                <View className="mt-0.5 flex-row items-center gap-1.5">
                  {verdict ? <StatusDot tone={verdict.tone} size={6} /> : null}
                  <Text
                    className="text-xs text-ink-muted dark:text-ink-dark-muted"
                    numberOfLines={1}
                  >
                    {`${verdict ? `${verdict.label} · ` : ''}${item.trades} trades${item.winRate != null ? ` · ${formatPercent(item.winRate, 0)} won` : ''}`}
                  </Text>
                </View>
              </View>
              <Text
                className={cn(
                  'text-[13px] font-semibold',
                  trendTextClass[trendOf(item.avgReturnPct)],
                )}
                style={NUM}
                accessibilityLabel={`Average per trade ${formatSignedPercent(item.avgReturnPct, 2)}`}
              >
                {formatSignedPercent(item.avgReturnPct, 2)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
