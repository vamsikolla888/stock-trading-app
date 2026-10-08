import { formatNumber } from '@/lib/utils/formatters';

import type { BotMode, BotNumberKey, BotNumbers, BotSettings } from '../types';

/**
 * The bot's editable caps, mirrored from the server's zod schema for PUT /ai-autotrade/settings
 * (ai-autotrade.routes.ts `settingsInput`) — the same ranges and integer rules, so a value the
 * server would refuse is caught under its field before Save. The server stays the authority: its
 * own field errors are shown under the same fields.
 */

export interface SettingField {
  key: BotNumberKey;
  label: string;
  unit: string;
  hint: string;
  min: number;
  max: number;
  integer: boolean;
}

/** Hard caps the AI cannot change — the most a single entry and a day may risk. */
export const RISK_FIELDS: readonly SettingField[] = [
  {
    key: 'maxLots',
    label: 'Lots per entry',
    unit: 'lots',
    hint: 'One liquid option contract at a time.',
    min: 1,
    max: 5,
    integer: true,
  },
  {
    key: 'maxPremium',
    label: 'Premium ceiling',
    unit: '₹',
    hint: 'Most premium paid for one entry.',
    min: 1_000,
    max: 100_000,
    integer: true,
  },
  {
    key: 'maxStopLossPct',
    label: 'Maximum stop loss',
    unit: '%',
    hint: 'Premium a stop may lose per trade. The server never accepts more than 10%.',
    min: 5,
    max: 10,
    integer: false,
  },
  {
    key: 'maxRiskPerTrade',
    label: 'Stop-risk ceiling',
    unit: '₹',
    hint: 'Premium loss before fees; fees are checked separately.',
    min: 100,
    max: 10_000,
    integer: true,
  },
  {
    key: 'maxDailyLoss',
    label: 'Daily loss limit',
    unit: '₹',
    hint: 'No new entry when what is left cannot cover the stop.',
    min: 100,
    max: 25_000,
    integer: true,
  },
  {
    key: 'maxTradesPerDay',
    label: 'Daily trade limit',
    unit: 'trades',
    hint: 'An upper bound, not a target.',
    min: 1,
    max: 10,
    integer: true,
  },
];

/** What the evidence must show before a scan may trade — missing or weak evidence means HOLD. */
export const SIGNAL_FIELDS: readonly SettingField[] = [
  {
    key: 'cadenceMinutes',
    label: 'Analysis cadence',
    unit: 'min',
    hint: 'Fresh market snapshots, analysed while the entry window is open.',
    min: 5,
    max: 60,
    integer: true,
  },
  {
    key: 'minFutureMovePct',
    label: 'Minimum futures move',
    unit: '%',
    hint: 'Absolute session move required.',
    min: 0.1,
    max: 5,
    integer: false,
  },
  {
    key: 'minFutureVolume',
    label: 'Minimum futures volume',
    unit: 'units',
    hint: 'Rejects inactive index futures.',
    min: 100,
    max: 1_000_000,
    integer: true,
  },
  {
    key: 'minOptionVolume',
    label: 'Minimum option volume',
    unit: 'units',
    hint: 'Rejects illiquid contracts.',
    min: 100,
    max: 1_000_000,
    integer: true,
  },
  {
    key: 'minRewardRisk',
    label: 'Minimum reward / risk',
    unit: '×',
    hint: 'Target distance divided by stop distance.',
    min: 1.2,
    max: 5,
    integer: false,
  },
  {
    key: 'minNetTarget',
    label: 'Net target floor',
    unit: '₹',
    hint: 'Profit target after estimated Groww charges.',
    min: 20,
    max: 10_000,
    integer: true,
  },
  {
    key: 'minBacktestSamples',
    label: 'Minimum history samples',
    unit: 'windows',
    hint: 'Non-overlapping one-hour option trials.',
    min: 30,
    max: 500,
    integer: true,
  },
  {
    key: 'minProbabilityEdge',
    label: 'Conservative edge',
    unit: 'fraction',
    hint: 'Wilson lower bound above cost break-even (0.05 = 5 points).',
    min: 0,
    max: 0.25,
    integer: false,
  },
];

export const ALL_FIELDS: readonly SettingField[] = [...RISK_FIELDS, ...SIGNAL_FIELDS];

/** The text a field's input holds, per key — typed freely, parsed on validation. */
export type DraftTexts = Record<BotNumberKey, string>;

export interface SettingsDraft {
  enabled: boolean;
  texts: DraftTexts;
}

/** A saved number as its input text: no grouping, no trailing zeros ("0.05", "10000"). */
export function numberText(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(6))) : '';
}

export function draftFrom(settings: BotSettings): SettingsDraft {
  const texts = Object.fromEntries(
    ALL_FIELDS.map((f) => [f.key, numberText(settings[f.key])]),
  ) as DraftTexts;
  return { enabled: settings.enabled, texts };
}

/** 100000 → "1,00,000", 0.1 → "0.1": grouped, without padding zeros. */
const bound = (n: number) => {
  const digits = Number.isInteger(n) ? 0 : n < 1 ? 2 : 1;
  return formatNumber(n, digits)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
};

export const rangeText = (f: SettingField) => `${bound(f.min)}–${bound(f.max)}`;

