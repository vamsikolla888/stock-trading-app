import type { BrokerCatalogEntry, BrokerConnectionSummary } from '@/features/trading/types';

import {
  brokerLabel,
  brokerRows,
  connectionState,
  glanceTiles,
  INDEX_BOT_CONTROLS,
  liveOrderState,
  notificationWord,
  PANEL_LAYOUT,
  PREF_PANELS,
  prefLayout,
  pushDeviceLabel,
  pushTestMessage,
  sectionTarget,
  walletFigures,
  walletNote,
} from '../lib/preferences';

function connection(
  broker: string,
  status: BrokerConnectionSummary['status'],
  extra: Partial<BrokerConnectionSummary> = {},
): BrokerConnectionSummary {
  return {
    broker,
    mfaMethod: 'otp' as BrokerConnectionSummary['mfaMethod'],
    status,
    connectedAt: null,
    expiresAt: null,
    lastError: null,
    ...extra,
  };
}

function catalogEntry(id: string, label: string): BrokerCatalogEntry {
  return {
    id,
    label,
    auth: 'api-key-totp',
    capabilities: { portfolio: true, orderHistory: true, liveTrading: true, marketData: true },
    sessionNote: '',
    docsUrl: '',
  };
}

const CATALOG = [catalogEntry('mstock', 'mStock'), catalogEntry('groww', 'Groww')];

describe('PANEL_LAYOUT / prefLayout', () => {
  it('lays every panel out exactly once at every column count', () => {
    const all = [...PREF_PANELS].sort();
    for (const n of [1, 2, 3] as const) {
      expect(PANEL_LAYOUT[n]).toHaveLength(n);
      expect(PANEL_LAYOUT[n].flat().sort()).toEqual(all);
    }
    expect(all).toHaveLength(8);
  });

  it('reads top-left first: account, then safeguards beside it once there is room', () => {
    expect(PANEL_LAYOUT[1][0]).toEqual(PREF_PANELS);
    expect(PANEL_LAYOUT[2].map((column) => column[0])).toEqual(['account', 'safeguards']);
    expect(PANEL_LAYOUT[3][0]?.[0]).toBe('account');
    expect(PANEL_LAYOUT[3][1]?.[0]).toBe('safeguards');
  });

  it('keeps the two paper wallets in one column on a wide window', () => {
    const column = PANEL_LAYOUT[3].find((c) => c.includes('paper'));
    expect(column).toContain('fno-wallet');
  });

  it('maps the screen column count, clamping anything odd', () => {
    expect(prefLayout(1)).toBe(PANEL_LAYOUT[1]);
    expect(prefLayout(2)).toBe(PANEL_LAYOUT[2]);
    expect(prefLayout(3)).toBe(PANEL_LAYOUT[3]);
    expect(prefLayout(0)).toBe(PANEL_LAYOUT[1]);
    expect(prefLayout(6)).toBe(PANEL_LAYOUT[3]);
  });
});

describe('sectionTarget', () => {
  it('lands the old ?section= links on the panel that holds them now', () => {
    expect(sectionTarget('paper')).toEqual({ panel: 'paper' });
    expect(sectionTarget('fno-wallet')).toEqual({ panel: 'fno-wallet' });
    expect(sectionTarget('connections')).toEqual({ panel: 'connections' });
    expect(sectionTarget('notifications')).toEqual({ panel: 'notifications' });
    expect(sectionTarget('workspace')).toEqual({ panel: 'appearance' });
    expect(sectionTarget('appearance')).toEqual({ panel: 'appearance' });
    expect(sectionTarget('safeguards')).toEqual({ panel: 'safeguards' });
    expect(sectionTarget('account')).toEqual({ panel: 'account' });
    expect(sectionTarget('about')).toEqual({ panel: 'about' });
  });

  it('sends the index bot link to Agents › Index trading › Controls', () => {
    expect(sectionTarget('automation')).toEqual({ redirect: INDEX_BOT_CONTROLS });
    expect(INDEX_BOT_CONTROLS).toEqual({
      pathname: '/agents/index-trading',
      params: { tab: 'controls' },
    });
  });

  it('takes the first of a repeated param and ignores anything unknown', () => {
    expect(sectionTarget(['paper', 'account'])).toEqual({ panel: 'paper' });
    expect(sectionTarget(' paper ')).toEqual({ panel: 'paper' });
    expect(sectionTarget(null)).toBeNull();
    expect(sectionTarget(undefined)).toBeNull();
    expect(sectionTarget('overview')).toBeNull();
    expect(sectionTarget('')).toBeNull();
  });
});

