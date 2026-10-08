import type { BrokerCatalogEntry, BrokerConnectionSummary } from '@/features/trading/types';
import { formatINR, formatSignedINR } from '@/lib/utils/formatters';

import type { StatusTone } from './status';
import { formatDate, formatDateTime } from './time';

/**
 * Settings › Preferences' layout and wording decisions, ported from the web's
 * features/settings/lib/preferences.ts and kept pure so the rules are pinned by tests: unknown is
 * never green, an old `?section=` link still lands somewhere, and every panel appears exactly
 * once whatever the window width.
 */

export type PrefPanelId =
  | 'account'
  | 'safeguards'
  | 'connections'
  | 'paper'
  | 'fno-wallet'
  | 'notifications'
  | 'appearance'
  | 'about';

/** The reading order on a phone: who you are, what guards your orders, then the rest. */
export const PREF_PANELS: readonly PrefPanelId[] = [
  'account',
  'safeguards',
  'connections',
  'paper',
  'fno-wallet',
  'notifications',
  'appearance',
  'about',
];

/**
 * Which panels go in which column, per column count. The panels differ a lot in height (the
 * safeguards panel is twice a wallet summary), so a plain grid would leave holes under the short
 * ones; explicit columns keep each roughly the same height, in an order that still reads
 * top-left first. On three columns the two paper wallets share a column so they read together.
 */
export const PANEL_LAYOUT: Record<1 | 2 | 3, readonly (readonly PrefPanelId[])[]> = {
  1: [PREF_PANELS],
  2: [
    ['account', 'connections', 'paper', 'appearance'],
    ['safeguards', 'notifications', 'fno-wallet', 'about'],
  ],
  3: [
    ['account', 'connections', 'about'],
    ['safeguards', 'appearance'],
    ['paper', 'fno-wallet', 'notifications'],
  ],
};

/** The panel columns for the screen's column count (useScreenLayout().columns). */
export function prefLayout(columns: number): readonly (readonly PrefPanelId[])[] {
  return PANEL_LAYOUT[columns >= 3 ? 3 : columns >= 2 ? 2 : 1];
}

/** Agents › Index trading, Controls tab — where the index bot's switch lives now. */
export const INDEX_BOT_CONTROLS = {
  pathname: '/agents/index-trading',
  params: { tab: 'controls' },
} as const;

export type SectionTarget = { panel: PrefPanelId } | { redirect: typeof INDEX_BOT_CONTROLS } | null;

/**
 * Where a `/settings?section=` deep link lands. The old Settings page had one section per tab;
 * those ids are still linked from the paper screens, F&O and the agent docs, so each maps to the
 * panel that now holds it. The index bot is an agent now, so `automation` redirects to its
 * Controls tab instead of naming a panel. Anything else is no target (the page opens at the top).
 */
export function sectionTarget(param: string | readonly string[] | null | undefined): SectionTarget {
  const raw = Array.isArray(param) ? param[0] : param;
  switch (typeof raw === 'string' ? raw.trim() : null) {
    case 'paper':
      return { panel: 'paper' };
    case 'fno-wallet':
      return { panel: 'fno-wallet' };
    case 'connections':
      return { panel: 'connections' };
    case 'notifications':
      return { panel: 'notifications' };
    case 'workspace':
    case 'appearance':
      return { panel: 'appearance' };
    case 'safeguards':
      return { panel: 'safeguards' };
    case 'account':
      return { panel: 'account' };
    case 'about':
      return { panel: 'about' };
    case 'automation':
      return { redirect: INDEX_BOT_CONTROLS };
    default:
      return null;
  }
}

export interface LiveOrderState {
  allowed: boolean;
  reason: string;
}

/**
 * Can a real order go out for this user right now, and if not, which switch says no — the kill
 * switch first, then the platform's live switch, then the user's own Safe Mode. Unknown (any
 * input still loading or unread) is null: the screen shows a dash, never a guessed "Allowed".
 */
export function liveOrderState(input: {
  platformOn: boolean | undefined;
  killEngaged: boolean | undefined;
  safeMode: boolean | undefined;
}): LiveOrderState | null {
  const { platformOn, killEngaged, safeMode } = input;
  if (platformOn == null || killEngaged == null || safeMode == null) return null;
  if (killEngaged) return { allowed: false, reason: 'the platform kill switch is engaged' };
  if (!platformOn) return { allowed: false, reason: 'live trading is off for the platform' };
  if (safeMode) return { allowed: false, reason: 'your Safe Mode is on' };
  return { allowed: true, reason: 'every switch is clear' };
}

