import type {
  CatalogEntry,
  Comparator,
  Condition,
  IndicatorCategory,
  IndicatorName,
  Operand,
  StrategyRules,
} from '../types';

/**
 * The rule builder's pure logic: operand editing, wording and validation. Every limit here
 * mirrors the server's zod schemas (server/src/modules/strategies/strategy.dto.ts) so the
 * form refuses exactly what the server would, before a round trip.
 */

/** Mirrors the server's MAX_CONDITIONS for strategy entries/exits and custom screeners. */
export const MAX_CONDITIONS = 8;
/** Mirrors MAX_BARS — the longest period or look-back the engine accepts. */
export const MAX_BARS = 400;

export const COMPARATOR_LABELS: Record<Comparator, string> = {
  '>': 'is above',
  '<': 'is below',
  '>=': 'is at or above',
  '<=': 'is at or below',
  crossesAbove: 'crosses above',
  crossesBelow: 'crosses below',
};

export const COMPARATORS = (Object.keys(COMPARATOR_LABELS) as Comparator[]).map((key) => ({
  key,
  label: COMPARATOR_LABELS[key],
}));

export const CATEGORY_LABELS: Record<IndicatorCategory, string> = {
  price: 'Price',
  'overlap studies': 'Moving averages',
  oscillators: 'Oscillators',
  trend: 'Trend',
  volatility: 'Volatility & bands',
  'volume indicators': 'Volume',
};

export const CATEGORY_ORDER: readonly IndicatorCategory[] = [
  'price',
  'overlap studies',
  'oscillators',
  'trend',
  'volatility',
  'volume indicators',
];

/** A sensible new row — `close is above SMA(50)` — never an empty form. */
export function blankCondition(): Condition {
  return {
    left: { kind: 'price', field: 'close' },
    op: '>',
    right: { kind: 'indicator', name: 'SMA', period: 50 },
  };
}

/** What an unseeded builder opens on: a real, valid, deliberately unremarkable strategy. */
export function startingRules(): StrategyRules {
  return {
    entry: {
      all: [
        {
          left: { kind: 'indicator', name: 'RSI', period: 14 },
          op: '<',
          right: { kind: 'constant', value: 30 },
        },
        {
          left: { kind: 'price', field: 'close' },
          op: '>',
          right: { kind: 'indicator', name: 'SMA', period: 200 },
        },
      ],
    },
    exit: { any: [], targetPct: 8, stopLossPct: 4, maxHoldBars: 15 },
    universe: { exchange: 'NSE', minPrice: 20 },
  };
}

/** What a new custom screener opens on. */
export function startingScreenerCondition(): Condition {
  return {
    left: { kind: 'indicator', name: 'RSI', period: 14 },
    op: '<',
    right: { kind: 'constant', value: 30 },
  };
}

// ── Operands ───────────────────────────────────────────────────────────────────────────

/**
 * The catalogue entry an operand corresponds to ("constant" for a number). Price operands
 * compare the offset too, since "Close" and "Prev Close" differ only by it.
 */
export function matchEntryId(operand: Operand, catalog: readonly CatalogEntry[]): string {
  if (operand.kind === 'constant') return 'constant';
  if (operand.kind === 'indicator') {
    return (
      catalog.find((e) => e.operand.kind === 'indicator' && e.operand.name === operand.name)?.id ??
      'constant'
    );
  }
  const exact = catalog.find(
    (e) =>
      e.operand.kind === 'price' &&
      e.operand.field === operand.field &&
      (e.operand.offset ?? 0) === (operand.offset ?? 0),
  );
  if (exact) return exact.id;
  return (
    catalog.find(
      (e) => e.operand.kind === 'price' && e.operand.field === operand.field && !e.operand.offset,
    )?.id ?? 'constant'
  );
}

/**
 * The operand after choosing a different catalogue entry. The multiplier survives the change
 * (switching "1.5 × average volume" to "1.5 × close" rarely means resetting it); the offset
 * survives only when the new entry does not define its own (Prev High is high at offset 1).
 */
