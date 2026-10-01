import Minus from 'lucide-react-native/icons/minus';
import Plus from 'lucide-react-native/icons/plus';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils/cn';
import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { useGeneration, useSaveCandidate, useStartGeneration, useStrategyPacks } from '../hooks';
import { formatProfitFactor } from '../lib/ranking';
import { isGenerationActive, type GenerationView, type UniverseExchange } from '../types';

import { NumberField } from './NumberField';
import { SheetModal } from './SheetModal';

const EXCHANGES: readonly { key: UniverseExchange; label: string }[] = [
  { key: 'NSE', label: 'NSE' },
  { key: 'BSE', label: 'BSE' },
  { key: 'ALL', label: 'Both' },
];

/** Each status spelled out — "working…" for 40 seconds with no detail reads as hung. */
const STATUS_TEXT: Record<string, string> = {
  queued: 'Queued on the worker…',
  waiting: 'Waiting for the AI provider to come back…',
  generating: 'Asking the AI model for candidates…',
  validating: 'Validating and sample-backtesting each candidate…',
};

interface GenerateSheetProps {
  visible: boolean;
  kind: 'strategy' | 'screener';
  onClose: () => void;
}

/**
 * Generate strategies or screeners with the server's AI model. Shows the rejections as well
 * as the survivors — "3 saved" alone would hide that others were thrown out, and why.
 */