export type NotificationWord = 'Unavailable' | 'On' | 'Blocked' | 'Off';

/** This device's push state, in one word. `permission` is the OS's answer, null while unread. */
export function notificationWord(input: {
  supported: boolean;
  enabledHere: boolean;
  permission: string | null;
}): NotificationWord {
  if (!input.supported) return 'Unavailable';
  if (input.enabledHere) return 'On';
  if (input.permission === 'denied') return 'Blocked';
  return 'Off';
}

export const NOTIFICATION_TONE: Record<NotificationWord, StatusTone> = {
  On: 'ok',
  Blocked: 'warn',
  Off: 'neutral',
  Unavailable: 'neutral',
};

/** What a push test did, in words (POST /notifications/test). */
export function pushTestMessage(result: { deliveredTo: number; failed: number }): string {
  if (result.deliveredTo > 0) {
    return `Test sent to ${result.deliveredTo} device${result.deliveredTo === 1 ? '' : 's'}.`;
  }
  if (result.failed > 0) {
    return 'The push provider rejected the test — check the server configuration.';
  }
  return 'No active device to send a test to.';
}

/** The `userAgent` this phone registers its push token under — shown in the device list. */
export function pushDeviceLabel(input: {
  appName: string;
  os: string;
  osVersion: string | number | null | undefined;
  model: string | null | undefined;
}): string {
  const os = input.os === 'android' ? 'Android' : input.os === 'ios' ? 'iOS' : input.os;
  const parts = [
    `${input.appName} app`,
    input.osVersion != null && String(input.osVersion).trim()
      ? `${os} ${String(input.osVersion).trim()}`
      : os,
    input.model?.trim() || null,
  ].filter(Boolean);
  // The server caps it at 500 characters.
  return parts.join(' · ').slice(0, 500);
}

/** A broker's display name: the catalog's label, else the known spelling, else its id. */
export function brokerLabel(
  id: string,
  catalog: readonly BrokerCatalogEntry[] | undefined,
): string {
  return (
    catalog?.find((broker) => broker.id === id)?.label ??
    (id === 'mstock' ? 'mStock' : id === 'groww' ? 'Groww' : id)
  );
}

export interface BrokerRow {
  id: string;
  label: string;
  connection: BrokerConnectionSummary | undefined;
}

/**
 * One row per broker the catalog offers, plus any connection the catalog no longer lists (so a
 * retired broker's live session is still visible). Before the catalog loads, mStock stands in.
 */
export function brokerRows(
  connections: readonly BrokerConnectionSummary[] | undefined,
  catalog: readonly BrokerCatalogEntry[] | undefined,
): BrokerRow[] {
  const list = connections ?? [];
  const ids = [
    ...(catalog?.map((broker) => broker.id) ?? ['mstock']),
    ...list.map((connection) => connection.broker),
  ];
  return [...new Set(ids)].map((id) => ({
    id,
    label: brokerLabel(id, catalog),
    connection: list.find((connection) => connection.broker === id),
  }));
}

export interface ConnectionState {
  tone: StatusTone;
  word: string;
  detail: string;
}

