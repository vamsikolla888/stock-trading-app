import { apiClient } from '@/services/api/client';

import type {
  ChartTarget,
  ExitPositionInput,
  ExpiryCalendar,
  ExploreFuture,
  ExploreSection,
  ExploreUnderlying,
  FnoCandleInterval,
  FnoCandles,
  FnoChain,
  FnoContractDetail,
  FnoExchange,
  FnoExploreSectionView,
  FnoExploreSummary,
  FnoExpiry,
  FnoFeedStatus,
  FnoFunds,
  FnoFutures,
  FnoOrderDetail,
  FnoOrderRow,
  FnoPositionsView,
  FnoSearchResult,
  FnoUnderlying,
  LiveOrder,
  MarginLeg,
  MarginPreview,
  ModifyFnoOrderInput,
  PlaceFnoOrderInput,
  TradeOrderResult,
} from './types';

/**
 * /api/v1/fno — the Groww-backed F&O module. Same paths and bodies as the web client's
 * fno.service.ts; the api client unwraps the envelope and returns `data`.
 *
 * Every account call reads the CALLER'S OWN Groww session server-side: a 404 (NOT_FOUND)
 * means no Groww connection, a 409 BROKER_SESSION_EXPIRED an expired one.
 */

const enc = encodeURIComponent;

export type ExploreSectionRow = ExploreUnderlying | ExploreFuture;