describe('liveOrderState', () => {
  it('names the switch that blocks a real order, the kill switch first', () => {
    expect(liveOrderState({ platformOn: true, killEngaged: true, safeMode: true })).toEqual({
      allowed: false,
      reason: 'the platform kill switch is engaged',
    });
    expect(liveOrderState({ platformOn: false, killEngaged: false, safeMode: true })?.reason).toBe(
      'live trading is off for the platform',
    );
    expect(liveOrderState({ platformOn: true, killEngaged: false, safeMode: true })?.reason).toBe(
      'your Safe Mode is on',
    );
    expect(liveOrderState({ platformOn: true, killEngaged: false, safeMode: false })).toEqual({
      allowed: true,
      reason: 'every switch is clear',
    });
  });

  it('says nothing about real orders while any switch is unknown', () => {
    expect(
      liveOrderState({ platformOn: true, killEngaged: undefined, safeMode: false }),
    ).toBeNull();
    expect(
      liveOrderState({ platformOn: undefined, killEngaged: false, safeMode: false }),
    ).toBeNull();
    expect(
      liveOrderState({ platformOn: true, killEngaged: false, safeMode: undefined }),
    ).toBeNull();
  });
});

describe('notificationWord', () => {
  it('reads this device’s notification state in one word', () => {
    expect(notificationWord({ supported: false, enabledHere: true, permission: 'granted' })).toBe(
      'Unavailable',
    );
    expect(notificationWord({ supported: true, enabledHere: true, permission: 'granted' })).toBe(
      'On',
    );
    expect(notificationWord({ supported: true, enabledHere: false, permission: 'denied' })).toBe(
      'Blocked',
    );
    expect(
      notificationWord({ supported: true, enabledHere: false, permission: 'undetermined' }),
    ).toBe('Off');
    expect(notificationWord({ supported: true, enabledHere: false, permission: null })).toBe('Off');
  });
});

describe('pushTestMessage', () => {
  it('says what the test did', () => {
    expect(pushTestMessage({ deliveredTo: 1, failed: 0 })).toBe('Test sent to 1 device.');
    expect(pushTestMessage({ deliveredTo: 3, failed: 1 })).toBe('Test sent to 3 devices.');
    expect(pushTestMessage({ deliveredTo: 0, failed: 2 })).toMatch(/rejected/);
    expect(pushTestMessage({ deliveredTo: 0, failed: 0 })).toBe(
      'No active device to send a test to.',
    );
  });
});

describe('pushDeviceLabel', () => {
  it('names the app, the OS and the phone', () => {
    expect(
      pushDeviceLabel({ appName: 'Stocks', os: 'android', osVersion: 34, model: 'Pixel 8' }),
    ).toBe('Stocks app · Android 34 · Pixel 8');
  });

  it('drops what the phone does not report and stays under the server’s limit', () => {
    expect(pushDeviceLabel({ appName: 'Stocks', os: 'ios', osVersion: null, model: '  ' })).toBe(
      'Stocks app · iOS',
    );
    expect(
      pushDeviceLabel({ appName: 'Stocks', os: 'android', osVersion: 1, model: 'x'.repeat(900) }),
    ).toHaveLength(500);
  });
});

describe('brokers', () => {
  it('labels a broker from the catalog, then the known spelling, then its id', () => {
    expect(brokerLabel('groww', CATALOG)).toBe('Groww');
    expect(brokerLabel('mstock', undefined)).toBe('mStock');
    expect(brokerLabel('zerodha', CATALOG)).toBe('zerodha');
  });

  it('lists every catalog broker plus connections the catalog no longer offers, once each', () => {
    const rows = brokerRows(
      [connection('groww', 'connected'), connection('angel', 'error')],
      CATALOG,
    );
    expect(rows.map((row) => row.id)).toEqual(['mstock', 'groww', 'angel']);
    expect(rows[0]?.connection).toBeUndefined();
    expect(rows[1]?.connection?.status).toBe('connected');
  });

  it('shows mStock before the catalog loads', () => {
    expect(brokerRows(undefined, undefined).map((row) => row.label)).toEqual(['mStock']);
  });

  it('puts each connection state in a word and one line', () => {
    expect(connectionState(undefined)).toMatchObject({ tone: 'neutral', word: 'Not connected' });
    expect(
      connectionState(
        connection('groww', 'connected', { accountLabel: 'AB1234', autoRefresh: true }),
      ),
    ).toEqual({ tone: 'ok', word: 'Connected', detail: 'AB1234 · renews daily' });
    expect(connectionState(connection('mstock', 'connected')).detail).toBe('Ready');
    expect(
      connectionState(connection('mstock', 'connected', { expiresAt: '2026-10-05T10:30:00Z' }))
        .detail,
    ).toMatch(/^session until 5 Oct/);
    expect(connectionState(connection('mstock', 'pending_verification')).word).toBe('Verify');
    expect(connectionState(connection('mstock', 'error', { lastError: 'Bad TOTP' }))).toEqual({
      tone: 'bad',
      word: 'Needs attention',
      detail: 'Bad TOTP',
    });
    expect(connectionState(connection('mstock', 'disconnected'))).toMatchObject({
      tone: 'warn',
      word: 'Session expired',
    });
  });
});