/** A broker connection as a status word and one line of detail. */
export function connectionState(connection: BrokerConnectionSummary | undefined): ConnectionState {
  if (!connection) {
    return {
      tone: 'neutral',
      word: 'Not connected',
      detail: '',
    };
  }
  switch (connection.status) {
    case 'connected': {
      const detail = [
        connection.accountLabel?.trim() || null,
        connection.expiresAt ? `session until ${formatDateTime(connection.expiresAt)}` : null,
        connection.autoRefresh ? 'renews daily' : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return { tone: 'ok', word: 'Connected', detail: detail || 'Ready' };
    }
    case 'pending_verification':
      return {
        tone: 'warn',
        word: 'Verify',
        detail: 'Enter the verification code.',
      };
    case 'error':
      return {
        tone: 'bad',
        word: 'Needs attention',
        detail: connection.lastError?.trim() || 'Last connection attempt failed.',
      };
    default:
      // A lapsed session reports 'disconnected' — the brokers screen calls it the same.
      return {
        tone: 'warn',
        word: 'Session expired',
        detail: 'Reconnect to resume.',
      };
  }
}

export interface GlanceTile {
  panel: PrefPanelId;
  label: string;
  value: string;
  sub: string;
  status?: StatusTone;
}

/**
 * The four statuses worth knowing at a glance, each a tap from the panel that explains it.
 * Undefined means not known yet: a dash and "Checking…" (or "Couldn’t be checked" once the read
 * failed), never a guess.
 */
export function glanceTiles(input: {
  connections: readonly BrokerConnectionSummary[] | undefined;
  connectionsFailed: boolean;
  catalog: readonly BrokerCatalogEntry[] | undefined;
  orders: LiveOrderState | null;
  ordersFailed: boolean;
  safeMode: { enabled: boolean | undefined; failed: boolean; unsupported: boolean };
  notification: NotificationWord;
  devices: number | null;
}): GlanceTile[] {
  const list = input.connections;
  const connected = (list ?? []).filter((connection) => connection.status === 'connected');
  const attention = (list ?? []).filter(
    (connection) =>
      connection.status !== 'connected' && connection.status !== 'pending_verification',
  );
  const names = (rows: readonly BrokerConnectionSummary[]) =>
    rows.map((connection) => brokerLabel(connection.broker, input.catalog)).join(' · ');
  const unknown = (failed: boolean) => (failed ? 'Couldn’t be checked' : 'Checking…');

  const brokers: GlanceTile = !list
    ? { panel: 'connections', label: 'Brokers', value: '—', sub: unknown(input.connectionsFailed) }
    : {
        panel: 'connections',
        label: 'Brokers',
        value: connected.length > 0 ? `${connected.length} connected` : 'None',
        status: attention.length > 0 ? 'warn' : connected.length > 0 ? 'ok' : 'neutral',
        sub:
          attention.length > 0
            ? `${names(attention)} needs attention`
            : connected.length > 0
              ? names(connected)
              : 'Paper trading works without one',
      };

  const orders: GlanceTile = {
    panel: 'safeguards',
    label: 'Real orders',
    value: input.orders ? (input.orders.allowed ? 'Allowed' : 'Blocked') : '—',
    status: input.orders ? (input.orders.allowed ? 'ok' : 'warn') : undefined,
    sub: input.orders
      ? input.orders.allowed
        ? 'Every switch is clear'
        : `Because ${input.orders.reason}`
      : unknown(input.ordersFailed),
  };

  const { enabled, failed, unsupported } = input.safeMode;
  const safe: GlanceTile = {
    panel: 'safeguards',
    label: 'Safe Mode',
    value: unsupported || enabled == null ? '—' : enabled ? 'On' : 'Off',
    status: !unsupported && enabled ? 'ok' : undefined,
    sub: unsupported
      ? 'Needs a newer server'
      : enabled == null
        ? unknown(failed)
        : enabled
          ? 'Your real orders are refused'
          : 'Real orders allowed',
  };

  const notifications: GlanceTile = {
    panel: 'notifications',
    label: 'Notifications',
    value: input.notification,
    status:
      input.notification === 'On' ? 'ok' : input.notification === 'Blocked' ? 'warn' : undefined,
    sub:
      input.devices != null
        ? `${input.devices} device${input.devices === 1 ? '' : 's'} registered`
        : 'This phone',
  };

  return [brokers, orders, safe, notifications];
}

/** A paper wallet's three headline figures — the cash wallet's or the F&O sandbox's. */
export function walletFigures(wallet: {
  capital: number;
  cash: number;
  availableCash: number;
}): { label: string; value: string }[] {
  return [
    { label: 'Wallet', value: formatINR(wallet.capital, 0) },
    { label: 'Cash', value: formatINR(wallet.cash, 0) },
    {
      label: 'Free cash',
      value: formatINR(
        Number.isFinite(wallet.availableCash) ? Math.max(0, wallet.availableCash) : null,
        0,
      ),
    },
  ];
}

/**
 * The wallet's history in a sentence: what it started at and what was added since, and when the
 * old delivery/intraday pools were merged into it. Null when there is nothing to say.
 */
export function walletNote(wallet: {
  openingCapital: number;
  capitalAdded: number;
  resetAt: string | null;
  mergedAt?: string | null;
}): string | null {
  const parts: string[] = [];
  if (Number.isFinite(wallet.capitalAdded) && wallet.capitalAdded !== 0) {
    parts.push(
      `Started at ${formatINR(wallet.openingCapital, 0)}; ${formatSignedINR(wallet.capitalAdded, 0)} added since ${wallet.resetAt ? 'the last reset' : 'it opened'}.`,
    );
  }
  const merged = wallet.mergedAt ? formatDate(wallet.mergedAt) : null;
  if (merged && merged !== '—') {
    parts.push(
      `The separate delivery and intraday wallets were combined into this one on ${merged}.`,
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}