export function GenerateSheet({ visible, kind, onClose }: GenerateSheetProps) {
  const { colors } = useTheme();
  const [count, setCount] = useState(4);
  const [theme, setTheme] = useState('');
  const [exchange, setExchange] = useState<UniverseExchange>('NSE');
  const [minPrice, setMinPrice] = useState<number | undefined>(50);
  const [fnoOnly, setFnoOnly] = useState(false);
  const [packId, setPackId] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);

  const packsQuery = useStrategyPacks(visible);
  const packs = (packsQuery.data ?? []).filter((p) => p.kind === kind);
  const pack = packs.find((p) => p.id === packId) ?? null;

  const start = useStartGeneration();
  const run = useGeneration(generationId);
  const generation = run.data ?? null;
  const settled = generation != null && !isGenerationActive(generation.status);
  const busy = start.isPending || (generationId !== null && !settled);
  const label = kind === 'strategy' ? 'strategies' : 'screeners';
  const minPriceInvalid =
    minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0 || minPrice > 1_000_000);

  const reset = () => {
    setGenerationId(null);
    start.reset();
  };

  const close = () => {
    // A finished run is cleared; one still working keeps going and reopens where it was.
    if (settled || (generationId === null && !start.isPending)) reset();
    onClose();
  };

  const submit = async () => {
    try {
      const result = await start.mutateAsync({
        kind,
        packId,
        count,
        theme: theme.trim() || null,
        exchange,
        minPrice: minPrice ?? null,
        fnoOnly: pack ? pack.fnoOnly : fnoOnly,
      });
      setGenerationId(result.generationId);
    } catch {
      // Shown from start.error below.
    }
  };

  return (
    <SheetModal
      visible={visible}
      title={`Generate ${label} with AI`}
      subtitle={
        generationId === null
          ? 'Validated and sample-backtested before anything is saved'
          : generation?.status === 'complete'
            ? `${generation.savedCount} saved · ${generation.kept ?? generation.savedCount} kept of ${generation.proposed}`
            : undefined
      }
      onClose={close}
      tall={generationId !== null}
      footer={
        generationId === null ? (
          <View className="gap-2">
            {start.error ? (
              <Text className="text-[13px] text-danger-600 dark:text-danger-dark">
                {getErrorMessage(start.error)}
              </Text>
            ) : null}
            <Button
              label={pack ? `Build ${pack.setupCount} setups` : `Generate ${count}`}
              loading={start.isPending}
              disabled={busy || minPriceInvalid}
              onPress={() => void submit()}
              fullWidth
            />
            <Text className="text-center text-[11px] text-ink-faint dark:text-ink-dark-faint">
              {pack
                ? `A few AI calls, then ${pack.setupCount} sample backtests — a minute or two.`
                : 'One AI call, then one sample backtest per candidate.'}
            </Text>
          </View>
        ) : settled ? (
          <View className="flex-row gap-3">
            <Button label="Generate again" variant="outline" className="flex-1" onPress={reset} />
            <Button label="Done" className="flex-1" onPress={close} />
          </View>
        ) : undefined
      }
    >
      {generationId === null ? (
        <>
          {packs.length > 0 ? (
            <>
              <Text className="mb-2 text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
                Start from a known set
              </Text>
              <View className="gap-2">
                <PackOption
                  title="Let the model choose"
                  body="Free-form. Works best with a focus below."
                  selected={packId === null}
                  onPress={() => setPackId(null)}
                />
                {packs.map((p) => (
                  <PackOption
                    key={p.id}
                    title={`${p.label} · ${p.setupCount}`}
                    body={p.description}
                    selected={packId === p.id}
                    onPress={() => setPackId(p.id)}
                  />
                ))}
              </View>
              {pack ? (
                <View className="mt-3 rounded-lg bg-surface-sunk p-3 dark:bg-surface-sunk-dark">
                  <Text className="text-xs font-semibold text-ink dark:text-ink-dark">
                    What gets built
                  </Text>
                  {pack.setups.map((setup) => (
                    <Text
                      key={setup.name}
                      className="mt-1.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
                    >
                      <Text className="font-semibold text-ink dark:text-ink-dark">
                        {setup.name}
                      </Text>{' '}
                      — {setup.brief}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}

          {!pack ? (
            <View className="mt-5 flex-row items-center justify-between">
              <Text className="text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
                How many
              </Text>
              <View className="flex-row items-center gap-3">
                <StepButton
                  label="Fewer"
                  disabled={count <= 1}
                  onPress={() => setCount((n) => Math.max(1, n - 1))}
                  icon={<Minus size={16} color={colors.text} />}
                />
                <Text
                  className="w-6 text-center text-base font-bold text-ink dark:text-ink-dark"
                  style={{ fontVariant: ['tabular-nums'] }}
                  accessibilityLabel={`${count} candidates`}
                >
                  {count}
                </Text>
                <StepButton
                  label="More"
                  disabled={count >= 8}
                  onPress={() => setCount((n) => Math.min(8, n + 1))}
                  icon={<Plus size={16} color={colors.text} />}
                />
              </View>
            </View>
          ) : null}

          <Text className="mb-2 mt-5 text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
            Exchange
          </Text>
          <SegmentedControl items={EXCHANGES} value={exchange} onChange={setExchange} />

          <NumberField
            label="Min price ₹ (optional)"
            value={minPrice}
            onChange={setMinPrice}
            placeholder="off"
            error={minPriceInvalid ? 'Enter a price between 0 and 10,00,000.' : undefined}
            containerClassName="mt-4"
          />

          <View className="mt-4 flex-row items-center gap-3">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                Only F&amp;O stocks
              </Text>
              <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                NSE names with listed futures & options. Rules still read the daily cash price.
                {pack ? ' Set by the pack.' : ''}
              </Text>
            </View>
            <Switch
              value={pack ? pack.fnoOnly : fnoOnly}
              disabled={Boolean(pack)}
              onValueChange={setFnoOnly}
              trackColor={{ true: colors.primary, false: colors.borderStrong }}
              accessibilityLabel="Only F&O stocks"
            />
          </View>

          <Input
            label="Focus (optional)"
            value={theme}
            onChangeText={setTheme}
            maxLength={300}
            placeholder="e.g. trend following with a hard stop"
            helperText="A hint for the model only — the engine sees just the validated rules."
            containerClassName="mt-4"
          />
        </>
      ) : generation ? (
        <GenerationResult generation={generation} kind={kind} />
      ) : run.error ? (
        <Text className="py-6 text-center text-[13px] text-danger-600 dark:text-danger-dark">
          {getErrorMessage(run.error)}
        </Text>
      ) : (
        <Progress text={STATUS_TEXT.queued!} />
      )}
    </SheetModal>
  );
}

function PackOption({
  title,
  body,
  selected,
  onPress,
}: {
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'rounded-card border p-3',
        selected
          ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
          : 'border-line bg-surface active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark',
      )}
    >
      <Text
        className={cn(
          'text-sm font-semibold',
          selected ? 'text-brand-text dark:text-brand-text-dark' : 'text-ink dark:text-ink-dark',
        )}
      >
        {title}
      </Text>
      <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
        {body}
      </Text>
    </Pressable>
  );
}

function StepButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'h-9 w-9 items-center justify-center rounded-full border border-line-strong active:bg-surface-sunk dark:border-line-dark-strong dark:active:bg-surface-sunk-dark',
        disabled && 'opacity-40',
      )}
    >
      {icon}
    </Pressable>
  );
}