export function operandFromEntry(
  entryId: string,
  previous: Operand,
  catalog: readonly CatalogEntry[],
): Operand {
  if (entryId === 'constant') {
    return { kind: 'constant', value: previous.kind === 'constant' ? previous.value : 0 };
  }
  const entry = catalog.find((e) => e.id === entryId);
  if (!entry) return previous;
  const carriedMultiplier = previous.kind === 'constant' ? undefined : previous.multiplier;
  const entryOffset = entry.operand.kind === 'constant' ? undefined : entry.operand.offset;
  const carriedOffset = previous.kind === 'constant' ? undefined : previous.offset;
  if (entry.operand.kind === 'constant') return { ...entry.operand };
  return {
    ...entry.operand,
    ...(carriedMultiplier != null ? { multiplier: carriedMultiplier } : {}),
    ...(entryOffset != null
      ? { offset: entryOffset }
      : carriedOffset != null
        ? { offset: carriedOffset }
        : {}),
  } as Operand;
}

export type NumericKey = 'period' | 'fast' | 'slow' | 'signal' | 'stdDev' | 'multiplier' | 'offset';

export interface NumericField {
  key: NumericKey;
  label: string;
  placeholder?: string;
  integer: boolean;
  min: number;
  max: number;
}

const FIELD: Record<NumericKey, NumericField> = {
  period: { key: 'period', label: 'Period', integer: true, min: 1, max: MAX_BARS },
  fast: { key: 'fast', label: 'Fast', integer: true, min: 1, max: MAX_BARS },
  slow: { key: 'slow', label: 'Slow', integer: true, min: 1, max: MAX_BARS },
  signal: { key: 'signal', label: 'Signal', integer: true, min: 1, max: MAX_BARS },
  stdDev: { key: 'stdDev', label: 'Std dev', integer: false, min: 0.1, max: 10 },
  multiplier: {
    key: 'multiplier',
    label: 'Multiplier',
    placeholder: '×1',
    integer: false,
    min: 0.0001,
    max: 1000,
  },
  offset: {
    key: 'offset',
    label: 'Bars ago',
    placeholder: 'now',
    integer: true,
    min: 0,
    max: MAX_BARS,
  },
};

/** The numeric inputs an operand shows, in display order — driven by the catalogue entry. */
export function operandFields(operand: Operand, catalog: readonly CatalogEntry[]): NumericField[] {
  if (operand.kind === 'constant') return [];
  const entry = catalog.find((e) => e.id === matchEntryId(operand, catalog));
  const params = entry?.params ?? [];
  const fields: NumericField[] = [];
  if (operand.kind === 'indicator') {
    if (params.includes('period')) fields.push(FIELD.period);
    if (params.includes('stdDev')) {
      fields.push({
        ...FIELD.stdDev,
        label: operand.name === 'SUPERTREND' ? 'ATR multiple' : 'Std dev',
      });
    }
    if (params.includes('macd') || params.includes('fastSlow')) {
      fields.push(FIELD.fast, FIELD.slow);
      if (params.includes('macd')) fields.push(FIELD.signal);
    }
    if (params.includes('signal') && !params.includes('macd')) {
      fields.push({ ...FIELD.signal, label: 'Smoothing' });
    }
  }
  fields.push(FIELD.multiplier, FIELD.offset);
  return fields;
}

/** Sets a numeric key, DELETING it when cleared — absence means "use the default". */
export function setOperandNumber(
  operand: Operand,
  key: NumericKey,
  value: number | undefined,
): Operand {
  if (operand.kind === 'constant') return operand;
  const next = { ...operand } as Record<string, unknown>;
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next as unknown as Operand;
}

export function operandNumber(operand: Operand, key: NumericKey): number | undefined {
  if (operand.kind === 'constant') return undefined;
  return (operand as Record<string, unknown>)[key] as number | undefined;
}

// ── Wording (mirrors server describeOperand/describeCondition) ─────────────────────────