/** One field's text as a number, or the reason it cannot be saved. */
export function parseField(
  field: SettingField,
  raw: string,
): { value: number; error: null } | { value: null; error: string } {
  const cleaned = raw.replace(/[,\s₹%×]/g, '');
  if (cleaned === '') return { value: null, error: 'Required' };
  // Number('') and Number('1e3') are both "numbers"; only plain decimals are accepted.
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(cleaned)) return { value: null, error: 'Enter a number' };
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { value: null, error: 'Enter a number' };
  if (field.integer && !Number.isInteger(value)) {
    return { value: null, error: 'A whole number' };
  }
  if (value < field.min || value > field.max) {
    return { value: null, error: `Between ${rangeText(field)}` };
  }
  return { value, error: null };
}

export type DraftErrors = Partial<Record<BotNumberKey, string>>;

/**
 * The draft's errors and, when there are none, the exact body the server's strict schema takes:
 * `enabled` plus every number, and never `mode` (live is entered only by deploying).
 */
export function validateDraft(draft: SettingsDraft): {
  errors: DraftErrors;
  body: ({ enabled: boolean } & BotNumbers) | null;
} {
  const errors: DraftErrors = {};
  const numbers: Partial<BotNumbers> = {};
  for (const field of ALL_FIELDS) {
    const parsed = parseField(field, draft.texts[field.key] ?? '');
    if (parsed.value === null) errors[field.key] = parsed.error;
    else numbers[field.key] = parsed.value;
  }
  if (Object.keys(errors).length > 0) return { errors, body: null };
  return { errors, body: { enabled: draft.enabled, ...(numbers as BotNumbers) } };
}

/** Whether the draft differs from what the server holds (by parsed value, not by text). */
export function isDirty(draft: SettingsDraft, saved: BotSettings): boolean {
  if (draft.enabled !== saved.enabled) return true;
  return ALL_FIELDS.some((field) => {
    const parsed = parseField(field, draft.texts[field.key] ?? '');
    return parsed.value == null || parsed.value !== saved[field.key];
  });
}

/**
 * The draft after the server's settings changed underneath it (a save landed, the bot was stopped
 * elsewhere): every field the person has not touched follows the server, every field they edited
 * keeps their value. Above all the switch follows the server unless it was flipped here — a stop
 * made elsewhere must never be undone by saving an unrelated cap.
 */
export function rebaseDraft(
  draft: SettingsDraft,
  base: BotSettings,
  next: BotSettings,
): SettingsDraft {
  const texts = { ...draft.texts };
  for (const field of ALL_FIELDS) {
    const parsed = parseField(field, draft.texts[field.key] ?? '');
    const untouched = parsed.value != null && parsed.value === base[field.key];
    if (untouched) texts[field.key] = numberText(next[field.key]);
  }
  return { enabled: draft.enabled === base.enabled ? next.enabled : draft.enabled, texts };
}

/** What saving would arm, in words for the confirmation — or null when it arms nothing new. */
export function armWarning(
  draft: Pick<SettingsDraft, 'enabled'>,
  saved: Pick<BotSettings, 'enabled'>,
  mode: BotMode,
): { title: string; message: string } | null {
  if (!draft.enabled || saved.enabled) return null;
  return mode === 'live'
    ? {
        title: 'Arm live entries?',
        message:
          'The bot may place real Groww index-option orders with broker-side OCO protection. Safe Mode, the live master switch, the kill switch and the risk limits still apply.',
      }
    : {
        title: 'Arm paper entries?',
        message:
          'The bot may place simulated index-option orders in your paper F&O book during market hours.',
      };
}

/** A server field error (`field` from the zod issue path) mapped onto the draft's fields. */
export function serverFieldErrors(fieldErrors: Record<string, string> | undefined): DraftErrors {
  const out: DraftErrors = {};
  if (!fieldErrors) return out;
  for (const field of ALL_FIELDS) {
    const message = fieldErrors[field.key];
    if (message) out[field.key] = message;
  }
  return out;
}

/* ── deploy to live ── */

/**
 * Whether "Deploy to live" may go ahead — the server's deployCheck (ai-autotrade.mode.ts), with
 * the typed phrase compared the way the server compares it (trimmed, upper-cased).
 */
export function deployCheck(input: {
  mode: BotMode;
  liveAvailable: boolean;
  aiConfigured: boolean;
  /** The server's build-time paper lock (readiness.paperOnly). */
  paperOnly?: boolean;
  phrase: string | null;
  typed: string;
}): { ok: true } | { ok: false; reason: string } {
  if (input.paperOnly) {
    return { ok: false, reason: 'Index trading is locked to paper trading on this server.' };
  }
  if (input.mode === 'live') return { ok: false, reason: 'The bot is already deployed to live.' };
  if (!input.aiConfigured) {
    return { ok: false, reason: 'The AI service connection is not configured.' };
  }
  if (!input.liveAvailable) {
    return {
      ok: false,
      reason: 'Turn on the platform Live trading master switch first (Admin › Trading controls).',
    };
  }
  if (!input.phrase) {
    return { ok: false, reason: 'Deploying needs a newer server version.' };
  }
  if (input.typed.trim().toUpperCase() !== input.phrase.toUpperCase()) {
    return { ok: false, reason: `Type ${input.phrase} to confirm real Groww orders.` };
  }
  return { ok: true };
}

/** Whether the deploy flow may even open: everything but the typed phrase. */
export function canStartDeploy(input: {
  mode: BotMode;
  liveAvailable: boolean;
  aiConfigured: boolean;
  paperOnly?: boolean;
  phrase: string | null;
}): { ok: true } | { ok: false; reason: string } {
  return deployCheck({ ...input, typed: input.phrase ?? '' });
}

/** Under 20 closed trades the paper results are a small sample — said, not hidden. */
export function sampleNote(closed: number): string | null {
  return closed < 20 ? 'small sample' : null;
}