describe('glanceTiles', () => {
  const base = {
    connections: [] as BrokerConnectionSummary[],
    connectionsFailed: false,
    catalog: CATALOG,
    orders: { allowed: true, reason: 'every switch is clear' },
    ordersFailed: false,
    safeMode: { enabled: false, failed: false, unsupported: false },
    notification: 'Off' as const,
    devices: 0,
  };

  it('never paints an unknown status green', () => {
    const tiles = glanceTiles({
      ...base,
      connections: undefined,
      orders: null,
      safeMode: { enabled: undefined, failed: false, unsupported: false },
      devices: null,
    });
    expect(tiles.map((tile) => tile.value)).toEqual(['—', '—', '—', 'Off']);
    expect(tiles.slice(0, 3).every((tile) => tile.status === undefined)).toBe(true);
    expect(tiles[0]?.sub).toBe('Checking…');
    expect(tiles[3]?.sub).toBe('This phone');
  });

  it('says a failed read failed instead of "Checking…" forever', () => {
    const tiles = glanceTiles({
      ...base,
      connections: undefined,
      connectionsFailed: true,
      orders: null,
      ordersFailed: true,
      safeMode: { enabled: undefined, failed: true, unsupported: false },
    });
    expect(tiles.slice(0, 3).map((tile) => tile.sub)).toEqual([
      'Couldn’t be checked',
      'Couldn’t be checked',
      'Couldn’t be checked',
    ]);
  });

  it('names connected brokers, and the ones that need attention first', () => {
    const ok = glanceTiles({ ...base, connections: [connection('groww', 'connected')] });
    expect(ok[0]).toMatchObject({ value: '1 connected', status: 'ok', sub: 'Groww' });
    const bad = glanceTiles({
      ...base,
      connections: [connection('groww', 'connected'), connection('mstock', 'disconnected')],
    });
    expect(bad[0]).toMatchObject({ status: 'warn', sub: 'mStock needs attention' });
    expect(glanceTiles(base)[0]).toMatchObject({ value: 'None', status: 'neutral' });
  });

  it('gives the reason a real order is blocked', () => {
    const tiles = glanceTiles({
      ...base,
      orders: { allowed: false, reason: 'your Safe Mode is on' },
      safeMode: { enabled: true, failed: false, unsupported: false },
    });
    expect(tiles[1]).toMatchObject({
      value: 'Blocked',
      status: 'warn',
      sub: 'Because your Safe Mode is on',
    });
    expect(tiles[2]).toMatchObject({ value: 'On', status: 'ok' });
  });

  it('says when the server has no Safe Mode', () => {
    const tiles = glanceTiles({
      ...base,
      safeMode: { enabled: undefined, failed: true, unsupported: true },
    });
    expect(tiles[2]).toMatchObject({ value: '—', sub: 'Needs a newer server' });
  });

  it('counts registered devices and tones the notification word', () => {
    expect(glanceTiles({ ...base, notification: 'On', devices: 1 })[3]).toMatchObject({
      status: 'ok',
      sub: '1 device registered',
    });
    expect(glanceTiles({ ...base, notification: 'Blocked', devices: 2 })[3]).toMatchObject({
      status: 'warn',
      sub: '2 devices registered',
    });
  });

  it('points every tile at the panel that explains it', () => {
    expect(glanceTiles(base).map((tile) => tile.panel)).toEqual([
      'connections',
      'safeguards',
      'safeguards',
      'notifications',
    ]);
  });
});

describe('wallet summary', () => {
  it('shows the three balances, free cash never below zero', () => {
    expect(walletFigures({ capital: 1_000_000, cash: 400_000, availableCash: -5 })).toEqual([
      { label: 'Wallet', value: '₹10,00,000' },
      { label: 'Cash', value: '₹4,00,000' },
      { label: 'Free cash', value: '₹0' },
    ]);
    expect(
      walletFigures({ capital: Number.NaN, cash: 1, availableCash: Number.NaN })[2]?.value,
    ).toBe('—');
  });

  it('tells the wallet’s history only when there is one', () => {
    expect(walletNote({ openingCapital: 500_000, capitalAdded: 0, resetAt: null })).toBeNull();
    expect(walletNote({ openingCapital: 500_000, capitalAdded: 250_000, resetAt: null })).toBe(
      'Started at ₹5,00,000; +₹2,50,000 added since it opened.',
    );
    expect(
      walletNote({
        openingCapital: 500_000,
        capitalAdded: -100_000,
        resetAt: '2026-10-01T00:00:00Z',
      }),
    ).toBe('Started at ₹5,00,000; −₹1,00,000 added since the last reset.');
    expect(
      walletNote({
        openingCapital: 500_000,
        capitalAdded: 0,
        resetAt: null,
        mergedAt: '2026-10-01T06:00:00Z',
      }),
    ).toMatch(/combined into this one on 1 Oct 2026\.$/);
    expect(
      walletNote({ openingCapital: 1, capitalAdded: 0, resetAt: null, mergedAt: 'garbage' }),
    ).toBeNull();
  });
});