const DEFAULT_PERIODS: Record<IndicatorName, number> = {
  SMA: 50,
  EMA: 20,
  WMA: 20,
  DEMA: 20,
  TEMA: 20,
  RSI: 14,
  RSI_MA: 14,
  MACD: 0,
  MACD_SIGNAL: 0,
  MACD_HIST: 0,
  MFI: 14,
  MOMENTUM: 10,
  ADX: 14,
  ADX_MA: 14,
  PLUS_DI: 14,
  MINUS_DI: 14,
  SUPERTREND: 10,
  VORTEX_PLUS: 14,
  VORTEX_MINUS: 14,
  BB_UPPER: 20,
  BB_MIDDLE: 20,
  BB_LOWER: 20,
  BB_WIDTH: 20,
  ATR: 14,
  VOL_SMA: 20,
  VOL_OSC: 20,
  VWAP: 20,
  VWAP_MA: 20,
  MID: 1,
  HIGHEST_HIGH: 250,
  LOWEST_LOW: 250,
};

function indicatorBody(o: Extract<Operand, { kind: 'indicator' }>): string {
  const p = o.period ?? DEFAULT_PERIODS[o.name];
  switch (o.name) {
    case 'RSI_MA':
      return `RSI(${p}) moving average(${o.signal ?? 9})`;
    case 'MACD':
      return `MACD(${o.fast ?? 12},${o.slow ?? 26})`;
    case 'MACD_SIGNAL':
      return `MACD signal(${o.signal ?? 9})`;
    case 'MACD_HIST':
      return 'MACD histogram';
    case 'MFI':
      return `money flow index(${p})`;
    case 'MOMENTUM':
      return `momentum(${p})`;
    case 'ADX_MA':
      return `ADX(${p}) moving average(${o.signal ?? 9})`;
    case 'PLUS_DI':
      return `+DI(${p})`;
    case 'MINUS_DI':
      return `−DI(${p})`;
    case 'SUPERTREND':
      return `SuperTrend(${p},${o.stdDev ?? 3})`;
    case 'VORTEX_PLUS':
      return `VI+(${p})`;
    case 'VORTEX_MINUS':
      return `VI−(${p})`;
    case 'BB_UPPER':
      return `Bollinger upper(${p},${o.stdDev ?? 2})`;
    case 'BB_MIDDLE':
      return `Bollinger middle(${p})`;
    case 'BB_LOWER':
      return `Bollinger lower(${p},${o.stdDev ?? 2})`;
    case 'BB_WIDTH':
      return `Bollinger band width(${p})`;
    case 'VOL_SMA':
      return `average volume(${p})`;
    case 'VOL_OSC':
      return `volume oscillator(${o.fast ?? 5},${o.slow ?? p})`;
    case 'VWAP':
      return `rolling VWAP(${p})`;
    case 'VWAP_MA':
      return `rolling VWAP(${p}) moving average(${o.signal ?? 9})`;
    case 'MID':
      return 'mid price';
    case 'HIGHEST_HIGH':
      return `highest high(${p})`;
    case 'LOWEST_LOW':
      return `lowest low(${p})`;
    default:
      return `${o.name}(${p})`;
  }
}

/** Same words the server's readback uses, so a card reads like the saved rule will. */
export function describeOperand(o: Operand): string {
  if (o.kind === 'constant') return Number.isFinite(o.value) ? String(o.value) : '?';
  const mult = o.multiplier && o.multiplier !== 1 ? `${o.multiplier} × ` : '';
  const ago = o.offset ? ` ${o.offset} bar${o.offset === 1 ? '' : 's'} ago` : '';
  const body = o.kind === 'price' ? o.field : indicatorBody(o);
  return `${mult}${body}${ago}`;
}

export function describeCondition(c: Condition): string {
  return `${describeOperand(c.left)} ${COMPARATOR_LABELS[c.op]} ${describeOperand(c.right)}`;
}

/** The label the operand picker shows ("RSI", "Prev Close", "A number"). */
export function operandLabel(operand: Operand, catalog: readonly CatalogEntry[]): string {
  if (operand.kind === 'constant') return 'A number';
  const id = matchEntryId(operand, catalog);
  return catalog.find((e) => e.id === id)?.label ?? describeOperand(operand);
}

// ── Validation (mirrors strategy.dto.ts) ───────────────────────────────────────────────

