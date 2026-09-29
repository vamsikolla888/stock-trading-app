import { apiClient } from '@/services/api/client';

import type {
  ApiKeyTotpConnectPayload,
  BrokerCatalogEntry,
  BrokerConnectionSummary,
  ChallengeResult,
  KillSwitchState,
  LiveBroker,
  LiveOrder,
  LiveOrderResult,
  LiveTradingSettings,
  LiveWallet,
  ModifyLiveOrderInput,
  MstockConnectPayload,
  PlaceLiveOrderInput,
} from './types';

export const brokersApi = {
  async connections(): Promise<BrokerConnectionSummary[]> {
    const { data } = await apiClient.get<{ connections: BrokerConnectionSummary[] }>('/brokers');
    return data.connections;
  },
  async catalog(): Promise<BrokerCatalogEntry[]> {
    const { data } = await apiClient.get<{ brokers: BrokerCatalogEntry[] }>('/brokers/catalog');
    return data.brokers;
  },
  async connectMstock(payload: MstockConnectPayload): Promise<ChallengeResult> {
    const { data } = await apiClient.post<ChallengeResult>('/brokers/mstock/connect', payload);
    return data;
  },
  async verifyMstock(code: string): Promise<ChallengeResult> {
    const { data } = await apiClient.post<ChallengeResult>('/brokers/mstock/verify', { code });
    return data;
  },
  /**
   * Reuses the stored credentials: mStock sends the day's challenge (verify next); Groww
   * mints a fresh token straight away and comes back connected.
   */
  async reconnect(broker: string): Promise<ChallengeResult> {
    const { data } = await apiClient.post<ChallengeResult>(
      `/brokers/${encodeURIComponent(broker)}/reconnect`,
    );
    return data;
  },
  async reconnectMstock(): Promise<ChallengeResult> {
    return brokersApi.reconnect('mstock');
  },
  async connectApiKey(broker: string, payload: ApiKeyTotpConnectPayload): Promise<ChallengeResult> {
    const { data } = await apiClient.post<ChallengeResult>(
      `/brokers/${encodeURIComponent(broker)}/connect`,
      payload,
    );
    return data;
  },
  /** Deletes the stored credentials — reconnecting starts from scratch. */
  async disconnect(broker: string): Promise<void> {
    await apiClient.delete(`/brokers/${encodeURIComponent(broker)}`);
  },
};

export const liveTradingApi = {
  async settings(): Promise<LiveTradingSettings> {
    const { data } = await apiClient.get<LiveTradingSettings>('/live-trading/settings');
    return data;
  },
  async killSwitch(): Promise<KillSwitchState> {
    const { data } = await apiClient.get<KillSwitchState>('/live-trading/kill-switch');
    return data;
  },
  async wallet(broker: LiveBroker): Promise<LiveWallet> {
    const { data } = await apiClient.get<LiveWallet>('/live-trading/wallet', {
      params: { broker },
    });
    return data;
  },
  /**
   * Places a REAL order. Risk rejections (market closed, kill switch, margin) and broker
   * rejections still come back as a successful response — callers must branch on
   * `order.status`, not on the request succeeding.
   */
  async placeOrder(input: PlaceLiveOrderInput): Promise<LiveOrderResult> {
    const { data } = await apiClient.post<LiveOrderResult>('/live-trading/orders', input);
    return data;
  },
  /** The user's REAL orders placed through this app, newest first. */
  async orders(limit = 50): Promise<LiveOrder[]> {
    const { data } = await apiClient.get<{ orders: LiveOrder[] }>('/live-trading/orders', {
      params: { limit },
    });
    return data.orders ?? [];
  },
  /** Sends only what changed; the server resends the rest to the broker as-is. */
  async modifyOrder(id: string, body: ModifyLiveOrderInput): Promise<LiveOrder> {
    const { data } = await apiClient.patch<LiveOrder>(
      `/live-trading/orders/${encodeURIComponent(id)}`,
      body,
    );
    return data;
  },
  /** Anything already filled stays filled. */
  async cancelOrder(id: string): Promise<LiveOrder> {
    const { data } = await apiClient.delete<LiveOrder>(
      `/live-trading/orders/${encodeURIComponent(id)}`,
    );
    return data;
  },
};

export interface ChargesPreview {
  breakdown: {
    brokerage: number;
    stt: number;
    exchangeTxn: number;
    sebiFee: number;
    gst: number;
    stampDuty: number;
    total: number;
  };
  caveats: string[];
}

/** Pure statutory-charges calculator (POST /portfolio/orders/preview-charges) — no side effects. */
export async function previewCharges(
  input: { product: 'DELIVERY' | 'INTRADAY'; side: 'BUY' | 'SELL'; qty: number; price: number },
  signal?: AbortSignal,
): Promise<ChargesPreview> {
  const { data } = await apiClient.post<ChargesPreview>(
    '/portfolio/orders/preview-charges',
    input,
    { signal },
  );
  return data;
}

/** The paper API moved to features/paper; re-exported so existing imports keep working. */
export { paperApi } from '@/features/paper/api';
