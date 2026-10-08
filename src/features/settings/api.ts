import type { ChallengeResult } from '@/features/trading/types';
import { apiClient } from '@/services/api/client';

import type {
  GrowwTokenStatus,
  MarketDataProvider,
  MarketDataProviderSettings,
  PushDevicesResponse,
  PushTestResult,
  SetMarketDataProviderResult,
  TokenRefreshRun,
} from './types';

/**
 * Account-level endpoints the Settings screens need beyond features/trading's broker
 * client: push-device status, the shared market-data source, the Groww daily token, and a
 * reconnect that works for any broker (the web's POST /brokers/:broker/reconnect).
 */
export const settingsApi = {
  async pushDevices(): Promise<PushDevicesResponse> {
    const { data } = await apiClient.get<PushDevicesResponse>('/notifications/devices');
    return data;
  },
  /** Subscribes this phone's push token to the signed-in account (moves it if another had it). */
  async registerPushDevice(token: string, userAgent: string): Promise<void> {
    await apiClient.post('/notifications/devices', { token, userAgent });
  },
  /** Unsubscribes this phone only — the account's other devices keep their alerts. */
  async unregisterPushDevice(token: string): Promise<void> {
    await apiClient.delete('/notifications/devices', { data: { token } });
  },
  async sendPushTest(): Promise<PushTestResult> {
    const { data } = await apiClient.post<PushTestResult>('/notifications/test');
    return data;
  },
  async marketDataProvider(): Promise<MarketDataProviderSettings> {
    const { data } = await apiClient.get<MarketDataProviderSettings>(
      '/brokers/market-data-provider',
    );
    return data;
  },
  /** Admin only. The server probes the new source with a live quote before saving it. */
  async setMarketDataProvider(provider: MarketDataProvider): Promise<SetMarketDataProviderResult> {
    const { data } = await apiClient.put<SetMarketDataProviderResult>(
      '/brokers/market-data-provider',
      { provider },
    );
    return data;
  },
  async growwToken(): Promise<GrowwTokenStatus> {
    const { data } = await apiClient.get<GrowwTokenStatus>('/brokers/groww/token');
    return data;
  },
  /** Resolves even when Groww refused — read `run.summary` / `status.lastError`. */
  async refreshGrowwToken(): Promise<{ run: TokenRefreshRun; status: GrowwTokenStatus }> {
    const { data } = await apiClient.post<{ run: TokenRefreshRun; status: GrowwTokenStatus }>(
      '/brokers/groww/token/refresh',
    );
    return data;
  },
  /** Reuses stored credentials: mStock sends the day's code, API-key brokers re-mint a token. */
  async reconnectBroker(broker: string): Promise<ChallengeResult> {
    const { data } = await apiClient.post<ChallengeResult>(
      `/brokers/${encodeURIComponent(broker)}/reconnect`,
    );
    return data;
  },
};
