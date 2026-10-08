import { apiClient } from '@/services/api/client';

import { normalizeBook, normalizeOrder, normalizeOrders, normalizePreview } from './lib/normalize';
import { paperOrderBody } from './lib/orderBody';
import type {
  BasketPayoff,
  BuildStrategyInput,
  BuildStrategyResult,
  ExpirySettlementResult,
  FnoAnalytics,
  FnoBook,
  FnoMover,
  FnoOrderPreview,
  FnoOrderView,
  FnoWallet,
  OptionChain,
  OptionStrategyDefinition,
  PaperChainQuery,
  PayoffLegInput,
  PlaceBasketResult,
  PlacePaperFnoOrderInput,
  UnderlyingSummary,
} from './types';

/**
 * /api/v1/derivatives — the reference option chain and the simulated F&O paper book. Same
 * paths and bodies as the web client's derivatives.service.ts. Nothing here reaches a broker.
 */

const enc = encodeURIComponent;

/** An order the server returned; one it did not shape as an order is refused, not guessed at. */
function order(raw: unknown): FnoOrderView {
  const parsed = normalizeOrder(raw);
  if (!parsed) throw new Error('The server answered with something that is not an order.');
  return parsed;
}

export const derivativesApi = {
  async underlyings(signal?: AbortSignal): Promise<UnderlyingSummary[]> {
    const { data } = await apiClient.get<{ underlyings: UnderlyingSummary[] }>(
      '/derivatives/underlyings',
      { signal },
    );
    return data.underlyings;
  },

  async expiries(underlying: string, signal?: AbortSignal): Promise<string[]> {
    const { data } = await apiClient.get<{ underlying: string; expiries: string[] }>(
      `/derivatives/${enc(underlying)}/expiries`,
      { signal },
    );
    return data.expiries;
  },

  async chain(
    underlying: string,
    query: PaperChainQuery,
    signal?: AbortSignal,
  ): Promise<OptionChain> {
    // Keys are omitted rather than sent empty: the query schema is `.strict()`.
    const params: Record<string, string | number> = {};
    if (query.expiry) params.expiry = query.expiry;
    if (query.window != null) params.window = query.window;
    if (query.exchange) params.exchange = query.exchange;
    const { data } = await apiClient.get<OptionChain>(`/derivatives/${enc(underlying)}/chain`, {
      params,
      signal,
    });
    return data;
  },

  async book(signal?: AbortSignal): Promise<FnoBook> {
    const { data } = await apiClient.get<unknown>('/derivatives/book', { signal });
    return normalizeBook(data);
  },

  async orders(limit = 100, signal?: AbortSignal): Promise<FnoOrderView[]> {
    const { data } = await apiClient.get<{ orders?: unknown }>('/derivatives/orders', {
      params: { limit },
      signal,
    });
    return normalizeOrders(data?.orders);
  },

  /**
   * Returns the ORDER even when rejected — status REJECTED plus a `note` saying why — and a
   * resting one (a LIMIT, or an after-market order placed outside the session) as PENDING.
   */
  async placeOrder(body: PlacePaperFnoOrderInput): Promise<FnoOrderView> {
    const { data } = await apiClient.post<unknown>('/derivatives/orders', paperOrderBody(body));
    return order(data);
  },

  /**
   * What an order would do, without placing it — computed by placement's own code. A refusal is
   * a normal answer (`blockedReason`). Writes nothing; 240/min per user, so callers debounce.
   * Null when the answer is not a preview this app can read.
   */
  async previewOrder(
    body: PlacePaperFnoOrderInput,
    signal?: AbortSignal,
  ): Promise<FnoOrderPreview | null> {
    const { data } = await apiClient.post<unknown>(
      '/derivatives/orders/preview',
      paperOrderBody(body),
      { signal },
    );
    return normalizePreview(data);
  },

  async squareOff(exchange: string, tradingsymbol: string): Promise<FnoOrderView> {
    const { data } = await apiClient.post<unknown>(
      `/derivatives/positions/${enc(exchange)}/${enc(tradingsymbol)}/square-off`,
    );
    return order(data);
  },

  /** Withdraws a resting order. Only a PENDING order can be cancelled (else 422). */
  async cancelOrder(orderId: string): Promise<FnoOrderView> {
    const { data } = await apiClient.post<unknown>(`/derivatives/orders/${enc(orderId)}/cancel`);
    return order(data);
  },

  /** The F&O sandbox's OWN wallet — separate from the cash paper wallet, not profile-scoped. */
  async wallet(signal?: AbortSignal): Promise<FnoWallet> {
    const { data } = await apiClient.get<FnoWallet>('/derivatives/wallet', { signal });
    return data;
  },

  /** A deposit or withdrawal of the difference; positions, orders and booked P&L are untouched. */
  async setWallet(amount: number): Promise<FnoWallet> {
    const { data } = await apiClient.put<FnoWallet>('/derivatives/wallet', { amount });
    return data;
  },

  /** Wipes the F&O sandbox ALONE back to an empty book — never the cash paper account. */
  async reset(startingCapital?: number): Promise<FnoWallet> {
    const { data } = await apiClient.post<FnoWallet>(
      '/derivatives/reset',
      startingCapital != null ? { startingCapital } : {},
    );
    return data;
  },

  /** Every order this pool ever placed, replayed — charges, win rate, P&L slices, cash check. */
  async analytics(signal?: AbortSignal): Promise<FnoAnalytics> {
    const { data } = await apiClient.get<FnoAnalytics>('/derivatives/analytics', { signal });
    return data;
  },

  /** Settles expired positions at INTRINSIC value — not the same as letting them lapse. */
  async settleExpired(): Promise<ExpirySettlementResult> {
    const { data } = await apiClient.post<ExpirySettlementResult>('/derivatives/settle-expired');
    return data;
  },

  /** Prices a proposed basket (1–8 legs, one underlying). Writes nothing. */
  async payoff(legs: PayoffLegInput[]): Promise<BasketPayoff> {
    const { data } = await apiClient.post<BasketPayoff>('/derivatives/payoff', { legs });
    return data;
  },

  /** The strategy templates — fetched, so the picker cannot offer a key the server rejects. */
  async strategies(signal?: AbortSignal): Promise<OptionStrategyDefinition[]> {
    const { data } = await apiClient.get<{ strategies: OptionStrategyDefinition[] }>(
      '/derivatives/strategies',
      { signal },
    );
    return data.strategies;
  },

  /** Resolves a template against the live chain and prices it. Writes nothing. */
  async buildStrategy(body: BuildStrategyInput): Promise<BuildStrategyResult> {
    const { data } = await apiClient.post<BuildStrategyResult>(
      '/derivatives/strategies/build',
      body,
    );
    return data;
  },

  /** Places every leg, one after another, under one basket id — a later leg can be rejected. */
  async placeBasket(
    basketName: string,
    legs: PlacePaperFnoOrderInput[],
  ): Promise<PlaceBasketResult> {
    const { data } = await apiClient.post<{ basketId?: unknown; orders?: unknown }>(
      '/derivatives/basket',
      { basketName, legs },
    );
    return {
      basketId: typeof data?.basketId === 'string' ? data.basketId : '',
      orders: normalizeOrders(data?.orders),
    };
  },

  /** F&O-eligible NSE movers (the web paper Explore's "F&O Stocks" and "Top traded" shelves). */
  async movers(
    kind: 'gainers' | 'losers' | 'volume',
    limit: number,
    signal?: AbortSignal,
  ): Promise<FnoMover[]> {
    const path =
      kind === 'gainers'
        ? '/stocks/top-gainers'
        : kind === 'losers'
          ? '/stocks/top-losers'
          : '/stocks/top-volume';
    const { data } = await apiClient.get<{ movers: FnoMover[] }>(path, {
      params: { limit, fnoOnly: 'true' },
      signal,
    });
    return data.movers;
  },
};