export const fnoApi = {
  async explore(signal?: AbortSignal): Promise<FnoExploreSummary> {
    const { data } = await apiClient.get<FnoExploreSummary>('/fno/explore', { signal });
    return data;
  },

  async exploreSection(
    section: ExploreSection,
    signal?: AbortSignal,
  ): Promise<FnoExploreSectionView<ExploreSectionRow>> {
    const { data } = await apiClient.get<FnoExploreSectionView<ExploreSectionRow>>(
      `/fno/explore/${section}`,
      { signal },
    );
    return data;
  },

  async expiryCalendar(signal?: AbortSignal): Promise<ExpiryCalendar> {
    const { data } = await apiClient.get<ExpiryCalendar>('/fno/expiry-calendar', { signal });
    return data;
  },

  async underlyings(signal?: AbortSignal): Promise<{ underlyings: FnoUnderlying[]; asOf: string }> {
    const { data } = await apiClient.get<{ underlyings: FnoUnderlying[]; asOf: string }>(
      '/fno/underlyings',
      { signal },
    );
    return data;
  },

  /** `q` is 1–40 characters (server searchQuerySchema). */
  async search(q: string, signal?: AbortSignal): Promise<FnoSearchResult> {
    const { data } = await apiClient.get<FnoSearchResult>('/fno/search', {
      params: { q },
      signal,
    });
    return data;
  },

  async status(signal?: AbortSignal): Promise<FnoFeedStatus> {
    const { data } = await apiClient.get<FnoFeedStatus>('/fno/status', { signal });
    return data;
  },

  async expiries(
    exchange: FnoExchange,
    underlying: string,
    signal?: AbortSignal,
  ): Promise<{ underlying: FnoUnderlying; expiries: FnoExpiry[] }> {
    const { data } = await apiClient.get<{ underlying: FnoUnderlying; expiries: FnoExpiry[] }>(
      `/fno/${exchange}/${enc(underlying)}/expiries`,
      { signal },
    );
    return data;
  },

  /** `strikes` = strikes either side of ATM (1–100); omitted = every strike the source lists. */
  async chain(
    exchange: FnoExchange,
    underlying: string,
    query: { expiry?: string | null; strikes?: number | null },
    signal?: AbortSignal,
  ): Promise<FnoChain> {
    // Keys are omitted rather than sent empty: the query schema is `.strict()`.
    const params: Record<string, string | number> = {};
    if (query.expiry) params.expiry = query.expiry;
    if (query.strikes != null) params.strikes = query.strikes;
    const { data } = await apiClient.get<FnoChain>(`/fno/${exchange}/${enc(underlying)}/chain`, {
      params,
      signal,
    });
    return data;
  },

  async futures(
    exchange: FnoExchange,
    underlying: string,
    signal?: AbortSignal,
  ): Promise<FnoFutures> {
    const { data } = await apiClient.get<FnoFutures>(
      `/fno/${exchange}/${enc(underlying)}/futures`,
      { signal },
    );
    return data;
  },

  async contract(
    exchange: FnoExchange,
    tradingSymbol: string,
    signal?: AbortSignal,
  ): Promise<FnoContractDetail> {
    const { data } = await apiClient.get<FnoContractDetail>(
      `/fno/contracts/${exchange}/${enc(tradingSymbol)}`,
      { signal },
    );
    return data;
  },

  /**
   * Bars for a contract, or (`target: 'underlying'`) for its cash/index underlying — the
   * contract only names which underlying. `from`/`to` are epoch seconds, and the server caps
   * the span per interval (30 days for ≤5m, 90 for 15m, 180 above).
   */
  async candles(
    exchange: FnoExchange,
    tradingSymbol: string,
    query: { target: ChartTarget; interval: FnoCandleInterval; from: number; to: number },
    signal?: AbortSignal,
  ): Promise<FnoCandles> {
    const { data } = await apiClient.get<FnoCandles>(
      `/fno/contracts/${exchange}/${enc(tradingSymbol)}/candles`,
      { params: query, signal },
    );
    return data;
  },

  async positions(signal?: AbortSignal): Promise<FnoPositionsView> {
    const { data } = await apiClient.get<FnoPositionsView>('/fno/positions', { signal });
    return data;
  },

  async orders(signal?: AbortSignal): Promise<{ orders: FnoOrderRow[]; asOf: string }> {
    const { data } = await apiClient.get<{ orders: FnoOrderRow[]; asOf: string }>('/fno/orders', {
      signal,
    });
    return data;
  },

  async orderDetail(growwOrderId: string, signal?: AbortSignal): Promise<FnoOrderDetail> {
    const { data } = await apiClient.get<FnoOrderDetail>(`/fno/orders/${enc(growwOrderId)}`, {
      signal,
    });
    return data;
  },

  async funds(signal?: AbortSignal): Promise<FnoFunds> {
    const { data } = await apiClient.get<FnoFunds>('/fno/funds', { signal });
    return data;
  },

  /** Groww's own required-margin figure for exactly these legs. Writes nothing. */
  async margin(legs: MarginLeg[], signal?: AbortSignal): Promise<MarginPreview> {
    const { data } = await apiClient.post<MarginPreview>('/fno/margin', { legs }, { signal });
    return data;
  },

  /**
   * A REAL order on the user's Groww account. Resolves even when the risk engine or Groww
   * refused it — read `order.status`, never the HTTP success.
   */
  async placeOrder(body: PlaceFnoOrderInput): Promise<TradeOrderResult> {
    const { data } = await apiClient.post<TradeOrderResult>('/fno/orders', body);
    return data;
  },

  /** A REAL order on the opposite side, never larger than what is held (the server refuses). */
  async exitPosition(body: ExitPositionInput): Promise<TradeOrderResult> {
    const { data } = await apiClient.post<TradeOrderResult>('/fno/positions/exit', body);
    return data;
  },

  async modifyOrder(
    growwOrderId: string,
    body: ModifyFnoOrderInput,
  ): Promise<{ modified: boolean; lifecycle: LiveOrder | null }> {
    const { data } = await apiClient.post<{ modified: boolean; lifecycle: LiveOrder | null }>(
      `/fno/orders/${enc(growwOrderId)}/modify`,
      body,
    );
    return data;
  },

  async cancelOrder(
    growwOrderId: string,
  ): Promise<{ cancelRequested: boolean; lifecycle: LiveOrder | null }> {
    const { data } = await apiClient.post<{
      cancelRequested: boolean;
      lifecycle: LiveOrder | null;
    }>(`/fno/orders/${enc(growwOrderId)}/cancel`);
    return data;
  },
};
