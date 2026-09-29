import { apiClient } from '@/services/api/client';

import type {
  AutoTradeActivity,
  AutoTradeAiReviewResult,
  AutoTradeConfig,
  AutoTradeConfigResponse,
  AutoTradeRunResult,
  CashSegment,
  IntradaySweepResult,
  PaperAnalytics,
  PaperOrder,
  PaperOrderInput,
  PaperOrderPreview,
  PaperPerformance,
  PaperPortfolio,
  PaperProfile,
  PaperWallet,
  QuoteRow,
  SegmentOverview,
  StrategyOption,
} from './types';

/** `profileId` omitted resolves to the user's default profile on the server. */
const withProfile = (profileId?: string) => (profileId ? { profileId } : {});

type RawProfile = Omit<PaperProfile, 'id'> & { id?: string; _id?: string };

/**
 * The profile routes return Mongo documents as stored (`.lean()` / toObject), so the id
 * arrives as `_id` and there is no `id` — whatever the OpenAPI spec says. Normalised here,
 * once, so every screen can key, select and delete by `id`.
 */
export function toPaperProfile(raw: RawProfile): PaperProfile {
  return {
    id: String(raw.id ?? raw._id ?? ''),
    name: raw.name ?? '',
    strategy: raw.strategy ?? null,
    isDefault: Boolean(raw.isDefault),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/** Paper trading — mirrors the web's paper.service.ts, same paths and field names. */
export const paperApi = {
  async profiles(): Promise<PaperProfile[]> {
    const { data } = await apiClient.get<{ profiles: RawProfile[] }>('/paper/profiles');
    return (data?.profiles ?? []).map(toPaperProfile).filter((profile) => profile.id !== '');
  },
  async createProfile(body: {
    name: string;
    strategy?: string | null;
    startingCapital?: number;
  }): Promise<PaperProfile> {
    const { data } = await apiClient.post<RawProfile>('/paper/profiles', body);
    return toPaperProfile(data);
  },
  async renameProfile(
    profileId: string,
    body: { name?: string; strategy?: string | null },
  ): Promise<PaperProfile> {
    const { data } = await apiClient.patch<RawProfile>(
      `/paper/profiles/${encodeURIComponent(profileId)}`,
      body,
    );
    return toPaperProfile(data);
  },
  async deleteProfile(profileId: string): Promise<void> {
    await apiClient.delete(`/paper/profiles/${encodeURIComponent(profileId)}`);
  },

  async segments(profileId?: string): Promise<SegmentOverview> {
    const { data } = await apiClient.get<SegmentOverview>('/paper/segments', {
      params: withProfile(profileId),
    });
    return data;
  },
  async portfolio(segment: CashSegment, profileId?: string): Promise<PaperPortfolio> {
    const { data } = await apiClient.get<PaperPortfolio>('/paper/portfolio', {
      params: { segment, ...withProfile(profileId) },
    });
    return data;
  },
  /** Both pools unless a segment is given — the right default for an audit trail. */
  async orders(limit = 50, profileId?: string): Promise<PaperOrder[]> {
    const { data } = await apiClient.get<{ orders: PaperOrder[] }>('/paper/orders', {
      params: { limit, ...withProfile(profileId) },
    });
    return data.orders;
  },
  async preview(input: PaperOrderInput, signal?: AbortSignal): Promise<PaperOrderPreview> {
    const { data } = await apiClient.post<PaperOrderPreview>('/paper/orders/preview', input, {
      signal,
    });
    return data;
  },
  /** A rejection is also a 201 with status REJECTED and a `note`. */
  async placeOrder(input: PaperOrderInput): Promise<PaperOrder> {
    const { data } = await apiClient.post<PaperOrder>('/paper/orders', input);
    return data;
  },
  async cancelOrder(id: string, profileId?: string): Promise<PaperOrder> {
    const { data } = await apiClient.delete<PaperOrder>(`/paper/orders/${encodeURIComponent(id)}`, {
      params: withProfile(profileId),
    });
    return data;
  },
  /** Sells the whole position at market. */
  async closePosition(
    exchange: string,
    symbol: string,
    segment: CashSegment,
    profileId?: string,
  ): Promise<PaperOrder> {
    const { data } = await apiClient.post<PaperOrder>(
      `/paper/positions/${encodeURIComponent(exchange)}/${encodeURIComponent(symbol)}/close`,
      undefined,
      { params: { segment, ...withProfile(profileId) } },
    );
    return data;
  },
  async updateLevels(
    exchange: string,
    symbol: string,
    body: {
      segment: CashSegment;
      profileId?: string;
      targetPrice: number | null;
      stopPrice: number | null;
      autoExit?: boolean;
    },
  ): Promise<void> {
    await apiClient.patch(
      `/paper/positions/${encodeURIComponent(exchange)}/${encodeURIComponent(symbol)}`,
      { ...body, profileId: body.profileId || undefined },
    );
  },
  /** Wipes one pool back to its wallet. Irreversible — callers confirm first. */
  async reset(segment: CashSegment, profileId?: string): Promise<PaperPortfolio> {
    const { data } = await apiClient.post<PaperPortfolio>('/paper/reset', {
      segment,
      ...withProfile(profileId),
    });
    return data;
  },
  /** The cron's own sweep; it reads the clock, so it can never square off early. */
  async sweepIntraday(): Promise<IntradaySweepResult> {
    const { data } = await apiClient.post<IntradaySweepResult>('/paper/intraday/sweep', {});
    return data;
  },

  async performance(days: number, profileId?: string): Promise<PaperPerformance> {
    const { data } = await apiClient.get<PaperPerformance>('/paper/performance', {
      params: { days, ...withProfile(profileId) },
    });
    return data;
  },
  async analytics(profileId?: string): Promise<PaperAnalytics> {
    const { data } = await apiClient.get<PaperAnalytics>('/paper/analytics', {
      params: withProfile(profileId),
    });
    return data;
  },
  async wallet(profileId?: string): Promise<PaperWallet> {
    const { data } = await apiClient.get<PaperWallet>('/paper/wallet', {
      params: withProfile(profileId),
    });
    return data;
  },
  async setWallet(body: {
    segment: CashSegment;
    amount: number;
    profileId?: string;
  }): Promise<PaperWallet> {
    const { data } = await apiClient.put<PaperWallet>('/paper/wallet', {
      segment: body.segment,
      amount: body.amount,
      ...withProfile(body.profileId),
    });
    return data;
  },

  async autoTradeConfig(): Promise<AutoTradeConfigResponse> {
    const { data } = await apiClient.get<AutoTradeConfigResponse>('/paper/autotrade/config');
    return data;
  },
  async updateAutoTradeConfig(
    patch: Partial<AutoTradeConfig>,
  ): Promise<{ configured: boolean; config: AutoTradeConfig }> {
    const { data } = await apiClient.patch<{ configured: boolean; config: AutoTradeConfig }>(
      '/paper/autotrade/config',
      patch,
    );
    return data;
  },
  async autoTradeActivity(limit = 100): Promise<AutoTradeActivity> {
    const { data } = await apiClient.get<AutoTradeActivity>('/paper/autotrade/activity', {
      params: { limit },
    });
    return data;
  },
  /** `dryRun` previews and writes nothing. */
  async runAutoTrade(dryRun: boolean): Promise<AutoTradeRunResult> {
    const { data } = await apiClient.post<AutoTradeRunResult>('/paper/autotrade/run', { dryRun });
    return data;
  },
  async runAutoTradeExits(): Promise<AutoTradeRunResult> {
    const { data } = await apiClient.post<AutoTradeRunResult>('/paper/autotrade/exits', {});
    return data;
  },
  /** Prepares and stores today's quant + AI risk review for the strategy source. */
  async prepareAutoTradeAiReview(): Promise<AutoTradeAiReviewResult> {
    const { data } = await apiClient.post<AutoTradeAiReviewResult>(
      '/paper/autotrade/ai-review',
      {},
    );
    return data;
  },

  /** The saved strategies — only for the auto-trade source picker. */
  async strategies(): Promise<StrategyOption[]> {
    const { data } = await apiClient.get<{ strategies: StrategyOption[] }>('/strategies');
    return data.strategies;
  },
  /** Latest price and previous close per symbol, one request per exchange. */
  async quotes(exchange: string, symbols: string[]): Promise<QuoteRow[]> {
    const { data } = await apiClient.get<{ quotes: QuoteRow[] }>('/market/quotes', {
      params: { exchange, symbols: symbols.join(',') },
    });
    return data?.quotes ?? [];
  },
};