function Progress({ text, detail }: { text: string; detail?: string }) {
  const { colors } = useTheme();
  return (
    <View className="items-center gap-3 py-10" accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.accent} />
      <Text className="text-center text-sm font-semibold text-ink dark:text-ink-dark">{text}</Text>
      {detail ? (
        <Text className="text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

function GenerationResult({
  generation,
  kind,
}: {
  generation: GenerationView;
  kind: 'strategy' | 'screener';
}) {
  if (generation.status === 'failed') {
    return (
      <Text className="py-6 text-center text-[13px] leading-[19px] text-danger-600 dark:text-danger-dark">
        {generation.error ?? 'The generation failed.'}
      </Text>
    );
  }
  if (generation.status !== 'complete') {
    return (
      <Progress
        text={STATUS_TEXT[generation.status] ?? 'Working…'}
        detail={
          generation.status === 'waiting'
            ? (generation.error ??
              'The AI provider is unavailable right now. The run is parked and resumes by itself — you can close this.')
            : generation.proposed > 0
              ? `${generation.proposed} candidates returned — each is being backtested on a sample.`
              : 'You can close this — the run continues and its survivors are saved.'
        }
      />
    );
  }

  return <CompletedGeneration generation={generation} kind={kind} />;
}

function CompletedGeneration({
  generation,
  kind,
}: {
  generation: GenerationView;
  kind: 'strategy' | 'screener';
}) {
  const save = useSaveCandidate(generation.id);
  // Original indexes — the save endpoint addresses a candidate by its place in the run.
  const indexed = generation.candidates.map((candidate, index) => ({ candidate, index }));
  const kept = indexed.filter(({ candidate }) => candidate.verdict === 'kept');
  const rejected = indexed
    .filter(({ candidate }) => candidate.verdict === 'rejected')
    .map(({ candidate }) => candidate);
  const unit = kind === 'screener' ? 'matches' : 'trades';
  const savingIndex = save.isPending ? (save.variables ?? null) : null;

  const saveOne = (index: number) =>
    save.mutate(index, {
      onSuccess: () =>
        toast.success(
          'Saved',
          kind === 'screener' ? 'Added to your screeners.' : 'Added to your strategies.',
        ),
      onError: (error) => toast.error("Couldn't save it", getErrorMessage(error)),
    });

  return (
    <View>
      {kept.length === 0 ? (
        <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          Nothing survived the checks this time — the reasons are below. A different focus usually
          helps.
        </Text>
      ) : (
        <>
          <Text className="mb-2 text-[13px] font-semibold text-ink dark:text-ink-dark">
            Passed every check ({kept.length})
          </Text>
          <View className="gap-2.5">
            {kept.map(({ candidate, index }) => (
              // Names come from the model and can repeat — the index keeps keys unique.
              <View
                key={`${index}-${candidate.name}`}
                className="rounded-card border border-line p-3 dark:border-line-dark"
              >
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
                    {candidate.name}
                  </Text>
                  {candidate.savedId !== null && candidate.savedId !== undefined ? (
                    <Badge label="Saved" variant="success" />
                  ) : candidate.savedId === null ? (
                    <Button
                      label="Save"
                      size="sm"
                      variant="secondary"
                      loading={savingIndex === index}
                      disabled={save.isPending}
                      onPress={() => saveOne(index)}
                    />
                  ) : null}
                </View>
                {candidate.sample ? (
                  <View className="mt-1.5">
                    <Badge
                      label={`${formatNumber(candidate.sample.trades, 0)} ${unit} on ${candidate.sample.symbolsTested} symbols`}
                    />
                  </View>
                ) : null}
                {(candidate.conditionText ?? []).map((text, line) => (
                  <Text
                    key={`${line}-${text}`}
                    className="mt-1.5 text-xs leading-[17px] text-ink dark:text-ink-dark"
                  >
                    {text}
                  </Text>
                ))}
                {candidate.sample?.expectancyPct != null ? (
                  <Text className="mt-1.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                    Sample: win {formatPercent(candidate.sample.winRate, 0)} · PF{' '}
                    {formatProfitFactor(candidate.sample.profitFactor)} · expectancy{' '}
                    {formatSignedPercent(candidate.sample.expectancyPct, 2)}
                  </Text>
                ) : null}
                <Text className="mt-1.5 text-xs leading-[17px] text-warning-600 dark:text-warning-dark">
                  Weakness: {candidate.weakness}
                </Text>
                {(candidate.warnings ?? []).map((warning) => (
                  <Text
                    key={warning}
                    className="mt-1 text-xs leading-[17px] text-warning-600 dark:text-warning-dark"
                  >
                    ⚠ {warning}
                  </Text>
                ))}
              </View>
            ))}
          </View>
          <Text className="mt-3 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
            Sample figures come from {kept[0]?.candidate.sample?.symbolsTested ?? 150} symbols, not
            the whole market, and candidates are deliberately not filtered by profitability. Run a
            full backtest before trusting any of it.
          </Text>
        </>
      )}

      {rejected.length > 0 ? (
        <>
          <Text className="mb-2 mt-5 text-[13px] font-semibold text-ink dark:text-ink-dark">
            Rejected ({rejected.length})
          </Text>
          <View className="gap-2">
            {rejected.map((candidate, index) => (
              <View
                key={`${index}-${candidate.name}`}
                className="rounded-card bg-surface-sunk p-3 dark:bg-surface-sunk-dark"
              >
                <Text className="text-[13px] font-semibold text-ink-muted dark:text-ink-dark-muted">
                  {candidate.name}
                </Text>
                {candidate.reason ? (
                  <Text className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                    {candidate.reason}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : null}
      <Text className="mt-4 text-[11px] text-ink-faint dark:text-ink-dark-faint">
        {formatNumber(generation.tokensUsed, 0)} tokens used
      </Text>
    </View>
  );
}
