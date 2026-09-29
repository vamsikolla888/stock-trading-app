import {
  LIVE_BROKER_LABEL,
  type BrokerCatalogEntry,
  type BrokerConnectionSummary,
  type KillSwitchState,
  type LiveBroker,
  type LiveTradingSettings,
} from '../types';

/** mStock first: it was the only live broker before Groww, and stays the default. */
export const LIVE_BROKER_ORDER: readonly LiveBroker[] = ['mstock', 'groww'];

export interface LiveTradingInputs {
  settings: { data?: LiveTradingSettings; error: unknown };
  killSwitch: { data?: KillSwitchState; error: unknown };
  connections: { data?: readonly BrokerConnectionSummary[]; error: unknown };
  catalog: { data?: readonly BrokerCatalogEntry[] };
}

export interface LiveTradingResolution {
  /** Every connected broker that can trade live, in LIVE_BROKER_ORDER. */
  brokers: LiveBroker[];
  /** Why no real order can go out right now — null when one can. */
  reason: string | null;
  labelOf: (broker: string) => string;
}

/**
 * Whether a real order can be placed, decided from the four pre-checks the order ticket
 * and the Trade hub share: the global switch, the kill switch, a connected broker, and
 * that broker being able to trade live. Fails CLOSED: a check that couldn't be read is a
 * reason, never a pass. Until the static catalog arrives both brokers are assumed
 * live-capable — the server refuses an order to a broker that can't trade anyway.
 */
export function resolveLiveTrading({
  settings,
  killSwitch,
  connections,
  catalog,
}: LiveTradingInputs): LiveTradingResolution {
  const labelOf = (broker: string) =>
    catalog.data?.find((entry) => entry.id === broker)?.label ??
    LIVE_BROKER_LABEL[broker as LiveBroker] ??
    broker;
  const capable = catalog.data
    ? new Set(catalog.data.filter((entry) => entry.capabilities?.liveTrading).map((e) => e.id))
    : new Set<string>(LIVE_BROKER_ORDER);
  const rows = connections.data ?? [];
  const brokers = LIVE_BROKER_ORDER.filter(
    (id) => capable.has(id) && rows.some((row) => row.broker === id && row.status === 'connected'),
  );
  // The first live broker the user has ANY record for — its state says what to fix.
  const known = LIVE_BROKER_ORDER.map((id) => rows.find((row) => row.broker === id)).find(
    (row): row is BrokerConnectionSummary => row !== undefined,
  );

  let reason: string | null = null;
  if (settings.data && !settings.data.enabled) {
    reason = 'Live trading is switched off right now.';
  } else if (killSwitch.data?.engaged) {
    reason = `Live trading is paused${killSwitch.data.reason ? `: ${killSwitch.data.reason}` : '.'}`;
  } else if (!connections.data && connections.error) {
    reason = "Couldn't check your broker connections.";
  } else if (brokers.length === 0 && known) {
    const label = labelOf(known.broker);
    reason =
      known.status === 'pending_verification'
        ? `Finish connecting ${label} to trade live.`
        : known.status === 'error'
          ? `${label} needs attention. Reconnect it to trade live.`
          : `Your ${label} session has expired. Reconnect to trade live.`;
  } else if (brokers.length === 0) {
    reason = 'Connect a broker to place real orders.';
  } else if (!settings.data || !killSwitch.data) {
    reason = "Couldn't confirm that live trading is available.";
  }

  return { brokers: reason === null ? brokers : [], reason, labelOf };
}

/**
 * Why a specific broker can't take this order when the ticket was opened for it (selling a
 * Groww holding must never quietly go to mStock). Null when it can.
 */
export function pinnedBrokerReason(
  pinned: LiveBroker | null,
  resolution: {
    brokers: readonly LiveBroker[];
    reason: string | null;
    labelOf: (broker: LiveBroker) => string;
  },
): string | null {
  if (resolution.reason) return resolution.reason;
  if (pinned && !resolution.brokers.includes(pinned)) {
    return `${resolution.labelOf(pinned)} isn't connected for live trading. Reconnect it in Brokers.`;
  }
  return null;
}
