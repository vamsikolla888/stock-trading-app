import type { StatusTone } from '@/features/settings/lib/status';

import type {
  BrowserResearchConfig,
  BrowserResearchGuardrails,
  BrowserResearchRun,
  BrowserResearchScheduleMode,
  BrowserResearchStatus,
} from '../types';
import { isCronShape } from './jobs';

// Browser research (web: AdminConsole → Browser research). The validation mirrors the
// server's configSchema (browser-research.routes.ts) so a bad value is caught on the phone
// with a useful message, not bounced back as a generic 400.

/** The server's domain rule: dotted labels, a 2+ letter TLD, no scheme or path. */
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
export const MAX_DOMAINS = 30;
const MAX_CRON_LENGTH = 100;

export const LIMIT_RULES = {
  maxPagesPerStock: { label: 'Pages per stock', min: 1, max: 20 },
  maxPagesPerRun: { label: 'Pages per run', min: 1, max: 100 },
  requestTimeoutMs: { label: 'Page timeout (ms)', min: 5_000, max: 120_000 },
  navigationDelayMs: { label: 'Delay between pages (ms)', min: 0, max: 10_000 },
} as const;

export type LimitKey = keyof typeof LIMIT_RULES;
export const LIMIT_KEYS = Object.keys(LIMIT_RULES) as LimitKey[];

export const SCHEDULE_MODES: readonly { key: BrowserResearchScheduleMode; label: string }[] = [
  { key: 'manual', label: 'Manual only' },
  { key: 'pre-market', label: 'Pre-market' },
  { key: 'post-market', label: 'Post-market' },
  { key: 'custom', label: 'Custom cron' },
];

export const CONNECTION_STATUS: Record<BrowserResearchStatus, { tone: StatusTone; label: string }> =
  {
    connected: { tone: 'ok', label: 'Connected' },
    pairing: { tone: 'warn', label: 'Waiting to pair' },
    error: { tone: 'bad', label: 'Error' },
    disconnected: { tone: 'neutral', label: 'Disconnected' },
  };

export const RUN_OUTCOME: Record<
  BrowserResearchRun['outcome'],
  { tone: StatusTone; label: string }
> = {
  success: { tone: 'ok', label: 'Success' },
  limited: { tone: 'warn', label: 'Limited' },
  failed: { tone: 'bad', label: 'Failed' },
};

/** The form as typed: free text, validated only on save. */
export interface GuardrailsDraft {
  domains: string;
  limits: Record<LimitKey, string>;
  mode: BrowserResearchScheduleMode;
  cron: string;
}

export type GuardrailsField = 'domains' | 'cron' | LimitKey;

export function draftFromConfig(config: BrowserResearchGuardrails): GuardrailsDraft {
  return {
    domains: config.allowedDomains.join('\n'),
    limits: {
      maxPagesPerStock: String(config.limits.maxPagesPerStock),
      maxPagesPerRun: String(config.limits.maxPagesPerRun),
      requestTimeoutMs: String(config.limits.requestTimeoutMs),
      navigationDelayMs: String(config.limits.navigationDelayMs),
    },
    mode: config.schedule.mode,
    cron: config.schedule.cron ?? '',
  };
}

/**
 * One domain per line (commas and spaces also split). A pasted URL is reduced to its host —
 * "https://www.nseindia.com/market/" → "www.nseindia.com" — and duplicates are dropped.
 */
export function parseDomains(text: string): string[] {
  const hosts = text
    .split(/[\s,]+/)
    .map((entry) =>
      entry
        .trim()
        .toLowerCase()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
        .replace(/[/?#].*$/, '')
        .replace(/:\d+$/, '')
        .replace(/\.$/, ''),
    )
    .filter(Boolean);
  return [...new Set(hosts)];
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN_PATTERN.test(domain);
}

export interface GuardrailsResult {
  payload: BrowserResearchGuardrails | null;
  errors: Partial<Record<GuardrailsField, string>>;
}

function parseLimit(key: LimitKey, raw: string): { value: number | null; error?: string } {
  const rule = LIMIT_RULES[key];
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return { value: null, error: 'Enter a whole number' };
  const value = Number(text);
  if (value < rule.min || value > rule.max) {
    return {
      value: null,
      error: `Between ${rule.min.toLocaleString('en-IN')} and ${rule.max.toLocaleString('en-IN')}`,
    };
  }
  return { value };
}

/** Checks the draft against the server's rules; returns the PUT body only when it all passes. */
export function validateGuardrails(draft: GuardrailsDraft): GuardrailsResult {
  const errors: GuardrailsResult['errors'] = {};

  const domains = parseDomains(draft.domains);
  const invalid = domains.find((domain) => !isValidDomain(domain));
  if (domains.length === 0) errors.domains = 'Add at least one domain';
  else if (invalid) errors.domains = `“${invalid}” isn’t a domain like example.com`;
  else if (domains.length > MAX_DOMAINS) errors.domains = `At most ${MAX_DOMAINS} domains`;

  const limits = {} as Record<LimitKey, number>;
  for (const key of LIMIT_KEYS) {
    const parsed = parseLimit(key, draft.limits[key]);
    if (parsed.error) errors[key] = parsed.error;
    else if (parsed.value !== null) limits[key] = parsed.value;
  }

  const cron = draft.cron.trim();
  if (draft.mode === 'custom') {
    if (!cron) errors.cron = 'A custom schedule needs a cron expression';
    else if (cron.length > MAX_CRON_LENGTH || !isCronShape(cron))
      errors.cron = 'Five fields: minute hour day month weekday';
  }

  if (Object.keys(errors).length > 0) return { payload: null, errors };
  return {
    payload: {
      allowedDomains: domains,
      limits,
      schedule: { mode: draft.mode, cron: draft.mode === 'custom' ? cron : null },
    },
    errors,
  };
}

/** What "Connect Chrome" does to a live connection, for its confirmation. */
export function pairingWarning(config: Pick<BrowserResearchConfig, 'tokenConfigured'>): string {
  return config.tokenConfigured
    ? 'A new code replaces any unused one. The browser paired now keeps working until another one pairs with this code, or you revoke it.'
    : 'The code is valid for 10 minutes. Enter it in the Chrome extension to pair.';
}

export interface ResearchSummary {
  runs: number;
  succeeded: number;
  pages: number;
}

/** The headline numbers over the recent runs the server keeps (web: Browser research KPIs). */
export function researchSummary(
  runs: readonly Pick<BrowserResearchRun, 'outcome' | 'pagesVisited'>[],
): ResearchSummary {
  return {
    runs: runs.length,
    succeeded: runs.filter((run) => run.outcome === 'success').length,
    pages: runs.reduce((sum, run) => sum + Math.max(0, run.pagesVisited || 0), 0),
  };
}