function checkNumber(
  value: number | undefined,
  field: Pick<NumericField, 'integer' | 'min' | 'max'>,
  label: string,
): string | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value)) return `${label} must be a number.`;
  if (field.integer && !Number.isInteger(value)) return `${label} must be a whole number.`;
  if (value < field.min || value > field.max) {
    return `${label} must be between ${field.min} and ${field.max}.`;
  }
  return null;
}

export function validateOperand(operand: Operand, side: 'left' | 'right'): string | null {
  const sideLabel = side === 'left' ? 'left side' : 'right side';
  if (operand.kind === 'constant') {
    return Number.isFinite(operand.value) ? null : `Enter a number for the ${sideLabel}.`;
  }
  const keys: NumericKey[] =
    operand.kind === 'indicator'
      ? ['period', 'fast', 'slow', 'signal', 'stdDev', 'multiplier', 'offset']
      : ['multiplier', 'offset'];
  for (const key of keys) {
    const error = checkNumber(operandNumber(operand, key), FIELD[key], FIELD[key].label);
    if (error) return `${error.replace(/\.$/, '')} (${sideLabel}).`;
  }
  return null;
}

const PRICE_LIKE = new Set(['close', 'open', 'high', 'low']);

function isPriceLike(o: Operand): boolean {
  if (o.kind === 'price') return PRICE_LIKE.has(o.field);
  return o.kind === 'indicator' && o.name === 'MID';
}

function isExtreme(o: Operand, name: 'HIGHEST_HIGH' | 'LOWEST_LOW'): boolean {
  return o.kind === 'indicator' && o.name === name && !o.offset;
}

/** The first problem with a condition, in the server's words, or null when it is valid. */
export function validateCondition(c: Condition): string | null {
  const left = validateOperand(c.left, 'left');
  if (left) return left;
  const right = validateOperand(c.right, 'right');
  if (right) return right;
  if (c.left.kind === 'constant' && c.right.kind === 'constant') {
    return 'Both sides are numbers, so this condition has a fixed answer and is not a rule.';
  }
  if (c.op === '>' && isPriceLike(c.left) && isExtreme(c.right, 'HIGHEST_HIGH')) {
    return 'A price can never be above the highest high of a window that includes today. Set "Bars ago" to 1 or more — that is what a breakout rule means.';
  }
  if (c.op === '<' && isPriceLike(c.left) && isExtreme(c.right, 'LOWEST_LOW')) {
    return 'A price can never be below the lowest low of a window that includes today. Set "Bars ago" to 1 or more.';
  }
  return null;
}

export function hasExit(exit: StrategyRules['exit']): boolean {
  return (
    exit.any.length > 0 ||
    exit.targetPct != null ||
    exit.stopLossPct != null ||
    exit.maxHoldBars != null
  );
}

export interface StrategyFormIssues {
  name?: string;
  description?: string;
  entry?: string;
  exit?: string;
  targetPct?: string;
  stopLossPct?: string;
  maxHoldBars?: string;
  minPrice?: string;
  maxSymbols?: string;
  entryConditions: (string | null)[];
  exitConditions: (string | null)[];
}

function nameIssue(name: string, noun: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed.length === 0) return `Give the ${noun} a name.`;
  if (trimmed.length > 80) return 'Keep the name to 80 characters or fewer.';
  return undefined;
}

function listIssue(conditions: readonly Condition[], required: boolean, empty: string) {
  if (required && conditions.length === 0) return empty;
  if (conditions.length > MAX_CONDITIONS) return `At most ${MAX_CONDITIONS} conditions.`;
  return undefined;
}

