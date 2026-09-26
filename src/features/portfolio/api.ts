import type { BrokerTrade } from '@/features/trading/types';
import { apiClient } from '@/services/api/client';

import type {
  LifetimeOverview,
  LifetimeStatementPage,
  LinkedAnalytics,
  LinkedPortfolioSnapshot,
  ManualPortfolioSnapshot,
  OrderHistoryPage,
  PnlStatement,
  PortfolioHistoryResult,
  PortfolioHistoryScope,
  PortfolioSnapshot,
} from './types';

const brokerPath = (broker: string) => `/portfolio/linked/${encodeURIComponent(broker)}`;

/** The portfolio endpoints — same paths and field names as the web's portfolio.service.ts. */
export const portfolioApi = {
  /** The connected mStock book. 404 NOT_FOUND without a broker, 409 when the session lapsed. */
  async broker(): Promise<PortfolioSnapshot> {
    const { data } = await apiClient.get<PortfolioSnapshot>('/portfolio');
    return data;
  },
  async linked(broker: string): Promise<LinkedPortfolioSnapshot> {
    const { data } = await apiClient.get<LinkedPortfolioSnapshot>(brokerPath(broker));
    return data;
  },
  async manual(): Promise<ManualPortfolioSnapshot> {
    const { data } = await apiClient.get<ManualPortfolioSnapshot>('/portfolio/manual');
    return data;
  },
  /** mStock's orders sit under live-trading; every linked broker's under its own book. */
  async orderHistory(broker: string, page = 1, days = 3): Promise<OrderHistoryPage> {
    const path =
      broker === 'mstock' ? '/live-trading/broker/orders/history' : `${brokerPath(broker)}/orders`;
    const { data } = await apiClient.get<OrderHistoryPage>(path, { params: { page, days } });
    return data;
  },
  /** Today's executions from the broker's trade book. */
  async trades(broker: string): Promise<BrokerTrade[]> {
    const path =
      broker === 'mstock' ? '/live-trading/broker/trades' : `${brokerPath(broker)}/trades`;
    const { data } = await apiClient.get<{ trades: BrokerTrade[] }>(path);
    return data.trades ?? [];
  },
  async history(days: number, scope: PortfolioHistoryScope): Promise<PortfolioHistoryResult> {
    const { data } = await apiClient.get<PortfolioHistoryResult>('/portfolio/history', {
      params: { days, scope },
    });
    return data;
  },
  async pnl(broker: string, days: number): Promise<PnlStatement> {
    const { data } = await apiClient.get<PnlStatement>(`${brokerPath(broker)}/pnl`, {
      params: { days },
    });
    return data;
  },
  async analytics(broker: string, days: number): Promise<LinkedAnalytics> {
    const { data } = await apiClient.get<LinkedAnalytics>(`${brokerPath(broker)}/analytics`, {
      params: { days },
    });
    return data;
  },
  async lifetime(broker: string): Promise<LifetimeOverview> {
    const { data } = await apiClient.get<LifetimeOverview>(`${brokerPath(broker)}/lifetime`);
    return data;
  },
  async statement(
    broker: string,
    page: number,
    sym?: string | null,
    pageSize = 30,
  ): Promise<LifetimeStatementPage> {
    const { data } = await apiClient.get<LifetimeStatementPage>(
      `${brokerPath(broker)}/lifetime/statement`,
      { params: { page, pageSize, ...(sym ? { sym } : {}) } },
    );
    return data;
  },
  /** Cancels an open mStock order by its broker order number. */
  async cancelBrokerOrder(brokerOrderId: string): Promise<void> {
    await apiClient.delete(`/live-trading/broker/orders/${encodeURIComponent(brokerOrderId)}`);
  },
};