export function validateStrategyForm(input: {
  name: string;
  description: string;
  rules: StrategyRules;
}): { valid: boolean; issues: StrategyFormIssues } {
  const { rules } = input;
  const issues: StrategyFormIssues = {
    name: nameIssue(input.name, 'strategy'),
    description:
      input.description.trim().length > 500 ? 'Keep the note to 500 characters.' : undefined,
    entry: listIssue(
      rules.entry.all,
      true,
      'Add at least one entry condition — an empty list would match every bar of every stock.',
    ),
    exit: hasExit(rules.exit)
      ? listIssue(rules.exit.any, false, '')
      : 'Set at least one exit — a target, a stop, a time stop or an exit condition. Without one every trade stays open to the end of the data.',
    targetPct:
      checkNumber(rules.exit.targetPct, { integer: false, min: 0.1, max: 500 }, 'Target') ??
      undefined,
    stopLossPct:
      checkNumber(rules.exit.stopLossPct, { integer: false, min: 0.1, max: 99 }, 'Stop loss') ??
      undefined,
    maxHoldBars:
      checkNumber(rules.exit.maxHoldBars, { integer: true, min: 1, max: 400 }, 'Time stop') ??
      undefined,
    minPrice:
      checkNumber(
        rules.universe.minPrice,
        { integer: false, min: 0, max: 1_000_000 },
        'Min price',
      ) ?? undefined,
    maxSymbols:
      checkNumber(
        rules.universe.maxSymbols,
        { integer: true, min: 1, max: 10_000 },
        'Max symbols',
      ) ?? undefined,
    entryConditions: rules.entry.all.map(validateCondition),
    exitConditions: rules.exit.any.map(validateCondition),
  };
  const { entryConditions, exitConditions, ...scalar } = issues;
  const valid =
    Object.values(scalar).every((issue) => !issue) &&
    entryConditions.every((issue) => issue === null) &&
    exitConditions.every((issue) => issue === null);
  return { valid, issues };
}

export interface ScreenerFormIssues {
  name?: string;
  description?: string;
  conditions?: string;
  minPrice?: string;
  conditionIssues: (string | null)[];
}

export function validateScreenerForm(input: {
  name: string;
  description: string;
  conditions: readonly Condition[];
  minPrice: number | null;
}): { valid: boolean; issues: ScreenerFormIssues } {
  const issues: ScreenerFormIssues = {
    name: nameIssue(input.name, 'screener'),
    description:
      input.description.trim().length > 500 ? 'Keep the note to 500 characters.' : undefined,
    conditions: listIssue(
      input.conditions,
      true,
      'Add at least one condition — an empty list holds for every stock, which is not a screen.',
    ),
    minPrice:
      checkNumber(
        input.minPrice ?? undefined,
        { integer: false, min: 0, max: 1_000_000 },
        'Min price',
      ) ?? undefined,
    conditionIssues: input.conditions.map(validateCondition),
  };
  const { conditionIssues, ...scalar } = issues;
  const valid =
    Object.values(scalar).every((issue) => !issue) &&
    conditionIssues.every((issue) => issue === null);
  return { valid, issues };
}

/** Sets or deletes an optional numeric key — the DSL spells "not set" as absence. */
export function withOptional<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  value: T[K] | undefined,
): T {
  const next = { ...obj };
  if (value === undefined || value === null) delete next[key];
  else next[key] = value;
  return next;
}

/** The server's bounds on backtest settings (strategy.routes.yaml BacktestSettings). */
export const SETTINGS_BOUNDS = {
  costBps: { min: 0, max: 100 },
  maxOpenPositions: { min: 1, max: 50 },
} as const;

export function settingsIssues(settings: {
  costBps: number;
  maxOpenPositions: number;
}): Partial<Record<'costBps' | 'maxOpenPositions', string>> {
  const issues: Partial<Record<'costBps' | 'maxOpenPositions', string>> = {};
  const { costBps, maxOpenPositions } = SETTINGS_BOUNDS;
  if (
    !Number.isFinite(settings.costBps) ||
    settings.costBps < costBps.min ||
    settings.costBps > costBps.max
  ) {
    issues.costBps = `Between ${costBps.min} and ${costBps.max}`;
  }
  if (
    !Number.isInteger(settings.maxOpenPositions) ||
    settings.maxOpenPositions < maxOpenPositions.min ||
    settings.maxOpenPositions > maxOpenPositions.max
  ) {
    issues.maxOpenPositions = `A whole number, ${maxOpenPositions.min}–${maxOpenPositions.max}`;
  }
  return issues;
}
